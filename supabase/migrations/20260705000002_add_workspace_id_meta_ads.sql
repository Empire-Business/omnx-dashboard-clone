-- =============================================================================
-- Migration: Adiciona isolamento por workspace às tabelas Meta Ads
-- Data: 2026-07-05
--
-- GAP IDENTIFICADO (documentado nesta migration):
--   Não existe, no momento, uma tabela de mapeamento conta Meta Ads -> workspace.
--   A Edge Function sync-meta-ads ainda é single-tenant (META_AD_ACCOUNT_ID único
--   via variável de ambiente) e não recebe workspace_id de origem confiável.
--   Portanto, esta migration:
--     1. Adiciona workspace_id nullable nas tabelas afetadas.
--     2. Prepara as funções de processamento para propagar workspace_id quando
--        ele for informado em raw.params->>'workspace_id'.
--     3. Cria policies que permitem leitura de registros legados (workspace_id IS NULL)
--        e restringe registros novos ao workspace do usuário.
--     4. Documenta a estratégia de backfill a ser executada APÓS criar o mapeamento
--        conta Meta -> workspace.
--
-- ATENÇÃO: Não popula workspace_id automaticamente porque a relação
--   conta Meta/workspace ainda não existe no banco. Alterações forçadas correm
--   risco de vazar dados ou de associar insights ao workspace errado.
-- =============================================================================

-- =============================================================================
-- 1. SCHEMA: adiciona workspace_id nullable
-- =============================================================================

ALTER TABLE meta_ads_raw_insights
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE meta_ads_insights
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE meta_ads_insights_breakdowns
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE meta_ads_sync_log
ADD COLUMN IF NOT EXISTS workspace_id UUID;

COMMENT ON COLUMN meta_ads_raw_insights.workspace_id IS
  'Workspace ao qual este lote de insights pertence. NULL = legado sem isolamento (backfill pendente).';
COMMENT ON COLUMN meta_ads_insights.workspace_id IS
  'Workspace ao qual este insight pertence. NULL = legado sem isolamento (backfill pendente).';
COMMENT ON COLUMN meta_ads_insights_breakdowns.workspace_id IS
  'Workspace ao qual este breakdown pertence. Propagado do insight pai.';
COMMENT ON COLUMN meta_ads_sync_log.workspace_id IS
  'Workspace relacionado à execução de sync. NULL quando não informado.';

-- =============================================================================
-- 2. ÍNDICES para lookup por workspace
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_workspace ON meta_ads_raw_insights(workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_workspace ON meta_ads_insights(workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_workspace ON meta_ads_insights_breakdowns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_workspace ON meta_ads_sync_log(workspace_id);

-- =============================================================================
-- 3. FUNÇÕES DE PROCESSAMENTO: propagam workspace_id vindo de raw.params
-- =============================================================================

-- A função padrão é recriada com a mesma lógica da migration 20260618,
-- acrescentando workspace_id na inserção do insight e dos breakdowns.
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

    -- Resolver workspace_id a partir dos params (preenchido pela Edge Function quando houver)
    BEGIN
        v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_id := NULL;
    END;

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
                workspace_id,
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                date,
                spend,
                impressions,
                clicks,
                reach,
                frequency,
                ctr,
                cpc,
                cpm,
                cpp,
                actions,
                conversions,
                conversion_values,
                cost_per_action_type,
                video_metrics,
                quality_ranking,
                engagement_rate_ranking,
                conversion_rate_ranking,
                raw_insight_id,
                fetched_at,
                landing_page_views,
                video_views,
                link_clicks,
                leads,
                onsite_web_leads,
                fb_pixel_leads
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
            ON CONFLICT (ad_id, date) DO UPDATE SET
                workspace_id            = COALESCE(EXCLUDED.workspace_id, meta_ads_insights.workspace_id),
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
                    workspace_id,
                    insights_id,
                    age,
                    gender,
                    country,
                    region,
                    impression_device,
                    publisher_platform,
                    platform_position,
                    spend,
                    impressions,
                    clicks,
                    reach
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
    SET processado_em = now(),
        workspace_id  = COALESCE(meta_ads_raw_insights.workspace_id, v_workspace_id)
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- A função de region breakdown também deve propagar workspace_id.
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

    IF v_raw.response_data->'data' IS NULL OR jsonb_array_length(v_raw.response_data->'data') = 0 THEN
        UPDATE meta_ads_raw_insights SET processado_em = now() WHERE id = p_raw_id;
        RETURN jsonb_build_object(
            'insights_inseridos',   0,
            'breakdowns_inseridos', 0
        );
    END IF;

    BEGIN
        v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_id := NULL;
    END;

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
            workspace_id,
            account_id,
            campaign_id,
            campaign_name,
            adset_id,
            adset_name,
            ad_id,
            ad_name,
            date,
            spend,
            impressions,
            clicks,
            reach,
            actions,
            conversions,
            conversion_values,
            cost_per_action_type,
            video_metrics,
            quality_ranking,
            engagement_rate_ranking,
            conversion_rate_ranking,
            raw_insight_id,
            fetched_at,
            landing_page_views,
            video_views,
            link_clicks,
            leads,
            onsite_web_leads,
            fb_pixel_leads
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
        ON CONFLICT (ad_id, date) DO UPDATE SET
            workspace_id            = COALESCE(EXCLUDED.workspace_id, meta_ads_insights.workspace_id),
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
            workspace_id,
            insights_id,
            breakdown_type,
            country,
            region,
            spend,
            impressions,
            clicks,
            reach
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
        ON CONFLICT (insights_id, region, country) DO UPDATE SET
            workspace_id   = COALESCE(EXCLUDED.workspace_id, meta_ads_insights_breakdowns.workspace_id),
            breakdown_type = EXCLUDED.breakdown_type,
            spend          = EXCLUDED.spend,
            impressions    = EXCLUDED.impressions,
            clicks         = EXCLUDED.clicks,
            reach          = EXCLUDED.reach;

        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_breakdowns_count := v_breakdowns_count + v_inserted_rows;
    END LOOP;

    UPDATE meta_ads_raw_insights
    SET processado_em = now(),
        workspace_id  = COALESCE(meta_ads_raw_insights.workspace_id, v_workspace_id)
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- =============================================================================
-- 3.1 FUNÇÃO DE LOG: aceita workspace_id opcional
-- =============================================================================

DROP FUNCTION IF EXISTS registrar_sync_log(
    TIMESTAMPTZ, TEXT, INTEGER, INTEGER, INTEGER, TEXT, JSONB, INTEGER
);

CREATE OR REPLACE FUNCTION registrar_sync_log(
    p_started_at TIMESTAMPTZ,
    p_status TEXT,
    p_records_fetched INTEGER DEFAULT 0,
    p_records_inserted INTEGER DEFAULT 0,
    p_records_updated INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL,
    p_execution_time_ms INTEGER DEFAULT NULL,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO meta_ads_sync_log (
        started_at,
        finished_at,
        status,
        records_fetched,
        records_inserted,
        records_updated,
        error_message,
        error_details,
        execution_time_ms,
        workspace_id
    ) VALUES (
        p_started_at,
        now(),
        p_status,
        p_records_fetched,
        p_records_inserted,
        p_records_updated,
        p_error_message,
        p_error_details,
        p_execution_time_ms,
        p_workspace_id
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- =============================================================================
-- 4. ROW LEVEL SECURITY: policies por workspace
-- =============================================================================

-- Raw insights
DROP POLICY IF EXISTS "Service role full access on meta_ads_raw_insights" ON meta_ads_raw_insights;
DROP POLICY IF EXISTS "Authenticated users can view meta_ads_raw_insights" ON meta_ads_raw_insights;

CREATE POLICY "Service role full access on meta_ads_raw_insights"
ON meta_ads_raw_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insights
DROP POLICY IF EXISTS "Service role full access on meta_ads_insights" ON meta_ads_insights;
DROP POLICY IF EXISTS "Authenticated users can view meta_ads_insights" ON meta_ads_insights;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights" ON meta_ads_insights;

CREATE POLICY "Service role full access on meta_ads_insights"
ON meta_ads_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Workspace members can view meta_ads_insights"
ON meta_ads_insights FOR SELECT TO authenticated
USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
);

-- Insights breakdowns
DROP POLICY IF EXISTS "Service role full access on meta_ads_insights_breakdowns" ON meta_ads_insights_breakdowns;
DROP POLICY IF EXISTS "Authenticated users can view meta_ads_insights_breakdowns" ON meta_ads_insights_breakdowns;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights_breakdowns" ON meta_ads_insights_breakdowns;

CREATE POLICY "Service role full access on meta_ads_insights_breakdowns"
ON meta_ads_insights_breakdowns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Workspace members can view meta_ads_insights_breakdowns"
ON meta_ads_insights_breakdowns FOR SELECT TO authenticated
USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
);

-- Sync log
DROP POLICY IF EXISTS "Service role full access on meta_ads_sync_log" ON meta_ads_sync_log;
DROP POLICY IF EXISTS "Authenticated users can view meta_ads_sync_log" ON meta_ads_sync_log;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_sync_log" ON meta_ads_sync_log;

CREATE POLICY "Service role full access on meta_ads_sync_log"
ON meta_ads_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Workspace members can view meta_ads_sync_log"
ON meta_ads_sync_log FOR SELECT TO authenticated
USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
);

-- =============================================================================
-- 5. GRANTS
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON meta_ads_insights TO authenticated;
GRANT SELECT ON meta_ads_insights_breakdowns TO authenticated;
GRANT SELECT ON meta_ads_sync_log TO authenticated;

-- =============================================================================
-- 6. ESTRATÉGIA DE BACKFILL (executar manualmente após modelar o relacionamento)
-- =============================================================================

/*
PASSO 1 — Modelar o relacionamento conta Meta -> workspace.
  Criar uma tabela de configuração, por exemplo:

  CREATE TABLE workspace_meta_ad_accounts (
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      account_id   TEXT NOT NULL,
      is_active    BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, account_id)
  );

PASSO 2 — Inserir o(s) mapeamento(s) conhecido(s).
  Exemplo:
  INSERT INTO workspace_meta_ad_accounts (workspace_id, account_id)
  VALUES ('<workspace-uuid>', 'act_<meta-account-id>');

PASSO 3 — Popular workspace_id nos insights existentes.
  UPDATE meta_ads_insights i
  SET workspace_id = (
      SELECT wm.workspace_id
      FROM workspace_meta_ad_accounts wm
      WHERE wm.account_id = i.account_id
      LIMIT 1
  )
  WHERE i.workspace_id IS NULL
    AND i.account_id IS NOT NULL;

PASSO 4 — Propagar para breakdowns e raw.
  UPDATE meta_ads_insights_breakdowns b
  SET workspace_id = i.workspace_id
  FROM meta_ads_insights i
  WHERE b.insights_id = i.id
    AND b.workspace_id IS NULL
    AND i.workspace_id IS NOT NULL;

  UPDATE meta_ads_raw_insights r
  SET workspace_id = (
      SELECT wm.workspace_id
      FROM workspace_meta_ad_accounts wm
      WHERE wm.account_id = (r.params->>'account_id')
      LIMIT 1
  )
  WHERE r.workspace_id IS NULL
    AND (r.params->>'account_id') IS NOT NULL;

PASSO 5 — Depois do backfill, remover a cláusula workspace_id IS NULL das policies
  de SELECT para garantir que apenas registros isolados sejam visíveis.
  ATENÇÃO: registros com workspace_id NULL continuarão visíveis enquanto a cláusula
  OR workspace_id IS NULL existir.
*/
