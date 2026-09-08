-- Tabela de contexto dinâmico do bot Empire
-- O bot-chat lê todas as linhas em runtime e injeta no system prompt.
-- Para atualizar o conhecimento do bot: UPDATE bot_context SET content = '...' WHERE key = '...';
-- Nenhum redeploy necessário.

CREATE TABLE IF NOT EXISTS bot_context (
  key      TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  ordem    INTEGER NOT NULL DEFAULT 100,
  ativo    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE bot_context IS 'Contexto dinâmico injetado no system prompt do bot Empire. Atualize aqui para mudar o conhecimento do bot sem redeploy.';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_bot_context_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bot_context_updated_at
  BEFORE UPDATE ON bot_context
  FOR EACH ROW EXECUTE FUNCTION update_bot_context_updated_at();
