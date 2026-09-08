-- ============================================================
-- Migration: 20260716000002
-- Backfill de workspace_id em meta_ads_insights
--
-- Problema: 9.842 linhas (94%) da tabela meta_ads_insights estavam
-- com workspace_id NULL porque versoes antigas do sync-meta-ads nao
-- populavam a coluna. Isso fez os snapshots cohort de trafego
-- registrarem meta_spend = 0 para semanas anteriores a 2026-07-09,
-- distorcendo CPMQL, ROAS e benchmarks da Clara.
--
-- Contexto: projeto single-tenant-lock, apenas uma account_id Meta
-- ativa (act_716772443330289) e ela ja esta vinculada ao workspace
-- default. A account_id Burn-in Interno nunca recebeu dados Meta.
-- ============================================================
SET search_path = public, pg_catalog;

DO $$
DECLARE
    v_default_workspace_id UUID := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
    v_count INT;
BEGIN
    UPDATE public.meta_ads_insights
    SET workspace_id = v_default_workspace_id
    WHERE workspace_id IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RAISE NOTICE 'Backfill meta_ads_insights.workspace_id: % linhas atualizadas', v_count;
END;
$$;

-- Garante que novas linhas nao cheguem sem workspace (best-effort,
-- o sync-meta-ads ja deve preencher; trigger de seguranca).
ALTER TABLE public.meta_ads_insights
    ALTER COLUMN workspace_id SET NOT NULL;
