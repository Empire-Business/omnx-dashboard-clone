-- ============================================================
-- Migration: 20260916000001
-- Fix: operadores -> em ORDER BY de RPCs get_clara_*
-- (não funcionam em record alias — usar coluna direta)
-- ============================================================
SET search_path = public, pg_catalog;

-- Fix get_clara_creatives
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
    SELECT jsonb_agg(row_to_json(t) ORDER BY cpl ASC NULLS LAST)
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

    SELECT jsonb_agg(row_to_json(t) ORDER BY cpl DESC NULLS LAST)
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
'Top 5 e bottom 5 criativos por CPL no período. Fixed: ORDER BY direto, sem operador -> em alias.';

-- Fix get_clara_campaigns
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
    SELECT jsonb_agg(row_to_json(t) ORDER BY spend DESC)
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
        ORDER BY spend DESC
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_campaigns(uuid, date, date) IS
'Breakdown de performance por campanha Meta Ads. Fixed: ORDER BY direto.';
