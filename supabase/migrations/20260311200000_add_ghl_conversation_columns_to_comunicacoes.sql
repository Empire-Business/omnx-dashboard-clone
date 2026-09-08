-- ============================================================
-- Migration: Adiciona colunas para sync com GHL Conversations API
-- Motivo: Popular comunicacoes com mensagens outbound dos SDRs
--         (WhatsApp, SMS, Email, Ligações de todos os lados)
-- Data: 2026-03-11
-- ============================================================

-- Novas colunas para rastrear a origem exata de cada mensagem
ALTER TABLE comunicacoes
  -- ID único da mensagem no GHL (usado para deduplicação no upsert)
  ADD COLUMN IF NOT EXISTS ghl_message_id TEXT,
  -- ID da conversa no GHL (grupo de mensagens com um contato)
  ADD COLUMN IF NOT EXISTS ghl_conversation_id TEXT,
  -- Canal da comunicação: sms, whatsapp, email, call, facebook, instagram, gmb
  ADD COLUMN IF NOT EXISTS channel TEXT,
  -- Timestamp real da mensagem conforme o GHL (campo dateAdded)
  -- Diferente de created_at, que é quando o registro entrou no Supabase
  ADD COLUMN IF NOT EXISTS data_comunicacao TIMESTAMPTZ,
  -- Array de URLs de anexos (imagens, documentos, áudios)
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  -- ID do usuário GHL que enviou a mensagem (para mensagens outbound do SDR)
  ADD COLUMN IF NOT EXISTS usuario_ghl_id TEXT;

-- Constraint única em ghl_message_id para evitar duplicatas no upsert
-- WHERE NOT NULL garante que registros antigos sem ghl_message_id não conflitem
CREATE UNIQUE INDEX IF NOT EXISTS idx_comunicacoes_ghl_message_id
  ON comunicacoes (ghl_message_id)
  WHERE ghl_message_id IS NOT NULL;

-- Index de busca por conversa
CREATE INDEX IF NOT EXISTS idx_comunicacoes_ghl_conversation_id
  ON comunicacoes (ghl_conversation_id)
  WHERE ghl_conversation_id IS NOT NULL;

-- Index de busca por timestamp real da mensagem
CREATE INDEX IF NOT EXISTS idx_comunicacoes_data_comunicacao
  ON comunicacoes (data_comunicacao DESC)
  WHERE data_comunicacao IS NOT NULL;

-- Index composto: contato + canal + data (para análise por canal de comunicação)
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_channel_data
  ON comunicacoes (contato_id, channel, data_comunicacao DESC)
  WHERE channel IS NOT NULL;

-- Comentários documentando a origem dos dados
COMMENT ON COLUMN comunicacoes.ghl_message_id IS 'ID único da mensagem no GHL. Usado como chave de deduplicação no sync da API GHL Conversations.';
COMMENT ON COLUMN comunicacoes.ghl_conversation_id IS 'ID da conversa no GHL. Uma conversa agrupa todas as mensagens com um contato em um canal.';
COMMENT ON COLUMN comunicacoes.channel IS 'Canal da comunicação: sms | whatsapp | email | call | facebook | instagram | gmb | webchat';
COMMENT ON COLUMN comunicacoes.data_comunicacao IS 'Timestamp real da mensagem no GHL (dateAdded). Use este campo para análise temporal, não created_at.';
COMMENT ON COLUMN comunicacoes.attachments IS 'Array JSON de URLs de anexos (imagens, documentos, áudios, vídeos).';
COMMENT ON COLUMN comunicacoes.usuario_ghl_id IS 'ID do usuário GHL que enviou a mensagem (userId). Presente em mensagens outbound. Mapeável para owner_id na tabela contatos.';
