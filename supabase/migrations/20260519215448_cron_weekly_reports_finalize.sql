-- Migration: Cron job para finalizar snapshots de produtividade antigos
-- Data: 2026-05-19
-- Frequência: Terças-feiras, 06:00 BRT (09:00 UTC)
-- Ação: Atualiza status='finalized' em weekly_snapshots de produtividade
--       cuja semana já tenha mais de 7 dias de idade.

-- =============================================================================
-- 1. FUNÇÃO DO JOB
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_finalize_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.weekly_snapshots
  SET status       = 'finalized',
      finalized_at = NOW()
  WHERE week_start < CURRENT_DATE - 7
    AND report_type = 'produtividade'
    AND status != 'finalized';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN 'Finalized: ' || v_count || ' snapshots';
END;
$$;

-- =============================================================================
-- 2. AGENDAMENTO CRON
-- =============================================================================

SELECT cron.unschedule('weekly-reports-finalize')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-finalize');

SELECT cron.schedule(
  'weekly-reports-finalize',
  '0 9 * * 2',  -- Terças, 09:00 UTC = 06:00 BRT
  'SELECT weekly_reports_finalize_job()'
);
