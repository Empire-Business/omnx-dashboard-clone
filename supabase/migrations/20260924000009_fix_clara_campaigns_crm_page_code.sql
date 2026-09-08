-- ============================================================
-- Migration: 20260924000009
-- Fix: corrige cruzamento em get_clara_campaigns_crm para usar page_code
--
-- O painel de Tráfego adota DUAS formas de cruzar campanhas Meta × CRM:
--   1. "Campanha Meta": campaign_name = utm_campaigns.nome (quando mapeado)
--   2. "Campanha [cp]": page_code em meta_ads_insights.ad_name = utm_campaigns.page_code
--
-- Na prática, os ad_names contêm o page_code (ex: "M7_01_PG53_CR-1116"), e
-- utm_campaigns.page_code = "PG53" mapeia para contatos.utm_campaign = 53.
-- Essa é a forma que funciona com os dados reais atuais, então a Clara passa
-- a usar page_code como chave de cruzamento — igual ao filtro "Campanha [cp]"
-- do painel de Tráfego.
-- ============================================================
SET search_path = public, pg_catalog;

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
            COALESCE(uc.nome, 'Campanha ' || COALESCE(m.page_code, cr.page_code)) AS campanha,
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
                'PG' || (regexp_match(ad_name, 'PG(\d+)'))[1] AS page_code,
                SUM(spend) AS investimento,
                SUM(impressions) AS impressoes,
                SUM(clicks) AS cliques,
                SUM(leads) AS leads_meta
            FROM public.meta_ads_insights
            WHERE workspace_id = p_workspace_id
              AND date BETWEEN p_week_start AND p_week_end
              AND ad_name ~ 'PG(\d+)'
            GROUP BY 'PG' || (regexp_match(ad_name, 'PG(\d+)'))[1]
        ) m
        FULL OUTER JOIN (
            SELECT
                uc.page_code,
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
            JOIN public.utm_campaigns uc
              ON uc.workspace_id = p_workspace_id
              AND uc.utm_campaign::TEXT = c.utm_campaign
            LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
            WHERE o.workspace_id = p_workspace_id
              AND o.data_lead_recebido >= (p_week_start::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND o.data_lead_recebido < ((p_week_end + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND c.utm_campaign IS NOT NULL
              AND c.utm_campaign <> ''
              AND o.pipeline_id != 'dz9ItDIo7qnEmM2wko3E'  -- exclui Recuperação
            GROUP BY uc.page_code
        ) cr USING (page_code)
        LEFT JOIN public.utm_campaigns uc
          ON uc.workspace_id = p_workspace_id
          AND uc.page_code = COALESCE(m.page_code, cr.page_code)
        WHERE COALESCE(m.investimento, 0) > 0
        ORDER BY COALESCE(m.investimento, 0) DESC
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) IS
'Breakdown de campanhas Meta Ads cruzado com CRM via page_code (PGxx) em ad_name e tabela utm_campaigns: spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS.';

REVOKE ALL ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
