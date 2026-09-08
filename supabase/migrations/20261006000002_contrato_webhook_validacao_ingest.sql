-- ============================================================
-- Migration: 20261005000001
-- CONTRATO DE WEBHOOK CRM OMNX — validação de formato no ingest
-- (ver docs/CONTRATO-WEBHOOK-CRM.md)
--
-- CONTEXTO: webhook-ghl/index.ts agora checa o FORMATO de cada payload
-- contra o contrato (supabase/functions/_shared/webhook-ghl-contract.ts) —
-- nunca bloqueia nem descarta o evento (webhooks_ghl continua imutável e
-- recebendo 100% do tráfego autenticado), só registra quando o payload foge
-- do contrato: falta identificador (contact_id/id) ou traz customData com
-- chaves fora do vocabulário fixo. Esta tabela é o destino desse registro —
-- mesmo padrão de observabilidade de ghl_mapping_change_alerts
-- (20260819000000), reaproveitado aqui para o novo tipo de alerta.
-- ============================================================
SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.webhook_contract_mismatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    location_id TEXT,
    webhook_ghl_id UUID REFERENCES public.webhooks_ghl(id) ON DELETE CASCADE,
    missing_identifiers TEXT[] NOT NULL DEFAULT '{}',
    unknown_customdata_keys TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.webhook_contract_mismatches IS
'Vigilância do contrato de webhook (docs/CONTRATO-WEBHOOK-CRM.md): registra quando um payload autenticado foge do contrato (sem contact_id/id, ou customData com chave fora do vocabulário fixo). O evento em si SEMPRE é gravado em webhooks_ghl — esta tabela é só observabilidade/alerta, nunca bloqueio.';

CREATE INDEX IF NOT EXISTS idx_webhook_contract_mismatches_workspace_pending
    ON public.webhook_contract_mismatches (workspace_id)
    WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_contract_mismatches_created
    ON public.webhook_contract_mismatches (created_at DESC);

ALTER TABLE public.webhook_contract_mismatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_contract_mismatches: owner/admin le" ON public.webhook_contract_mismatches;
CREATE POLICY "webhook_contract_mismatches: owner/admin le"
    ON public.webhook_contract_mismatches FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = webhook_contract_mismatches.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "webhook_contract_mismatches: owner/admin reconhece" ON public.webhook_contract_mismatches;
CREATE POLICY "webhook_contract_mismatches: owner/admin reconhece"
    ON public.webhook_contract_mismatches FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = webhook_contract_mismatches.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = webhook_contract_mismatches.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "webhook_contract_mismatches: service_role full access" ON public.webhook_contract_mismatches;
CREATE POLICY "webhook_contract_mismatches: service_role full access"
    ON public.webhook_contract_mismatches FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

REVOKE ALL ON public.webhook_contract_mismatches FROM anon;
GRANT SELECT, UPDATE ON public.webhook_contract_mismatches TO authenticated;
GRANT ALL ON public.webhook_contract_mismatches TO service_role;

-- ------------------------------------------------------------------
-- RPC de resumo — usada pela vigilância (dashboard/alerta) para saber se um
-- workspace tem mismatches recentes não reconhecidos, sem expor o payload
-- completo (que fica só acessível via service_role/RLS de owner-admin).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_contract_mismatches_pending(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COUNT(*)::INTEGER
    FROM public.webhook_contract_mismatches
    WHERE workspace_id = p_workspace_id
      AND acknowledged_at IS NULL
      AND created_at > now() - interval '7 days';
$$;

COMMENT ON FUNCTION public.count_contract_mismatches_pending(UUID) IS
'Quantos webhooks recentes (7 dias) fugiram do contrato e ainda não foram reconhecidos pelo owner/admin. Usado pela vigilância (docs/CONTRATO-WEBHOOK-CRM.md).';

REVOKE ALL ON FUNCTION public.count_contract_mismatches_pending(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_contract_mismatches_pending(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
