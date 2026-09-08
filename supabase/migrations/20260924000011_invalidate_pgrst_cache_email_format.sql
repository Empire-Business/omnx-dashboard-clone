-- ============================================================
-- Migration: 20260924000011
-- Força recarga do schema cache do PostgREST após alteração
-- no tipo de retorno das RPCs de weekly_email_schedules.
-- ============================================================
SET search_path = public, pg_catalog;

-- Invalida o cache alterando o OID das funções (DROP + CREATE em vez de REPLACE)
DROP FUNCTION IF EXISTS public.list_weekly_email_schedules();
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
  clara_prompt TEXT,
  email_sent_count INTEGER,
  last_error TEXT,
  email_format TEXT
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

DROP FUNCTION IF EXISTS public.create_weekly_email_schedule(
  TEXT, TEXT, TEXT[], TEXT, TEXT, INTEGER, INTEGER, TIME, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, TEXT
);
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
  p_use_clara_summary BOOLEAN DEFAULT false,
  p_email_format TEXT DEFAULT 'full'
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
    next_run_at,
    email_format
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
    v_next_run,
    COALESCE(p_email_format, 'full')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.update_weekly_email_schedule(
  UUID, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT, INTEGER, INTEGER, TIME, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, TEXT
);
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
  p_use_clara_summary BOOLEAN DEFAULT NULL,
  p_email_format TEXT DEFAULT NULL
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
    use_clara_summary = COALESCE(p_use_clara_summary, use_clara_summary),
    email_format = COALESCE(p_email_format, email_format)
  WHERE id = p_id;

  RETURN true;
END;
$$;

-- Força recarga do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
