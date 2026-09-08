-- Migration: tabela de allowlist para o Bot Telegram
-- Apenas usuários cadastrados aqui podem usar o bot no Telegram

CREATE TABLE IF NOT EXISTS telegram_allowed_users (
  telegram_user_id BIGINT PRIMARY KEY,
  nome             TEXT NOT NULL,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE telegram_allowed_users IS 'Allowlist de usuários autorizados a usar o bot Empire no Telegram';
COMMENT ON COLUMN telegram_allowed_users.telegram_user_id IS 'ID numérico do usuário no Telegram (obter via @userinfobot)';
COMMENT ON COLUMN telegram_allowed_users.nome IS 'Nome legível para identificação (ex: João Silva)';
COMMENT ON COLUMN telegram_allowed_users.ativo IS 'false = bloqueado sem precisar deletar';

-- Índice para lookup rápido por ativo
CREATE INDEX IF NOT EXISTS idx_telegram_allowed_users_ativo
  ON telegram_allowed_users (ativo)
  WHERE ativo = true;
