-- ============================================================================
-- FASE 1 — Modelo de dados "Agency" (multi-tenant) — fatia 1: fundacao
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 3.1, 3.2, 3.3)
--
-- O que esta migration cria:
--   - agencies            : entidade de topo (governanca/integracao/billing),
--                           SEM dados de negocio proprios.
--   - agency_members      : membros da agencia (espelha workspace_members).
--   - agency_workspaces   : juncao Agency <-> Workspace (sub-conta).
--   - is_agency_member()  : helper RLS (SECURITY DEFINER).
--   - is_agency_admin()   : helper RLS (SECURITY DEFINER).
--   - indices de suporte + RLS proprio das 3 tabelas + GRANTs.
--
-- O que NAO entra NESTA migration (entra em migration separada da Fase 1):
--   - can_access_workspace_via_agency() (com filtro obrigatorio de
--     status='active') e o retrofit programatico de politicas nas ~90 tabelas
--     com RLS de workspace (incluindo as 3 do CRM por argumento de funcao).
--   Decisao de escopo do dono (docs/ROADMAP-MULTI-TENANT.md): plano COMPLETO
--   (Fases 0-8), SEM corte de MVP. Esta migration entrega a fundacao (tabelas
--   + indices + RLS proprio + is_agency_member/admin), comum aos dois caminhos;
--   a RLS aditiva vem na proxima fatia, com suite dedicada (secao 3.3.1) e
--   gate de performance (indices + EXPLAIN antes/depois em staging).
--
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agencies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    ghl_agency_company_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.agency_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
    invited_by UUID REFERENCES auth.users(id),
    joined_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true NOT NULL,
    UNIQUE(agency_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.agency_workspaces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provisioning_mode TEXT NOT NULL CHECK (provisioning_mode IN ('auto_discovered', 'manual_byok')),
    ghl_location_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id)
);

-- ---------------------------------------------------------------------------
-- Indices de suporte (secao 3.3 do plano)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agency_members_user_active
    ON public.agency_members (user_id, agency_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agency_members_agency_active
    ON public.agency_members (agency_id, user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_ws_active
    ON public.agency_workspaces (workspace_id, agency_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agency_workspaces_agency
    ON public.agency_workspaces (agency_id, workspace_id);

-- ---------------------------------------------------------------------------
-- Funcoes helper de RLS (SECURITY DEFINER para evitar recursao de RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agency_member(p_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.agency_members
        WHERE agency_id = p_agency_id
          AND user_id = auth.uid()
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(p_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.agency_members
        WHERE agency_id = p_agency_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS + policies das 3 tabelas (leitura para membros; escrita via service_role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_workspaces ENABLE ROW LEVEL SECURITY;

-- agencies
DROP POLICY IF EXISTS agencies_read ON public.agencies;
CREATE POLICY agencies_read ON public.agencies FOR SELECT TO authenticated
    USING (public.is_agency_member(id));
DROP POLICY IF EXISTS "Service role full access on agencies" ON public.agencies;
CREATE POLICY "Service role full access on agencies" ON public.agencies FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- agency_members
DROP POLICY IF EXISTS agency_members_read ON public.agency_members;
CREATE POLICY agency_members_read ON public.agency_members FOR SELECT TO authenticated
    USING (public.is_agency_member(agency_id));
DROP POLICY IF EXISTS "Service role full access on agency_members" ON public.agency_members;
CREATE POLICY "Service role full access on agency_members" ON public.agency_members FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- agency_workspaces
DROP POLICY IF EXISTS agency_workspaces_read ON public.agency_workspaces;
CREATE POLICY agency_workspaces_read ON public.agency_workspaces FOR SELECT TO authenticated
    USING (public.is_agency_member(agency_id));
DROP POLICY IF EXISTS "Service role full access on agency_workspaces" ON public.agency_workspaces;
CREATE POLICY "Service role full access on agency_workspaces" ON public.agency_workspaces FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- GRANTs (mesmo padrao de __tests__/fixtures/test-db-grants.sql):
-- authenticated chega a tabela, RLS decide linha a linha; service_role pleno.
-- ---------------------------------------------------------------------------
GRANT ALL ON public.agencies, public.agency_members, public.agency_workspaces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies, public.agency_members, public.agency_workspaces TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_member(UUID), public.is_agency_admin(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
