-- ============================================================
-- Migration: Harden ghl_api_jobs + corrigir cron de conversas
--
-- Objetivos:
-- 1. Tornar a fila central utilizável em produção pelos callers reais
-- 2. Recuperar jobs presos em processing via claimed_at
-- 3. Permitir payload/contexto por job e marcação handled_at
-- 4. Recriar o cron de sync-ghl-conversations em formato confiável
-- ============================================================

-- --------------------------------------------------------
-- ghl_api_jobs: novas colunas operacionais
-- --------------------------------------------------------

ALTER TABLE public.ghl_api_jobs
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;

-- A UNIQUE constraint permanente em idempotency_key impede re-enfileirar
-- um item depois que ele termina. Queremos bloquear apenas duplicatas ativas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ghl_api_jobs_idempotency_key_key'
      AND conrelid = 'public.ghl_api_jobs'::regclass
  ) THEN
    ALTER TABLE public.ghl_api_jobs
      DROP CONSTRAINT ghl_api_jobs_idempotency_key_key;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_api_jobs_idempotency_active
  ON public.ghl_api_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_unhandled_by_caller
  ON public.ghl_api_jobs (caller, processed_at ASC)
  WHERE status IN ('done', 'dead')
    AND handled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_processing_claimed_at
  ON public.ghl_api_jobs (claimed_at ASC)
  WHERE status = 'processing';

-- --------------------------------------------------------
-- Função: enqueue_ghl_api_job
-- Insere um job e ignora duplicata ativa via ON CONFLICT DO NOTHING
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_ghl_api_job(
  p_url TEXT,
  p_method TEXT DEFAULT 'GET',
  p_body JSONB DEFAULT NULL,
  p_priority INT DEFAULT 5,
  p_caller TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_max_attempts INT DEFAULT 4
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows INT := 0;
BEGIN
  INSERT INTO public.ghl_api_jobs (
    url,
    method,
    body,
    priority,
    caller,
    idempotency_key,
    context,
    max_attempts
  )
  VALUES (
    p_url,
    COALESCE(NULLIF(TRIM(p_method), ''), 'GET'),
    p_body,
    COALESCE(p_priority, 5),
    p_caller,
    p_idempotency_key,
    COALESCE(p_context, '{}'::jsonb),
    COALESCE(p_max_attempts, 4)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- --------------------------------------------------------
-- Função: requeue_stale_ghl_api_jobs
-- Recoloca jobs processing presos de volta para pending
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.requeue_stale_ghl_api_jobs(
  p_stale_after_minutes INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.ghl_api_jobs
  SET
    status = 'pending',
    claimed_at = NULL,
    next_retry_at = NOW(),
    error = LEFT(
      COALESCE(error || ' | ', '') ||
      'stale_requeue at ' || NOW()::TEXT,
      1000
    )
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- --------------------------------------------------------
-- claim_ghl_api_jobs: agora marca claimed_at
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_ghl_api_jobs(max_jobs INT DEFAULT 50)
RETURNS SETOF public.ghl_api_jobs
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.ghl_api_jobs
  SET
    status = 'processing',
    attempts = attempts + 1,
    claimed_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.ghl_api_jobs
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
    ORDER BY priority ASC, next_retry_at ASC
    LIMIT max_jobs
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

COMMENT ON COLUMN public.ghl_api_jobs.context IS
  'Metadados do caller para aplicar o resultado do job no domínio (ex.: opportunity_id, contato_id).';

COMMENT ON COLUMN public.ghl_api_jobs.claimed_at IS
  'Timestamp de claim pelo worker. Usado para recuperar jobs presos em processing.';

COMMENT ON COLUMN public.ghl_api_jobs.handled_at IS
  'Timestamp em que o caller consumiu/aplicou o result do job.';

-- --------------------------------------------------------
-- Cron de conversas: recriar com wrapper explícito e chave estável
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_ghl_conversations_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-ghl-conversations',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{"mode":"incremental"}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

SELECT cron.unschedule('sync-ghl-conversations-incremental')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'sync-ghl-conversations-incremental'
);

SELECT cron.schedule(
  'sync-ghl-conversations-incremental',
  '*/10 * * * *',
  'SELECT sync_ghl_conversations_job()'
);

DO $$
BEGIN
  RAISE NOTICE 'ghl_api_jobs hardened; sync-ghl-conversations-incremental recriado em */10';
END;
$$;
