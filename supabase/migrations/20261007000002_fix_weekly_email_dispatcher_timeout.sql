-- Fix: weekly_email_dispatcher_job disparava send-weekly-report-email via
-- net.http_post sem definir timeout_milliseconds (default do pg_net = 5000ms).
-- A Clara (agent loop com tool-calling) já levava até ~78s para escrever o
-- relatório completo (documentado em docs/CLARA-AGENTE-RELATORIOS.md), e o
-- fix de 2026-07-21 (piso de tokens por analysis_depth, até 12000 para
-- 'detailed') tende a aumentar ainda mais o tempo de geração. Sem esse ajuste,
-- o disparo automático via cron corria risco real de abandonar a conexão
-- antes da function terminar de escrever e enviar o e-mail.
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
        body := v_body,
        timeout_milliseconds := 180000
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
