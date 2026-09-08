-- Migration: Adiciona verificacao de membership em RPCs SECURITY DEFINER
-- Objetivo: garantir que usuarios so consigam chamar funcoes de dados
-- de workspaces aos quais pertencem.

-- =============================================================================
-- Helper para levantar erro padrao de acesso negado
-- =============================================================================
CREATE OR REPLACE FUNCTION raise_unless_workspace_member(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Acesso negado ao workspace %', p_workspace_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$$;

-- =============================================================================
-- get_max_creative_number
-- =============================================================================
CREATE OR REPLACE FUNCTION get_max_creative_number(p_workspace_id uuid, p_prefix text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);
  RETURN (
    SELECT COALESCE(MAX(
      (regexp_match(external_id, '^' || p_prefix || '-(\d+)$'))[1]::bigint
    ), 0)
    FROM notion_creatives
    WHERE workspace_id = p_workspace_id
      AND external_id ~ ('^' || p_prefix || '-\d+$')
  );
END;
$$;

-- =============================================================================
-- get_creative_metrics (assinatura curta)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_creative_metrics(
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
    WHERE mai.date BETWEEN p_start_date AND p_end_date
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
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
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

-- =============================================================================
-- get_creative_metrics (assinatura longa com filtros)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_creative_metrics(
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
    WHERE mai.date BETWEEN p_start_date AND p_end_date
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
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
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
