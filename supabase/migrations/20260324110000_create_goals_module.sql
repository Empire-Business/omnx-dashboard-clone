-- Migration: módulo de metas unificado, histórico e extensível
-- Cria catálogo de indicadores, metas versionadas e snapshots de acompanhamento.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.goal_metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  description TEXT,
  analysis_mode TEXT NOT NULL CHECK (analysis_mode IN ('cohort', 'produtividade')),
  aggregation_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  target_direction TEXT NOT NULL CHECK (target_direction IN ('maximize', 'minimize')),
  date_basis TEXT NOT NULL,
  default_period_granularity TEXT NOT NULL DEFAULT 'customizado',
  tracking_mode TEXT NOT NULL CHECK (tracking_mode IN ('cumulative', 'snapshot', 'budget_capped')),
  provider_key TEXT NOT NULL,
  legacy_tipo TEXT,
  supported_scope_types TEXT[] NOT NULL DEFAULT ARRAY['workspace']::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goal_metric_definitions_area_metric_key UNIQUE (area_key, metric_key)
);

ALTER TABLE public.goal_metric_definitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goal_metric_definitions'
      AND policyname = 'goal_metric_definitions_read_authenticated'
  ) THEN
    CREATE POLICY goal_metric_definitions_read_authenticated
      ON public.goal_metric_definitions
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.goal_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_definition_id UUID NOT NULL REFERENCES public.goal_metric_definitions(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'area', 'team', 'user', 'channel', 'campaign', 'custom_entity')),
  scope_id TEXT NOT NULL,
  scope_label TEXT NOT NULL,
  owner_user_id UUID,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT goal_definitions_scope_not_blank_chk CHECK (btrim(scope_id) <> ''),
  CONSTRAINT goal_definitions_workspace_metric_scope_key UNIQUE (workspace_id, metric_definition_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS goal_definitions_workspace_idx
  ON public.goal_definitions (workspace_id, metric_definition_id);

ALTER TABLE public.goal_definitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goal_definitions'
      AND policyname = 'goal_definitions_workspace_access'
  ) THEN
    CREATE POLICY goal_definitions_workspace_access
      ON public.goal_definitions
      FOR ALL
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM public.workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
      WITH CHECK (
        workspace_id IN (
          SELECT workspace_id
          FROM public.workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.goal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_definition_id UUID NOT NULL REFERENCES public.goal_definitions(id) ON DELETE CASCADE,
  target_value NUMERIC(14, 2) NOT NULL CHECK (target_value > 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'customizado',
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT goal_versions_period_valid_chk CHECK (period_start <= period_end),
  CONSTRAINT goal_versions_goal_period_key UNIQUE (goal_definition_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS goal_versions_goal_definition_idx
  ON public.goal_versions (goal_definition_id, period_start, period_end);

ALTER TABLE public.goal_versions
  ADD CONSTRAINT goal_versions_no_overlap
  EXCLUDE USING gist (
    goal_definition_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  );

ALTER TABLE public.goal_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goal_versions'
      AND policyname = 'goal_versions_workspace_access'
  ) THEN
    CREATE POLICY goal_versions_workspace_access
      ON public.goal_versions
      FOR ALL
      USING (
        goal_definition_id IN (
          SELECT gd.id
          FROM public.goal_definitions gd
          INNER JOIN public.workspace_members wm
            ON wm.workspace_id = gd.workspace_id
          WHERE wm.user_id = auth.uid()
            AND wm.is_active = true
        )
      )
      WITH CHECK (
        goal_definition_id IN (
          SELECT gd.id
          FROM public.goal_definitions gd
          INNER JOIN public.workspace_members wm
            ON wm.workspace_id = gd.workspace_id
          WHERE wm.user_id = auth.uid()
            AND wm.is_active = true
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.goal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_version_id UUID NOT NULL REFERENCES public.goal_versions(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  actual_value NUMERIC(14, 2),
  ideal_value NUMERIC(14, 2),
  projected_value NUMERIC(14, 2),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'on_track', 'at_risk', 'off_track', 'completed', 'no_data')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goal_snapshots_goal_date_key UNIQUE (goal_version_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS goal_snapshots_goal_version_idx
  ON public.goal_snapshots (goal_version_id, snapshot_date DESC);

ALTER TABLE public.goal_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goal_snapshots'
      AND policyname = 'goal_snapshots_workspace_access'
  ) THEN
    CREATE POLICY goal_snapshots_workspace_access
      ON public.goal_snapshots
      FOR ALL
      USING (
        goal_version_id IN (
          SELECT gv.id
          FROM public.goal_versions gv
          INNER JOIN public.goal_definitions gd
            ON gd.id = gv.goal_definition_id
          INNER JOIN public.workspace_members wm
            ON wm.workspace_id = gd.workspace_id
          WHERE wm.user_id = auth.uid()
            AND wm.is_active = true
        )
      )
      WITH CHECK (
        goal_version_id IN (
          SELECT gv.id
          FROM public.goal_versions gv
          INNER JOIN public.goal_definitions gd
            ON gd.id = gv.goal_definition_id
          INNER JOIN public.workspace_members wm
            ON wm.workspace_id = gd.workspace_id
          WHERE wm.user_id = auth.uid()
            AND wm.is_active = true
        )
      );
  END IF;
END $$;

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
) VALUES
  (
    'trafego',
    'mql_count',
    'MQLs gerados',
    'Volume de MQLs atribuídos ao tráfego pago dentro da vigência da meta.',
    'cohort',
    'count',
    'mql',
    'maximize',
    'data_lead_recebido',
    'customizado',
    'cumulative',
    'trafego.mql_count',
    'mql_count_trafego',
    ARRAY['workspace', 'channel', 'campaign']::TEXT[],
    '{"scope_source":"trafego"}'::JSONB
  ),
  (
    'trafego',
    'cost_per_mql',
    'Custo por MQL',
    'Custo médio por MQL do tráfego pago. Quando existir meta pareada de MQLs, deriva o teto de gasto do período.',
    'cohort',
    'currency',
    'BRL',
    'minimize',
    'data_lead_recebido',
    'customizado',
    'budget_capped',
    'trafego.cost_per_mql',
    'custo_mql_trafego',
    ARRAY['workspace', 'channel', 'campaign']::TEXT[],
    '{"scope_source":"trafego","paired_metric_key":"mql_count"}'::JSONB
  ),
  (
    'prevendas',
    'agendamentos',
    'Agendamentos',
    'Total de agendamentos produzidos no período por time ou SDR.',
    'produtividade',
    'count',
    'agendamentos',
    'maximize',
    'data_agendamento_reuniao',
    'customizado',
    'cumulative',
    'prevendas.agendamentos',
    'agendamentos_sdr',
    ARRAY['workspace', 'user']::TEXT[],
    '{"scope_source":"sdr_users"}'::JSONB
  ),
  (
    'prevendas',
    'response_time',
    'Tempo médio de resposta',
    'Tempo médio de primeira resposta do time de SDRs no período.',
    'produtividade',
    'average',
    'minutes',
    'minimize',
    'data_comunicacao',
    'customizado',
    'snapshot',
    'prevendas.response_time',
    NULL,
    ARRAY['workspace', 'user']::TEXT[],
    '{"scope_source":"sdr_users"}'::JSONB
  ),
  (
    'vendas',
    'closed_count',
    'Fechamentos',
    'Quantidade de oportunidades fechadas no período.',
    'produtividade',
    'count',
    'fechamentos',
    'maximize',
    'data_fechado',
    'customizado',
    'cumulative',
    'vendas.closed_count',
    NULL,
    ARRAY['workspace', 'user']::TEXT[],
    '{"scope_source":"closer_users"}'::JSONB
  ),
  (
    'vendas',
    'closed_revenue',
    'Faturamento fechado',
    'Soma de valor faturado das oportunidades fechadas no período.',
    'produtividade',
    'currency',
    'BRL',
    'maximize',
    'data_fechado',
    'customizado',
    'cumulative',
    'vendas.closed_revenue',
    NULL,
    ARRAY['workspace', 'user']::TEXT[],
    '{"scope_source":"closer_users"}'::JSONB
  )
ON CONFLICT (area_key, metric_key) DO UPDATE
SET
  metric_name = EXCLUDED.metric_name,
  description = EXCLUDED.description,
  analysis_mode = EXCLUDED.analysis_mode,
  aggregation_type = EXCLUDED.aggregation_type,
  unit = EXCLUDED.unit,
  target_direction = EXCLUDED.target_direction,
  date_basis = EXCLUDED.date_basis,
  default_period_granularity = EXCLUDED.default_period_granularity,
  tracking_mode = EXCLUDED.tracking_mode,
  provider_key = EXCLUDED.provider_key,
  legacy_tipo = EXCLUDED.legacy_tipo,
  supported_scope_types = EXCLUDED.supported_scope_types,
  metadata = EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

WITH legacy_rows AS (
  SELECT
    m.id AS legacy_meta_id,
    m.workspace_id,
    gmd.id AS metric_definition_id,
    CASE
      WHEN gmd.legacy_tipo = 'agendamentos_sdr'
        AND lower(btrim(COALESCE(m.referencia, 'global'))) <> 'global'
      THEN 'user'
      ELSE 'workspace'
    END AS scope_type,
    CASE
      WHEN lower(btrim(COALESCE(m.referencia, 'global'))) = 'global'
      THEN 'global'
      ELSE btrim(COALESCE(m.referencia, 'global'))
    END AS scope_id,
    CASE
      WHEN lower(btrim(COALESCE(m.referencia, 'global'))) = 'global'
      THEN 'Global'
      ELSE btrim(COALESCE(m.referencia, 'global'))
    END AS scope_label,
    m.valor,
    m.periodo,
    m.periodo_inicio,
    m.periodo_fim,
    m.created_at,
    m.updated_at
  FROM public.metas m
  INNER JOIN public.goal_metric_definitions gmd
    ON gmd.legacy_tipo = m.tipo
),
upsert_goal_definitions AS (
  INSERT INTO public.goal_definitions (
    workspace_id,
    metric_definition_id,
    scope_type,
    scope_id,
    scope_label,
    notes,
    created_at,
    updated_at,
    metadata
  )
  SELECT DISTINCT
    lr.workspace_id,
    lr.metric_definition_id,
    lr.scope_type,
    lr.scope_id,
    lr.scope_label,
    'Migrado da tabela legada metas em 2026-03-24.',
    COALESCE(lr.created_at, now()),
    COALESCE(lr.updated_at, now()),
    jsonb_build_object('migrated_from_legacy_metas', true)
  FROM legacy_rows lr
  ON CONFLICT (workspace_id, metric_definition_id, scope_type, scope_id) DO UPDATE
  SET
    scope_label = EXCLUDED.scope_label,
    updated_at = now(),
    metadata = public.goal_definitions.metadata || EXCLUDED.metadata
  RETURNING id, workspace_id, metric_definition_id, scope_type, scope_id
)
INSERT INTO public.goal_versions (
  goal_definition_id,
  target_value,
  period_start,
  period_end,
  cadence,
  notes,
  created_at,
  updated_at,
  metadata
)
SELECT
  gd.id,
  lr.valor,
  lr.periodo_inicio,
  lr.periodo_fim,
  COALESCE(NULLIF(lr.periodo, ''), 'customizado'),
  'Migrado da tabela legada metas.',
  COALESCE(lr.created_at, now()),
  COALESCE(lr.updated_at, now()),
  jsonb_build_object('legacy_meta_id', lr.legacy_meta_id)
FROM legacy_rows lr
INNER JOIN public.goal_definitions gd
  ON gd.workspace_id = lr.workspace_id
 AND gd.metric_definition_id = lr.metric_definition_id
 AND gd.scope_type = lr.scope_type
 AND gd.scope_id = lr.scope_id
ON CONFLICT (goal_definition_id, period_start, period_end) DO UPDATE
SET
  target_value = EXCLUDED.target_value,
  cadence = EXCLUDED.cadence,
  notes = EXCLUDED.notes,
  updated_at = COALESCE(EXCLUDED.updated_at, now()),
  metadata = public.goal_versions.metadata || EXCLUDED.metadata;
