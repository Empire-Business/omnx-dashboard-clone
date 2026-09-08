-- Tabela de scores dinâmicos para o discador de pré-vendas
-- Populada a cada 2 min pelo cron recalcular_discagem_scores()

CREATE TABLE IF NOT EXISTS discagem_scores (
  oportunidade_id  UUID         PRIMARY KEY REFERENCES oportunidades(id) ON DELETE CASCADE,
  contato_id       UUID         NOT NULL,
  score            INTEGER      NOT NULL DEFAULT 0,
  estado           TEXT         NOT NULL CHECK (estado IN ('ligue_agora', 'ligue_hoje', 'mensagem')),
  razao            TEXT         NOT NULL DEFAULT '',
  componente_dom   TEXT         NOT NULL DEFAULT 'urgencia',
  score_sinal      INTEGER      NOT NULL DEFAULT 0,
  score_urgencia   INTEGER      NOT NULL DEFAULT 0,
  score_tentativas INTEGER      NOT NULL DEFAULT 0,
  score_fonte      INTEGER      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discagem_scores_estado ON discagem_scores(estado, score DESC);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_contato ON discagem_scores(contato_id);

ALTER TABLE discagem_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_discagem_scores" ON discagem_scores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.user_id = (SELECT auth.uid()) AND wm.is_active = true)
  );

CREATE POLICY "service_role_full_discagem_scores" ON discagem_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);
