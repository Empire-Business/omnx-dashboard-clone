-- RPC que cruza meta_ads_insights com oportunidades via utm_campaign normalizado
-- Útil para o painel de Tráfego comparar investimento Meta vs leads no CRM

CREATE OR REPLACE FUNCTION analisar_meta_crm_cruzado(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  utm_campaign       TEXT,
  investimento_meta  NUMERIC,
  impressoes         BIGINT,
  cliques            BIGINT,
  leads_meta         BIGINT,
  leads_crm          BIGINT,
  mqls_crm           BIGINT,
  reunioes           BIGINT,
  fechamentos        BIGINT,
  cpl_meta           NUMERIC,
  cpl_crm            NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH meta AS (
    SELECT
      LOWER(TRIM(campaign_name))  AS camp_key,
      SUM(spend)                  AS investimento,
      SUM(impressions)            AS impressoes,
      SUM(clicks)                 AS cliques,
      SUM(leads)                  AS leads_meta
    FROM meta_ads_insights
    WHERE date >= p_start_date
      AND date <= p_end_date
      AND campaign_name IS NOT NULL
      AND campaign_name <> ''
    GROUP BY LOWER(TRIM(campaign_name))
  ),
  crm AS (
    SELECT
      LOWER(TRIM(c.utm_campaign))  AS camp_key,
      COUNT(DISTINCT o.id)         AS leads_crm,
      COUNT(DISTINCT o.id) FILTER (
        WHERE c.tags IS NOT NULL AND c.tags ~* '(^|,)\s*mql\s*($|,)'
      )                            AS mqls_crm,
      COUNT(DISTINCT o.id) FILTER (
        WHERE o.data_agendamento_reuniao >= p_start_date
          AND o.data_agendamento_reuniao <= p_end_date
      )                            AS reunioes,
      COUNT(DISTINCT vf.oportunidade_id) FILTER (
        WHERE vf.data_pagamento_entrada >= p_start_date
          AND vf.data_pagamento_entrada <= p_end_date
      )                            AS fechamentos
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND o.data_lead_recebido < ((p_end_date + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND c.utm_campaign IS NOT NULL
      AND c.utm_campaign <> ''
    GROUP BY LOWER(TRIM(c.utm_campaign))
  )
  SELECT
    COALESCE(m.camp_key, cr.camp_key)  AS utm_campaign,
    COALESCE(m.investimento, 0)        AS investimento_meta,
    COALESCE(m.impressoes, 0)          AS impressoes,
    COALESCE(m.cliques, 0)             AS cliques,
    COALESCE(m.leads_meta, 0)          AS leads_meta,
    COALESCE(cr.leads_crm, 0)          AS leads_crm,
    COALESCE(cr.mqls_crm, 0)           AS mqls_crm,
    COALESCE(cr.reunioes, 0)           AS reunioes,
    COALESCE(cr.fechamentos, 0)        AS fechamentos,
    CASE
      WHEN COALESCE(m.leads_meta, 0) > 0
        THEN ROUND(m.investimento / m.leads_meta, 2)
      ELSE NULL
    END AS cpl_meta,
    CASE
      WHEN COALESCE(cr.leads_crm, 0) > 0
        THEN ROUND(m.investimento / cr.leads_crm, 2)
      ELSE NULL
    END AS cpl_crm
  FROM meta m
  FULL OUTER JOIN crm cr USING (camp_key)
  ORDER BY COALESCE(m.investimento, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION analisar_meta_crm_cruzado(DATE, DATE) TO authenticated;
