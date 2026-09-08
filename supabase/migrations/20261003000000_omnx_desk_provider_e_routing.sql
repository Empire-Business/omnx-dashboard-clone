-- ============================================================================
-- Multi-tenant omnx-desk: provider 'omnx_desk' + roteamento por secret (digest)
-- ============================================================================
-- Prepara o isolamento por conta omnx-desk (docs/INTEGRACAO-OMNX-DESK-VENDAS.md §7):
--   1. Amplia o CHECK de provider de workspace_integration_credentials para
--      aceitar 'omnx_desk' (cada conta guarda seu secret exclusivo no Vault +
--      o digest SHA-256 do secret em metadata->>'secret_sha256' para lookup).
--   2. RPC resolve_workspace_by_omnx_desk_secret_digest(p_digest) — dado o digest
--      do secret recebido, devolve o workspace dono (ou NULL). SECURITY DEFINER,
--      EXECUTE só para service_role (fail-closed; a edge function usa service_role).
--
-- O digest é hash de mão-única — não é o segredo; pode viver em metadata (que a
-- própria tabela documenta como "não sensível"). O segredo real continua no Vault.
--
-- Isolamento real (na edge function, não aqui): a oportunidade precisa pertencer
-- ao workspace resolvido, senão 403. Este SQL só habilita o roteamento por conta.
--
-- Idempotente. O DROP CONSTRAINT/ADD CONSTRAINT dispara a guarda de "destrutivo"
-- do apply-migration (por conter DROP ... CONSTRAINT), mas é apenas ampliação de
-- allowlist — aplicar com --allow-destructive é seguro (nenhum dado perdido).
-- ============================================================================
SET search_path = public, pg_catalog;

-- 1. Ampliar o CHECK de provider para incluir 'omnx_desk'.
ALTER TABLE public.workspace_integration_credentials
  DROP CONSTRAINT IF EXISTS workspace_integration_credentials_provider_check;
ALTER TABLE public.workspace_integration_credentials
  ADD CONSTRAINT workspace_integration_credentials_provider_check
  CHECK (provider IN ('ghl', 'meta', 'openrouter', 'notion', 'outbound_webhook', 'omnx_desk'));

-- Índice para o lookup por digest (poucas contas hoje, mas mantém O(log n)).
CREATE INDEX IF NOT EXISTS idx_wic_omnx_desk_secret_digest
  ON public.workspace_integration_credentials ((metadata->>'secret_sha256'))
  WHERE provider = 'omnx_desk';

-- 2. RPC de resolução por digest do secret (secret → workspace).
CREATE OR REPLACE FUNCTION public.resolve_workspace_by_omnx_desk_secret_digest(p_digest text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT wic.workspace_id
  FROM public.workspace_integration_credentials wic
  WHERE wic.provider = 'omnx_desk'
    AND wic.metadata->>'secret_sha256' = p_digest
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_workspace_by_omnx_desk_secret_digest(text) IS
  'Roteamento omnx-desk: dado o digest SHA-256 do secret recebido, devolve o workspace dono (ou NULL). service_role only.';

-- Fail-closed: revoga de PUBLIC/anon/authenticated; só service_role executa.
REVOKE ALL ON FUNCTION public.resolve_workspace_by_omnx_desk_secret_digest(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_workspace_by_omnx_desk_secret_digest(text) TO service_role;

NOTIFY pgrst, 'reload schema';
