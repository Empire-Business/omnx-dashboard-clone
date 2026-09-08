-- =============================================================================
-- Migration: Infraestrutura Meta Ads Sync
-- Cria tabelas, funções e configura pg_cron para sincronização automática
-- =============================================================================

-- =============================================================================
-- PARTE 1: TABELAS
-- =============================================================================

-- 1. Tabela de JSON bruto (fonte de verdade)
CREATE TABLE IF NOT EXISTS meta_ads_raw_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_endpoint TEXT NOT NULL,
    params JSONB DEFAULT '{}'::jsonb,
    response_data JSONB NOT NULL,
    http_status INTEGER,
    records_count INTEGER DEFAULT 0,
    fetch_started_at TIMESTAMPTZ,
    fetch_finished_at TIMESTAMPTZ,
    processado_em TIMESTAMPTZ,
    error_details JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_processado ON meta_ads_raw_insights(processado_em);
CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_fetch_finished ON meta_ads_raw_insights(fetch_finished_at DESC);

-- 2. Tabela de métricas processadas
CREATE TABLE IF NOT EXISTS meta_ads_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id TEXT,
    campaign_id TEXT,
    campaign_name TEXT,
    adset_id TEXT,
    adset_name TEXT,
    ad_id TEXT,
    ad_name TEXT,
    date DATE NOT NULL,
    hour INTEGER,
    spend DECIMAL(12,2) DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    frequency DECIMAL(10,4),
    ctr DECIMAL(10,4),
    cpc DECIMAL(10,4),
    cpm DECIMAL(10,4),
    cpp DECIMAL(10,4),
    actions JSONB DEFAULT '[]'::jsonb,
    conversions JSONB DEFAULT '[]'::jsonb,
    conversion_values JSONB DEFAULT '[]'::jsonb,
    cost_per_action_type JSONB DEFAULT '[]'::jsonb,
    video_metrics JSONB DEFAULT '{}'::jsonb,
    quality_ranking TEXT,
    engagement_rate_ranking TEXT,
    conversion_rate_ranking TEXT,
    raw_insight_id UUID REFERENCES meta_ads_raw_insights(id),
    fetched_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(ad_id, date, hour)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_date ON meta_ads_insights(date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_campaign ON meta_ads_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_adset ON meta_ads_insights(adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_ad ON meta_ads_insights(ad_id);

-- 3. Tabela de breakdowns (segmentações)
CREATE TABLE IF NOT EXISTS meta_ads_insights_breakdowns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    insights_id UUID REFERENCES meta_ads_insights(id) ON DELETE CASCADE,
    age TEXT,
    gender TEXT,
    country TEXT,
    region TEXT,
    impression_device TEXT,
    publisher_platform TEXT,
    platform_position TEXT,
    spend DECIMAL(12,2) DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_insights ON meta_ads_insights_breakdowns(insights_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_platform ON meta_ads_insights_breakdowns(publisher_platform);

-- 4. Tabela de log de sincronização
CREATE TABLE IF NOT EXISTS meta_ads_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'error')),
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    error_message TEXT,
    error_details JSONB,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_status ON meta_ads_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_started ON meta_ads_sync_log(started_at DESC);

-- 5. Tabelas de controle para backfill
CREATE TABLE IF NOT EXISTS meta_ads_backfill_controle (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'error')) DEFAULT 'pending',
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    dias_processados INTEGER DEFAULT 0,
    total_dias INTEGER,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_ads_backfill_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    controle_id UUID REFERENCES meta_ads_backfill_controle(id),
    data DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'error')),
    registros_processados INTEGER DEFAULT 0,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    UNIQUE(controle_id, data)
);

-- =============================================================================
-- PARTE 2: FUNÇÕES POSTGRESQL
-- =============================================================================

-- Dropar funções existentes para evitar conflito de tipo de retorno
DROP FUNCTION IF EXISTS processar_meta_ads_raw(UUID);
DROP FUNCTION IF EXISTS registrar_sync_log(TIMESTAMPTZ, TEXT, INTEGER, INTEGER, INTEGER, TEXT, JSONB, INTEGER);
DROP FUNCTION IF EXISTS criar_backfill_meta_ads(DATE, DATE);
DROP FUNCTION IF EXISTS sync_meta_ads_job();

-- Função para processar JSON bruto e inserir nas tabelas normalizadas
CREATE OR REPLACE FUNCTION processar_meta_ads_raw(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw RECORD;
    v_insight JSONB;
    v_insights_count INTEGER := 0;
    v_breakdowns_count INTEGER := 0;
    v_insight_id UUID;
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
                fetched_at
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
                COALESCE(v_insight->'actions', '[]'::jsonb),
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
                v_raw.fetch_finished_at
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
                fetched_at = EXCLUDED.fetched_at
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

-- Função para registrar log de sincronização
CREATE OR REPLACE FUNCTION registrar_sync_log(
    p_started_at TIMESTAMPTZ,
    p_status TEXT,
    p_records_fetched INTEGER DEFAULT 0,
    p_records_inserted INTEGER DEFAULT 0,
    p_records_updated INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL,
    p_execution_time_ms INTEGER DEFAULT NULL
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
        execution_time_ms
    ) VALUES (
        p_started_at,
        now(),
        p_status,
        p_records_fetched,
        p_records_inserted,
        p_records_updated,
        p_error_message,
        p_error_details,
        p_execution_time_ms
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- Função para criar backfill
CREATE OR REPLACE FUNCTION criar_backfill_meta_ads(
    p_data_inicio DATE,
    p_data_fim DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_controle_id UUID;
    v_total_dias INTEGER;
    v_data_atual DATE;
BEGIN
    -- Calcular total de dias
    v_total_dias := (p_data_fim - p_data_inicio)::INTEGER + 1;
    
    -- Criar controle
    INSERT INTO meta_ads_backfill_controle (
        data_inicio,
        data_fim,
        total_dias,
        status
    ) VALUES (
        p_data_inicio,
        p_data_fim,
        v_total_dias,
        'pending'
    )
    RETURNING id INTO v_controle_id;
    
    -- Criar logs para cada dia
    v_data_atual := p_data_inicio;
    WHILE v_data_atual <= p_data_fim LOOP
        INSERT INTO meta_ads_backfill_log (
            controle_id,
            data,
            status
        ) VALUES (
            v_controle_id,
            v_data_atual,
            'pending'
        );
        v_data_atual := v_data_atual + 1;
    END LOOP;
    
    RETURN v_controle_id;
END;
$$;

-- =============================================================================
-- PARTE 3: RLS (Row Level Security)
-- =============================================================================

ALTER TABLE meta_ads_raw_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_insights_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_sync_log ENABLE ROW LEVEL SECURITY;

-- Políticas para service_role (acesso total)
CREATE POLICY "Service role full access on meta_ads_raw_insights" 
ON meta_ads_raw_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on meta_ads_insights" 
ON meta_ads_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on meta_ads_insights_breakdowns" 
ON meta_ads_insights_breakdowns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on meta_ads_sync_log" 
ON meta_ads_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Políticas para authenticated (leitura)
CREATE POLICY "Authenticated users can view meta_ads_insights" 
ON meta_ads_insights FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view meta_ads_insights_breakdowns" 
ON meta_ads_insights_breakdowns FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- PARTE 4: PG_CRON - Sincronização Automática
-- =============================================================================

-- Verificar se pg_cron está disponível
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron já está instalado';
    ELSE
        -- Tentar instalar (requer permissões de superuser)
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_cron;
            RAISE NOTICE 'pg_cron instalado com sucesso';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Não foi possível instalar pg_cron automaticamente. Execute manualmente: CREATE EXTENSION pg_cron;';
        END;
    END IF;
END $$;

-- Verificar se pg_net está disponível (necessário para chamadas HTTP)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        RAISE NOTICE 'pg_net já está instalado';
    ELSE
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_net;
            RAISE NOTICE 'pg_net instalado com sucesso';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Não foi possível instalar pg_net automaticamente. Execute manualmente: CREATE EXTENSION pg_net;';
        END;
    END IF;
END $$;

-- Criar função que chama a Edge Function
CREATE OR REPLACE FUNCTION sync_meta_ads_job()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_response JSONB;
BEGIN
    -- Obter variáveis de ambiente (configuradas no Supabase Dashboard)
    -- Nota: No Supabase, use vault para armazenar secrets
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- Se não tiver a URL, usar a URL padrão do projeto
    IF v_supabase_url IS NULL THEN
        -- Este valor deve ser configurado manualmente ou via vault
        RAISE EXCEPTION 'Variável app.settings.supabase_url não configurada';
    END IF;
    
    -- Chamar Edge Function via HTTP
    -- Nota: Em produção, use pg_net para chamadas assíncronas
    SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/sync-meta-ads',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    ) INTO v_response;
    
    RAISE NOTICE 'Sync job executado: %', v_response;
END;
$$;

-- Agendar job para executar a cada hora usando cron.schedule
-- Nota: Execute isto manualmente se o cron não estiver disponível na migration
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remover job anterior se existir (idempotente: nao falha em banco zerado)
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-meta-ads-hourly';
        
        -- Criar novo job (executa a cada hora no minuto 0)
        PERFORM cron.schedule(
            'sync-meta-ads-hourly',
            '0 * * * *',  -- Toda hora no minuto 0
            'SELECT sync_meta_ads_job();'
        );
        
        RAISE NOTICE 'Job sync-meta-ads-hourly criado com sucesso';
    ELSE
        RAISE NOTICE 'pg_cron não disponível. Configure manualmente via Supabase Dashboard';
    END IF;
END $$;

-- =============================================================================
-- PARTE 5: GRANTS
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON meta_ads_insights TO authenticated;
GRANT SELECT ON meta_ads_insights_breakdowns TO authenticated;
GRANT SELECT ON meta_ads_sync_log TO authenticated;

-- =============================================================================
-- NOTAS FINAIS
-- =============================================================================
-- Para configurar as variáveis de ambiente necessárias:
-- 1. Acesse o Supabase Dashboard > Settings > API
-- 2. Copie a URL do projeto e a Service Role Key
-- 3. Execute no SQL Editor:
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://seu-projeto.supabase.co';
--    ALTER DATABASE postgres SET app.settings.service_role_key = 'sua-service-role-key';
-- 4. Configure as variáveis da Edge Function:
--    META_ACCESS_TOKEN e META_AD_ACCOUNT_ID
-- =============================================================================
