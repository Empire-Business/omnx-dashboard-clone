-- ============================================================
-- Migration: 20260916000000
-- RPCs de análise para Clara Agente Autônomo de Relatórios
-- docs/CLARA-AGENTE-RELATORIOS.md
-- ============================================================
SET search_path = public, pg_catalog;

-- 1. KPIs da semana
CREATE OR REPLACE FUNCTION public.get_clara_kpis(
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
    v_prev jsonb;
BEGIN
    SELECT jsonb_build_object(
        'leads',           r.leads_count,
        'mqls',            r.mqls_count,
        'conectados',      r.conectados_count,
        'agendados',       r.agendados_count,
        'reunioes',        r.reunioes_count,
        'fechados',        r.fechados_count,
        'no_shows',        r.no_shows_count,
        'perdidos',        r.perdidos_count,
        'negociacao',      r.negociacao_count,
        'spend',           r.meta_spend,
        'impressions',     r.meta_impressions,
        'clicks',          r.meta_clicks,
        'ctr',             round((r.ctr * 100)::numeric, 2),
        'cpmql',           r.cpmql,
        'roas',            round(r.roas::numeric, 2),
        'roas_caixa',      round(r.roas_caixa::numeric, 2),
        'faturamento',     r.faturamento_bruto,
        'caixa',           r.caixa_recebido,
        'taxa_conexao',    r.taxa_conexao_pct,
        'taxa_agendamento', r.taxa_agendamento_pct,
        'taxa_reuniao',    r.taxa_reuniao_pct,
        'taxa_conversao',  r.taxa_conversao_pct,
        'taxa_no_show',    r.taxa_no_show_pct
    ) INTO v_result
    FROM public.v_weekly_dashboard r
    WHERE r.workspace_id = p_workspace_id
      AND r.module = 'trafego'
      AND r.dimension = 'todos'
      AND r.week_start = p_week_start
      AND r.report_type = 'cohort'
    LIMIT 1;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_kpis(uuid, date, date) IS
'Retorna KPIs do tráfego para uma semana específica (cohort). Usado pela Clara Agente de Relatórios.';

-- 2. Comparação entre períodos (delta vs semana anterior)
CREATE OR REPLACE FUNCTION public.get_clara_comparison(
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
    v_prev_start date := p_week_start - INTERVAL '7 days';
    v_prev_end   date := p_week_end - INTERVAL '7 days';
    v_curr jsonb;
    v_prev jsonb;
    v_delta jsonb;
    v_metric text;
    v_curr_val numeric;
    v_prev_val numeric;
    v_pct numeric;
BEGIN
    v_curr := public.get_clara_kpis(p_workspace_id, p_week_start, p_week_end);
    v_prev := public.get_clara_kpis(p_workspace_id, v_prev_start, v_prev_end);

    v_delta := '{}'::jsonb;

    FOR v_metric IN SELECT jsonb_object_keys(v_curr)
    LOOP
        v_curr_val := (v_curr->>v_metric)::numeric;
        v_prev_val := (v_prev->>v_metric)::numeric;

        IF v_prev_val IS NOT NULL AND v_prev_val != 0 THEN
            v_pct := round(((v_curr_val - v_prev_val) / v_prev_val * 100)::numeric, 1);
        ELSIF v_curr_val IS NOT NULL AND v_curr_val != 0 THEN
            v_pct := NULL; -- semana anterior zerada, delta infinito
        ELSE
            v_pct := 0;
        END IF;

        v_delta := v_delta || jsonb_build_object(
            v_metric,
            jsonb_build_object(
                'atual',   v_curr_val,
                'anterior', v_prev_val,
                'delta_pct', v_pct
            )
        );
    END LOOP;

    RETURN v_delta;
END;
$$;

COMMENT ON FUNCTION public.get_clara_comparison(uuid, date, date) IS
'Compara KPIs da semana atual com a semana anterior e retorna deltas percentuais.';

-- 3. Funil de conversão da semana
CREATE OR REPLACE FUNCTION public.get_clara_funnel(
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
    v_row RECORD;
    v_result jsonb;
BEGIN
    SELECT
        r.leads_count, r.mqls_count, r.conectados_count,
        r.agendados_count, r.reunioes_count, r.fechados_count,
        r.no_shows_count, r.perdidos_count, r.negociacao_count,
        r.taxa_conexao_pct, r.taxa_agendamento_pct,
        r.taxa_reuniao_pct, r.taxa_conversao_pct, r.taxa_no_show_pct
    INTO v_row
    FROM public.v_weekly_dashboard r
    WHERE r.workspace_id = p_workspace_id
      AND r.module = 'trafego'
      AND r.dimension = 'todos'
      AND r.week_start = p_week_start
      AND r.report_type = 'cohort'
    LIMIT 1;

    SELECT jsonb_build_object(
        'leads',       COALESCE(v_row.leads_count, 0),
        'mqls',        COALESCE(v_row.mqls_count, 0),
        'conectados',  COALESCE(v_row.conectados_count, 0),
        'agendados',   COALESCE(v_row.agendados_count, 0),
        'reunioes',    COALESCE(v_row.reunioes_count, 0),
        'fechados',    COALESCE(v_row.fechados_count, 0),
        'no_shows',    COALESCE(v_row.no_shows_count, 0),
        'perdidos',    COALESCE(v_row.perdidos_count, 0),
        'negociacao',  COALESCE(v_row.negociacao_count, 0),
        'taxa_mql',            round((COALESCE(v_row.mqls_count, 0)::numeric / NULLIF(v_row.leads_count, 0) * 100)::numeric, 1),
        'taxa_conexao',        v_row.taxa_conexao_pct,
        'taxa_agendamento',    v_row.taxa_agendamento_pct,
        'taxa_reuniao',        v_row.taxa_reuniao_pct,
        'taxa_conversao',      v_row.taxa_conversao_pct,
        'taxa_no_show',        v_row.taxa_no_show_pct
    ) INTO v_result;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_funnel(uuid, date, date) IS
'Retorna o funil de conversão completo com contagens e taxas.';

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
    -- Top 5 criativos por menor CPMQL (mais eficientes)
    SELECT jsonb_agg(row_to_json(t) ORDER BY (t->>'cpmql')::numeric ASC)
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
    SELECT jsonb_agg(row_to_json(t) ORDER BY (t->>'cpl')::numeric DESC)
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

COMMENT ON FUNCTION public.get_clara_creatives(uuid, date, date) IS
'Top 5 e bottom 5 criativos por CPL no período.';

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
    SELECT jsonb_agg(row_to_json(t) ORDER BY (t->>'spend')::numeric DESC)
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

COMMENT ON FUNCTION public.get_clara_campaigns(uuid, date, date) IS
'Breakdown de performance por campanha Meta Ads no período.';

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
    SELECT jsonb_agg(row_to_json(t) ORDER BY (t->>'leads')::int DESC)
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
          AND o.pipeline_id != 'dz9ItDIo7qnEmM2wko3E'  -- exclui Recuperação
        GROUP BY COALESCE(NULLIF(c.utm_source, ''), 'direto/outros')
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_channels(uuid, date, date) IS
'Breakdown de leads/MQLs/vendas por canal (utm_source) no período.';

-- 7. Tendência de uma métrica nas últimas N semanas
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
        RETURN jsonb_build_object('error', 'Métrica inválida. Válidas: ' || array_to_string(v_valid_metrics, ', '));
    END IF;

    SELECT jsonb_agg(row_to_json(t) ORDER BY (t->>'week_start'))
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

COMMENT ON FUNCTION public.get_clara_trend(uuid, text, integer) IS
'Tendência de uma métrica nas últimas N semanas. Métricas: leads_count, mqls_count, meta_spend, cpmql, roas, taxas, etc.';

-- 8. Benchmarks históricos (média + desvio das últimas 12 semanas)
CREATE OR REPLACE FUNCTION public.get_clara_benchmarks(
    p_workspace_id uuid,
    p_metric text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'leads_avg',            round(avg(r.leads_count)::numeric, 1),
        'leads_stddev',         round(stddev(r.leads_count)::numeric, 1),
        'mqls_avg',             round(avg(r.mqls_count)::numeric, 1),
        'mqls_stddev',          round(stddev(r.mqls_count)::numeric, 1),
        'cpmql_avg',            round(avg(r.cpmql)::numeric, 2),
        'cpmql_stddev',         round(stddev(r.cpmql)::numeric, 2),
        'spend_avg',            round(avg(r.meta_spend)::numeric, 2),
        'taxa_conexao_avg',     round(avg(r.taxa_conexao_pct)::numeric, 2),
        'taxa_agendamento_avg', round(avg(r.taxa_agendamento_pct)::numeric, 2),
        'taxa_no_show_avg',     round(avg(r.taxa_no_show_pct)::numeric, 2),
        'roas_avg',             round(avg(r.roas)::numeric, 2),
        'semanas_consideradas', count(*)::int
    ) INTO v_result
    FROM public.v_weekly_dashboard r
    WHERE r.workspace_id = p_workspace_id
      AND r.module = 'trafego'
      AND r.dimension = 'todos'
      AND r.report_type = 'cohort'
      AND r.week_start <= CURRENT_DATE
      AND r.leads_count > 0;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_benchmarks(uuid, text) IS
'Médias e desvios-padrão históricos (12 semanas) para detecção de anomalias.';

-- Grants: somente service_role
REVOKE ALL ON FUNCTION public.get_clara_kpis(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_kpis(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_comparison(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_comparison(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_funnel(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_funnel(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_creatives(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_creatives(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_campaigns(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_campaigns(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_channels(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_channels(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_trend(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_trend(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_benchmarks(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_benchmarks(uuid, text) TO service_role;
