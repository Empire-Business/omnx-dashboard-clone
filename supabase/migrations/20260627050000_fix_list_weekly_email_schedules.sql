-- Fix: list_weekly_email_schedules faltava clara_prompt no RETURNS TABLE
-- "structure of query does not match function result type" porque SELECT s.* retorna
-- mais colunas (inclui clara_prompt) do que o tipo declarado na função.
-- DROP obrigatório: PostgreSQL não permite alterar RETURNS TABLE via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.list_weekly_email_schedules();

CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
RETURNS TABLE (
  id                  UUID,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ,
  created_by          UUID,
  name                TEXT,
  description         TEXT,
  is_active           BOOLEAN,
  modules             TEXT[],
  report_type         TEXT,
  dimensions          TEXT[],
  frequency           TEXT,
  day_of_week         INTEGER,
  day_of_month        INTEGER,
  time_of_day         TIME,
  timezone            TEXT,
  last_run_at         TIMESTAMPTZ,
  next_run_at         TIMESTAMPTZ,
  subject             TEXT,
  recipient_emails    TEXT[],
  reply_to            TEXT,
  template_key        TEXT,
  include_comparative BOOLEAN,
  include_trends      BOOLEAN,
  clara_prompt        TEXT,
  use_clara_summary   BOOLEAN,
  email_sent_count    INTEGER,
  last_error          TEXT
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

GRANT EXECUTE ON FUNCTION public.list_weekly_email_schedules() TO authenticated;
