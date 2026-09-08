-- ============================================================
-- Migration: 20260924000001
-- Meta Ads: trigger fail-closed validando vínculo conta ↔ workspace
--
-- Reforço da migration 20260924000000: mesmo que alguém insira diretamente
-- nas tabelas Meta Ads (service_role, scripts, APIs), o banco rejeita se a
-- account_id não estiver cadastrada em workspace_meta_ad_accounts para o
-- workspace informado.
-- ============================================================
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION trg_validar_meta_ad_account_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id nao pode ser NULL em %', TG_TABLE_NAME;
    END IF;

    IF NEW.account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM workspace_meta_ad_accounts
        WHERE workspace_id = NEW.workspace_id
          AND account_id = NEW.account_id
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'account_id % nao esta vinculada ao workspace % em workspace_meta_ad_accounts',
            NEW.account_id, NEW.workspace_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ads_insights_validar_conta ON meta_ads_insights;
CREATE TRIGGER trg_meta_ads_insights_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_insights
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

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

DROP TRIGGER IF EXISTS trg_meta_ads_account_daily_validar_conta ON meta_ads_account_daily;
CREATE TRIGGER trg_meta_ads_account_daily_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_account_daily
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

DROP TRIGGER IF EXISTS trg_meta_ads_campaigns_validar_conta ON meta_ads_campaigns;
CREATE TRIGGER trg_meta_ads_campaigns_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_campaigns
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

CREATE OR REPLACE FUNCTION trg_validar_meta_ads_breakdown_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id nao pode ser NULL em meta_ads_insights_breakdowns';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_ads_insights_breakdowns_validar_workspace ON meta_ads_insights_breakdowns;
CREATE TRIGGER trg_meta_ads_insights_breakdowns_validar_workspace
  BEFORE INSERT OR UPDATE ON meta_ads_insights_breakdowns
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ads_breakdown_workspace();
