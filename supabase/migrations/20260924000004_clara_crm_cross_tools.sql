-- ============================================================
-- Migration: 20260924000004
-- Clara: ferramentas de cruzamento Meta Ads × CRM por campanha e criativo
--
-- Adiciona duas RPCs que a Clara pode usar para investigar a eficiência
-- real de campanhas e criativos, incluindo métricas de funil do CRM:
-- CPMQL, CPAgendamento, CPReunião, CPV, ROAS e ROAS Caixa.
-- ============================================================
SET search_path = public, pg_catalog;

-- 1. Campanhas Meta Ads cruzadas com CRM (por utm_campaign)
CREATE OR REPLACE FUNCTION public.get_clara_campaigns_crm(
    p_workspace_id uuid,
    p_week_start date,
    p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'spend')::numeric DESC)
    INTO v_result
    FROM (
        SELECT
            COALESCE(m.camp_key, cr.camp_key) AS campanha,
            COALESCE(m.investimento, 0)::numeric AS spend,
            COALESCE(m.impressoes, 0)::bigint AS impressions,
            COALESCE(m.cliques, 0)::bigint AS clicks,
            COALESCE(m.leads_meta, 0)::bigint AS leads_meta,
            COALESCE(cr.leads_crm, 0)::bigint AS leads_crm,
            COALESCE(cr.mqls_crm, 0)::bigint AS mqls_crm,
            COALESCE(cr.agendados, 0)::bigint AS agendados,
            COALESCE(cr.reunioes, 0)::bigint AS reunioes,
            COALESCE(cr.fechamentos, 0)::bigint AS vendas,
            COALESCE(cr.faturamento, 0)::numeric AS faturamento,
            COALESCE(cr.caixa, 0)::numeric AS caixa,
            CASE WHEN COALESCE(m.leads_meta, 0) > 0
                THEN ROUND(m.investimento / m.leads_meta, 2)
            END AS cpl_meta,
            CASE WHEN COALESCE(cr.leads_crm, 0) > 0
                THEN ROUND(m.investimento / cr.leads_crm, 2)
            END AS cpl_crm,
            CASE WHEN COALESCE(cr.mqls_crm, 0) > 0
                THEN ROUND(m.investimento / cr.mqls_crm, 2)
            END AS cpmql,
            CASE WHEN COALESCE(cr.agendados, 0) > 0
                THEN ROUND(m.investimento / cr.agendados, 2)
            END AS cpagendamento,
            CASE WHEN COALESCE(cr.reunioes, 0) > 0
                THEN ROUND(m.investimento / cr.reunioes, 2)
            END AS cpreuniao,
            CASE WHEN COALESCE(cr.fechamentos, 0) > 0
                THEN ROUND(m.investimento / cr.fechamentos, 2)
            END AS cpv,
            CASE WHEN m.investimento > 0
                THEN ROUND(cr.faturamento / m.investimento, 2)
            END AS roas,
            CASE WHEN m.investimento > 0
                THEN ROUND(cr.caixa / m.investimento, 2)
            END AS roas_caixa,
            CASE WHEN COALESCE(m.impressoes, 0) > 0
                THEN ROUND((m.cliques::numeric / m.impressoes) * 100, 2)
            END AS ctr
        FROM (
            SELECT
                LOWER(TRIM(campaign_name)) AS camp_key,
                SUM(spend) AS investimento,
                SUM(impressions) AS impressoes,
                SUM(clicks) AS cliques,
                SUM(leads) AS leads_meta
            FROM public.meta_ads_insights
            WHERE workspace_id = p_workspace_id
              AND date BETWEEN p_week_start AND p_week_end
              AND campaign_name IS NOT NULL
              AND campaign_name <> ''
            GROUP BY LOWER(TRIM(campaign_name))
        ) m
        FULL OUTER JOIN (
            SELECT
                LOWER(TRIM(c.utm_campaign)) AS camp_key,
                COUNT(DISTINCT o.id)::bigint AS leads_crm,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE c.tags IS NOT NULL AND c.tags ~* '(^|,)\s*mql\s*($|,)'
                )::bigint AS mqls_crm,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE o.data_agendamento_reuniao BETWEEN p_week_start AND p_week_end
                )::bigint AS agendados,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE o.data_realizacao_vendas BETWEEN p_week_start AND p_week_end
                       OR o.data_reuniao_agendada BETWEEN p_week_start AND p_week_end
                )::bigint AS reunioes,
                COUNT(DISTINCT vf.oportunidade_id) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                )::bigint AS fechamentos,
                COALESCE(SUM(vf.valor_faturado) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                ), 0)::numeric AS faturamento,
                COALESCE(SUM(vf.valor_entrada) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                ), 0)::numeric AS caixa
            FROM public.oportunidades o
            JOIN public.contatos c ON c.id = o.contato_id AND c.workspace_id = p_workspace_id
            LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
            WHERE o.workspace_id = p_workspace_id
              AND o.data_lead_recebido >= (p_week_start::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND o.data_lead_recebido < ((p_week_end + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND c.utm_campaign IS NOT NULL
              AND c.utm_campaign <> ''
              AND o.pipeline_id != 'dz9ItDIo7qnEmM2wko3E'  -- exclui Recuperação
            GROUP BY LOWER(TRIM(c.utm_campaign))
        ) cr USING (camp_key)
        WHERE COALESCE(m.investimento, 0) > 0
        ORDER BY COALESCE(m.investimento, 0) DESC
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) IS
'Breakdown de campanhas Meta Ads cruzado com CRM: spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS.';

-- 2. Criativos Meta Ads cruzados com CRM (por CR-xxx no utm_term / ad_name)
CREATE OR REPLACE FUNCTION public.get_clara_creatives_crm(
    p_workspace_id uuid,
    p_week_start date,
    p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'spend')::numeric DESC)
    INTO v_result
    FROM (
        SELECT
            e.creative_code,
            e.creative_name,
            e.spend,
            e.impressions,
            e.clicks,
            e.leads_meta,
            e.leads_crm,
            e.mqls,
            e.agendados,
            e.reunioes,
            e.vendas,
            e.faturamento,
            e.caixa,
            e.cpl_crm,
            e.cpmql,
            CASE WHEN COALESCE(e.agendados, 0) > 0
                THEN ROUND(e.spend / e.agendados, 2)
            END AS cpagendamento,
            CASE WHEN COALESCE(e.reunioes, 0) > 0
                THEN ROUND(e.spend / e.reunioes, 2)
            END AS cpreuniao,
            e.cpv,
            e.roas,
            e.roas_caixa,
            e.ctr
        FROM (
            SELECT
                ('CR-' || j.creative_num)::TEXT AS creative_code,
                COALESCE(nc.name, 'Criativo CR-' || j.creative_num) AS creative_name,
                j.sum_spend AS spend,
                j.sum_impressions AS impressions,
                j.sum_clicks AS clicks,
                j.sum_leads_meta AS leads_meta,
                j.sum_leads_crm AS leads_crm,
                j.sum_mqls AS mqls,
                j.sum_agendados AS agendados,
                j.sum_reunioes AS reunioes,
                j.sum_vendas AS vendas,
                j.sum_faturamento AS faturamento,
                j.sum_caixa AS caixa,
                CASE WHEN j.sum_impressions > 0
                    THEN ROUND((j.sum_clicks::NUMERIC / j.sum_impressions) * 100, 2)
                ELSE 0 END AS ctr,
                CASE WHEN j.sum_impressions > 0
                    THEN ROUND((j.sum_spend / j.sum_impressions) * 1000, 2)
                ELSE 0 END AS cpm,
                CASE WHEN j.sum_leads_crm > 0
                    THEN ROUND(j.sum_spend / j.sum_leads_crm, 2)
                ELSE 0 END AS cpl_crm,
                CASE WHEN j.sum_mqls > 0
                    THEN ROUND(j.sum_spend / j.sum_mqls, 2)
                ELSE 0 END AS cpmql,
                CASE WHEN j.sum_vendas > 0
                    THEN ROUND(j.sum_spend / j.sum_vendas, 2)
                ELSE 0 END AS cpv,
                CASE WHEN j.sum_spend > 0
                    THEN ROUND(j.sum_faturamento / j.sum_spend, 2)
                ELSE 0 END AS roas,
                CASE WHEN j.sum_spend > 0
                    THEN ROUND(j.sum_caixa / j.sum_spend, 2)
                ELSE 0 END AS roas_caixa
            FROM (
                SELECT
                    ak.jkey,
                    ma.creative_num,
                    COALESCE(ma.sum_spend, 0) AS sum_spend,
                    COALESCE(ma.sum_impressions, 0) AS sum_impressions,
                    COALESCE(ma.sum_clicks, 0) AS sum_clicks,
                    COALESCE(ma.sum_leads_meta, 0) AS sum_leads_meta,
                    COALESCE(ca.sum_leads_crm, 0) AS sum_leads_crm,
                    COALESCE(ca.sum_mqls, 0) AS sum_mqls,
                    COALESCE(ca.sum_agendados, 0) AS sum_agendados,
                    COALESCE(ca.sum_reunioes, 0) AS sum_reunioes,
                    COALESCE(ca.sum_vendas, 0) AS sum_vendas,
                    COALESCE(ca.sum_faturamento, 0) AS sum_faturamento,
                    COALESCE(ca.sum_caixa, 0) AS sum_caixa
                FROM (
                    SELECT meta_key AS jkey FROM (
                        SELECT (regexp_match(ad_name, 'CR-(\d+)'))[1] AS meta_key
                        FROM public.meta_ads_insights
                        WHERE workspace_id = p_workspace_id
                          AND date BETWEEN p_week_start AND p_week_end
                          AND ad_name ~ 'CR-(\d+)'
                    ) m1
                    UNION
                    SELECT crm_key AS jkey FROM (
                        SELECT (regexp_match(utm_term, 'CR-(\d+)'))[1] AS crm_key
                        FROM public.contatos
                        WHERE workspace_id = p_workspace_id
                          AND utm_term IS NOT NULL
                          AND utm_term ~ 'CR-(\d+)'
                    ) c1
                ) ak
                LEFT JOIN (
                    SELECT
                        (regexp_match(ad_name, 'CR-(\d+)'))[1] AS meta_key,
                        NULL::TEXT AS creative_num,
                        SUM(spend) AS sum_spend,
                        SUM(impressions)::BIGINT AS sum_impressions,
                        SUM(clicks)::BIGINT AS sum_clicks,
                        SUM(leads)::BIGINT AS sum_leads_meta
                    FROM public.meta_ads_insights
                    WHERE workspace_id = p_workspace_id
                      AND date BETWEEN p_week_start AND p_week_end
                      AND ad_name ~ 'CR-(\d+)'
                    GROUP BY (regexp_match(ad_name, 'CR-(\d+)'))[1]
                ) ma ON ma.meta_key = ak.jkey
                LEFT JOIN (
                    SELECT
                        (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS crm_key,
                        COUNT(DISTINCT o.id)::BIGINT AS sum_leads_crm,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE c.tags IS NOT NULL AND c.tags::TEXT ILIKE '%MQL%'
                        )::BIGINT AS sum_mqls,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE o.data_agendamento_reuniao BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_agendados,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE o.data_realizacao_vendas BETWEEN p_week_start AND p_week_end
                               OR o.data_reuniao_agendada BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_reunioes,
                        COUNT(DISTINCT vf.oportunidade_id) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_vendas,
                        SUM(COALESCE(vf.valor_faturado, 0)) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        ) AS sum_faturamento,
                        SUM(COALESCE(vf.valor_entrada, 0)) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        ) AS sum_caixa
                    FROM public.oportunidades o
                    JOIN public.contatos c ON c.id = o.contato_id AND c.workspace_id = p_workspace_id
                    LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
                    WHERE o.workspace_id = p_workspace_id
                      AND o.data_lead_recebido >= (p_week_start::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
                      AND o.data_lead_recebido < ((p_week_end + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
                      AND c.utm_term IS NOT NULL
                      AND c.utm_term ~ 'CR-(\d+)'
                      AND o.pipeline_id IS DISTINCT FROM 'dz9ItDIo7qnEmM2wko3E'::TEXT
                    GROUP BY (regexp_match(c.utm_term, 'CR-(\d+)'))[1]
                ) ca ON ca.crm_key = ak.jkey
            ) j
            LEFT JOIN public.notion_creatives nc
              ON nc.external_id = 'CR-' || j.creative_num
              AND nc.workspace_id = p_workspace_id
              AND nc.database_type = 'paid'
        ) e
        WHERE e.spend > 0
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_creatives_crm(uuid, date, date) IS
'Breakdown de criativos Meta Ads cruzado com CRM: spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS.';

-- Grants: somente service_role (padrão das tools da Clara)
REVOKE ALL ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_clara_creatives_crm(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_creatives_crm(uuid, date, date) TO service_role;
