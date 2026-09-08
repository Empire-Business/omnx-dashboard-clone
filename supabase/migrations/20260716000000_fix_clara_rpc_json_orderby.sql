-- ============================================================
-- Migration: 20260716000000
-- Corrige operadores json em ORDER BY nas RPCs da Clara
-- Problema: row_to_json(t)->>'campo' pode ser interpretado como record->>unknown
-- Solucao: ordenar diretamente pelas colunas da subquery
-- docs/CLARA-AGENTE-RELATORIOS.md
-- ============================================================
SET search_path = public, pg_catalog;

-- 4. Performance de criativos (top/bottom)
CREATE OR REPLACE FUNCTION public.get_clara_creatives(
    p_workspace_id uuid,
    p_week_start date,
    p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_top jsonb;
    v_bottom jsonb;
    v_summary jsonb;
BEGIN
    -- Top 5 criativos por menor CPL (mais eficientes)
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cpl ASC NULLS LAST)
    INTO v_top
    FROM (
        SELECT
            regexp_replace(m.ad_name, '.*?(CR-\d+|AN-\d+).*', '\1', 'g') AS criativo,
            sum(m.spend)      AS spend,
            sum(m.impressions) AS impressions,
            sum(m.clicks)     AS clicks,
            sum(m.leads)      AS leads_meta,
            CASE WHEN sum(m.leads) > 0
                THEN round((sum(m.spend) / sum(m.leads))::numeric, 2)
            END AS cpl,
            CASE WHEN sum(m.leads) > 0
                THEN round((sum(m.clicks)::numeric / NULLIF(sum(m.impressions), 0) * 100)::numeric, 2)
            END AS ctr
        FROM public.meta_ads_insights m
        WHERE m.date BETWEEN p_week_start AND p_week_end
          AND m.ad_name ~ '(CR-|AN-)\d+'
        GROUP BY regexp_replace(m.ad_name, '.*?(CR-\d+|AN-\d+).*', '\1', 'g')
        HAVING sum(m.spend) > 0
        ORDER BY cpl ASC NULLS LAST
        LIMIT 5
    ) t;

    -- Bottom 5 criativos (mais caros)
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cpl DESC NULLS LAST)
    INTO v_bottom
    FROM (
        SELECT
            regexp_replace(m.ad_name, '.*?(CR-\d+|AN-\d+).*', '\1', 'g') AS criativo,
            sum(m.spend)      AS spend,
            sum(m.impressions) AS impressions,
            sum(m.clicks)     AS clicks,
            sum(m.leads)      AS leads_meta,
            CASE WHEN sum(m.leads) > 0
                THEN round((sum(m.spend) / sum(m.leads))::numeric, 2)
            END AS cpl,
            CASE WHEN sum(m.leads) > 0
                THEN round((sum(m.clicks)::numeric / NULLIF(sum(m.impressions), 0) * 100)::numeric, 2)
            END AS ctr
        FROM public.meta_ads_insights m
        WHERE m.date BETWEEN p_week_start AND p_week_end
          AND m.ad_name ~ '(CR-|AN-)\d+'
        GROUP BY regexp_replace(m.ad_name, '.*?(CR-\d+|AN-\d+).*', '\1', 'g')
        HAVING sum(m.spend) > 0
        ORDER BY cpl DESC NULLS LAST
        LIMIT 5
    ) t;

    SELECT jsonb_build_object('top', v_top, 'bottom', v_bottom) INTO v_summary;
    RETURN COALESCE(v_summary, '{}'::jsonb);
END;
$$;

-- 5. Breakdown por campanha Meta Ads
CREATE OR REPLACE FUNCTION public.get_clara_campaigns(
    p_workspace_id uuid,
    p_week_start date,
    p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.spend DESC)
    INTO v_result
    FROM (
        SELECT
            m.campaign_name AS campanha,
            sum(m.spend)      AS spend,
            sum(m.impressions) AS impressions,
            sum(m.clicks)     AS clicks,
            sum(m.leads)      AS leads,
            CASE WHEN sum(m.clicks) > 0
                THEN round((sum(m.clicks)::numeric / NULLIF(sum(m.impressions), 0) * 100)::numeric, 2)
            END AS ctr,
            CASE WHEN sum(m.leads) > 0
                THEN round((sum(m.spend) / sum(m.leads))::numeric, 2)
            END AS cpl
        FROM public.meta_ads_insights m
        WHERE m.date BETWEEN p_week_start AND p_week_end
        GROUP BY m.campaign_name
        HAVING sum(m.spend) > 0
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 6. Breakdown por canal (utm_source)
CREATE OR REPLACE FUNCTION public.get_clara_channels(
    p_workspace_id uuid,
    p_week_start date,
    p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.leads DESC)
    INTO v_result
    FROM (
        SELECT
            COALESCE(NULLIF(c.utm_source, ''), 'direto/outros') AS canal,
            count(DISTINCT c.id) AS leads,
            count(DISTINCT CASE WHEN c.tags ILIKE '%MQL%' THEN c.id END) AS mqls,
            count(DISTINCT o.id) AS oportunidades,
            count(DISTINCT vf.oportunidade_id) AS vendas,
            coalesce(sum(vf.valor_faturado), 0) AS faturamento
        FROM public.contatos c
        JOIN public.oportunidades o ON o.contato_id = c.id
            AND o.data_lead_recebido BETWEEN p_week_start AND (p_week_end::date + INTERVAL '1 day' - INTERVAL '1 second')
        LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
        WHERE c.workspace_id = p_workspace_id
          AND o.pipeline_id != 'dz9ItDIo7qnEmM2wko3E'  -- exclui Recuperacao
        GROUP BY COALESCE(NULLIF(c.utm_source, ''), 'direto/outros')
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 7. Tendencia de uma metrica nas ultimas N semanas
CREATE OR REPLACE FUNCTION public.get_clara_trend(
    p_workspace_id uuid,
    p_metric text,
    p_weeks_back integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
    v_sql text;
    v_valid_metrics text[] := ARRAY[
        'leads_count', 'mqls_count', 'conectados_count', 'agendados_count',
        'reunioes_count', 'fechados_count', 'no_shows_count', 'perdidos_count',
        'meta_spend', 'meta_impressions', 'meta_clicks', 'cpmql',
        'roas', 'taxa_conexao_pct', 'taxa_agendamento_pct', 'taxa_no_show_pct'
    ];
BEGIN
    IF p_metric != ALL(v_valid_metrics) THEN
        RETURN jsonb_build_object('error', 'Metrica invalida. Validas: ' || array_to_string(v_valid_metrics, ', '));
    END IF;

    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.week_start)
    INTO v_result
    FROM (
        SELECT
            r.week_start,
            r.year_week,
            CASE p_metric
                WHEN 'leads_count'         THEN r.leads_count
                WHEN 'mqls_count'          THEN r.mqls_count
                WHEN 'conectados_count'    THEN r.conectados_count
                WHEN 'agendados_count'     THEN r.agendados_count
                WHEN 'reunioes_count'      THEN r.reunioes_count
                WHEN 'fechados_count'      THEN r.fechados_count
                WHEN 'no_shows_count'      THEN r.no_shows_count
                WHEN 'perdidos_count'      THEN r.perdidos_count
                WHEN 'meta_spend'          THEN r.meta_spend
                WHEN 'meta_impressions'    THEN r.meta_impressions
                WHEN 'meta_clicks'         THEN r.meta_clicks
                WHEN 'cpmql'               THEN r.cpmql
                WHEN 'roas'                THEN round(r.roas::numeric, 2)
                WHEN 'taxa_conexao_pct'    THEN r.taxa_conexao_pct
                WHEN 'taxa_agendamento_pct' THEN r.taxa_agendamento_pct
                WHEN 'taxa_no_show_pct'    THEN r.taxa_no_show_pct
            END AS valor
        FROM public.v_weekly_dashboard r
        WHERE r.workspace_id = p_workspace_id
          AND r.module = 'trafego'
          AND r.dimension = 'todos'
          AND r.report_type = 'cohort'
          AND r.week_start <= CURRENT_DATE
        ORDER BY r.week_start DESC
        LIMIT p_weeks_back
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Grants mantidos
REVOKE ALL ON FUNCTION public.get_clara_creatives(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_creatives(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_campaigns(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_campaigns(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_channels(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_channels(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_trend(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_trend(uuid, text, integer) TO service_role;
