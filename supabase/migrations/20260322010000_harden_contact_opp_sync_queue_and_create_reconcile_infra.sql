-- ============================================================
-- Migration: endurecer fila sync-contact-opportunities + infra
-- de reconciliação/backfill de oportunidades GHL
--
-- Problemas resolvidos:
-- 1. Itens presos em processing sem mecanismo robusto de reclaim
-- 2. Retry da fila dependia de lógica frágil na edge function
-- 3. Não existia infraestrutura para run audit/write de reconciliação
-- 4. Cron noturno precisava de estado persistente para processar
--    todos os contatos em lotes sem perder progresso
-- ============================================================

ALTER TABLE public.contact_opp_sync_queue
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contact_opp_sync_queue.claimed_at IS
'Timestamp de claim da edge function. Usado para recuperar itens presos em processing.';

CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_status_claimed_idx
  ON public.contact_opp_sync_queue (status, claimed_at, created_at);

CREATE OR REPLACE FUNCTION public.requeue_stale_contact_opp_sync_queue(
  p_stale_after_minutes INT DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.contact_opp_sync_queue
  SET
    status = 'pending',
    claimed_at = NULL
  WHERE status = 'processing'
    AND (
      claimed_at IS NULL
      OR claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_contact_opp_sync_queue(
  p_batch_size INT DEFAULT 20,
  p_stale_after_minutes INT DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  ghl_contact_id TEXT,
  location_id TEXT,
  attempts INT,
  created_at TIMESTAMPTZ,
  last_error TEXT,
  claimed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.requeue_stale_contact_opp_sync_queue(p_stale_after_minutes);

  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.contact_opp_sync_queue q
    WHERE q.status = 'pending'
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(p_batch_size, 200), 1)
  ),
  updated AS (
    UPDATE public.contact_opp_sync_queue q
    SET
      status = 'processing',
      claimed_at = NOW(),
      attempts = COALESCE(q.attempts, 0) + 1
    FROM picked
    WHERE q.id = picked.id
    RETURNING
      q.id,
      q.ghl_contact_id,
      q.location_id,
      q.attempts,
      q.created_at,
      q.last_error,
      q.claimed_at
  )
  SELECT
    updated.id,
    updated.ghl_contact_id,
    updated.location_id,
    updated.attempts,
    updated.created_at,
    updated.last_error,
    updated.claimed_at
  FROM updated
  ORDER BY updated.created_at;
END;
$$;

CREATE TABLE IF NOT EXISTS public.ghl_opp_reconcile_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('audit', 'write')),
  scope TEXT NOT NULL DEFAULT 'all_contacts',
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'done_with_errors', 'failed')),
  total_contacts INT NOT NULL DEFAULT 0,
  processed_contacts INT NOT NULL DEFAULT 0,
  success_contacts INT NOT NULL DEFAULT 0,
  error_contacts INT NOT NULL DEFAULT 0,
  contacts_with_missing INT NOT NULL DEFAULT 0,
  contacts_with_extra INT NOT NULL DEFAULT 0,
  opportunities_missing INT NOT NULL DEFAULT 0,
  opportunities_extra INT NOT NULL DEFAULT 0,
  opportunities_inserted INT NOT NULL DEFAULT 0,
  opportunities_updated INT NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_runs_status_created_idx
  ON public.ghl_opp_reconcile_runs (status, created_at);

CREATE TABLE IF NOT EXISTS public.ghl_opp_reconcile_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ghl_opp_reconcile_runs(id) ON DELETE CASCADE,
  contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  ghl_contact_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  nome_contato TEXT,
  email_contato TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  ghl_total INT NOT NULL DEFAULT 0,
  db_total INT NOT NULL DEFAULT 0,
  missing_in_db JSONB NOT NULL DEFAULT '[]'::JSONB,
  extra_in_db JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_in_db JSONB NOT NULL DEFAULT '[]'::JSONB,
  inserted_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ghl_opp_reconcile_items_run_contact_unique UNIQUE (run_id, ghl_contact_id, location_id)
);

CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_items_run_status_created_idx
  ON public.ghl_opp_reconcile_items (run_id, status, created_at);

CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_items_status_claimed_idx
  ON public.ghl_opp_reconcile_items (status, claimed_at, created_at);

CREATE OR REPLACE FUNCTION public.requeue_stale_ghl_opp_reconcile_items(
  p_run_id UUID,
  p_stale_after_minutes INT DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.ghl_opp_reconcile_items
  SET
    status = 'pending',
    claimed_at = NULL,
    updated_at = NOW()
  WHERE run_id = p_run_id
    AND status = 'processing'
    AND (
      claimed_at IS NULL
      OR claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ghl_opp_reconcile_items(
  p_run_id UUID,
  p_batch_size INT DEFAULT 20,
  p_stale_after_minutes INT DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  run_id UUID,
  contato_id UUID,
  ghl_contact_id TEXT,
  location_id TEXT,
  nome_contato TEXT,
  email_contato TEXT,
  attempts INT,
  created_at TIMESTAMPTZ,
  last_error TEXT,
  claimed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.requeue_stale_ghl_opp_reconcile_items(p_run_id, p_stale_after_minutes);

  RETURN QUERY
  WITH picked AS (
    SELECT i.id
    FROM public.ghl_opp_reconcile_items i
    WHERE i.run_id = p_run_id
      AND i.status = 'pending'
    ORDER BY i.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(p_batch_size, 500), 1)
  ),
  updated AS (
    UPDATE public.ghl_opp_reconcile_items i
    SET
      status = 'processing',
      claimed_at = NOW(),
      attempts = COALESCE(i.attempts, 0) + 1,
      updated_at = NOW()
    FROM picked
    WHERE i.id = picked.id
    RETURNING
      i.id,
      i.run_id,
      i.contato_id,
      i.ghl_contact_id,
      i.location_id,
      i.nome_contato,
      i.email_contato,
      i.attempts,
      i.created_at,
      i.last_error,
      i.claimed_at
  )
  SELECT
    updated.id,
    updated.run_id,
    updated.contato_id,
    updated.ghl_contact_id,
    updated.location_id,
    updated.nome_contato,
    updated.email_contato,
    updated.attempts,
    updated.created_at,
    updated.last_error,
    updated.claimed_at
  FROM updated
  ORDER BY updated.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ghl_opp_reconcile_run_counters(
  p_run_id UUID,
  p_processed_contacts INT DEFAULT 0,
  p_success_contacts INT DEFAULT 0,
  p_error_contacts INT DEFAULT 0,
  p_contacts_with_missing INT DEFAULT 0,
  p_contacts_with_extra INT DEFAULT 0,
  p_opportunities_missing INT DEFAULT 0,
  p_opportunities_extra INT DEFAULT 0,
  p_opportunities_inserted INT DEFAULT 0,
  p_opportunities_updated INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ghl_opp_reconcile_runs
  SET
    processed_contacts     = processed_contacts + COALESCE(p_processed_contacts, 0),
    success_contacts       = success_contacts + COALESCE(p_success_contacts, 0),
    error_contacts         = error_contacts + COALESCE(p_error_contacts, 0),
    contacts_with_missing  = contacts_with_missing + COALESCE(p_contacts_with_missing, 0),
    contacts_with_extra    = contacts_with_extra + COALESCE(p_contacts_with_extra, 0),
    opportunities_missing  = opportunities_missing + COALESCE(p_opportunities_missing, 0),
    opportunities_extra    = opportunities_extra + COALESCE(p_opportunities_extra, 0),
    opportunities_inserted = opportunities_inserted + COALESCE(p_opportunities_inserted, 0),
    opportunities_updated  = opportunities_updated + COALESCE(p_opportunities_updated, 0),
    updated_at             = NOW()
  WHERE id = p_run_id;
END;
$$;
