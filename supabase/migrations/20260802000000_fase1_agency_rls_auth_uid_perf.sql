-- ============================================================================
-- FASE 1 (correcao de performance, achado da auditoria de seguranca pre-merge)
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 5.2 do security-auditor: RLS
-- performance — (SELECT auth.uid()) vs auth.uid() direto)
--
-- is_agency_member(), is_agency_admin() e can_access_workspace_via_agency()
-- chamavam auth.uid() SEM o wrapper (SELECT auth.uid()). Sem o wrapper, o
-- Postgres reavalia auth.uid() por LINHA dentro da policy (em vez de uma vez
-- por query, via initPlan) — e essas 3 funcoes sao usadas em 198 policies de
-- 85 tabelas (retrofit da fatia 2b). Isso e consistente com o sinal (ainda que
-- inconclusivo) do smoke test de performance
-- (__tests__/integration/agency-rls-performance-smoke.test.ts).
--
-- Correcao: mesma logica, so trocando auth.uid() por (SELECT auth.uid()) nas
-- 3 funcoes. NAO muda semantica de seguranca (mesmo resultado, mesma
-- autorizacao) — so performance. CREATE OR REPLACE, idempotente.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.is_agency_member(p_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.agency_members
        WHERE agency_id = p_agency_id
          AND user_id = (SELECT auth.uid())
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(p_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.agency_members
        WHERE agency_id = p_agency_id
          AND user_id = (SELECT auth.uid())
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace_via_agency(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.agency_workspaces aw
        JOIN public.agency_members am ON am.agency_id = aw.agency_id
        WHERE aw.workspace_id = p_workspace_id
          AND aw.status = 'active'
          AND am.user_id = (SELECT auth.uid())
          AND am.is_active = true
          AND am.role IN ('owner', 'admin')
    );
$$;

NOTIFY pgrst, 'reload schema';
