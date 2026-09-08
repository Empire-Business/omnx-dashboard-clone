-- Migration: Rastreamento de origem do agendamento (IA vs humano)
-- Objetivo: salvar de onde veio cada agendamento no GHL para distinguir
-- agendamentos feitos pela SDR IA de agendamentos feitos por humanos.
--
-- Ações:
--   1. Adiciona 8 colunas em public.oportunidades com metadados do appointment.
--   2. Cria tabela public.ghl_calendars para cache local dos calendários GHL.
--   3. Cria índices para joins/consultas rápidas.
--   4. Adiciona comentários documentando cada coluna.

-- =============================================================================
-- 1. Colunas de origem do agendamento em oportunidades
-- =============================================================================
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS agendamento_origem TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_nome TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_email TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_calendar_name TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_assigned_user_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_assigned_user_nome TEXT;

COMMENT ON COLUMN public.oportunidades.agendamento_origem IS
  'Fonte do agendamento no GHL: conversations_ai, calendar_page, google_calendar, event_sync, etc.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_id IS
  'ID do usuário do GHL que criou o agendamento (quando humano). Quando IA, fica NULL.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_nome IS
  'Nome legível do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_email IS
  'Email do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_id IS
  'ID do calendário do GHL onde o agendamento foi feito.';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_name IS
  'Nome legível do calendário do GHL onde o agendamento foi feito.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_id IS
  'ID do dono do calendário / closer atribuído no GHL.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_nome IS
  'Nome legível do dono do calendário / closer atribuído no GHL.';

CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_origem
  ON public.oportunidades(agendamento_origem);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_calendar_id
  ON public.oportunidades(agendamento_calendar_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_por_user_id
  ON public.oportunidades(agendamento_por_user_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_assigned_user_id
  ON public.oportunidades(agendamento_assigned_user_id);

-- =============================================================================
-- 2. Tabela de cache de calendários GHL
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ghl_calendars (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ghl_id       TEXT        NOT NULL,
  nome         TEXT        NOT NULL,
  location_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ghl_id)
);

COMMENT ON TABLE public.ghl_calendars IS
  'Cache local dos calendários do location GHL — usado para traduzir calendarId em nome legível.';
COMMENT ON COLUMN public.ghl_calendars.ghl_id IS
  'ID do calendário na GHL. Join: oportunidades.agendamento_calendar_id = ghl_calendars.ghl_id.';
COMMENT ON COLUMN public.ghl_calendars.nome IS
  'Nome legível do calendário no GHL.';
COMMENT ON COLUMN public.ghl_calendars.location_id IS
  'Location ID do GHL ao qual o calendário pertence (quando disponível).';

CREATE INDEX IF NOT EXISTS idx_ghl_calendars_ghl_id ON public.ghl_calendars(ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_calendars_workspace_id ON public.ghl_calendars(workspace_id);

-- =============================================================================
-- 3. RLS básica para ghl_calendars
-- =============================================================================
ALTER TABLE public.ghl_calendars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_ghl_calendars" ON public.ghl_calendars;
DROP POLICY IF EXISTS "service_role_all_ghl_calendars" ON public.ghl_calendars;

CREATE POLICY "workspace_members_select_ghl_calendars"
  ON public.ghl_calendars FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
  );

CREATE POLICY "service_role_all_ghl_calendars"
  ON public.ghl_calendars FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.ghl_calendars TO service_role;
GRANT SELECT ON public.ghl_calendars TO authenticated;

-- Recarrega schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
