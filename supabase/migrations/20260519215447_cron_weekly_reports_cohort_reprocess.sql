-- Migration: Cron job para consumir fila de reprocessamento cohort
-- Data: 2026-05-19
-- Frequência: A cada 30 minutos
-- Ação: Consome itens pendentes da weekly_reprocess_queue,
--       chama edge function compute-weekly-reports para reprocessar,
--       marca como processed.

-- =============================================================================
-- 1. FUNÇÃO DO JOB
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  -- Processa até 5 itens pendentes por execução (evita sobrecarga no pg_net)
  FOR v_item IN
    SELECT id, week_start, report_type
    FROM public.weekly_reprocess_queue
    WHERE processed_at IS NULL
    ORDER BY priority DESC, created_at ASC
    LIMIT 5
  LOOP
    -- Chama edge function para reprocessar a semana
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer REMOVED_SERVICE_ROLE_TOKEN_CONFIGURE_IN_SUPABASE_DASHBOARD'
      ),
      body := jsonb_build_object(
        'report_type', 'cohort',
        'week_start',  v_item.week_start,
        'reprocess',   true
      )
    ) INTO v_request_id;

    -- Marca como processado e incrementa tentativas
    UPDATE public.weekly_reprocess_queue
    SET processed_at = NOW(),
        attempts     = attempts + 1
    WHERE id = v_item.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Processed: ' || v_count || ' items';
END;
$$;

-- =============================================================================
-- 2. AGENDAMENTO CRON
-- =============================================================================

SELECT cron.unschedule('weekly-reports-cohort-reprocess')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort-reprocess');

SELECT cron.schedule(
  'weekly-reports-cohort-reprocess',
  '*/30 * * * *',
  'SELECT weekly_reports_cohort_reprocess_job()'
);
