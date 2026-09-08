-- ============================================================
-- Migration: 20260924000002
-- Corrige trigger de validação para meta_ads_raw_insights
--
-- A tabela raw_insights não tem coluna account_id; a account está em
-- params->>'account_id'. A migration 20260924000001 usou a função genérica
-- que referenciava NEW.account_id, causando erro 42703 em inserts.
-- ============================================================
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION trg_validar_meta_ads_raw_account_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    IF NEW.workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id nao pode ser NULL em meta_ads_raw_insights';
    END IF;

    v_account_id := NEW.params->>'account_id';
    IF v_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM workspace_meta_ad_accounts
        WHERE workspace_id = NEW.workspace_id
          AND account_id = v_account_id
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'account_id % (em params) nao esta vinculada ao workspace % em workspace_meta_ad_accounts',
            v_account_id, NEW.workspace_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ads_raw_insights_validar_conta ON meta_ads_raw_insights;
CREATE TRIGGER trg_meta_ads_raw_insights_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_raw_insights
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ads_raw_account_workspace();
