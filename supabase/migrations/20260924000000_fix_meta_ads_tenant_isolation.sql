-- ============================================================
-- Migration: 20260924000000
-- Meta Ads: isolamento multi-tenant completo
--
-- O que fecha:
--   1. Cria tabela workspace_meta_ad_accounts (conta ↔ workspace).
--   2. Faz backfill seguro de workspace_id em raw_insights,
--      insights_breakdowns e campaigns (usando account_id → workspace).
--   3. Torna workspace_id NOT NULL em raw_insights, breakdowns e campaigns.
--   4. Ajusta UNIQUE constraints para incluir workspace_id.
--   5. Aperta policies RLS (remove workspace_id IS NULL).
--   6. Recria processar_meta_ads_raw* sem COALESCE de workspace_id.
--   7. Valida CHECK de meta_ads_account_daily.
--
-- Dependências:
--   20260705000002_add_workspace_id_meta_ads.sql
--   20260716000002_backfill_meta_ads_workspace_id.sql
--   20260823000000_fix_meta_ads_account_daily_tenant_isolation.sql
-- ============================================================
SET search_path = public, pg_catalog;

-- ============================================================
-- 1. TABELA DE MAPEAMENTO CONTA META ↔ WORKSPACE
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_meta_ad_accounts (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id   TEXT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, account_id)
);

COMMENT ON TABLE workspace_meta_ad_accounts IS
  'Mapeamento formal de contas de anúncios Meta para workspaces. Fonte de verdade do isolamento multi-tenant de Meta Ads.';

-- Uma conta ativa só pode pertencer a um workspace (regra de negócio atual).
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_meta_ad_accounts_active_account
  ON workspace_meta_ad_accounts(account_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workspace_meta_ad_accounts_workspace
  ON workspace_meta_ad_accounts(workspace_id);

-- RLS
ALTER TABLE workspace_meta_ad_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on workspace_meta_ad_accounts" ON workspace_meta_ad_accounts;
CREATE POLICY "Service role full access on workspace_meta_ad_accounts"
  ON workspace_meta_ad_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Workspace members can view workspace_meta_ad_accounts" ON workspace_meta_ad_accounts;
CREATE POLICY "Workspace members can view workspace_meta_ad_accounts"
  ON workspace_meta_ad_accounts FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

GRANT SELECT ON workspace_meta_ad_accounts TO authenticated;

-- ============================================================
-- 2. SEED DO MAPEAMENTO CONHECIDO (workspace Default)
-- ============================================================
DO $$
DECLARE
    v_default_workspace_id UUID := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
    v_default_account_id   TEXT := 'act_716772443330289';
BEGIN
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = v_default_workspace_id) THEN
        INSERT INTO workspace_meta_ad_accounts (workspace_id, account_id)
        VALUES (v_default_workspace_id, v_default_account_id)
        ON CONFLICT (workspace_id, account_id) DO NOTHING;
    END IF;
END;
$$;

-- ============================================================
-- 3. ADICIONAR workspace_id EM meta_ads_campaigns
-- ============================================================
ALTER TABLE meta_ads_campaigns
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_meta_ads_campaigns_workspace
  ON meta_ads_campaigns(workspace_id);

-- ============================================================
-- 4. BACKFILL SEGURO DE workspace_id
-- ============================================================
-- raw_insights: resolve pelo account_id nos params
UPDATE meta_ads_raw_insights r
SET workspace_id = wmaa.workspace_id
FROM workspace_meta_ad_accounts wmaa
WHERE r.workspace_id IS NULL
  AND r.params->>'account_id' = wmaa.account_id;

-- raw_insights com account_id NULL: atribui ao workspace Default (única conta
-- ativa no histórico; fallback seguro em single-tenant-lock).
DO $$
DECLARE
    v_default_workspace_id UUID := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
BEGIN
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = v_default_workspace_id) THEN
        UPDATE meta_ads_raw_insights
        SET workspace_id = v_default_workspace_id
        WHERE workspace_id IS NULL
          AND (params->>'account_id' IS NULL);
    END IF;
END;
$$;

-- breakdowns: herda do insight pai
UPDATE meta_ads_insights_breakdowns b
SET workspace_id = i.workspace_id
FROM meta_ads_insights i
WHERE b.workspace_id IS NULL
  AND b.insights_id = i.id
  AND i.workspace_id IS NOT NULL;

-- campaigns: resolve pelo account_id
UPDATE meta_ads_campaigns c
SET workspace_id = wmaa.workspace_id
FROM workspace_meta_ad_accounts wmaa
WHERE c.workspace_id IS NULL
  AND c.account_id = wmaa.account_id;

-- ============================================================
-- 5. NOT NULL em workspace_id
-- ============================================================
ALTER TABLE meta_ads_raw_insights
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE meta_ads_insights_breakdowns
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE meta_ads_campaigns
  ALTER COLUMN workspace_id SET NOT NULL;

-- account_daily: remove duplicatas legadas (NULL que colidiriam com preenchidas)
-- antes de fazer o backfill.
DELETE FROM meta_ads_account_daily d1
WHERE d1.workspace_id IS NULL
  AND EXISTS (
    SELECT 1 FROM workspace_meta_ad_accounts wmaa
    WHERE wmaa.account_id = d1.account_id
      AND EXISTS (
        SELECT 1 FROM meta_ads_account_daily d2
        WHERE d2.workspace_id = wmaa.workspace_id
          AND d2.account_id = d1.account_id
          AND d2.date = d1.date
      )
  );

-- account_daily: resolve pelo account_id e fallback para Default
UPDATE meta_ads_account_daily d
SET workspace_id = wmaa.workspace_id
FROM workspace_meta_ad_accounts wmaa
WHERE d.workspace_id IS NULL
  AND d.account_id = wmaa.account_id;

DO $$
DECLARE
    v_default_workspace_id UUID := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
BEGIN
    IF EXISTS (SELECT 1 FROM workspaces WHERE id = v_default_workspace_id) THEN
        UPDATE meta_ads_account_daily
        SET workspace_id = v_default_workspace_id
        WHERE workspace_id IS NULL
          AND account_id IS NULL;
    END IF;
END;
$$;

-- Valida e torna NOT NULL em account_daily
ALTER TABLE meta_ads_account_daily
  VALIDATE CONSTRAINT meta_ads_account_daily_workspace_id_required;

ALTER TABLE meta_ads_account_daily
  ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================
-- 6. UNIQUE CONSTRAINTS COM workspace_id
-- ============================================================
ALTER TABLE meta_ads_insights
  DROP CONSTRAINT IF EXISTS meta_ads_insights_ad_id_date_key;

ALTER TABLE meta_ads_insights
  ADD CONSTRAINT meta_ads_insights_workspace_ad_id_date_key
  UNIQUE (workspace_id, ad_id, date);

ALTER TABLE meta_ads_insights_breakdowns
  DROP CONSTRAINT IF EXISTS meta_ads_insights_breakdowns_insights_id_region_country_key;

ALTER TABLE meta_ads_insights_breakdowns
  ADD CONSTRAINT meta_ads_insights_breakdowns_workspace_insights_id_region_country_key
  UNIQUE (workspace_id, insights_id, region, country);

ALTER TABLE meta_ads_campaigns
  ADD CONSTRAINT meta_ads_campaigns_workspace_campaign_id_key
  UNIQUE (workspace_id, campaign_id);

-- ============================================================
-- 7. POLICIES RLS FAIL-CLOSED
-- ============================================================
DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights" ON meta_ads_insights;
CREATE POLICY "Workspace members can view meta_ads_insights"
  ON meta_ads_insights FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights_breakdowns" ON meta_ads_insights_breakdowns;
CREATE POLICY "Workspace members can view meta_ads_insights_breakdowns"
  ON meta_ads_insights_breakdowns FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members can view meta_ads_raw_insights" ON meta_ads_raw_insights;
CREATE POLICY "Workspace members can view meta_ads_raw_insights"
  ON meta_ads_raw_insights FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members can view meta_ads_sync_log" ON meta_ads_sync_log;
CREATE POLICY "Workspace members can view meta_ads_sync_log"
  ON meta_ads_sync_log FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "agencia_select_meta_ads_account_daily" ON meta_ads_account_daily;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_account_daily" ON meta_ads_account_daily;
CREATE POLICY "Workspace members can view meta_ads_account_daily"
  ON meta_ads_account_daily FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members can view meta_ads_campaigns" ON meta_ads_campaigns;
CREATE POLICY "Workspace members can view meta_ads_campaigns"
  ON meta_ads_campaigns FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members can view workspace_meta_ad_accounts" ON workspace_meta_ad_accounts;
CREATE POLICY "Workspace members can view workspace_meta_ad_accounts"
  ON workspace_meta_ad_accounts FOR SELECT TO authenticated
  USING (
    is_workspace_member(workspace_id)
    OR can_access_workspace_via_agency(workspace_id)
  );

-- ============================================================
-- 8. FUNCTIONS SEM COALESCE DE workspace_id
-- ============================================================
DROP FUNCTION IF EXISTS processar_meta_ads_raw(UUID);

CREATE OR REPLACE FUNCTION processar_meta_ads_raw(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw                RECORD;
    v_insight            JSONB;
    v_actions            JSONB;
    v_insights_count     INTEGER := 0;
    v_breakdowns_count   INTEGER := 0;
    v_insight_id         UUID;
    v_workspace_id       UUID;
    v_landing_page_views INTEGER := 0;
    v_video_views        INTEGER := 0;
    v_link_clicks        INTEGER := 0;
    v_leads              INTEGER := 0;
    v_onsite_web_leads   INTEGER := 0;
    v_fb_pixel_leads     INTEGER := 0;
BEGIN
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;

    -- GUARDA DE SEGURANÇA: registros com breakdowns devem usar a função específica
    IF (v_raw.params->'breakdowns') IS NOT NULL AND jsonb_array_length(v_raw.params->'breakdowns') > 0 THEN
        RAISE EXCEPTION 'Raw com breakdowns deve ser processado por processar_meta_ads_raw_region_breakdown';
    END IF;

    -- workspace_id OBRIGATÓRIO (fail-closed)
    v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id obrigatorio em params do raw (isolamento multi-tenant)';
    END IF;

    IF v_raw.response_data->'data' IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_raw.response_data->'data') - 1 LOOP
            v_insight := v_raw.response_data->'data'->i;
            v_actions := COALESCE(v_insight->'actions', '[]'::jsonb);

            v_landing_page_views := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "landing_page_view").value')  #>> '{}')::INTEGER, 0);
            v_video_views        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "video_view").value')         #>> '{}')::INTEGER, 0);
            v_link_clicks        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "link_click").value')         #>> '{}')::INTEGER, 0);
            v_leads              := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "lead").value')               #>> '{}')::INTEGER, 0);
            v_onsite_web_leads   := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "onsite_web_lead").value')    #>> '{}')::INTEGER, 0);
            v_fb_pixel_leads     := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value') #>> '{}')::INTEGER, 0);

            INSERT INTO meta_ads_insights (
                workspace_id, account_id, campaign_id, campaign_name, adset_id, adset_name,
                ad_id, ad_name, date, spend, impressions, clicks, reach, frequency, ctr,
                cpc, cpm, cpp, actions, conversions, conversion_values, cost_per_action_type,
                video_metrics, quality_ranking, engagement_rate_ranking, conversion_rate_ranking,
                raw_insight_id, fetched_at, landing_page_views, video_views, link_clicks,
                leads, onsite_web_leads, fb_pixel_leads
            ) VALUES (
                v_workspace_id,
                v_raw.params->>'account_id',
                v_insight->>'campaign_id',
                v_insight->>'campaign_name',
                v_insight->>'adset_id',
                v_insight->>'adset_name',
                v_insight->>'ad_id',
                v_insight->>'ad_name',
                (v_insight->>'date_start')::DATE,
                COALESCE((v_insight->>'spend')::DECIMAL, 0),
                COALESCE((v_insight->>'impressions')::INTEGER, 0),
                COALESCE((v_insight->>'clicks')::INTEGER, 0),
                COALESCE((v_insight->>'reach')::INTEGER, 0),
                (v_insight->>'frequency')::DECIMAL,
                (v_insight->>'ctr')::DECIMAL,
                (v_insight->>'cpc')::DECIMAL,
                (v_insight->>'cpm')::DECIMAL,
                (v_insight->>'cpp')::DECIMAL,
                v_actions,
                COALESCE(v_insight->'conversions', '[]'::jsonb),
                COALESCE(v_insight->'conversion_values', '[]'::jsonb),
                COALESCE(v_insight->'cost_per_action_type', '[]'::jsonb),
                jsonb_build_object(
                    'p25',      v_insight->'video_p25_watched_actions',
                    'p50',      v_insight->'video_p50_watched_actions',
                    'p75',      v_insight->'video_p75_watched_actions',
                    'p95',      v_insight->'video_p95_watched_actions',
                    'p100',     v_insight->'video_p100_watched_actions',
                    'avg_time', v_insight->'video_avg_time_watched_actions'
                ),
                v_insight->>'quality_ranking',
                v_insight->>'engagement_rate_ranking',
                v_insight->>'conversion_rate_ranking',
                p_raw_id,
                v_raw.fetch_finished_at,
                v_landing_page_views,
                v_video_views,
                v_link_clicks,
                v_leads,
                v_onsite_web_leads,
                v_fb_pixel_leads
            )
            ON CONFLICT (workspace_id, ad_id, date) DO UPDATE SET
                account_id              = EXCLUDED.account_id,
                campaign_name           = EXCLUDED.campaign_name,
                adset_name              = EXCLUDED.adset_name,
                ad_name                 = EXCLUDED.ad_name,
                spend                   = EXCLUDED.spend,
                impressions             = EXCLUDED.impressions,
                clicks                  = EXCLUDED.clicks,
                reach                   = EXCLUDED.reach,
                frequency               = EXCLUDED.frequency,
                ctr                     = EXCLUDED.ctr,
                cpc                     = EXCLUDED.cpc,
                cpm                     = EXCLUDED.cpm,
                cpp                     = EXCLUDED.cpp,
                actions                 = EXCLUDED.actions,
                conversions             = EXCLUDED.conversions,
                conversion_values       = EXCLUDED.conversion_values,
                cost_per_action_type    = EXCLUDED.cost_per_action_type,
                video_metrics           = EXCLUDED.video_metrics,
                quality_ranking         = EXCLUDED.quality_ranking,
                engagement_rate_ranking = EXCLUDED.engagement_rate_ranking,
                conversion_rate_ranking = EXCLUDED.conversion_rate_ranking,
                landing_page_views      = EXCLUDED.landing_page_views,
                video_views             = EXCLUDED.video_views,
                link_clicks             = EXCLUDED.link_clicks,
                leads                   = EXCLUDED.leads,
                onsite_web_leads        = EXCLUDED.onsite_web_leads,
                fb_pixel_leads          = EXCLUDED.fb_pixel_leads,
                raw_insight_id          = EXCLUDED.raw_insight_id,
                fetched_at              = EXCLUDED.fetched_at
            RETURNING id INTO v_insight_id;

            v_insights_count := v_insights_count + 1;

            IF v_insight->>'age' IS NOT NULL
               OR v_insight->>'gender' IS NOT NULL
               OR v_insight->>'publisher_platform' IS NOT NULL THEN
                INSERT INTO meta_ads_insights_breakdowns (
                    workspace_id, insights_id, age, gender, country, region,
                    impression_device, publisher_platform, platform_position,
                    spend, impressions, clicks, reach
                ) VALUES (
                    v_workspace_id,
                    v_insight_id,
                    v_insight->>'age',
                    v_insight->>'gender',
                    v_insight->>'country',
                    v_insight->>'region',
                    v_insight->>'impression_device',
                    v_insight->>'publisher_platform',
                    v_insight->>'platform_position',
                    COALESCE((v_insight->>'spend')::DECIMAL, 0),
                    COALESCE((v_insight->>'impressions')::INTEGER, 0),
                    COALESCE((v_insight->>'clicks')::INTEGER, 0),
                    COALESCE((v_insight->>'reach')::INTEGER, 0)
                );
                v_breakdowns_count := v_breakdowns_count + 1;
            END IF;
        END LOOP;
    END IF;

    UPDATE meta_ads_raw_insights
    SET processado_em = now()
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

DROP FUNCTION IF EXISTS processar_meta_ads_raw_region_breakdown(UUID);

CREATE OR REPLACE FUNCTION processar_meta_ads_raw_region_breakdown(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw              RECORD;
    v_rec              RECORD;
    v_insights_count   INTEGER := 0;
    v_breakdowns_count INTEGER := 0;
    v_insight_id       UUID;
    v_workspace_id     UUID;
    v_inserted_rows    INTEGER;
BEGIN
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;

    IF (v_raw.params->'breakdowns') IS NULL OR jsonb_array_length(v_raw.params->'breakdowns') = 0 THEN
        RETURN jsonb_build_object(
            'erro',
            'Registro raw não possui breakdowns. Use processar_meta_ads_raw para o sync padrão.'
        );
    END IF;

    -- workspace_id OBRIGATÓRIO (fail-closed)
    v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id obrigatorio em params do raw (isolamento multi-tenant)';
    END IF;

    IF v_raw.response_data->'data' IS NULL OR jsonb_array_length(v_raw.response_data->'data') = 0 THEN
        UPDATE meta_ads_raw_insights SET processado_em = now() WHERE id = p_raw_id;
        RETURN jsonb_build_object(
            'insights_inseridos',   0,
            'breakdowns_inseridos', 0
        );
    END IF;

    FOR v_rec IN
        WITH exploded AS (
            SELECT
                v_raw.params->>'account_id'                              AS account_id,
                v_insight->>'campaign_id'                                AS campaign_id,
                v_insight->>'campaign_name'                              AS campaign_name,
                v_insight->>'adset_id'                                   AS adset_id,
                v_insight->>'adset_name'                                 AS adset_name,
                v_insight->>'ad_id'                                      AS ad_id,
                v_insight->>'ad_name'                                    AS ad_name,
                (v_insight->>'date_start')::DATE                         AS dt,
                COALESCE((v_insight->>'spend')::DECIMAL, 0)              AS spend,
                COALESCE((v_insight->>'impressions')::INTEGER, 0)        AS impressions,
                COALESCE((v_insight->>'clicks')::INTEGER, 0)             AS clicks,
                COALESCE((v_insight->>'reach')::INTEGER, 0)              AS reach,
                COALESCE(v_insight->'actions', '[]'::jsonb)              AS actions
            FROM jsonb_array_elements(v_raw.response_data->'data') AS v_insight
        ),
        actions_extracted AS (
            SELECT
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                dt,
                spend,
                impressions,
                clicks,
                reach,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "landing_page_view").value')  #>> '{}')::INTEGER, 0) AS landing_page_views,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "video_view").value')         #>> '{}')::INTEGER, 0) AS video_views,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "link_click").value')         #>> '{}')::INTEGER, 0) AS link_clicks,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value')               #>> '{}')::INTEGER, 0) AS leads,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "onsite_web_lead").value')    #>> '{}')::INTEGER, 0) AS onsite_web_leads,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value') #>> '{}')::INTEGER, 0) AS fb_pixel_leads
            FROM exploded
        )
        SELECT
            ad_id,
            dt,
            MIN(account_id)     AS account_id,
            MIN(campaign_id)    AS campaign_id,
            MIN(campaign_name)  AS campaign_name,
            MIN(adset_id)       AS adset_id,
            MIN(adset_name)     AS adset_name,
            MIN(ad_name)        AS ad_name,
            SUM(spend)          AS spend,
            SUM(impressions)    AS impressions,
            SUM(clicks)         AS clicks,
            SUM(reach)          AS reach,
            SUM(landing_page_views) AS landing_page_views,
            SUM(video_views)        AS video_views,
            SUM(link_clicks)        AS link_clicks,
            SUM(leads)              AS leads,
            SUM(onsite_web_leads)   AS onsite_web_leads,
            SUM(fb_pixel_leads)     AS fb_pixel_leads
        FROM actions_extracted
        GROUP BY ad_id, dt
    LOOP
        INSERT INTO meta_ads_insights (
            workspace_id, account_id, campaign_id, campaign_name, adset_id, adset_name,
            ad_id, ad_name, date, spend, impressions, clicks, reach, actions,
            conversions, conversion_values, cost_per_action_type, video_metrics,
            quality_ranking, engagement_rate_ranking, conversion_rate_ranking,
            raw_insight_id, fetched_at, landing_page_views, video_views, link_clicks,
            leads, onsite_web_leads, fb_pixel_leads
        ) VALUES (
            v_workspace_id,
            v_rec.account_id,
            v_rec.campaign_id,
            v_rec.campaign_name,
            v_rec.adset_id,
            v_rec.adset_name,
            v_rec.ad_id,
            v_rec.ad_name,
            v_rec.dt,
            v_rec.spend,
            v_rec.impressions,
            v_rec.clicks,
            v_rec.reach,
            '[]'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '{}'::jsonb,
            NULL,
            NULL,
            NULL,
            p_raw_id,
            v_raw.fetch_finished_at,
            v_rec.landing_page_views,
            v_rec.video_views,
            v_rec.link_clicks,
            v_rec.leads,
            v_rec.onsite_web_leads,
            v_rec.fb_pixel_leads
        )
        ON CONFLICT (workspace_id, ad_id, date) DO UPDATE SET
            account_id              = EXCLUDED.account_id,
            campaign_name           = EXCLUDED.campaign_name,
            adset_name              = EXCLUDED.adset_name,
            ad_name                 = EXCLUDED.ad_name,
            spend                   = EXCLUDED.spend,
            impressions             = EXCLUDED.impressions,
            clicks                  = EXCLUDED.clicks,
            reach                   = EXCLUDED.reach,
            landing_page_views      = EXCLUDED.landing_page_views,
            video_views             = EXCLUDED.video_views,
            link_clicks             = EXCLUDED.link_clicks,
            leads                   = EXCLUDED.leads,
            onsite_web_leads        = EXCLUDED.onsite_web_leads,
            fb_pixel_leads          = EXCLUDED.fb_pixel_leads,
            frequency               = COALESCE(EXCLUDED.frequency, meta_ads_insights.frequency),
            ctr                     = COALESCE(EXCLUDED.ctr, meta_ads_insights.ctr),
            cpc                     = COALESCE(EXCLUDED.cpc, meta_ads_insights.cpc),
            cpm                     = COALESCE(EXCLUDED.cpm, meta_ads_insights.cpm),
            cpp                     = COALESCE(EXCLUDED.cpp, meta_ads_insights.cpp),
            actions                 = COALESCE(NULLIF(EXCLUDED.actions, '[]'::jsonb), meta_ads_insights.actions),
            conversions             = COALESCE(NULLIF(EXCLUDED.conversions, '[]'::jsonb), meta_ads_insights.conversions),
            conversion_values       = COALESCE(NULLIF(EXCLUDED.conversion_values, '[]'::jsonb), meta_ads_insights.conversion_values),
            cost_per_action_type    = COALESCE(NULLIF(EXCLUDED.cost_per_action_type, '[]'::jsonb), meta_ads_insights.cost_per_action_type),
            video_metrics           = COALESCE(NULLIF(EXCLUDED.video_metrics, '{}'::jsonb), meta_ads_insights.video_metrics),
            quality_ranking         = COALESCE(EXCLUDED.quality_ranking, meta_ads_insights.quality_ranking),
            engagement_rate_ranking = COALESCE(EXCLUDED.engagement_rate_ranking, meta_ads_insights.engagement_rate_ranking),
            conversion_rate_ranking = COALESCE(EXCLUDED.conversion_rate_ranking, meta_ads_insights.conversion_rate_ranking),
            raw_insight_id          = EXCLUDED.raw_insight_id,
            fetched_at              = EXCLUDED.fetched_at
        RETURNING id INTO v_insight_id;

        v_insights_count := v_insights_count + 1;

        INSERT INTO meta_ads_insights_breakdowns (
            workspace_id, insights_id, breakdown_type, country, region,
            spend, impressions, clicks, reach
        )
        SELECT
            v_workspace_id,
            v_insight_id,
            'region',
            v_insight2->>'country',
            v_insight2->>'region',
            COALESCE((v_insight2->>'spend')::DECIMAL, 0),
            COALESCE((v_insight2->>'impressions')::INTEGER, 0),
            COALESCE((v_insight2->>'clicks')::INTEGER, 0),
            COALESCE((v_insight2->>'reach')::INTEGER, 0)
        FROM jsonb_array_elements(v_raw.response_data->'data') AS v_insight2
        WHERE v_insight2->>'ad_id' = v_rec.ad_id
          AND (v_insight2->>'date_start')::DATE = v_rec.dt
          AND v_insight2->>'region' IS NOT NULL
        ON CONFLICT (workspace_id, insights_id, region, country) DO UPDATE SET
            breakdown_type = EXCLUDED.breakdown_type,
            spend          = EXCLUDED.spend,
            impressions    = EXCLUDED.impressions,
            clicks         = EXCLUDED.clicks,
            reach          = EXCLUDED.reach;

        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_breakdowns_count := v_breakdowns_count + v_inserted_rows;
    END LOOP;

    UPDATE meta_ads_raw_insights
    SET processado_em = now()
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- ============================================================
-- 9. TRIGGER FAIL-CLOSED: account_id deve estar vinculada ao workspace
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_meta_ads_raw_insights_validar_conta ON meta_ads_raw_insights;
CREATE TRIGGER trg_meta_ads_raw_insights_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_raw_insights
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

DROP TRIGGER IF EXISTS trg_meta_ads_account_daily_validar_conta ON meta_ads_account_daily;
CREATE TRIGGER trg_meta_ads_account_daily_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_account_daily
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

DROP TRIGGER IF EXISTS trg_meta_ads_campaigns_validar_conta ON meta_ads_campaigns;
CREATE TRIGGER trg_meta_ads_campaigns_validar_conta
  BEFORE INSERT OR UPDATE ON meta_ads_campaigns
  FOR EACH ROW EXECUTE FUNCTION trg_validar_meta_ad_account_workspace();

-- Breakdowns herdam workspace do insight, mas reforçamos via trigger também.
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

-- ============================================================
-- 10. GRANTS
-- ============================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON workspace_meta_ad_accounts TO authenticated;
GRANT SELECT ON meta_ads_raw_insights TO authenticated;
GRANT SELECT ON meta_ads_insights TO authenticated;
GRANT SELECT ON meta_ads_insights_breakdowns TO authenticated;
GRANT SELECT ON meta_ads_sync_log TO authenticated;
GRANT SELECT ON meta_ads_account_daily TO authenticated;
GRANT SELECT ON meta_ads_campaigns TO authenticated;

NOTIFY pgrst, 'reload schema';
