-- ============================================================================
-- FASE 1 (fatia 2a) — Funcao de RLS aditiva de agencia
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 3.3, 3.3.1)
--
-- Cria can_access_workspace_via_agency(p_workspace_id): concede acesso ao dono/
-- admin de uma agencia sobre uma sub-conta ATIVA daquela agencia. E o caminho
-- "segundo PERMISSIVE" que, na fatia 2b, sera adicionado as ~90 tabelas com RLS
-- de workspace (via gerador programatico). Nesta fatia a funcao fica criada e
-- testada isoladamente; NENHUMA policy de tabela existente e alterada aqui.
--
-- Ponto unico de risco maximo (secao 3.3.1): um bug nesta funcao abre/fecha
-- acesso cross-tenant em todas as tabelas de uma vez. Por isso:
--   - filtro OBRIGATORIO aw.status = 'active' (sub-conta suspensa = acesso zero);
--   - role restrito a ('owner','admin') (staff nunca concede);
--   - is_active = true obrigatorio;
--   - suite dedicada em __tests__/integration/agency-rls-functions.test.ts.
--
-- Idempotente (OR REPLACE). NAO aplicar em producao fora do pipeline.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.can_access_workspace_via_agency(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.agency_workspaces aw
        JOIN public.agency_members am ON am.agency_id = aw.agency_id
        WHERE aw.workspace_id = p_workspace_id
          AND aw.status = 'active'
          AND am.user_id = auth.uid()
          AND am.is_active = true
          AND am.role IN ('owner', 'admin')
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_workspace_via_agency(UUID) TO anon, authenticated, service_role;
