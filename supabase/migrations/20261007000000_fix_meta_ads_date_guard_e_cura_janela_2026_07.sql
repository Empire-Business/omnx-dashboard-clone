-- ============================================================
-- fix: guarda anti-agregação (date_start/date_stop) nas RPCs de
-- processamento Meta Ads + cura da janela corrompida 30/06–06/07/2026
--
-- Contexto: antes do commit 65def51 (13/07/2026), o cron
-- sync-meta-ads-7days-daily chamava a Graph API com time_range de 7
-- dias SEM time_increment=1. A Meta agrega o período inteiro numa
-- linha com date_start = since, e processar_meta_ads_raw gravava essa
-- soma como se fosse do dia. 7 raws envenenados (fetches de 07/07 a
-- 07/13) deixaram linhas infladas nas datas 2026-06-30 → 2026-07-06
-- que o backfill dia-a-dia de 13/07 18:04 NÃO conseguiu sobrescrever:
-- o UPSERT (workspace_id, ad_id, date) só cura colisões, e os ad_ids
-- das linhas agregadas são disjuntos dos da geração correta (anúncios
-- ativos em 07–13/07 que não rodaram no dia gravado).
--
-- Esta migration:
-- 1. Recria processar_meta_ads_raw com guarda: pula insights com
--    date_stop <> date_start (linha agregada de N dias), contabiliza,
--    emite RAISE WARNING e reporta no retorno
--    ('insights_agregados_ignorados'). Não quebra o sync — apenas
--    impede que lixo agregado vire dado diário silenciosamente.
-- 2. Idem para processar_meta_ads_raw_region_breakdown (filtro no CTE).
-- 3. DELETE das linhas geradas pelos 7 raws envenenados.
-- 4. DELETE dos 7 raws envenenados (quarentena — impede que um
--    reprocessamento futuro re-infle os dados; response_data deles é
--    agregado e sem utilidade).
--
-- A guarda é agnóstica de workspace (valida cada insight), valendo para
-- qualquer tenant. O isolamento multi-tenant segue garantido por:
-- workspace_id NOT NULL, constraint UNIQUE (workspace_id, ad_id, date),
-- trigger de vínculo conta↔workspace e RLS por membership/agência.
-- ============================================================

-- ============================================================
-- 1. processar_meta_ads_raw COM GUARDA date_start == date_stop
-- ============================================================
DROP FUNCTION IF EXISTS processar_meta_ads_raw(UUID);

CREATE OR REPLACE FUNCTION processar_meta_ads_raw(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw                  RECORD;
    v_insight              JSONB;
    v_actions              JSONB;
    v_insights_count       INTEGER := 0;
    v_breakdowns_count     INTEGER := 0;
    v_agregados_ignorados  INTEGER := 0;
    v_insight_id           UUID;
    v_workspace_id         UUID;
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

            -- GUARDA ANTI-AGREGAÇÃO: insight com date_stop > date_start é uma
            -- linha agregada de N dias (time_range sem time_increment=1 na
            -- Graph API). Gravar como diária infla o dia date_start com a soma
            -- do período inteiro — pular e reportar.
            IF (v_insight->>'date_stop')::DATE <> (v_insight->>'date_start')::DATE THEN
                v_agregados_ignorados := v_agregados_ignorados + 1;
                CONTINUE;
            END IF;

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

    IF v_agregados_ignorados > 0 THEN
        RAISE WARNING 'processar_meta_ads_raw: % insight(s) agregados (date_stop > date_start) ignorados no raw %',
            v_agregados_ignorados, p_raw_id;
    END IF;

    UPDATE meta_ads_raw_insights
    SET processado_em = now()
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',           v_insights_count,
        'breakdowns_inseridos',         v_breakdowns_count,
        'insights_agregados_ignorados', v_agregados_ignorados
    );
END;
$$;

-- ============================================================
-- 2. processar_meta_ads_raw_region_breakdown COM A MESMA GUARDA
-- ============================================================
DROP FUNCTION IF EXISTS processar_meta_ads_raw_region_breakdown(UUID);

CREATE OR REPLACE FUNCTION processar_meta_ads_raw_region_breakdown(p_raw_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_raw                  RECORD;
    v_rec                  RECORD;
    v_insights_count       INTEGER := 0;
    v_breakdowns_count     INTEGER := 0;
    v_agregados_ignorados  INTEGER := 0;
    v_insight_id           UUID;
    v_workspace_id         UUID;
    v_inserted_rows        INTEGER;
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
            'insights_inseridos',           0,
            'breakdowns_inseridos',         0,
            'insights_agregados_ignorados', 0
        );
    END IF;

    -- GUARDA ANTI-AGREGAÇÃO: contar linhas agregadas (date_stop > date_start)
    -- que serão excluídas no CTE abaixo — mesma proteção da RPC padrão.
    SELECT COUNT(*) INTO v_agregados_ignorados
    FROM jsonb_array_elements(v_raw.response_data->'data') AS v_insight
    WHERE (v_insight->>'date_stop')::DATE <> (v_insight->>'date_start')::DATE;

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
            -- guarda anti-agregação: só processa linhas de 1 dia
            WHERE (v_insight->>'date_stop')::DATE = (v_insight->>'date_start')::DATE
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
          AND (v_insight2->>'date_stop')::DATE = v_rec.dt
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

    IF v_agregados_ignorados > 0 THEN
        RAISE WARNING 'processar_meta_ads_raw_region_breakdown: % insight(s) agregados (date_stop > date_start) ignorados no raw %',
            v_agregados_ignorados, p_raw_id;
    END IF;

    UPDATE meta_ads_raw_insights
    SET processado_em = now()
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',           v_insights_count,
        'breakdowns_inseridos',         v_breakdowns_count,
        'insights_agregados_ignorados', v_agregados_ignorados
    );
END;
$$;

-- ============================================================
-- 3. CURA: remove as linhas infladas geradas pelos 7 raws envenenados
-- (cada um agregou 7 dias e gravou a soma no dia `since`; as linhas
-- corretas dia-a-dia do backfill de 13/07 18:04 são preservadas).
-- meta_ads_insights_breakdowns cai em cascata (ON DELETE CASCADE) —
-- esses raws não tinham breakdowns, nada mais é afetado.
-- ============================================================
DELETE FROM meta_ads_insights
WHERE raw_insight_id IN (
    'eac2ca00-5e42-4b7c-9cb6-b6198045ec52', -- fetch 07/07 06:00, agregou 30/06–07/07 → gravou em 30/06
    'f6c19419-202f-4cd6-9660-c236baf5949a', -- fetch 07/08 06:00, agregou 01/07–08/07 → gravou em 01/07
    '8a92034b-07ae-49d5-b5b5-90608ec35fb4', -- fetch 07/09 06:00, agregou 02/07–09/07 → gravou em 02/07
    '843dc11e-5ba6-4552-8b6e-2f3c4bc2748f', -- fetch 07/10 06:00, agregou 03/07–10/07 → gravou em 03/07
    'f4f766ed-49d9-4c71-a194-83c3088fe03a', -- fetch 07/11 06:00, agregou 04/07–11/07 → gravou em 04/07
    'f5258c81-f557-4eac-82df-956b8936bcc3', -- fetch 07/12 06:00, agregou 05/07–12/07 → gravou em 05/07
    '0e163dcd-6312-4f4c-8922-3d39d2b73c25'  -- fetch 07/13 06:00, agregou 06/07–13/07 → gravou em 06/07
);

-- ============================================================
-- 4. QUARENTENA: remove os raws envenenados (response_data agregado,
-- sem utilidade) para impedir reprocessamento que re-inflaria os dados
-- ============================================================
DELETE FROM meta_ads_raw_insights
WHERE id IN (
    'eac2ca00-5e42-4b7c-9cb6-b6198045ec52',
    'f6c19419-202f-4cd6-9660-c236baf5949a',
    '8a92034b-07ae-49d5-b5b5-90608ec35fb4',
    '843dc11e-5ba6-4552-8b6e-2f3c4bc2748f',
    'f4f766ed-49d9-4c71-a194-83c3088fe03a',
    'f5258c81-f557-4eac-82df-956b8936bcc3',
    '0e163dcd-6312-4f4c-8922-3d39d2b73c25'
);
