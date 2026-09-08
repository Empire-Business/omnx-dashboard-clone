-- =============================================================================
-- Migration: Adicionar colunas de nome na tabela meta_ads_insights
-- =============================================================================

-- Adicionar colunas faltantes
ALTER TABLE meta_ads_insights 
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT,
ADD COLUMN IF NOT EXISTS ad_name TEXT;

-- Verificar estrutura atualizada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'meta_ads_insights' 
  AND column_name IN ('campaign_name', 'adset_name', 'ad_name');
