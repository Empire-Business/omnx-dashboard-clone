-- ============================================================
-- Migration: 20260924000003
-- Backfill de workspace_id para linhas Meta Ads com account_id NULL
--
-- A migration 20260924000000 preenche workspace_id via account_id ->
-- workspace_meta_ad_accounts. Em produção existem linhas legadas com
-- account_id NULL (principalmente em meta_ads_raw_insights e
-- meta_ads_account_daily). Como o projeto opera em single-tenant-lock e só
-- existe uma conta Meta ativa no histórico, o fallback seguro é atribuir essas
-- linhas ao workspace Default.
-- ============================================================
SET search_path = public, pg_catalog;

DO $$
DECLARE
    v_default_workspace_id UUID := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = v_default_workspace_id) THEN
        RETURN;
    END IF;

    UPDATE meta_ads_raw_insights
    SET workspace_id = v_default_workspace_id
    WHERE workspace_id IS NULL
      AND (params->>'account_id' IS NULL);

    UPDATE meta_ads_account_daily
    SET workspace_id = v_default_workspace_id
    WHERE workspace_id IS NULL
      AND account_id IS NULL;
END;
$$;
