-- ============================================================
-- Migration: 20260924000014
-- Refatora list_weekly_email_schedules para retornar SETOF
-- public.weekly_email_schedules, evitando cache de tipo
-- composto do PostgREST.
-- ============================================================
SET search_path = public, pg_catalog;

DROP FUNCTION IF EXISTS public.list_weekly_email_schedules();

CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
RETURNS SETOF public.weekly_email_schedules
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

COMMENT ON FUNCTION public.list_weekly_email_schedules() IS
  'Lista agendamentos de e-mail usando SETOF da tabela base.';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
