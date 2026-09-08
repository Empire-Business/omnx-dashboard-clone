-- ============================================================================
-- FASE 3 — Descoberta de sub-contas — fatia 1: tabela agency_ghl_credentials
-- docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.1)
-- docs/PLANO-MULTI-TENANT-AGENCY.md
--
-- Guarda o token de agencia do GHL (Private Integration Token, SO-LEITURA por
-- decisao do dono — docs/FASE-3-POC-RESULTADOS.md) usado exclusivamente para
-- listar sub-contas via GET /locations/search. O segredo real fica no Vault
-- (secret_key_id); esta tabela guarda so o ponteiro + company_id (nao sensivel).
--
-- Mesmo padrao de workspace_integration_credentials
-- (20260723000000_fase2_workspace_integration_credentials.sql): RLS somente
-- service_role, updated_at via trigger reaproveitado (tg_set_updated_at).
--
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE TABLE IF NOT EXISTS public.agency_ghl_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
    secret_key_id UUID NOT NULL,      -- referencia a vault.secrets (nunca plaintext)
    company_id TEXT NOT NULL,         -- ghl agency companyId, nao sensivel
    rotation_version INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS set_updated_at ON public.agency_ghl_credentials;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.agency_ghl_credentials
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS: somente service_role. authenticated/anon NAO leem (negativo obrigatorio).
ALTER TABLE public.agency_ghl_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on agency_ghl_credentials" ON public.agency_ghl_credentials;
CREATE POLICY "Service role full access on agency_ghl_credentials"
    ON public.agency_ghl_credentials FOR ALL TO service_role
    USING (true) WITH CHECK (true);
-- (nenhuma policy para authenticated/anon => com RLS enabled, negado por default)

GRANT ALL ON public.agency_ghl_credentials TO service_role;
REVOKE ALL ON public.agency_ghl_credentials FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';
