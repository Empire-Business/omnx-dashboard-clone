-- =============================================================================
-- Migration: Adicionar colunas faltantes na tabela meta_ads_insights
-- =============================================================================

-- Adicionar colunas que estão faltando
ALTER TABLE meta_ads_insights 
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT,
ADD COLUMN IF NOT EXISTS ad_name TEXT,
ADD COLUMN IF NOT EXISTS hour INTEGER,
ADD COLUMN IF NOT EXISTS cpp DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS video_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS quality_ranking TEXT,
ADD COLUMN IF NOT EXISTS engagement_rate_ranking TEXT,
ADD COLUMN IF NOT EXISTS conversion_rate_ranking TEXT;

-- Verificar estrutura atual
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'meta_ads_insights' 
ORDER BY ordinal_position;
