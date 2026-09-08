-- =============================================================================
-- Migration: Adicionar colunas de Action Types para métricas derivadas
-- Data: 2026-04-02
-- Objetivo: Extrair action_types do JSONB para colunas próprias para permitir
--           queries eficientes de CTR, conversão página, connect rate, video hook rate
-- =============================================================================

-- =============================================================================
-- PARTE 1: Adicionar colunas à tabela meta_ads_insights
-- =============================================================================

ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS landing_page_views INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS video_views INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS leads INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS onsite_web_leads INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS fb_pixel_leads INTEGER DEFAULT 0;

COMMENT ON COLUMN meta_ads_insights.landing_page_views IS 'Visualizações da landing page (action_type: landing_page_view)';
COMMENT ON COLUMN meta_ads_insights.video_views IS 'Visualizações de vídeo (action_type: video_view) - conta após ~3 segundos';
COMMENT ON COLUMN meta_ads_insights.link_clicks IS 'Cliques em links (action_type: link_click)';
COMMENT ON COLUMN meta_ads_insights.leads IS 'Leads gerados (action_type: lead)';
COMMENT ON COLUMN meta_ads_insights.onsite_web_leads IS 'Leads no site (action_type: onsite_web_lead)';
COMMENT ON COLUMN meta_ads_insights.fb_pixel_leads IS 'Leads via Pixel FB (action_type: offsite_conversion.fb_pixel_lead)';

-- Índices para as novas colunas (úteis para filtros e agregações)
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_landing_page_views ON meta_ads_insights(landing_page_views);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_video_views ON meta_ads_insights(video_views);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_link_clicks ON meta_ads_insights(link_clicks);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_leads ON meta_ads_insights(leads);

-- =============================================================================
-- PARTE 2: Atualizar função processar_meta_ads_raw para extrair action types
-- =============================================================================

DROP FUNCTION IF EXISTS processar_meta_ads_raw(UUID);

CREATE OR REPLACE FUNCTION processar_meta_ads_raw(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw RECORD;
    v_insight JSONB;
    v_actions JSONB;
    v_insights_count INTEGER := 0;
    v_breakdowns_count INTEGER := 0;
    v_insight_id UUID;
    
    -- Variáveis para action types
    v_landing_page_views INTEGER := 0;
    v_video_views INTEGER := 0;
    v_link_clicks INTEGER := 0;
    v_leads INTEGER := 0;
    v_onsite_web_leads INTEGER := 0;
    v_fb_pixel_leads INTEGER := 0;
BEGIN
    -- Buscar registro raw
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;
    
    -- Processar cada insight do array de dados
    IF v_raw.response_data->'data' IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_raw.response_data->'data') - 1 LOOP
            v_insight := v_raw.response_data->'data'->i;
            v_actions := COALESCE(v_insight->'actions', '[]'::jsonb);
            
            -- Extrair action types do JSONB
            v_landing_page_views := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "landing_page_view").value')::text)::INTEGER,
                0
            );
            v_video_views := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "video_view").value')::text)::INTEGER,
                0
            );
            v_link_clicks := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "link_click").value')::text)::INTEGER,
                0
            );
            v_leads := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "lead").value')::text)::INTEGER,
                0
            );
            v_onsite_web_leads := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "onsite_web_lead").value')::text)::INTEGER,
                0
            );
            v_fb_pixel_leads := COALESCE(
                (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value')::text)::INTEGER,
                0
            );
            
            -- Inserir na tabela de insights
            INSERT INTO meta_ads_insights (
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                date,
                hour,
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
                -- Novas colunas de action types
                landing_page_views,
                video_views,
                link_clicks,
                leads,
                onsite_web_leads,
                fb_pixel_leads
            ) VALUES (
                v_raw.params->>'account_id',
                v_insight->>'campaign_id',
                v_insight->>'campaign_name',
                v_insight->>'adset_id',
                v_insight->>'adset_name',
                v_insight->>'ad_id',
                v_insight->>'ad_name',
                (v_insight->>'date_start')::DATE,
                EXTRACT(HOUR FROM v_raw.fetch_finished_at)::INTEGER,
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
                    'p25', v_insight->'video_p25_watched_actions',
                    'p50', v_insight->'video_p50_watched_actions',
                    'p75', v_insight->'video_p75_watched_actions',
                    'p95', v_insight->'video_p95_watched_actions',
                    'p100', v_insight->'video_p100_watched_actions',
                    'avg_time', v_insight->'video_avg_time_watched_actions'
                ),
                v_insight->>'quality_ranking',
                v_insight->>'engagement_rate_ranking',
                v_insight->>'conversion_rate_ranking',
                p_raw_id,
                v_raw.fetch_finished_at,
                -- Valores extraídos
                v_landing_page_views,
                v_video_views,
                v_link_clicks,
                v_leads,
                v_onsite_web_leads,
                v_fb_pixel_leads
            )
            ON CONFLICT (ad_id, date, hour) DO UPDATE SET
                spend = EXCLUDED.spend,
                impressions = EXCLUDED.impressions,
                clicks = EXCLUDED.clicks,
                reach = EXCLUDED.reach,
                frequency = EXCLUDED.frequency,
                ctr = EXCLUDED.ctr,
                cpc = EXCLUDED.cpc,
                cpm = EXCLUDED.cpm,
                actions = EXCLUDED.actions,
                conversions = EXCLUDED.conversions,
                fetched_at = EXCLUDED.fetched_at,
                -- Atualizar action types
                landing_page_views = EXCLUDED.landing_page_views,
                video_views = EXCLUDED.video_views,
                link_clicks = EXCLUDED.link_clicks,
                leads = EXCLUDED.leads,
                onsite_web_leads = EXCLUDED.onsite_web_leads,
                fb_pixel_leads = EXCLUDED.fb_pixel_leads
            RETURNING id INTO v_insight_id;
            
            v_insights_count := v_insights_count + 1;
            
            -- Se tem breakdowns, inserir
            IF v_insight->>'age' IS NOT NULL OR v_insight->>'gender' IS NOT NULL 
               OR v_insight->>'publisher_platform' IS NOT NULL THEN
                INSERT INTO meta_ads_insights_breakdowns (
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
    
    -- Marcar como processado
    UPDATE meta_ads_raw_insights 
    SET processado_em = now() 
    WHERE id = p_raw_id;
    
    RETURN jsonb_build_object(
        'insights_inseridos', v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- =============================================================================
-- PARTE 3: Grant permissions
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =============================================================================
-- NOTAS
-- =============================================================================
-- Esta migration:
-- 1. Adiciona 6 novas colunas à tabela meta_ads_insights para armazenar action types
-- 2. Atualiza a função processar_meta_ads_raw para extrair valores do JSONB actions
-- 3. Mantém compatibilidade com dados existentes (colunas com DEFAULT 0)
-- 4. Usa UPSERT (ON CONFLICT) para não duplicar dados
--
-- Métricas derivadas possíveis com estas colunas:
-- - CTR: ctr (já existe) ou clicks/impressions
-- - CPM: cpm (já existe) ou spend/impressions*1000
-- - Conversão da página: leads / landing_page_views
-- - Connect Rate: landing_page_views / link_clicks
-- - Video Hook Rate: video_views / impressions
-- =============================================================================