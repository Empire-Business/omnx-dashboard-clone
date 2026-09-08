-- Migration: metas com vigência explícita por intervalo
-- Permite múltiplas metas históricas por tipo/referência e bloqueia sobreposição

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE metas
  ADD COLUMN IF NOT EXISTS periodo_inicio DATE,
  ADD COLUMN IF NOT EXISTS periodo_fim DATE;

UPDATE metas
SET
  periodo_inicio = COALESCE(
    periodo_inicio,
    date_trunc('month', timezone('America/Sao_Paulo', now()))::date
  ),
  periodo_fim = COALESCE(
    periodo_fim,
    (date_trunc('month', timezone('America/Sao_Paulo', now())) + INTERVAL '1 month - 1 day')::date
  ),
  periodo = 'customizado',
  updated_at = now()
WHERE periodo_inicio IS NULL OR periodo_fim IS NULL OR periodo <> 'customizado';

ALTER TABLE metas
  ALTER COLUMN periodo_inicio SET NOT NULL,
  ALTER COLUMN periodo_fim SET NOT NULL,
  ALTER COLUMN periodo SET DEFAULT 'customizado';

ALTER TABLE metas
  DROP CONSTRAINT IF EXISTS metas_workspace_id_tipo_referencia_key;

ALTER TABLE metas
  ADD CONSTRAINT metas_periodo_valido_chk
  CHECK (periodo_inicio <= periodo_fim);

ALTER TABLE metas
  ADD CONSTRAINT metas_workspace_tipo_referencia_periodo_key
  UNIQUE (workspace_id, tipo, referencia, periodo_inicio, periodo_fim);

ALTER TABLE metas
  ADD CONSTRAINT metas_sem_sobreposicao
  EXCLUDE USING gist (
    workspace_id WITH =,
    tipo WITH =,
    referencia WITH =,
    daterange(periodo_inicio, periodo_fim, '[]') WITH &&
  );
