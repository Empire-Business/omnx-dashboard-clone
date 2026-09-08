-- =============================================================================
-- VALIDAÇÃO DE SNAPSHOTS SEMANAIS — Empire Business Dashboard
-- =============================================================================
-- Uso:
--   1. Defina a variável :week_start no início do script (ex: '2026-05-12')
--   2. Execute no SQL Editor do Supabase ou via psql
--   3. Apenas SELECTs — 100% seguro e idempotente
--
-- Regras:
--   - Produtividade: eventos NA SEMANA (data do evento entre week_start e week_end)
--   - Cohort: leads RECEBIDOS na semana + eventos cumulativos (qualquer data)
--   - Pipeline padrão: != 'Sn1Guqcm6zwZNTVOOf5L'
--   - Recuperação: == 'Sn1Guqcm6zwZNTVOOf5L'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CONFIGURAÇÃO: altere apenas esta data
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    '2026-05-12'::DATE AS week_start,
    ('2026-05-12'::DATE + 6) AS week_end
)

-- =============================================================================
-- 1. MÓDULO TRÁFEGO — Produtividade
-- =============================================================================
, snapshot_trafego_prod AS (
  SELECT
    t.leads_count,
    t.mqls_count,
    t.conectados_count,
    t.agendados_count,
    t.reunioes_count,
    t.fechados_count,
    t.no_shows_count,
    t.negociacao_count,
    t.perdidos_count,
    t.faturamento_bruto,
    t.caixa_recebido,
    t.meta_spend,
    t.meta_impressions,
    t.meta_clicks,
    t.meta_leads_actions,
    t.cpmql,
    t.cpv,
    t.roas,
    t.roas_caixa,
    t.ctr,
    t.taxa_conexao_pct,
    t.taxa_agendamento_pct,
    t.taxa_reuniao_pct,
    t.taxa_conversao_pct,
    t.taxa_no_show_pct
  FROM weekly_trafego t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_trafego_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (
      SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
    )), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido,
    COALESCE((SELECT SUM(ma.spend) FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_spend,
    COALESCE((SELECT SUM(ma.impressions)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_impressions,
    COALESCE((SELECT SUM(ma.clicks)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_clicks,
    COALESCE((SELECT SUM(ma.leads)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_leads_actions
)
SELECT
  'trafego' AS module,
  'produtividade' AS report_type,
  (SELECT week_start FROM params) AS week_start,
  'leads_count' AS metric,
  s.leads_count AS snapshot_val,
  r.leads_count AS real_val,
  s.leads_count - r.leads_count AS diff
FROM snapshot_trafego_prod s, real_trafego_prod r
WHERE s.leads_count IS DISTINCT FROM r.leads_count

UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'meta_spend',s.meta_spend,r.meta_spend,s.meta_spend-r.meta_spend FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.meta_spend IS DISTINCT FROM r.meta_spend
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'meta_impressions',s.meta_impressions,r.meta_impressions,s.meta_impressions-r.meta_impressions FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.meta_impressions IS DISTINCT FROM r.meta_impressions
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'meta_clicks',s.meta_clicks,r.meta_clicks,s.meta_clicks-r.meta_clicks FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.meta_clicks IS DISTINCT FROM r.meta_clicks
UNION ALL
SELECT 'trafego','produtividade',(SELECT week_start FROM params),'meta_leads_actions',s.meta_leads_actions,r.meta_leads_actions,s.meta_leads_actions-r.meta_leads_actions FROM snapshot_trafego_prod s, real_trafego_prod r WHERE s.meta_leads_actions IS DISTINCT FROM r.meta_leads_actions;

-- =============================================================================
-- 2. MÓDULO TRÁFEGO — Cohort
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_trafego_coh AS (
  SELECT t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count,
         t.reunioes_count, t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.perdidos_count, t.faturamento_bruto, t.caixa_recebido,
         t.meta_spend, t.meta_impressions, t.meta_clicks, t.meta_leads_actions
  FROM weekly_trafego t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'cohort'
)
, base_trafego_coh AS (
  SELECT
    o.id,
    o.data_conectado,
    o.data_agendamento_reuniao,
    o.data_realizacao_vendas,
    o.data_fechado,
    o.data_no_show,
    o.data_negociacao,
    o.data_perdido
  FROM oportunidades o
  CROSS JOIN params p
  WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end
    AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
)
, real_trafego_coh AS (
  SELECT
    (SELECT COUNT(*) FROM base_trafego_coh) AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_conectado IS NOT NULL) AS conectados_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_agendamento_reuniao IS NOT NULL) AS agendados_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_realizacao_vendas IS NOT NULL) AS reunioes_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_fechado IS NOT NULL) AS fechados_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_no_show IS NOT NULL) AS no_shows_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_negociacao IS NOT NULL) AS negociacao_count,
    (SELECT COUNT(*) FROM base_trafego_coh WHERE data_perdido IS NOT NULL) AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT id FROM base_trafego_coh)), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT id FROM base_trafego_coh)), 0) AS caixa_recebido,
    COALESCE((SELECT SUM(ma.spend) FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_spend,
    COALESCE((SELECT SUM(ma.impressions)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_impressions,
    COALESCE((SELECT SUM(ma.clicks)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_clicks,
    COALESCE((SELECT SUM(ma.leads)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_leads_actions
)
SELECT
  'trafego' AS module,
  'cohort' AS report_type,
  (SELECT week_start FROM params) AS week_start,
  'leads_count' AS metric,
  s.leads_count AS snapshot_val,
  r.leads_count AS real_val,
  s.leads_count - r.leads_count AS diff
FROM snapshot_trafego_coh s, real_trafego_coh r
WHERE s.leads_count IS DISTINCT FROM r.leads_count

UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'meta_spend',s.meta_spend,r.meta_spend,s.meta_spend-r.meta_spend FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.meta_spend IS DISTINCT FROM r.meta_spend
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'meta_impressions',s.meta_impressions,r.meta_impressions,s.meta_impressions-r.meta_impressions FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.meta_impressions IS DISTINCT FROM r.meta_impressions
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'meta_clicks',s.meta_clicks,r.meta_clicks,s.meta_clicks-r.meta_clicks FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.meta_clicks IS DISTINCT FROM r.meta_clicks
UNION ALL
SELECT 'trafego','cohort',(SELECT week_start FROM params),'meta_leads_actions',s.meta_leads_actions,r.meta_leads_actions,s.meta_leads_actions-r.meta_leads_actions FROM snapshot_trafego_coh s, real_trafego_coh r WHERE s.meta_leads_actions IS DISTINCT FROM r.meta_leads_actions;

-- =============================================================================
-- 3. MÓDULO AQUISIÇÃO — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_aquisicao_prod AS (
  SELECT t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count,
         t.reunioes_count, t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.perdidos_count, t.faturamento_bruto, t.caixa_recebido, t.valor_entrada,
         t.meta_spend, t.meta_impressions, t.meta_clicks, t.meta_leads_actions
  FROM weekly_aquisicao t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_aquisicao_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS valor_entrada,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido,
    COALESCE((SELECT SUM(ma.spend) FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_spend,
    COALESCE((SELECT SUM(ma.impressions)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_impressions,
    COALESCE((SELECT SUM(ma.clicks)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_clicks,
    COALESCE((SELECT SUM(ma.leads)::INTEGER FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS meta_leads_actions
)
SELECT 'aquisicao' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'valor_entrada',s.valor_entrada,r.valor_entrada,s.valor_entrada-r.valor_entrada FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.valor_entrada IS DISTINCT FROM r.valor_entrada
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'meta_spend',s.meta_spend,r.meta_spend,s.meta_spend-r.meta_spend FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.meta_spend IS DISTINCT FROM r.meta_spend
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'meta_impressions',s.meta_impressions,r.meta_impressions,s.meta_impressions-r.meta_impressions FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.meta_impressions IS DISTINCT FROM r.meta_impressions
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'meta_clicks',s.meta_clicks,r.meta_clicks,s.meta_clicks-r.meta_clicks FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.meta_clicks IS DISTINCT FROM r.meta_clicks
UNION ALL
SELECT 'aquisicao','produtividade',(SELECT week_start FROM params),'meta_leads_actions',s.meta_leads_actions,r.meta_leads_actions,s.meta_leads_actions-r.meta_leads_actions FROM snapshot_aquisicao_prod s, real_aquisicao_prod r WHERE s.meta_leads_actions IS DISTINCT FROM r.meta_leads_actions;

-- =============================================================================
-- 4. MÓDULO ORGÂNICO — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_organico_prod AS (
  SELECT t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count,
         t.reunioes_count, t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.perdidos_count, t.faturamento_bruto, t.caixa_recebido
  FROM weekly_organico t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_organico_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido
)
SELECT 'organico' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_organico_prod s, real_organico_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_organico_prod s, real_organico_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_organico_prod s, real_organico_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'organico','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_organico_prod s, real_organico_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido;

-- =============================================================================
-- 5. MÓDULO PRÉ-VENDAS — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_prevendas_prod AS (
  SELECT t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count,
         t.reunioes_count, t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.perdidos_count, t.faturamento_bruto, t.caixa_recebido,
         t.ligacoes_count, t.mensagens_count, t.pessoas_contatadas,
         t.leads_sem_resposta, t.avg_response_seconds
  FROM weekly_prevendas t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_prevendas_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido,
    0 AS ligacoes_count,
    0 AS mensagens_count,
    0 AS pessoas_contatadas,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND o.data_conectado IS NULL) AS leads_sem_resposta,
    NULL::INTEGER AS avg_response_seconds
)
SELECT 'prevendas' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'ligacoes_count',s.ligacoes_count,r.ligacoes_count,s.ligacoes_count-r.ligacoes_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.ligacoes_count IS DISTINCT FROM r.ligacoes_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'mensagens_count',s.mensagens_count,r.mensagens_count,s.mensagens_count-r.mensagens_count FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.mensagens_count IS DISTINCT FROM r.mensagens_count
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'pessoas_contatadas',s.pessoas_contatadas,r.pessoas_contatadas,s.pessoas_contatadas-r.pessoas_contatadas FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.pessoas_contatadas IS DISTINCT FROM r.pessoas_contatadas
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'leads_sem_resposta',s.leads_sem_resposta,r.leads_sem_resposta,s.leads_sem_resposta-r.leads_sem_resposta FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.leads_sem_resposta IS DISTINCT FROM r.leads_sem_resposta
UNION ALL
SELECT 'prevendas','produtividade',(SELECT week_start FROM params),'avg_response_seconds',s.avg_response_seconds,r.avg_response_seconds,s.avg_response_seconds-r.avg_response_seconds FROM snapshot_prevendas_prod s, real_prevendas_prod r WHERE s.avg_response_seconds IS DISTINCT FROM r.avg_response_seconds;

-- =============================================================================
-- 6. MÓDULO VENDAS — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_vendas_prod AS (
  SELECT t.leads_count, t.mqls_count, t.agendados_count, t.reunioes_count,
         t.fechados_count, t.no_shows_count, t.negociacao_count, t.perdidos_count,
         t.perdidos_apos_reuniao, t.perdidos_sem_reuniao,
         t.faturamento_bruto, t.caixa_recebido, t.valor_entrada,
         t.ligacoes_count, t.mensagens_count, t.pessoas_contatadas,
         t.avg_response_seconds, t.ciclo_fechamento_dias
  FROM weekly_vendas t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_vendas_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND o.data_realizacao_vendas IS NOT NULL) AS perdidos_apos_reuniao,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND o.data_realizacao_vendas IS NULL) AS perdidos_sem_reuniao,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS valor_entrada,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido,
    0 AS ligacoes_count,
    0 AS mensagens_count,
    0 AS pessoas_contatadas,
    NULL::INTEGER AS avg_response_seconds,
    (SELECT ROUND(AVG(o.data_fechado - o.data_realizacao_vendas)::NUMERIC, 2)
     FROM oportunidades o CROSS JOIN params p
     WHERE o.data_fechado BETWEEN p.week_start AND p.week_end
       AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
       AND o.data_realizacao_vendas IS NOT NULL) AS ciclo_fechamento_dias
)
SELECT 'vendas' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'perdidos_apos_reuniao',s.perdidos_apos_reuniao,r.perdidos_apos_reuniao,s.perdidos_apos_reuniao-r.perdidos_apos_reuniao FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.perdidos_apos_reuniao IS DISTINCT FROM r.perdidos_apos_reuniao
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'perdidos_sem_reuniao',s.perdidos_sem_reuniao,r.perdidos_sem_reuniao,s.perdidos_sem_reuniao-r.perdidos_sem_reuniao FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.perdidos_sem_reuniao IS DISTINCT FROM r.perdidos_sem_reuniao
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'valor_entrada',s.valor_entrada,r.valor_entrada,s.valor_entrada-r.valor_entrada FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.valor_entrada IS DISTINCT FROM r.valor_entrada
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'vendas','produtividade',(SELECT week_start FROM params),'ciclo_fechamento_dias',s.ciclo_fechamento_dias,r.ciclo_fechamento_dias,s.ciclo_fechamento_dias-r.ciclo_fechamento_dias FROM snapshot_vendas_prod s, real_vendas_prod r WHERE s.ciclo_fechamento_dias IS DISTINCT FROM r.ciclo_fechamento_dias;

-- =============================================================================
-- 7. MÓDULO RECUPERAÇÃO — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_recuperacao_prod AS (
  SELECT t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count,
         t.reunioes_count, t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.perdidos_count, t.faturamento_bruto, t.caixa_recebido
  FROM weekly_recuperacao t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_recuperacao_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_perdido BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L') AS perdidos_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido
)
SELECT 'recuperacao' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'perdidos_count',s.perdidos_count,r.perdidos_count,s.perdidos_count-r.perdidos_count FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.perdidos_count IS DISTINCT FROM r.perdidos_count
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'recuperacao','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_recuperacao_prod s, real_recuperacao_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido;

-- =============================================================================
-- 8. MÓDULO SDR — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_sdr_prod AS (
  SELECT t.leads_count, t.conectados_count, t.agendados_count, t.agendados_no_prazo,
         t.reunioes_count, t.fechados_count, t.faturamento_bruto, t.caixa_recebido
  FROM weekly_sdr t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_sdr_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_conectado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS conectados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND o.data_conectado IS NOT NULL AND (o.data_agendamento_reuniao - o.data_conectado) <= 1) AS agendados_no_prazo,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS caixa_recebido
)
SELECT 'sdr' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'conectados_count',s.conectados_count,r.conectados_count,s.conectados_count-r.conectados_count FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.conectados_count IS DISTINCT FROM r.conectados_count
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'agendados_no_prazo',s.agendados_no_prazo,r.agendados_no_prazo,s.agendados_no_prazo-r.agendados_no_prazo FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.agendados_no_prazo IS DISTINCT FROM r.agendados_no_prazo
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'sdr','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_sdr_prod s, real_sdr_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido;

-- =============================================================================
-- 9. MÓDULO CLOSER — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_closer_prod AS (
  SELECT t.leads_count, t.mqls_count, t.agendados_count, t.reunioes_count,
         t.fechados_count, t.no_shows_count, t.negociacao_count,
         t.faturamento_bruto, t.caixa_recebido, t.ciclo_fechamento_dias
  FROM weekly_closer t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_closer_prod AS (
  SELECT
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS leads_count,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS mqls_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_agendamento_reuniao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS agendados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_realizacao_vendas BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS reunioes_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS fechados_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_no_show BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS no_shows_count,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_negociacao BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS negociacao_count,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS faturamento_bruto,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS caixa_recebido,
    (SELECT ROUND(AVG(o.data_fechado - o.data_realizacao_vendas)::NUMERIC, 2)
     FROM oportunidades o CROSS JOIN params p
     WHERE o.data_fechado BETWEEN p.week_start AND p.week_end
       AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
       AND o.data_realizacao_vendas IS NOT NULL) AS ciclo_fechamento_dias
)
SELECT 'closer' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'leads_count' AS metric, s.leads_count, r.leads_count, s.leads_count - r.leads_count
FROM snapshot_closer_prod s, real_closer_prod r WHERE s.leads_count IS DISTINCT FROM r.leads_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'mqls_count',s.mqls_count,r.mqls_count,s.mqls_count-r.mqls_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.mqls_count IS DISTINCT FROM r.mqls_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'agendados_count',s.agendados_count,r.agendados_count,s.agendados_count-r.agendados_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.agendados_count IS DISTINCT FROM r.agendados_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'reunioes_count',s.reunioes_count,r.reunioes_count,s.reunioes_count-r.reunioes_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.reunioes_count IS DISTINCT FROM r.reunioes_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'fechados_count',s.fechados_count,r.fechados_count,s.fechados_count-r.fechados_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.fechados_count IS DISTINCT FROM r.fechados_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'no_shows_count',s.no_shows_count,r.no_shows_count,s.no_shows_count-r.no_shows_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.no_shows_count IS DISTINCT FROM r.no_shows_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'negociacao_count',s.negociacao_count,r.negociacao_count,s.negociacao_count-r.negociacao_count FROM snapshot_closer_prod s, real_closer_prod r WHERE s.negociacao_count IS DISTINCT FROM r.negociacao_count
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'faturamento_bruto',s.faturamento_bruto,r.faturamento_bruto,s.faturamento_bruto-r.faturamento_bruto FROM snapshot_closer_prod s, real_closer_prod r WHERE s.faturamento_bruto IS DISTINCT FROM r.faturamento_bruto
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'caixa_recebido',s.caixa_recebido,r.caixa_recebido,s.caixa_recebido-r.caixa_recebido FROM snapshot_closer_prod s, real_closer_prod r WHERE s.caixa_recebido IS DISTINCT FROM r.caixa_recebido
UNION ALL
SELECT 'closer','produtividade',(SELECT week_start FROM params),'ciclo_fechamento_dias',s.ciclo_fechamento_dias,r.ciclo_fechamento_dias,s.ciclo_fechamento_dias-r.ciclo_fechamento_dias FROM snapshot_closer_prod s, real_closer_prod r WHERE s.ciclo_fechamento_dias IS DISTINCT FROM r.ciclo_fechamento_dias;

-- =============================================================================
-- 10. MÓDULO METAS — Produtividade
-- =============================================================================
WITH params AS (
  SELECT '2026-05-12'::DATE AS week_start,
         ('2026-05-12'::DATE + 6) AS week_end
)
, snapshot_metas_prod AS (
  SELECT t.meta_mql_target, t.meta_cpmql_target, t.meta_spend_target, t.meta_vendas_target,
         t.realizado_mql, t.realizado_spend, t.realizado_vendas,
         t.realizado_faturamento, t.realizado_caixa, t.realizado_cpmql
  FROM weekly_metas t
  JOIN weekly_snapshots s ON t.snapshot_id = s.id
  CROSS JOIN params p
  WHERE s.week_start = p.week_start AND s.report_type = 'produtividade'
)
, real_metas_prod AS (
  SELECT
    (SELECT valor FROM metas m CROSS JOIN params p WHERE m.tipo = 'mql_count_trafego' AND m.referencia = 'global' AND m.periodo_inicio <= p.week_end AND m.periodo_fim >= p.week_start LIMIT 1)::NUMERIC AS meta_mql_target,
    (SELECT valor FROM metas m CROSS JOIN params p WHERE m.tipo = 'custo_mql_trafego' AND m.referencia = 'global' AND m.periodo_inicio <= p.week_end AND m.periodo_fim >= p.week_start LIMIT 1)::NUMERIC AS meta_cpmql_target,
    NULL::NUMERIC AS meta_spend_target,
    (SELECT valor FROM metas m CROSS JOIN params p WHERE m.tipo = 'agendamentos_sdr' AND m.referencia = 'global' AND m.periodo_inicio <= p.week_end AND m.periodo_fim >= p.week_start LIMIT 1)::NUMERIC AS meta_vendas_target,
    (SELECT COUNT(*) FROM oportunidades o JOIN contatos c ON c.id = o.contato_id CROSS JOIN params p WHERE o.data_lead_recebido BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND c.tags ILIKE '%MQL%') AS realizado_mql,
    COALESCE((SELECT SUM(ma.spend) FROM meta_ads_insights ma CROSS JOIN params p WHERE ma.date BETWEEN p.week_start AND p.week_end), 0) AS realizado_spend,
    (SELECT COUNT(*) FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS realizado_vendas,
    COALESCE((SELECT SUM(vf.valor_faturado) FROM vendas_fechamento vf WHERE vf.oportunidade_id IN (SELECT o.id FROM oportunidades o CROSS JOIN params p WHERE o.data_fechado BETWEEN p.week_start AND p.week_end AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L')), 0) AS realizado_faturamento,
    COALESCE((SELECT SUM(vf.valor_entrada) FROM vendas_fechamento vf CROSS JOIN params p WHERE vf.data_pagamento_entrada BETWEEN p.week_start AND p.week_end), 0) AS realizado_caixa,
    NULL::NUMERIC AS realizado_cpmql
)
SELECT 'metas' AS module, 'produtividade' AS report_type, (SELECT week_start FROM params) AS week_start,
       'realizado_mql' AS metric, s.realizado_mql, r.realizado_mql, s.realizado_mql - r.realizado_mql
FROM snapshot_metas_prod s, real_metas_prod r WHERE s.realizado_mql IS DISTINCT FROM r.realizado_mql
UNION ALL
SELECT 'metas','produtividade',(SELECT week_start FROM params),'realizado_spend',s.realizado_spend,r.realizado_spend,s.realizado_spend-r.realizado_spend FROM snapshot_metas_prod s, real_metas_prod r WHERE s.realizado_spend IS DISTINCT FROM r.realizado_spend
UNION ALL
SELECT 'metas','produtividade',(SELECT week_start FROM params),'realizado_vendas',s.realizado_vendas,r.realizado_vendas,s.realizado_vendas-r.realizado_vendas FROM snapshot_metas_prod s, real_metas_prod r WHERE s.realizado_vendas IS DISTINCT FROM r.realizado_vendas
UNION ALL
SELECT 'metas','produtividade',(SELECT week_start FROM params),'realizado_faturamento',s.realizado_faturamento,r.realizado_faturamento,s.realizado_faturamento-r.realizado_faturamento FROM snapshot_metas_prod s, real_metas_prod r WHERE s.realizado_faturamento IS DISTINCT FROM r.realizado_faturamento
UNION ALL
SELECT 'metas','produtividade',(SELECT week_start FROM params),'realizado_caixa',s.realizado_caixa,r.realizado_caixa,s.realizado_caixa-r.realizado_caixa FROM snapshot_metas_prod s, real_metas_prod r WHERE s.realizado_caixa IS DISTINCT FROM r.realizado_caixa;

-- =============================================================================
-- RESUMO RÁPIDO: quantos divergências por módulo/tipo na semana configurada
-- =============================================================================
-- Descomente a query abaixo para um overview consolidado:
--
-- WITH all_checks AS (
--   -- Copie aqui os SELECTs acima (ou use a view v_weekly_dashboard)
-- )
-- SELECT module, report_type, COUNT(*) AS divergencias
-- FROM all_checks
-- GROUP BY module, report_type
-- ORDER BY divergencias DESC;
