-- ============================================================================
-- FASE 2 — Isolamento de credenciais — fatia 3: roteamento correto
-- docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 3, secoes 3.5 e 10.4)
--
-- Tres mudancas que fecham o "fallback silencioso para o workspace mais antigo":
--   (a) UNIQUE parcial em ghl_integration_settings(ghl_location_id) para linhas
--       ATIVAS — impede 2 tenants ativos com o mesmo location_id (roteamento
--       deterministicamente errado). Parcial permite historico de inativos.
--   (b) get_workspace_id_by_ghl_location_id(text) deixa de cair no "mais antigo":
--       sem match (ou vazio) => retorna NULL. Com a unique parcial, no maximo 1
--       ativo por location_id, entao o SELECT INTO e deterministico.
--   (c) webhook_unresolved (dead-letter, secao 10.4): todo evento inbound que
--       nao resolve workspace cai aqui (NUNCA descarte silencioso), com payload
--       para reprocessamento. RLS: service_role full; authenticated sem acesso
--       (evento nao resolvido nao tem workspace para filtrar — operacional).
--
-- Idempotente: CREATE INDEX IF NOT EXISTS / CREATE OR REPLACE FUNCTION /
-- CREATE TABLE IF NOT EXISTS. Pre-checado: ghl_integration_settings vazia no
-- banco de teste (0 duplicatas) em 2026-07-10 => unique aplica sem conflito.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- (a) Unicidade de location_id entre linhas ATIVAS -----------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_integration_settings_location_active
    ON public.ghl_integration_settings (ghl_location_id)
    WHERE ghl_location_id IS NOT NULL AND is_active = true;

-- (b) Fim do fallback "mais antigo" -------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_id_by_ghl_location_id(
    p_location_id text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_workspace_id uuid;
    v_clean_location_id text;
BEGIN
    v_clean_location_id := NULLIF(TRIM(p_location_id), '');

    IF v_clean_location_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Unique parcial (a) garante <= 1 ativo por location_id: SELECT INTO seguro.
    SELECT workspace_id INTO v_workspace_id
    FROM public.ghl_integration_settings
    WHERE ghl_location_id = v_clean_location_id
      AND is_active = true;

    -- Sem match => NULL (NAO cai mais no "workspace mais antigo").
    RETURN v_workspace_id;
END;
$$;

COMMENT ON FUNCTION public.get_workspace_id_by_ghl_location_id(text) IS
'Resolve workspace_id a partir do locationId GHL. Retorna NULL quando sem match ou vazio (fallback "mais antigo" removido na Fase 2/fatia 3). Eventos nao resolvidos vao para webhook_unresolved.';

-- (c) Dead-letter de eventos nao resolvidos (secao 10.4) ----------------------
CREATE TABLE IF NOT EXISTS public.webhook_unresolved (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL,                 -- ex: 'webhook-ghl','ghl-api-worker','outbound'
    location_id text,                     -- locationId que nao resolveu (se houver)
    reason text NOT NULL,                 -- 'no_match','ambiguous','missing_tenant','auth_failed'
    payload jsonb,                        -- payload original p/ reprocessamento
    headers jsonb,
    resolved_workspace_id uuid,           -- preenchido so quando conseguir resolver depois
    reprocessed_at timestamptz,           -- null = pendente de reprocessamento
    reprocess_attempts int NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_unresolved_pending
    ON public.webhook_unresolved (created_at)
    WHERE reprocessed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_unresolved_location
    ON public.webhook_unresolved (location_id);

ALTER TABLE public.webhook_unresolved ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (edge functions escrevem/leem para reprocessar)
DROP POLICY IF EXISTS "webhook_unresolved: service_role full access" ON public.webhook_unresolved;
CREATE POLICY "webhook_unresolved: service_role full access"
    ON public.webhook_unresolved FOR ALL
    TO service_role USING (true) WITH CHECK (true);

-- authenticated/anon: SEM acesso (evento nao resolvido nao tem workspace p/ filtrar)
-- (nenhuma policy para authenticated => negado por RLS)

REVOKE ALL ON public.webhook_unresolved FROM authenticated, anon;
GRANT ALL ON public.webhook_unresolved TO service_role;

NOTIFY pgrst, 'reload schema';
