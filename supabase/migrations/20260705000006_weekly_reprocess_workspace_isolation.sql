-- =============================================================================
-- Migration: Isolamento de workspace na fila de reprocessamento cohort
-- Data: 2026-07-05
--
-- Objetivo:
--   A tabela weekly_reprocess_queue recebeu workspace_id na migration
--   20260705000003_add_workspace_id_weekly_reports.sql, mas ainda não:
--     1. possuía constraint única incluindo workspace_id;
--     2. recebia workspace_id na trigger de pagamento;
--     3. fazia a edge function marcar itens como processados de forma isolada.
--
--   Esta migration corrige os três pontos e adiciona uma função helper para
--   marcar itens da fila como processados a partir da edge function.
--
--   A função do cron de reprocessamento é mantida em sincronia com a versão
--   mais recente (20260705000005_cron_weekly_reports_per_workspace.sql):
--   itera por workspace, envia workspace_id no payload e não marca o item como
--   processado antes da resposta — quem marca é a edge function em caso de
--   reprocessamento bem-sucedido.
-- =============================================================================

-- =============================================================================
-- 1. CONSTRAINT ÚNICA: inclui workspace_id
-- =============================================================================

ALTER TABLE public.weekly_reprocess_queue
DROP CONSTRAINT IF EXISTS uq_weekly_reprocess_queue;

ALTER TABLE public.weekly_reprocess_queue
ADD CONSTRAINT uq_weekly_reprocess_queue
UNIQUE (workspace_id, week_start, report_type, reason);

COMMENT ON CONSTRAINT uq_weekly_reprocess_queue ON public.weekly_reprocess_queue IS
  'Unicidade da fila de reprocessamento por workspace, semana, tipo de relatório e motivo.';

-- =============================================================================
-- 2. TRIGGER: popula workspace_id a partir da oportunidade que disparou
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_weekly_reprocess_on_payment_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_lead TIMESTAMPTZ;
  v_week_start DATE;
  v_workspace_id UUID;
BEGIN
  -- Só executa quando data_pagamento_entrada foi preenchida e há oportunidade
  IF NEW.data_pagamento_entrada IS NOT NULL AND NEW.oportunidade_id IS NOT NULL THEN
    -- Busca a semana cohort (data_lead_recebido) e o workspace da oportunidade
    SELECT
      o.data_lead_recebido,
      get_opportunity_workspace_id(o.id)
    INTO v_data_lead, v_workspace_id
    FROM public.oportunidades o
    WHERE o.id = NEW.oportunidade_id;

    -- Se encontrou data_lead_recebido, enfileira com workspace_id
    IF v_data_lead IS NOT NULL THEN
      v_week_start := v_data_lead::date - ((EXTRACT(DOW FROM v_data_lead::date)::int + 6) % 7);

      INSERT INTO public.weekly_reprocess_queue (workspace_id, week_start, report_type, reason, priority)
      VALUES (v_workspace_id, v_week_start, 'cohort', 'new_payment', 10)
      ON CONFLICT (workspace_id, week_start, report_type, reason) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Garante que o trigger exista (recria caso necessário)
DROP TRIGGER IF EXISTS tr_weekly_reprocess_on_payment ON public.vendas_fechamento;
CREATE TRIGGER tr_weekly_reprocess_on_payment
  AFTER INSERT OR UPDATE OF data_pagamento_entrada ON public.vendas_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_weekly_reprocess_on_payment_fn();

-- =============================================================================
-- 3. FUNÇÃO HELPER: marca itens da fila como processados
--    Chamada pela edge function compute-weekly-reports após reprocessamento.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_weekly_reprocess_queue_processed(
  p_workspace_id UUID,
  p_week_start DATE,
  p_report_type TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.weekly_reprocess_queue
  SET processed_at = NOW(),
      attempts     = attempts + 1
  WHERE workspace_id = p_workspace_id
    AND week_start   = p_week_start
    AND report_type  = p_report_type
    AND processed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_weekly_reprocess_queue_processed(UUID, DATE, TEXT) IS
  'Marca como processados todos os itens pendentes da fila para um workspace/semana/tipo.';

-- =============================================================================
-- 4. CRON: reprocessamento por workspace com workspace_id no payload
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_workspace  RECORD;
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  -- Para cada workspace ativo, consome até 5 itens pendentes da fila.
  -- Itens com workspace_id IS NULL (legado) não são processados aqui;
  -- eles devem ser backfilled/migrados antes de reprocessar.
  FOR v_workspace IN
    SELECT id FROM public.workspaces ORDER BY id
  LOOP
    FOR v_item IN
      SELECT id, week_start, report_type
      FROM public.weekly_reprocess_queue
      WHERE processed_at IS NULL
        AND workspace_id = v_workspace.id
      ORDER BY priority DESC, created_at ASC
      LIMIT 5
    LOOP
      SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', public.weekly_reports_auth_header()
        ),
        body := jsonb_build_object(
          'report_type',  v_item.report_type,
          'week_start',   v_item.week_start,
          'workspace_id', v_workspace.id::text,
          'reprocess',    true
        )
      ) INTO v_request_id;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' items';
END;
$$;

-- Reagenda o cron (idempotente)
SELECT cron.unschedule('weekly-reports-cohort-reprocess')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort-reprocess');

SELECT cron.schedule(
  'weekly-reports-cohort-reprocess',
  '*/30 * * * *',
  'SELECT weekly_reports_cohort_reprocess_job()'
);
