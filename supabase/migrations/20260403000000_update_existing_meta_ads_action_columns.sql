-- Migration: Atualizar colunas de action types para dados existentes
-- Data: 2026-04-03
-- Objetivo: Adicionar colunas faltantes E popular dados existentes

-- Adicionar colunas (IF NOT EXISTS para ser idempotente)
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS landing_page_views INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS video_views INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS leads INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS onsite_web_leads INTEGER DEFAULT 0;
ALTER TABLE meta_ads_insights ADD COLUMN IF NOT EXISTS fb_pixel_leads INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_meta_ads_action_columns_from_jsonb()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update landing_page_views
    UPDATE meta_ads_insights
    SET landing_page_views = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "landing_page_view").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update video_views
    UPDATE meta_ads_insights
    SET video_views = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "video_view").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update link_clicks
    UPDATE meta_ads_insights
    SET link_clicks = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "link_click").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update leads
    UPDATE meta_ads_insights
    SET leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update onsite_web_leads
    UPDATE meta_ads_insights
    SET onsite_web_leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "onsite_web_lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update fb_pixel_leads
    UPDATE meta_ads_insights
    SET fb_pixel_leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    RAISE NOTICE 'Meta Ads action columns updated successfully';
END;
$$;

-- Executar a função
SELECT update_meta_ads_action_columns_from_jsonb();
