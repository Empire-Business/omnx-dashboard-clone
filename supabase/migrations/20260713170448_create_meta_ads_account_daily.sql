-- =============================================================================
-- Migration: meta_ads_account_daily — total oficial de investimento por dia
--
-- CONTEXTO (bug de negócio, não de sync)
--   Descobrimos que somar `meta_ads_insights.spend` (nível de anúncio) pode
--   divergir SIGNIFICATIVAMENTE do total real da conta reportado pela própria
--   Meta (`level=account`). Em 2026-07, para o período 01/07-13/07: soma por
--   anúncio = R$35.593,78 vs level=account da Meta = R$17.296,07 (~2x).
--   Isso é um comportamento documentado da Meta Graph API — campanhas com
--   otimização de orçamento (CBO/Advantage+) e teste de criativos (Dynamic
--   Creative) fazem o sistema de entrega reportar spend por anúncio de forma
--   que, somado, pode superestimar bastante o gasto real da conta.
--
--   `meta_ads_insights` continua a fonte certa para granularidade (ranking de
--   criativos, campanhas, adsets) — nunca deve ser usada para o TOTAL de
--   investimento. Esta tabela nova é a fonte de verdade para o total.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meta_ads_account_daily (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID,
    account_id        TEXT NOT NULL,
    date              DATE NOT NULL,
    spend             NUMERIC(15,2) NOT NULL DEFAULT 0,
    account_currency  TEXT,
    raw_insight_id    UUID,
    fetched_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT meta_ads_account_daily_account_date_key UNIQUE (account_id, date)
);

COMMENT ON TABLE public.meta_ads_account_daily IS
  'Total oficial de investimento por dia, vindo do level=account da Meta Graph API. Fonte de verdade para "Investimento Total" — meta_ads_insights (level=ad) é só para granularidade e pode superestimar o total quando somado.';
COMMENT ON COLUMN public.meta_ads_account_daily.spend IS
  'Spend reportado pela Meta no nível de conta (não é soma de meta_ads_insights).';

CREATE INDEX IF NOT EXISTS idx_meta_ads_account_daily_date ON public.meta_ads_account_daily(date);
CREATE INDEX IF NOT EXISTS idx_meta_ads_account_daily_workspace ON public.meta_ads_account_daily(workspace_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_meta_ads_account_daily()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ads_account_daily_updated_at ON public.meta_ads_account_daily;
CREATE TRIGGER trg_meta_ads_account_daily_updated_at
  BEFORE UPDATE ON public.meta_ads_account_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_meta_ads_account_daily();

-- =============================================================================
-- RLS — mesmo padrão de meta_ads_insights (workspace + agência)
-- =============================================================================

ALTER TABLE public.meta_ads_account_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on meta_ads_account_daily" ON public.meta_ads_account_daily;
CREATE POLICY "Service role full access on meta_ads_account_daily"
ON public.meta_ads_account_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Workspace members can view meta_ads_account_daily" ON public.meta_ads_account_daily;
CREATE POLICY "Workspace members can view meta_ads_account_daily"
ON public.meta_ads_account_daily FOR SELECT TO authenticated
USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
);

-- NOTA: a policy "agencia_select_meta_ads_account_daily" (mesmo padrão de
-- agencia_select_meta_ads_insights, migration 20260722000000) NÃO foi criada
-- aqui de propósito — a função can_access_workspace_via_agency() ainda não
-- existe neste ambiente porque o backlog de migrations de agência (Fase 1-8
-- multi-tenant, 20260710000000 em diante) está pendente de aplicação nesta
-- produção, fora do escopo deste bugfix. Quando esse backlog for aplicado,
-- criar a policy análoga às demais tabelas meta_ads_* nessa mesma migration
-- ou numa nova, seguindo o padrão de 20260722000000_fase1_agency_rls_retrofit.sql.
