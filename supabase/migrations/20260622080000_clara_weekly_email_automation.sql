-- Migration: Automação de e-mails de relatórios semanais (Clara + Resend)
-- Data: 2026-06-22
-- Objetivo: Permitir que usuários configurem envios automáticos de relatórios
--           semanais por e-mail, com agendamento flexível e histórico.

-- =============================================================================
-- 1. TABELAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Configuração básica
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Filtros do relatório
  modules TEXT[] NOT NULL DEFAULT ARRAY['trafego'],
  report_type TEXT NOT NULL CHECK (report_type IN ('cohort', 'produtividade')),
  dimensions TEXT[] DEFAULT ARRAY['todos'],

  -- Agendamento
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  time_of_day TIME NOT NULL DEFAULT '08:00:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  -- E-mail
  subject TEXT NOT NULL DEFAULT 'Relatório Semanal - Empire Business',
  recipient_emails TEXT[] NOT NULL,
  reply_to TEXT,
  template_key TEXT DEFAULT 'default',
  include_comparative BOOLEAN DEFAULT true,
  include_trends BOOLEAN DEFAULT false,

  -- IA / Clara
  clara_prompt TEXT,
  use_clara_summary BOOLEAN DEFAULT false,

  -- Metadados
  email_sent_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

COMMENT ON TABLE public.weekly_email_schedules IS
  'Automações de envio de relatórios semanais por e-mail configuradas pelos usuários.';

CREATE TABLE IF NOT EXISTS public.weekly_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schedule_id UUID NOT NULL REFERENCES public.weekly_email_schedules(id) ON DELETE CASCADE,
  week_start DATE,
  report_type TEXT,
  recipient_emails TEXT[],
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  resend_message_id TEXT,
  error_message TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

COMMENT ON TABLE public.weekly_email_logs IS
  'Histórico de envios de e-mails automáticos de relatórios semanais.';

-- Trigger updated_at
DROP TRIGGER IF EXISTS tr_weekly_email_schedules_updated_at ON public.weekly_email_schedules;
CREATE TRIGGER tr_weekly_email_schedules_updated_at
  BEFORE UPDATE ON public.weekly_email_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_weekly_email_schedules_next_run
  ON public.weekly_email_schedules(next_run_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_weekly_email_logs_schedule
  ON public.weekly_email_logs(schedule_id, created_at DESC);

-- =============================================================================
-- 2. FUNÇÃO: calcular próximo envio
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_next_run_at(
  p_frequency TEXT,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_time_of_day TIME,
  p_timezone TEXT DEFAULT 'America/Sao_Paulo',
  p_after TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now DATE;
  v_now_time TIME;
  v_candidate TIMESTAMPTZ;
  v_base DATE;
BEGIN
  v_now := (p_after AT TIME ZONE p_timezone)::DATE;
  v_now_time := (p_after AT TIME ZONE p_timezone)::TIME;

  IF p_frequency = 'daily' THEN
    -- Todo dia no horário especificado
    IF p_time_of_day > v_now_time THEN
      v_base := v_now;
    ELSE
      v_base := v_now + INTERVAL '1 day';
    END IF;
    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
    RETURN v_candidate;

  ELSIF p_frequency IN ('weekly', 'biweekly') THEN
    -- Próximo dia da semana no horário especificado
    IF p_day_of_week IS NULL THEN
      p_day_of_week := 1; -- segunda como padrão
    END IF;

    v_base := v_now + ((p_day_of_week - EXTRACT(DOW FROM v_now))::INTEGER % 7) * INTERVAL '1 day';
    IF v_base < v_now OR (v_base = v_now AND p_time_of_day <= v_now_time) THEN
      v_base := v_base + INTERVAL '7 days';
    END IF;

    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;

    IF p_frequency = 'biweekly' THEN
      -- Ajusta para semanas alternadas: garante que a próxima execução seja 14 dias após a última segunda-feira da semana
      -- Simplificação: arredonda para a próxima segunda-feira ímpar/par baseada na semana do ano
      IF EXTRACT(WEEK FROM v_base)::INTEGER % 2 != EXTRACT(WEEK FROM v_now)::INTEGER % 2 THEN
        v_candidate := v_candidate + INTERVAL '7 days';
      END IF;
    END IF;

    RETURN v_candidate;

  ELSIF p_frequency = 'monthly' THEN
    -- Dia do mês no horário especificado
    IF p_day_of_month IS NULL THEN
      p_day_of_month := 1;
    END IF;

    v_base := make_date(EXTRACT(YEAR FROM v_now)::INTEGER, EXTRACT(MONTH FROM v_now)::INTEGER, LEAST(p_day_of_month, 28));
    IF v_base < v_now OR (v_base = v_now AND p_time_of_day <= v_now_time) THEN
      v_base := v_base + INTERVAL '1 month';
    END IF;

    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
    RETURN v_candidate;
  END IF;

  -- Fallback: amanhã no mesmo horário
  RETURN ((v_now + INTERVAL '1 day')::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
END;
$$;

-- =============================================================================
-- 3. RPCs de gerenciamento
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID,
  name TEXT,
  description TEXT,
  is_active BOOLEAN,
  modules TEXT[],
  report_type TEXT,
  dimensions TEXT[],
  frequency TEXT,
  day_of_week INTEGER,
  day_of_month INTEGER,
  time_of_day TIME,
  timezone TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  subject TEXT,
  recipient_emails TEXT[],
  reply_to TEXT,
  template_key TEXT,
  include_comparative BOOLEAN,
  include_trends BOOLEAN,
  use_clara_summary BOOLEAN,
  email_sent_count INTEGER,
  last_error TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  ORDER BY s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_weekly_email_schedule(
  p_name TEXT,
  p_description TEXT,
  p_modules TEXT[],
  p_report_type TEXT,
  p_frequency TEXT,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_time_of_day TIME,
  p_subject TEXT,
  p_recipient_emails TEXT[],
  p_reply_to TEXT DEFAULT NULL,
  p_template_key TEXT DEFAULT 'default',
  p_include_comparative BOOLEAN DEFAULT true,
  p_include_trends BOOLEAN DEFAULT false,
  p_clara_prompt TEXT DEFAULT NULL,
  p_use_clara_summary BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_next_run TIMESTAMPTZ;
BEGIN
  v_next_run := public.calculate_next_run_at(
    p_frequency,
    p_day_of_week,
    p_day_of_month,
    p_time_of_day,
    'America/Sao_Paulo',
    NOW()
  );

  INSERT INTO public.weekly_email_schedules (
    created_by,
    name,
    description,
    modules,
    report_type,
    frequency,
    day_of_week,
    day_of_month,
    time_of_day,
    subject,
    recipient_emails,
    reply_to,
    template_key,
    include_comparative,
    include_trends,
    clara_prompt,
    use_clara_summary,
    next_run_at
  )
  VALUES (
    auth.uid(),
    p_name,
    p_description,
    p_modules,
    p_report_type,
    p_frequency,
    p_day_of_week,
    p_day_of_month,
    p_time_of_day,
    COALESCE(p_subject, 'Relatório Semanal - Empire Business'),
    p_recipient_emails,
    p_reply_to,
    COALESCE(p_template_key, 'default'),
    COALESCE(p_include_comparative, true),
    COALESCE(p_include_trends, false),
    p_clara_prompt,
    COALESCE(p_use_clara_summary, false),
    v_next_run
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_weekly_email_schedule(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_modules TEXT[] DEFAULT NULL,
  p_report_type TEXT DEFAULT NULL,
  p_frequency TEXT DEFAULT NULL,
  p_day_of_week INTEGER DEFAULT NULL,
  p_day_of_month INTEGER DEFAULT NULL,
  p_time_of_day TIME DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_recipient_emails TEXT[] DEFAULT NULL,
  p_reply_to TEXT DEFAULT NULL,
  p_template_key TEXT DEFAULT NULL,
  p_include_comparative BOOLEAN DEFAULT NULL,
  p_include_trends BOOLEAN DEFAULT NULL,
  p_clara_prompt TEXT DEFAULT NULL,
  p_use_clara_summary BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule public.weekly_email_schedules%ROWTYPE;
  v_next_run TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_schedule FROM public.weekly_email_schedules WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Se agendamento mudou, recalcula next_run_at
  IF p_frequency IS NOT NULL OR p_day_of_week IS NOT NULL OR p_day_of_month IS NOT NULL OR p_time_of_day IS NOT NULL THEN
    v_next_run := public.calculate_next_run_at(
      COALESCE(p_frequency, v_schedule.frequency),
      COALESCE(p_day_of_week, v_schedule.day_of_week),
      COALESCE(p_day_of_month, v_schedule.day_of_month),
      COALESCE(p_time_of_day, v_schedule.time_of_day),
      'America/Sao_Paulo',
      NOW()
    );
  END IF;

  UPDATE public.weekly_email_schedules
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    is_active = COALESCE(p_is_active, is_active),
    modules = COALESCE(p_modules, modules),
    report_type = COALESCE(p_report_type, report_type),
    frequency = COALESCE(p_frequency, frequency),
    day_of_week = COALESCE(p_day_of_week, day_of_week),
    day_of_month = COALESCE(p_day_of_month, day_of_month),
    time_of_day = COALESCE(p_time_of_day, time_of_day),
    next_run_at = COALESCE(v_next_run, next_run_at),
    subject = COALESCE(p_subject, subject),
    recipient_emails = COALESCE(p_recipient_emails, recipient_emails),
    reply_to = COALESCE(p_reply_to, reply_to),
    template_key = COALESCE(p_template_key, template_key),
    include_comparative = COALESCE(p_include_comparative, include_comparative),
    include_trends = COALESCE(p_include_trends, include_trends),
    clara_prompt = COALESCE(p_clara_prompt, clara_prompt),
    use_clara_summary = COALESCE(p_use_clara_summary, use_clara_summary)
  WHERE id = p_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_weekly_email_schedule(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.weekly_email_schedules WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_email_logs(p_schedule_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  schedule_id UUID,
  week_start DATE,
  report_type TEXT,
  recipient_emails TEXT[],
  subject TEXT,
  status TEXT,
  resend_message_id TEXT,
  error_message TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT l.*
  FROM public.weekly_email_logs l
  WHERE l.schedule_id = p_schedule_id
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_weekly_report_test(p_schedule_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.weekly_email_logs (
    schedule_id,
    status,
    error_message
  )
  VALUES (
    p_schedule_id,
    'pending',
    'Teste agendado pelo usuário. O envio real é feito pela edge function send-weekly-report-email.'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- =============================================================================
-- 4. FUNÇÃO DO CRON: dispatcher
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_email_dispatcher_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule RECORD;
  v_auth_header TEXT;
  v_url TEXT;
  v_body TEXT;
BEGIN
  -- Busca token de autorização interno
  SELECT value INTO v_auth_header
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_auth_header IS NULL THEN
    RAISE EXCEPTION 'supabase_anon_key não configurado em app_config';
  END IF;

  v_auth_header := 'Bearer ' || v_auth_header;
  v_url := COALESCE(
    (SELECT value FROM public.app_config WHERE key = 'supabase_url'),
    current_setting('app.settings.supabase_url', true)
  ) || '/functions/v1/send-weekly-report-email';

  FOR v_schedule IN
    SELECT id
    FROM public.weekly_email_schedules
    WHERE is_active = true
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_body := json_build_object('schedule_id', v_schedule.id)::TEXT;

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
$$;

-- =============================================================================
-- 5. CRON
-- =============================================================================

SELECT cron.unschedule('weekly-email-dispatcher') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-email-dispatcher');

SELECT cron.schedule(
  'weekly-email-dispatcher',
  '0 * * * *', -- toda hora
  'SELECT public.weekly_email_dispatcher_job();'
);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.weekly_email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_email_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_schedules' AND policyname = 'weekly_email_schedules_select_auth'
  ) THEN
    CREATE POLICY weekly_email_schedules_select_auth
      ON public.weekly_email_schedules FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_schedules' AND policyname = 'weekly_email_schedules_insert_auth'
  ) THEN
    CREATE POLICY weekly_email_schedules_insert_auth
      ON public.weekly_email_schedules FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_schedules' AND policyname = 'weekly_email_schedules_update_auth'
  ) THEN
    CREATE POLICY weekly_email_schedules_update_auth
      ON public.weekly_email_schedules FOR UPDATE
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_schedules' AND policyname = 'weekly_email_schedules_delete_auth'
  ) THEN
    CREATE POLICY weekly_email_schedules_delete_auth
      ON public.weekly_email_schedules FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_logs' AND policyname = 'weekly_email_logs_select_auth'
  ) THEN
    CREATE POLICY weekly_email_logs_select_auth
      ON public.weekly_email_logs FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_email_logs' AND policyname = 'weekly_email_logs_insert_auth'
  ) THEN
    CREATE POLICY weekly_email_logs_insert_auth
      ON public.weekly_email_logs FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
