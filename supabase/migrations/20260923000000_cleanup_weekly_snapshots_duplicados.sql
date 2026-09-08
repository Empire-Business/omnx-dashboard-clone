-- =============================================================================
-- Migration: Limpeza de snapshots duplicados em weekly_snapshots
-- Data: 2026-07-16
--
-- CONTEXTO
--   Um bug antigo (já corrigido) criou snapshots duplicados para a mesma semana
--   lógica (mesmo year_week + report_type) em weekly_snapshots:
--     a) legados com workspace_id NULL convivendo com o snapshot correto do
--        workspace (a constraint uq_weekly_snapshots_workspace_week_type não
--        deduplica NULLs — NULLs são distintos entre si no Postgres);
--     b) legados com week_start fora da convenção de segunda-feira (terças),
--        cujo year_week colide com o snapshot correto de segunda-feira.
--   O frontend já deduplica na exibição (eb-dash2/src/lib/relatorios/trendData.ts)
--   por year_week: vence 1) maior data_version; 2) computed_at mais recente;
--   3) week_start mais antigo.
--
-- MEDIÇÃO EM PRODUÇÃO (2026-07-15, SELECT-only)
--   86 linhas: 56 com workspace_id NULL, 30 com workspace_id (1 workspace).
--   23 grupos (year_week, report_type) com 2+ linhas → 29 duplicatas (33,7%).
--   Pares NULL/ws com MESMO week_start têm métricas idênticas (single-tenant);
--   pares terça/segunda divergem porque a janela da terça está errada — o
--   snapshot de segunda é o correto.
--
-- CRITÉRIO DE LIMPEZA
--   Para cada grupo (year_week, report_type) com 2+ linhas, o KEEPER é:
--     1. a linha com workspace_id preenchido E week_start em segunda-feira
--        ("snapshot novo correto"; no máximo 1 por grupo, pela constraint);
--     2. se o grupo só tiver legados (sem linha do workspace), a linha que o
--        frontend escolheria hoje: data_version DESC, computed_at DESC,
--        week_start ASC (desempate determinístico por id).
--   As demais linhas do grupo são deletadas. O DELETE cascateia para as 9
--   tabelas de módulo (weekly_trafego ... weekly_metas) e weekly_cohort_audit
--   — todas REFERENCES weekly_snapshots ON DELETE CASCADE.
--   Linhas FORA de grupos duplicados não são tocadas: semanas que só existem
--   como legado (ex.: produtividade até 2026-W27 e cohort 2026-W10/W11/W17/W19)
--   são preservadas — não são duplicatas, são o único dado daquela semana.
--
-- SALVAGUARDAS (fail-closed)
--   1. Cobertura: ABORTA com EXCEPTION se algum candidato à deleção tiver
--      registros (por tupla de dimensão) em tabela filha que o keeper não
--      cobre — sinal de que o "duplicado" carrega dados únicos e o critério
--      precisa de revisão humana antes de deletar.
--   2. Volume: ABORTA se as deleções passarem de 40% da tabela (medido 33,7%;
--      folga pequena e deliberada para detectar regressão do critério).
--   Idempotente: sem candidatos, termina com NOTICE sem deletar nada.
-- =============================================================================

DO $$
DECLARE
  v_total         INTEGER;
  v_group_count   INTEGER;
  v_delete_count  INTEGER;
  v_delete_pct    NUMERIC;
  v_max_pct       CONSTANT NUMERIC := 0.40;
  v_uncovered     TEXT;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Grupos duplicados e ranking dentro de cada grupo (keeper = rn 1).
  --    O flag (workspace preenchido + segunda-feira) tem prioridade máxima;
  --    na ausência dele, a ordem replica o critério do frontend (trendData.ts).
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE _ws_cleanup_ranking ON COMMIT DROP AS
  WITH grupos AS (
    SELECT year_week, report_type
    FROM public.weekly_snapshots
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  )
  SELECT
    s.id,
    s.year_week,
    s.report_type,
    ROW_NUMBER() OVER (
      PARTITION BY s.year_week, s.report_type
      ORDER BY
        (s.workspace_id IS NOT NULL AND EXTRACT(DOW FROM s.week_start) = 1) DESC,
        s.data_version DESC,
        s.computed_at DESC NULLS LAST,
        s.week_start ASC,
        s.id ASC
    ) AS rn
  FROM public.weekly_snapshots s
  JOIN grupos g USING (year_week, report_type);

  CREATE TEMP TABLE _ws_cleanup_candidatos ON COMMIT DROP AS
  SELECT
    c.id AS candidato_id,
    k.id AS keeper_id,
    c.year_week,
    c.report_type
  FROM _ws_cleanup_ranking c
  JOIN _ws_cleanup_ranking k USING (year_week, report_type)
  WHERE c.rn > 1
    AND k.rn = 1;

  SELECT COUNT(*) INTO v_total FROM public.weekly_snapshots;
  SELECT COUNT(*) INTO v_group_count FROM _ws_cleanup_ranking WHERE rn = 1;
  SELECT COUNT(*) INTO v_delete_count FROM _ws_cleanup_candidatos;

  -- -------------------------------------------------------------------------
  -- 2. Salvaguarda de cobertura: nenhum candidato pode ter registro em tabela
  --    filha cuja tupla de dimensão não exista também para o keeper.
  -- -------------------------------------------------------------------------
  SELECT string_agg(DISTINCT c.candidato_id::text, ', ' ORDER BY c.candidato_id::text)
  INTO v_uncovered
  FROM _ws_cleanup_candidatos c
  WHERE
    EXISTS (
      SELECT 1 FROM public.weekly_trafego x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_trafego y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_aquisicao x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_aquisicao y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_organico x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_organico y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_prevendas x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_prevendas y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_vendas x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_vendas y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_recuperacao x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_recuperacao y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_sdr x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_sdr y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_closer x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_closer y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_metas x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_metas y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value
            AND y.sub_dimension IS NOT DISTINCT FROM x.sub_dimension
            AND y.sub_dimension_value IS NOT DISTINCT FROM x.sub_dimension_value))
    OR EXISTS (
      SELECT 1 FROM public.weekly_cohort_audit x
      WHERE x.snapshot_id = c.candidato_id
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_cohort_audit y
          WHERE y.snapshot_id = c.keeper_id
            AND y.dimension IS NOT DISTINCT FROM x.dimension
            AND y.dimension_value IS NOT DISTINCT FROM x.dimension_value));

  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'cleanup_weekly_snapshots: ABORTADO. Candidatos com dados de modulo/auditoria NAO cobertos pelo keeper (ids: %). Isso indica dado unico na versao "ruim" — revise o criterio antes de deletar.', v_uncovered;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Salvaguarda de volume: deleções não podem passar de 40% da tabela
  --    (medido em produção em 2026-07-15: 29 de 86 linhas = 33,7%).
  -- -------------------------------------------------------------------------
  IF v_delete_count > 0 THEN
    v_delete_pct := v_delete_count::numeric / v_total;
    IF v_delete_pct > v_max_pct THEN
      RAISE EXCEPTION 'cleanup_weekly_snapshots: ABORTADO. % delecoes em % linhas (% pct), acima do limite de % pct. Criterio precisa de revisao.',
        v_delete_count, v_total, round(v_delete_pct * 100, 1), (v_max_pct * 100)::int;
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Idempotência: nada a fazer se não houver candidatos.
  -- -------------------------------------------------------------------------
  IF v_delete_count = 0 THEN
    RAISE NOTICE 'cleanup_weekly_snapshots: nenhuma duplicata encontrada; nada a deletar (idempotente).';
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. Deleção (cascateia para as tabelas filhas via ON DELETE CASCADE).
  -- -------------------------------------------------------------------------
  DELETE FROM public.weekly_snapshots s
  USING _ws_cleanup_candidatos c
  WHERE s.id = c.candidato_id;

  RAISE NOTICE 'cleanup_weekly_snapshots: % snapshots duplicados removidos em % grupos (year_week, report_type). Total da tabela: % -> %.',
    v_delete_count, v_group_count, v_total, v_total - v_delete_count;
END $$;
