-- ============================================================================
-- Fix: weekly_email_dispatcher_job() — body do net.http_post deve ser jsonb
-- ============================================================================
-- Sintoma (produção, 2026-07-17): o cron 'weekly-email-dispatcher' falhava a
-- cada execução com:
--   function net.http_post(url => text, headers => jsonb, body => text) does not exist
-- Causa: v_body era TEXT e net.http_post espera body jsonb (mesma classe de bug
-- já corrigida em 20260323211000 para outro fluxo).
-- Efeito: nenhum relatório automático (diário/semanal) era disparado — incluindo
-- a "Análise diária completa de tráfego" da Clara.
-- Fix: v_body passa a ser jsonb (jsonb_build_object). Restante da função
-- preservado exatamente como em 20260808000000_fix_cron_caller_service_role.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.weekly_email_dispatcher_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_schedule RECORD;
  v_auth_header TEXT;
  v_url TEXT;
  v_body JSONB;
BEGIN
  v_auth_header := 'Bearer ' || get_secret('service_role_key');
  v_url := COALESCE(
    (SELECT value FROM public.app_config WHERE key = 'supabase_url'),
    get_secret('supabase_url')
  ) || '/functions/v1/send-weekly-report-email';

  FOR v_schedule IN
    SELECT id
    FROM public.weekly_email_schedules
    WHERE is_active = true
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_body := jsonb_build_object('schedule_id', v_schedule.id);

    BEGIN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Authorization', v_auth_header,
          'Content-Type', 'application/json'
        ),
        body := v_body
      );

      -- Marca como processado (a edge function atualizará last_run_at e next_run_at)
      UPDATE public.weekly_email_schedules
      SET last_run_at = NOW()
      WHERE id = v_schedule.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.weekly_email_schedules
      SET last_error = SQLERRM
      WHERE id = v_schedule.id;

      INSERT INTO public.weekly_email_logs (schedule_id, status, error_message)
      VALUES (v_schedule.id, 'failed', SQLERRM);
    END;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.weekly_email_dispatcher_job() IS
'Cron de despacho de e-mails: chama send-weekly-report-email com service_role_key. '
'Corrigido em 2026-08-08 (auth) e 2026-09-25 (body jsonb do net.http_post — '
'dispatcher falhava com "net.http_post(url => text, headers => jsonb, body => text) does not exist").';
