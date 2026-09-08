-- Migration: Reintroduz coluna direction em comunicacoes
-- Necessário para o módulo Pré-Vendas detectar leads aguardando resposta do SDR.
-- Dados históricos ficam com direction = NULL (não há como inferir retroativamente).

ALTER TABLE comunicacoes
  ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('inbound', 'outbound'));

COMMENT ON COLUMN comunicacoes.direction IS
  'inbound = mensagem veio do lead; outbound = enviada pelo SDR/sistema. NULL = histórico anterior à migração.';

-- Índice para queries do módulo Pré-Vendas (ex.: último inbound por contato)
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_direction_created
  ON comunicacoes (contato_id, direction, created_at DESC);
