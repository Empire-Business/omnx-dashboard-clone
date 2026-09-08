-- ============================================================
-- Migration: 20260924000013
-- Tenta invalidar o schema cache do PostgREST alterando
-- configurações das funções (muda o catálogo sem mudar a assinatura).
-- ============================================================
SET search_path = public, pg_catalog;

ALTER FUNCTION public.list_weekly_email_schedules()
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.create_weekly_email_schedule(
  TEXT, TEXT, TEXT[], TEXT, TEXT, INTEGER, INTEGER, TIME, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, TEXT
)
  SET search_path = public, pg_catalog;

ALTER FUNCTION public.update_weekly_email_schedule(
  UUID, TEXT, TEXT, BOOLEAN, TEXT[], TEXT, TEXT, INTEGER, INTEGER, TIME, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, TEXT
)
  SET search_path = public, pg_catalog;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
