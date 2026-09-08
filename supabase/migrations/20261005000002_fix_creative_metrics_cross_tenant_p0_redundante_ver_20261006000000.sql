-- =============================================================================
-- FIX P0: get_creative_metrics / v_creative_metrics sem isolamento por workspace
--
-- Achado (auditoria do sub-app Criativos, docs/AUDITORIA-CRIATIVOS.md, 2026-07-19):
--   As duas assinaturas de get_creative_metrics (4 args e 10 args, SECURITY
--   DEFINER) chamam raise_unless_workspace_member(p_workspace_id) — isso só
--   valida que o CALLER pertence ao workspace informado. As CTEs internas
--   (meta_agg sobre meta_ads_insights; crm_agg sobre oportunidades/contatos/
--   vendas_fechamento) agrupam SOMENTE por número extraído de "CR-xxx"/"AN-xxx"
--   via regex, SEM NENHUM FILTRO DE workspace_id. O filtro de workspace só
--   aparece no LEFT JOIN final com notion_creatives — ou seja, o gasto,
--   leads, MQLs, vendas e faturamento somados já vêm contaminados de TODOS
--   os workspaces antes desse join, e só são "carimbados" com o workspace de
--   quem chamou depois de já estarem errados.
--
--   Como generate-creative-code (get_max_creative_number) numera
--   sequencialmente POR WORKSPACE, todo workspace novo recomeça em "CR-1"/
--   "AN-1" — colisão de código entre tenants é PROVÁVEL, não hipotética.
--
--   v_creative_metrics (view legada, sem caller ativo localizado em
--   eb-dash2/src nem supabase/functions — código morto) tem o MESMO bug
--   estrutural nas CTEs, e além disso está com SELECT concedido a `anon`
--   (sem login) e é `owner=postgres` (BYPASSRLS), então contorna a RLS de
--   todas as tabelas-base quando consultada via PostgREST.
--
--   Hoje (2026-07-19, verificado ao vivo) só o workspace "Default"
--   (7909d02a-4d15-46ea-a7b8-5debeb6e8351) tem dados pagos reais
--   (1.102 criativos, 9.593 linhas de meta_ads_insights); o 2º workspace
--   ("Burn-in Interno", 15cacbe4-...) está vazio — o vazamento é real no
--   MECANISMO mas ainda sem 2º tenant pago com dado para vazar. Mesma classe
--   de bug já corrigida em analisar_meta_* (20261004000003), que não cobriu
--   este RPC. Precisa fechar ANTES do gate do 2º tenant para o app Criativos.
--
-- Correção:
--   - Filtra meta_agg por mai.workspace_id = p_workspace_id.
--   - Filtra crm_agg por c.workspace_id = p_workspace_id (contatos já tem a
--     coluna; oportunidades/vendas_fechamento também, mas contatos é
--     suficiente pois o JOIN já parte de contatos via o.contato_id = c.id).
--   - Revoga EXECUTE de anon nas duas assinaturas (mesmo padrão do fix
--     20261004000003) — mantém authenticated, pois a função já é fail-closed
--     via raise_unless_workspace_member para usuário fora do workspace.
--   - Revoga SELECT de anon/authenticated em v_creative_metrics (código morto,
--     sem caller ativo, sem motivo para ficar exposta bypassando RLS).
--
-- NÃO aplicada em produção por esta sessão — requer autorização do dono
-- (regra do projeto: correções de RLS/RPC sensíveis não vão direto).
-- Teste de regressão: __tests__/integration/creative-metrics-workspace-isolation.test.ts
-- =============================================================================
SET search_path = public, pg_catalog;

-- -----------------------------------------------------------------------
-- 1. get_creative_metrics (4 args) — filtra meta_agg e crm_agg por workspace
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.workspace_id = p_workspace_id
      AND mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

-- -----------------------------------------------------------------------
-- 2. get_creative_metrics (10 args, versão chamada pelo frontend) — idem
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid,
  p_campaign_names text[] DEFAULT NULL::text[],
  p_adset_names text[] DEFAULT NULL::text[],
  p_ad_names text[] DEFAULT NULL::text[],
  p_channels text[] DEFAULT NULL::text[],
  p_funil_tags text[] DEFAULT NULL::text[],
  p_cp_tags text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign_codes text[];
  v_funil_codes text[];
  v_cp_codes text[];
  v_channel_public_codes text[];
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);

  IF p_campaign_names IS NOT NULL AND array_length(p_campaign_names, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_campaign_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_campaign_names);
  END IF;

  IF p_funil_tags IS NOT NULL AND array_length(p_funil_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_funil_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(uc.funnels) AS f WHERE f = ANY(p_funil_tags)
      );
  END IF;

  IF p_cp_tags IS NOT NULL AND array_length(p_cp_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_cp_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_cp_tags);
  END IF;

  IF p_channels IS NOT NULL AND array_length(p_channels, 1) > 0 THEN
    SELECT array_agg(DISTINCT us.public_code)
    INTO v_channel_public_codes
    FROM utm_sources us
    WHERE us.workspace_id = p_workspace_id
      AND us.utm_source = ANY(p_channels)
      AND us.public_code IS NOT NULL;
  END IF;

  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.workspace_id = p_workspace_id
      AND mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
      AND (p_campaign_names IS NULL OR array_length(p_campaign_names, 1) IS NULL OR mai.campaign_name = ANY(p_campaign_names))
      AND (p_adset_names IS NULL OR array_length(p_adset_names, 1) IS NULL OR mai.adset_name = ANY(p_adset_names))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR mai.ad_name = ANY(p_ad_names)
        OR ((regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] || '-' || (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2]) = ANY(p_ad_names)
      )
      AND (
        v_channel_public_codes IS NULL OR array_length(v_channel_public_codes, 1) IS NULL
        OR mai.ad_name ~ ANY(v_channel_public_codes)
      )
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
      AND (p_channels IS NULL OR array_length(p_channels, 1) IS NULL OR c.utm_source = ANY(p_channels))
      AND (v_campaign_codes IS NULL OR array_length(v_campaign_codes, 1) IS NULL OR c.utm_campaign = ANY(v_campaign_codes))
      AND (v_funil_codes IS NULL OR array_length(v_funil_codes, 1) IS NULL OR c.utm_campaign = ANY(v_funil_codes))
      AND (v_cp_codes IS NULL OR array_length(v_cp_codes, 1) IS NULL OR c.utm_campaign = ANY(v_cp_codes))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR c.utm_term = ANY(p_ad_names)
      )
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

-- -----------------------------------------------------------------------
-- 3. Endurecimento de grants — mesmo padrão do fix 20261004000003
-- -----------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[]) TO authenticated;

-- v_creative_metrics: código morto (sem caller em eb-dash2/src nem
-- supabase/functions), mesmo bug estrutural (sem filtro de workspace nas
-- CTEs) e ainda por cima com SELECT liberado para anon, bypassando RLS por
-- ser owned by postgres (BYPASSRLS). Revoga acesso; view fica só para
-- inspeção manual via service_role/postgres.
REVOKE SELECT ON public.v_creative_metrics FROM anon, authenticated, PUBLIC;
