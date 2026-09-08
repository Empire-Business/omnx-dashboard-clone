-- ============================================================================
-- FASE 2 — Isolamento de credenciais — fatia 1: tabela workspace_integration_credentials
-- docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 1)
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 5.1)
--
-- Cria a tabela de credenciais por workspace (provider + ref ao Vault), com
-- rotation_version (invalidacao de cache, secao 5.3) e updated_at (trigger).
-- O segredo real fica no Vault (secret_key_id), NUNCA em texto plano.
-- RLS: SOMENTE service_role acessa; authenticated/anon NAO leem (teste negativo).
--
-- Pre-requisito (Fatia 0, verificado em 2026-07-10 no banco de teste):
--   - supabase_vault v0.3.1 instalada; authenticated/anon sem acesso ao schema vault.
--   CREATE EXTENSION IF NOT EXISTS abaixo e idempotente (no-op onde ja existe).
--
-- Idempotente: IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- Pre-requisito de ambiente (idempotente; no-op onde ja existe).
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE TABLE IF NOT EXISTS public.workspace_integration_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('ghl', 'meta', 'openrouter', 'notion', 'outbound_webhook')),
    secret_key_id UUID NOT NULL,                  -- referencia a vault.secrets (nunca plaintext; sem FK por ser schema gerenciado)
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,  -- nao sensivel (location_id, ad_account_id, database_id)
    rotation_version INTEGER DEFAULT 1 NOT NULL,  -- incrementado a cada rotacao/revogacao (secao 5.3)
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wic_workspace_provider
    ON public.workspace_integration_credentials (workspace_id, provider);

-- updated_at automatico (funcao propria para nao colidir com helpers existentes).
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.workspace_integration_credentials;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.workspace_integration_credentials
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS: somente service_role. authenticated/anon NAO leem (negativo obrigatorio).
ALTER TABLE public.workspace_integration_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on workspace_integration_credentials" ON public.workspace_integration_credentials;
CREATE POLICY "Service role full access on workspace_integration_credentials"
    ON public.workspace_integration_credentials FOR ALL TO service_role
    USING (true) WITH CHECK (true);
-- (nenhuma policy para authenticated/anon => com RLS enabled, negado por default)

-- Grants: service_role pleno; authenticated/anon NENHUM (defesa em profundidade).
GRANT ALL ON public.workspace_integration_credentials TO service_role;
REVOKE ALL ON public.workspace_integration_credentials FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';
