-- =============================================================================
-- Migration: Fix meta_ads_insights deduplicação e constraint
-- Causa raiz: UNIQUE(ad_id, date, hour) com hour = EXTRACT(HOUR FROM fetch_finished_at)
-- criava linhas cumulativas em vez de substituir, inflando o investimento.
-- =============================================================================

-- 1. Remover duplicatas: manter apenas o row com maior fetched_at por (ad_id, date)
DELETE FROM meta_ads_insights
WHERE id NOT IN (
  SELECT DISTINCT ON (ad_id, date) id
  FROM meta_ads_insights
  ORDER BY ad_id, date, fetched_at DESC NULLS LAST
);

-- 2. Trocar constraint: de (ad_id, date, hour) para (ad_id, date)
ALTER TABLE meta_ads_insights
  DROP CONSTRAINT IF EXISTS meta_ads_insights_ad_id_date_hour_key;

ALTER TABLE meta_ads_insights
  ADD CONSTRAINT meta_ads_insights_ad_id_date_key UNIQUE (ad_id, date);

-- 3. Corrigir função processar_meta_ads_raw:
--    - Remover hour dos VALUES (passa NULL — campo mantido na tabela para uso futuro)
--    - Mudar ON CONFLICT para (ad_id, date)
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

            INSERT INTO meta_ads_insights (
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                date,
                -- hour intencionalmente omitido: o sync diário não tem breakdowns horários reais.
                -- O campo permanece na tabela para uso futuro com a Meta Insights API hourly breakdown.
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
            ON CONFLICT (ad_id, date) DO UPDATE SET
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
