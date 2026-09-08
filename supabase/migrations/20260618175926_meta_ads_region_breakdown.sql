-- =============================================================================
-- Migration: Meta Ads Region Breakdown
-- Data: 2026-06-18
--
-- Objetivo:
--   Permitir o processamento seguro de dados da Meta Ads com breakdown por
--   região (estado brasileiro), sem corromper a tabela meta_ads_insights
--   e sem quebrar o sync padrão de hora em hora.
--
-- O que esta migration faz:
--   1. Adiciona coluna breakdown_type em meta_ads_insights_breakdowns.
--   2. Cria tabela meta_ads_region_mapping (nome Meta -> UF -> região).
--   3. Adiciona índices em region, country e breakdown_type.
--   4. Cria função processar_meta_ads_raw_region_breakdown(p_raw_id UUID).
--   5. Adiciona guarda de segurança em processar_meta_ads_raw existente.
--   6. Garante RLS e grants para a nova tabela.
--
-- Regras de segurança:
--   - Não altera migrations anteriores.
--   - Não muda o comportamento do sync padrão (apenas adiciona guarda).
--   - É idempotente: reexecução não duplica dados.
-- =============================================================================

-- =============================================================================
-- PARTE 1: SCHEMA
-- =============================================================================

-- 1.1 Tipo de breakdown para diferenciar segmentações na mesma tabela filha
ALTER TABLE meta_ads_insights_breakdowns
ADD COLUMN IF NOT EXISTS breakdown_type TEXT;

COMMENT ON COLUMN meta_ads_insights_breakdowns.breakdown_type IS
'Tipo de segmentação: region, age_gender, publisher_platform, etc.';

-- 1.2 Tabela de mapeamento de nomes de região da Meta para UF e região brasileira
CREATE TABLE IF NOT EXISTS meta_ads_region_mapping (
    region_name TEXT PRIMARY KEY, -- nome exato devolvido pela Meta Ads API
    uf          TEXT NOT NULL,    -- sigla do estado (SP, MG, etc.)
    regiao      TEXT NOT NULL     -- Sudeste, Sul, Nordeste, Norte, Centro-Oeste
);

COMMENT ON TABLE meta_ads_region_mapping IS
'Mapeia os nomes de região retornados pela Meta Ads API para UF e região brasileira.';

-- Seed inicial com os 26 estados + Distrito Federal
-- Inclui variações com e sem acento, pois a Meta pode devolver os nomes de forma
-- normalizada dependendo da versão da API.
INSERT INTO meta_ads_region_mapping (region_name, uf, regiao) VALUES
-- Nomes sem acento (Meta normaliza dependendo da versão da API)
('Acre',                'AC', 'Norte'),
('Alagoas',             'AL', 'Nordeste'),
('Amapa',               'AP', 'Norte'),
('Amapá',               'AP', 'Norte'),
('Amazonas',            'AM', 'Norte'),
('Bahia',               'BA', 'Nordeste'),
('Ceara',               'CE', 'Nordeste'),
('Ceará',               'CE', 'Nordeste'),
('Distrito Federal',    'DF', 'Centro-Oeste'),
('Espirito Santo',      'ES', 'Sudeste'),
('Espírito Santo',      'ES', 'Sudeste'),
('Goias',               'GO', 'Centro-Oeste'),
('Goiás',               'GO', 'Centro-Oeste'),
('Maranhao',            'MA', 'Nordeste'),
('Maranhão',            'MA', 'Nordeste'),
('Mato Grosso',         'MT', 'Centro-Oeste'),
('Mato Grosso do Sul',  'MS', 'Centro-Oeste'),
('Minas Gerais',        'MG', 'Sudeste'),
('Para',                'PA', 'Norte'),
('Pará',                'PA', 'Norte'),
('Paraiba',             'PB', 'Nordeste'),
('Paraíba',             'PB', 'Nordeste'),
('Parana',              'PR', 'Sul'),
('Paraná',              'PR', 'Sul'),
('Pernambuco',          'PE', 'Nordeste'),
('Piaui',               'PI', 'Nordeste'),
('Piauí',               'PI', 'Nordeste'),
('Rio de Janeiro',      'RJ', 'Sudeste'),
('Rio Grande do Norte', 'RN', 'Nordeste'),
('Rio Grande do Sul',   'RS', 'Sul'),
('Rondonia',            'RO', 'Norte'),
('Rondônia',            'RO', 'Norte'),
('Roraima',             'RR', 'Norte'),
('Santa Catarina',      'SC', 'Sul'),
('Sao Paulo',           'SP', 'Sudeste'),
('São Paulo',           'SP', 'Sudeste'),
('Sergipe',             'SE', 'Nordeste'),
('Tocantins',           'TO', 'Norte'),
-- Variações com sufixo (state) devolvidas pela Meta API v18.0
('Acre (state)',                'AC', 'Norte'),
('Alagoas (state)',             'AL', 'Nordeste'),
('Amapa (state)',               'AP', 'Norte'),
('Amapá (state)',               'AP', 'Norte'),
('Amazonas (state)',            'AM', 'Norte'),
('Bahia (state)',               'BA', 'Nordeste'),
('Ceara (state)',               'CE', 'Nordeste'),
('Ceará (state)',               'CE', 'Nordeste'),
('Distrito Federal (state)',    'DF', 'Centro-Oeste'),
('Federal District',            'DF', 'Centro-Oeste'),
('Espirito Santo (state)',      'ES', 'Sudeste'),
('Espírito Santo (state)',      'ES', 'Sudeste'),
('Goias (state)',               'GO', 'Centro-Oeste'),
('Goiás (state)',               'GO', 'Centro-Oeste'),
('Maranhao (state)',            'MA', 'Nordeste'),
('Maranhão (state)',            'MA', 'Nordeste'),
('Mato Grosso (state)',         'MT', 'Centro-Oeste'),
('Mato Grosso do Sul (state)',  'MS', 'Centro-Oeste'),
('Minas Gerais (state)',        'MG', 'Sudeste'),
('Para (state)',                'PA', 'Norte'),
('Pará (state)',                'PA', 'Norte'),
('Paraiba (state)',             'PB', 'Nordeste'),
('Paraíba (state)',             'PB', 'Nordeste'),
('Parana (state)',              'PR', 'Sul'),
('Paraná (state)',              'PR', 'Sul'),
('Pernambuco (state)',          'PE', 'Nordeste'),
('Piaui (state)',               'PI', 'Nordeste'),
('Piauí (state)',               'PI', 'Nordeste'),
('Rio de Janeiro (state)',      'RJ', 'Sudeste'),
('Rio Grande do Norte (state)', 'RN', 'Nordeste'),
('Rio Grande do Sul (state)',   'RS', 'Sul'),
('Rondonia (state)',            'RO', 'Norte'),
('Rondônia (state)',            'RO', 'Norte'),
('Roraima (state)',             'RR', 'Norte'),
('Santa Catarina (state)',      'SC', 'Sul'),
('Sao Paulo (state)',           'SP', 'Sudeste'),
('São Paulo (state)',           'SP', 'Sudeste'),
('Sergipe (state)',             'SE', 'Nordeste'),
('Tocantins (state)',           'TO', 'Norte'),
-- Casos especiais
('Unknown',                     'NA', 'Desconhecido')
ON CONFLICT (region_name) DO NOTHING;

-- 1.3 Índices para consultas por geografia e tipo de breakdown
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_region    ON meta_ads_insights_breakdowns(region);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_country   ON meta_ads_insights_breakdowns(country);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_type      ON meta_ads_insights_breakdowns(breakdown_type);

-- 1.4 Garantir coluna reach (utilizada pelas funções de processamento)
ALTER TABLE meta_ads_insights_breakdowns
ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;

-- 1.5 Constraint de unicidade para evitar duplicação de breakdowns por região
-- em cenários de retry/timeout da edge function.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'idx_meta_ads_breakdowns_unique_region'
          AND conrelid = 'meta_ads_insights_breakdowns'::regclass
    ) THEN
        ALTER TABLE meta_ads_insights_breakdowns
        ADD CONSTRAINT idx_meta_ads_breakdowns_unique_region
        UNIQUE (insights_id, region, country);
    END IF;
END $$;

-- =============================================================================
-- PARTE 2: FUNÇÃO DE PROCESSAMENTO COM BREAKDOWN POR REGIÃO
-- =============================================================================

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
    v_inserted_rows    INTEGER;
BEGIN
    -- Buscar registro raw
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;

    -- Guarda: só processa registros que realmente possuem breakdowns
    IF (v_raw.params->'breakdowns') IS NULL OR jsonb_array_length(v_raw.params->'breakdowns') = 0 THEN
        RETURN jsonb_build_object(
            'erro',
            'Registro raw não possui breakdowns. Use processar_meta_ads_raw para o sync padrão.'
        );
    END IF;

    -- Se não houver array de dados, não há o que processar
    IF v_raw.response_data->'data' IS NULL OR jsonb_array_length(v_raw.response_data->'data') = 0 THEN
        UPDATE meta_ads_raw_insights SET processado_em = now() WHERE id = p_raw_id;

        RETURN jsonb_build_object(
            'insights_inseridos',   0,
            'breakdowns_inseridos', 0
        );
    END IF;

    -- Agregar totais por (ad_id, date).
    -- Para cada grupo, fazemos upsert na tabela principal e depois inserimos
    -- os breakdowns de região na tabela filha.
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
        -- Upsert do total agregado na tabela principal.
        -- A constraint única real é (ad_id, date) — mesmo que a tabela ainda
        -- guarde a coluna hour para uso futuro, o sync diário não a utiliza.
        INSERT INTO meta_ads_insights (
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
            '[]'::jsonb, -- actions agregados por região são mantidos nas colunas específicas de action types
            '[]'::jsonb, -- conversions não disponíveis no breakdown por região
            '[]'::jsonb, -- conversion_values não disponíveis no breakdown por região
            '[]'::jsonb, -- cost_per_action_type não disponível no breakdown por região
            '{}'::jsonb, -- video_metrics não disponíveis no breakdown por região
            NULL,        -- quality_ranking não disponível no breakdown por região
            NULL,        -- engagement_rate_ranking não disponível no breakdown por região
            NULL,        -- conversion_rate_ranking não disponível no breakdown por região
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
            -- Preservar campos calculados/JSONB do sync padrão quando já existirem,
            -- pois o breakdown por região não fornece esses valores.
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

        -- Inserir os breakdowns individuais de região vinculados ao total agregado.
        -- ON CONFLICT garante idempotência mesmo em retries/timeouts da edge function.
        INSERT INTO meta_ads_insights_breakdowns (
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
            breakdown_type = EXCLUDED.breakdown_type,
            spend          = EXCLUDED.spend,
            impressions    = EXCLUDED.impressions,
            clicks         = EXCLUDED.clicks,
            reach          = EXCLUDED.reach;

        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_breakdowns_count := v_breakdowns_count + v_inserted_rows;
    END LOOP;

    -- Marcar raw como processado
    UPDATE meta_ads_raw_insights
    SET processado_em = now()
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- =============================================================================
-- PARTE 3: GUARDA DE SEGURANÇA NA FUNÇÃO PADRÃO
-- =============================================================================

-- Reinstala a função padrão com a mesma lógica da migration 20260409,
-- adicionando apenas uma guarda no início para evitar que dados com
-- breakdowns sejam processados pelo caminho errado.
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

    IF v_raw.response_data->'data' IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_raw.response_data->'data') - 1 LOOP
            v_insight := v_raw.response_data->'data'->i;
            v_actions := COALESCE(v_insight->'actions', '[]'::jsonb);

            -- Extrair action types do JSONB para colunas indexadas.
            -- Usar #>> '{}' remove as aspas JSON; a Meta API devolve strings.
            v_landing_page_views := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "landing_page_view").value')  #>> '{}')::INTEGER, 0);
            v_video_views        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "video_view").value')         #>> '{}')::INTEGER, 0);
            v_link_clicks        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "link_click").value')         #>> '{}')::INTEGER, 0);
            v_leads              := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "lead").value')               #>> '{}')::INTEGER, 0);
            v_onsite_web_leads   := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "onsite_web_lead").value')    #>> '{}')::INTEGER, 0);
            v_fb_pixel_leads     := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value') #>> '{}')::INTEGER, 0);

            INSERT INTO meta_ads_insights (
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

            -- Breakdowns (segmentações por idade, gênero, plataforma)
            IF v_insight->>'age' IS NOT NULL
               OR v_insight->>'gender' IS NOT NULL
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

    UPDATE meta_ads_raw_insights SET processado_em = now() WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$$;

-- =============================================================================
-- PARTE 4: RLS E GRANTS
-- =============================================================================

ALTER TABLE meta_ads_region_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on meta_ads_region_mapping" ON meta_ads_region_mapping;
CREATE POLICY "Service role full access on meta_ads_region_mapping"
ON meta_ads_region_mapping FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON meta_ads_region_mapping TO service_role;

-- Atualiza grants gerais para garantir que service_role tenha acesso às funções
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
