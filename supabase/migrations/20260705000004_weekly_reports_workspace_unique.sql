-- =============================================================================
-- Migration: Torna o snapshot semanal único por (workspace_id, week_start, report_type)
-- Data: 2026-07-05
--
-- Motivo:
--   A edge function compute-weekly-reports agora cria um snapshot por workspace.
--   A constraint anterior (week_start, report_type) impedia snapshots distintos
--   por workspace e permitia que um workspace sobrescrevesse o snapshot de outro.
-- =============================================================================

-- Remove a constraint de unicidade antiga (se existir).
ALTER TABLE public.weekly_snapshots
DROP CONSTRAINT IF EXISTS uq_weekly_snapshots_week_type;

-- Cria a nova constraint incluindo workspace_id.
-- workspace_id NULL representa snapshot legado agregado multi-workspace;
-- múltiplos registros NULL ainda seriam permitidos, mas o código passa a
-- exigir workspace_id para novos snapshots.
ALTER TABLE public.weekly_snapshots
ADD CONSTRAINT uq_weekly_snapshots_workspace_week_type
UNIQUE (workspace_id, week_start, report_type);

-- NOT NULL intencionalmente OMITIDO: há registros legados com workspace_id
-- IS NULL (snapshots antigos agregados multi-workspace) que ainda não
-- passaram por backfill — ver débito técnico em docs/MUDANCAS.md e
-- docs/HANDOFF-OMNX-2026-07-05.md item 5.1. Forçar NOT NULL aqui quebraria
-- a migration (2026-07-05: falhou em produção por esse motivo exato).
-- O código da aplicação já exige workspace_id para novos snapshots.

COMMENT ON CONSTRAINT uq_weekly_snapshots_workspace_week_type ON public.weekly_snapshots IS
  'Unicidade de snapshot por workspace, semana e tipo de relatório.';
