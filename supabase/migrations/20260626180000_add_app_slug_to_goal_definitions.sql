-- Migration: vincular metas a apps (sub-apps modulares)
-- Adiciona coluna opcional app_slug em goal_definitions para indicar a qual app a meta pertence.

ALTER TABLE public.goal_definitions
  ADD COLUMN IF NOT EXISTS app_slug TEXT;

CREATE INDEX IF NOT EXISTS goal_definitions_app_slug_idx
  ON public.goal_definitions (workspace_id, app_slug);

COMMENT ON COLUMN public.goal_definitions.app_slug IS
  'Slug do sub-app ao qual a meta está vinculada (ex: pre-vendas, sdr-ia, metas). Null = não vinculada a nenhum app.';
