-- Corrige RPCs que usam SELECT * mas o RETURNS TABLE nao inclui workspace_id.
-- Causa: a coluna workspace_id foi adicionada depois que as RPCs foram criadas.
-- Erro na UI: "structure of query does not match function result type"

DROP FUNCTION IF EXISTS public.list_weekly_email_schedules();

CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
  RETURNS TABLE(
    id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    created_by uuid,
    name text,
    description text,
    is_active boolean,
    modules text[],
    report_type text,
    dimensions text[],
    frequency text,
    day_of_week integer,
    day_of_month integer,
    time_of_day time,
    timezone text,
    last_run_at timestamptz,
    next_run_at timestamptz,
    subject text,
    recipient_emails text[],
    reply_to text,
    template_key text,
    include_comparative boolean,
    include_trends boolean,
    clara_prompt text,
    use_clara_summary boolean,
    email_sent_count integer,
    last_error text,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  ORDER BY s.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_weekly_email_logs(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_weekly_email_logs(p_schedule_id uuid, p_limit integer DEFAULT 20)
  RETURNS TABLE(
    id uuid,
    created_at timestamptz,
    schedule_id uuid,
    week_start date,
    report_type text,
    recipient_emails text[],
    subject text,
    status text,
    resend_message_id text,
    error_message text,
    opened_at timestamptz,
    clicked_at timestamptz,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path = ''
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
