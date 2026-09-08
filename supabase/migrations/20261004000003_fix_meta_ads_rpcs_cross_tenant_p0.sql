-- =============================================================================
-- FIX P0: RPCs de análise Meta Ads/CRM sem isolamento por workspace
--
-- Achado (validação adversarial Meta Ads multi-tenant, docs/VALIDACAO-META-MULTITENANT.md):
--   1. analisar_meta_crm_cruzado(date, date) — SECURITY DEFINER, sem filtro de
--      workspace, EXECUTE concedido a anon E authenticated (confirmado em
--      produção via pg_proc.proacl). Qualquer request HTTP com a anon key,
--      SEM LOGIN, agrega meta_ads_insights + oportunidades + vendas_fechamento
--      de TODOS os workspaces. Chamada pelo frontend em
--      eb-dash2/src/hooks/useMetaCrmCruzado.ts (TrafegoTab).
--   2. analisar_meta_ads_por_regiao(date, date) — SECURITY INVOKER, sem filtro
--      de workspace. Sozinha (chamada via PostgREST por authenticated/anon) a
--      RLS de meta_ads_insights/vendas_fechamento protegeria, mas é chamada
--      pela Clara (bot-chat-data/index.ts -> executors.ts:query_meta_ads_region)
--      via cliente com SERVICE_ROLE_KEY, que tem BYPASSRLS — o wrapper
--      createWorkspaceScopedClient (workspace-query-guard.ts) só intercepta
--      `.from(table).select(...)`, NUNCA `.rpc(...)`. Logo, qualquer usuário
--      que converse com a Clara em QUALQUER workspace recebe dados agregados
--      de investimento/vendas por região de TODOS os workspaces.
--   3. analisar_meta_ads(date, date, ...) — mesmo padrão do item 2 (SECURITY
--      INVOKER, sem filtro), atualmente sem caller ativo localizado (grep em
--      supabase/functions), mas mesma classe de risco latente — corrigido por
--      simetria e para não reabrir o gap se alguém a conectar no futuro.
--
-- Hoje (2026, verificado ao vivo) só o workspace Default tem dados reais em
-- meta_ads_insights/oportunidades; o 2º workspace (Burn-in Interno) está
-- vazio — logo o vazamento é real no MECANISMO mas ainda sem dado de um 2º
-- tenant pago para vazar. Precisa fechar ANTES do gate do 2º tenant.
--
-- Correção:
--   - Acrescenta p_workspace_id (obrigatório) às 3 funções.
--   - Fail-closed: sem is_workspace_member(p_workspace_id), retorna vazio
--     (mesmo padrão de get_meta_ads_campaign_metrics, migration 20260908000000).
--   - Filtra meta_ads_insights / meta_ads_insights_breakdowns / oportunidades /
--     vendas_fechamento pelo workspace_id informado.
--   - Revoga EXECUTE de anon e PUBLIC explicitamente (não só PUBLIC — mesma
--     causa raiz documentada em 20260816000000_fix_reassert_grants...).
--
-- NÃO aplicada em produção por esta sessão — requer autorização do dono
-- (regra do projeto: correções de RLS/RPC sensíveis não vão direto).
-- Testar via: node scripts/query-prod-readonly.mjs depois de aplicar, re-
-- confirmando has_function_privilege('anon', ...) = false e resultado vazio
-- para workspace_id de outro tenant.
-- =============================================================================
SET search_path = public, pg_catalog;

-- -----------------------------------------------------------------------
-- 1. analisar_meta_crm_cruzado — agora exige workspace_id, fail-closed
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS analisar_meta_crm_cruzado(DATE, DATE);

CREATE OR REPLACE FUNCTION analisar_meta_crm_cruzado(
  p_workspace_id UUID,
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
SET search_path = public
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
      AND workspace_id = p_workspace_id
      AND public.is_workspace_member(p_workspace_id)
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
      AND o.workspace_id = p_workspace_id
      AND public.is_workspace_member(p_workspace_id)
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

REVOKE ALL ON FUNCTION analisar_meta_crm_cruzado(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION analisar_meta_crm_cruzado(UUID, DATE, DATE) TO authenticated, service_role;

-- -----------------------------------------------------------------------
-- 2. analisar_meta_ads_por_regiao — idem
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS analisar_meta_ads_por_regiao(DATE, DATE);

CREATE OR REPLACE FUNCTION analisar_meta_ads_por_regiao(
    p_workspace_id UUID,
    p_start_date DATE,
    p_end_date   DATE
)
RETURNS TABLE (
    regiao          TEXT,
    investimento    NUMERIC,
    vendas          BIGINT,
    faturamento     NUMERIC,
    entrada         NUMERIC,
    cpv             NUMERIC,
    roas            NUMERIC,
    roas_caixa      NUMERIC,
    pct_vendas      NUMERIC,
    pct_faturamento NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total_vendas      BIGINT;
    v_total_faturamento NUMERIC;
BEGIN
    IF NOT public.is_workspace_member(p_workspace_id) THEN
        RETURN;
    END IF;

    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
          AND i.workspace_id = p_workspace_id
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.workspace_id = p_workspace_id
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)        AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        COALESCE(SUM(c.vendas), 0)::BIGINT,
        COALESCE(SUM(c.faturamento), 0)
    INTO v_total_vendas, v_total_faturamento
    FROM cruzado c;

    RETURN QUERY
    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
          AND i.workspace_id = p_workspace_id
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.workspace_id = p_workspace_id
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)::BIGINT AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        c.regiao,
        ROUND(c.investimento::NUMERIC, 2),
        c.vendas,
        ROUND(c.faturamento::NUMERIC, 2),
        ROUND(c.entrada::NUMERIC, 2),
        CASE WHEN c.vendas > 0 THEN ROUND((c.investimento / c.vendas)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.faturamento / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.entrada / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN v_total_vendas > 0 THEN ROUND((c.vendas::NUMERIC / v_total_vendas * 100), 2) ELSE 0 END,
        CASE WHEN v_total_faturamento > 0 THEN ROUND((c.faturamento / v_total_faturamento * 100), 2) ELSE 0 END
    FROM cruzado c
    ORDER BY c.investimento DESC;
END;
$$;

COMMENT ON FUNCTION analisar_meta_ads_por_regiao(UUID, DATE, DATE) IS
'Retorna investimento Meta Ads e vendas do CRM por região brasileira, isolado por workspace_id (fail-closed via is_workspace_member). Visão COHORT.';

REVOKE ALL ON FUNCTION analisar_meta_ads_por_regiao(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION analisar_meta_ads_por_regiao(UUID, DATE, DATE) TO authenticated, service_role;

-- -----------------------------------------------------------------------
-- 3. analisar_meta_ads — idem (sem caller ativo hoje; corrigido por simetria)
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS analisar_meta_ads(DATE, DATE, TEXT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION analisar_meta_ads(
  p_workspace_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'campaign',
  p_campaign_name TEXT DEFAULT NULL,
  p_adset_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  group_key TEXT,
  spend NUMERIC,
  impressions BIGINT,
  clicks BIGINT,
  leads BIGINT,
  landing_page_views BIGINT,
  ctr NUMERIC,
  cpm NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      CASE
        WHEN p_group_by = 'campaign' THEN COALESCE(campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(adset_name, 'Sem conjunto')
        WHEN p_group_by = 'ad' THEN COALESCE(ad_name, 'Sem anúncio')
        WHEN p_group_by = 'day' THEN COALESCE(date::TEXT, 'Sem data')
        ELSE 'Total'
      END AS gkey,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(leads) AS leads,
      SUM(landing_page_views) AS lp_views
    FROM meta_ads_insights
    WHERE date >= p_start_date
      AND date <= p_end_date
      AND workspace_id = p_workspace_id
      AND (p_campaign_name IS NULL OR campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (p_adset_name IS NULL OR adset_name ILIKE '%' || p_adset_name || '%')
    GROUP BY gkey
  )
  SELECT
    a.gkey AS group_key,
    COALESCE(a.spend, 0) AS spend,
    COALESCE(a.impressions, 0)::BIGINT AS impressions,
    COALESCE(a.clicks, 0)::BIGINT AS clicks,
    COALESCE(a.leads, 0)::BIGINT AS leads,
    COALESCE(a.lp_views, 0)::BIGINT AS landing_page_views,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.clicks::NUMERIC / a.impressions) * 100, 2) ELSE 0 END AS ctr,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.spend / a.impressions) * 1000, 2) ELSE 0 END AS cpm
  FROM agg a
  ORDER BY a.spend DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION analisar_meta_ads(UUID, DATE, DATE, TEXT, TEXT, TEXT, INTEGER) IS
'Retorna insights da Meta Ads agregados por campanha/conjunto/anúncio/dia, isolado por workspace_id (fail-closed via is_workspace_member).';

REVOKE ALL ON FUNCTION analisar_meta_ads(UUID, DATE, DATE, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION analisar_meta_ads(UUID, DATE, DATE, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
