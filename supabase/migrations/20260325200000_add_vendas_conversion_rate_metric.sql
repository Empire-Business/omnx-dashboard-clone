-- Migration: adicionar métrica "Taxa de Conversão de Reuniões" para vendas
-- Suporta escopo global (workspace) e por closer (user)
-- tipo legado: taxa_conversao_vendas — já usado em GeralTab via getActiveMeta

INSERT INTO public.goal_metric_definitions (
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
  legacy_tipo,
  supported_scope_types,
  metadata
) VALUES (
  'vendas',
  'conversion_rate',
  'Taxa de Conversão de Reuniões',
  '% de reuniões de vendas realizadas que resultaram em fechamento (pagamento confirmado) no período.',
  'produtividade',
  'ratio',
  'percent',
  'maximize',
  'data_realizacao_vendas',
  'customizado',
  'snapshot',
  'vendas.conversion_rate',
  'taxa_conversao_vendas',
  ARRAY['workspace', 'user']::TEXT[],
  '{"scope_source":"closer_users"}'::JSONB
)
ON CONFLICT (area_key, metric_key) DO UPDATE
SET
  metric_name      = EXCLUDED.metric_name,
  description      = EXCLUDED.description,
  legacy_tipo      = EXCLUDED.legacy_tipo,
  supported_scope_types = EXCLUDED.supported_scope_types,
  metadata         = EXCLUDED.metadata,
  provider_key     = EXCLUDED.provider_key,
  tracking_mode    = EXCLUDED.tracking_mode,
  is_active        = true,
  updated_at       = now();
