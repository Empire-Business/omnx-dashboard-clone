-- Migration: adicionar métrica organico.mql_count ao catálogo de metas
-- Permite cadastrar metas de MQLs por canal orgânico (Instagram, YouTube, etc.)
-- A meta global = soma das metas individuais por canal (calculada no frontend)

INSERT INTO goal_metric_definitions (
  area_key,
  metric_key,
  metric_name,
  description,
  analysis_mode,
  aggregation_type,
  unit,
  target_direction,
  date_basis,
  default_period_granularity,
  tracking_mode,
  provider_key,
  supported_scope_types,
  metadata,
  is_active
) VALUES (
  'organico',
  'mql_count',
  'MQLs Orgânicos',
  'Quantidade de leads qualificados (MQL) gerados por canais orgânicos (Instagram, YouTube, Indicação, etc.)',
  'cohort',
  'count',
  'mql',
  'maximize',
  'data_lead_recebido',
  'customizado',
  'cumulative',
  'organico.mql_count',
  ARRAY['workspace', 'channel']::text[],
  '{"scope_source": "organico"}'::jsonb,
  true
) ON CONFLICT (area_key, metric_key) DO NOTHING;
