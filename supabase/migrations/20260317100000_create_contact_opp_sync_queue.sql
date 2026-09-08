-- ============================================================
-- Migration: Tabela contact_opp_sync_queue
--
-- Fila de sincronização de TODAS as oportunidades de um contato.
--
-- Problema resolvido:
--   O webhook do GHL envia apenas UMA oportunidade por evento
--   ContactCreate. Se um contato já existe no GHL com múltiplas
--   oportunidades (ex: importado em massa, ou lead antigo reativado),
--   as outras ficam invisíveis no banco.
--
-- Solução:
--   1. Quando ContactCreate chega, enfileira o contact_id
--   2. Cron a cada 5 min busca contatos pendentes
--   3. Para cada contato, busca TODAS as oportunidades via API GHL
--   4. UPSERT cada oportunidade em oportunidades
--
-- Deduplicação: UNIQUE INDEX WHERE status='pending'
--   Mesmo contato não entra 2x na fila durante importação em massa.
--   Contatos processados (done/error) podem ser enfileirados novamente
--   se um novo webhook chegar.
--
-- Colunas:
--   id: UUID PK
--   ghl_contact_id: ID do contato no GHL (UNIQUE PENDING)
--   status: pending | processing | done | error
--   attempts: número de tentativas
--   last_error: mensagem de erro se status=error
--   created_at: quando foi enfileirado
--   processed_at: quando foi processado (done/error)
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_opp_sync_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_contact_id TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  attempts       INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ
);

-- Deduplicação: um contato só pode estar UMA VEZ com status='pending'
-- Se o contato já foi processado (done/error), ele pode ser re-enfileirado
CREATE UNIQUE INDEX IF NOT EXISTS contact_opp_sync_queue_dedup
  ON contact_opp_sync_queue (ghl_contact_id)
  WHERE status = 'pending';

-- Índice para buscar pendentes em ordem (criados primeiro)
CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_status_created_idx
  ON contact_opp_sync_queue (status, created_at);

-- Índice para busca rápida por ghl_contact_id (qualquer status)
CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_contact_id_idx
  ON contact_opp_sync_queue (ghl_contact_id);
