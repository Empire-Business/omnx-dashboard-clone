-- ============================================================
-- Migration: Remove registros antigos de comunicacoes dos webhooks
--
-- Contexto:
--   Antes da integração com a GHL Conversations API (2026-03-11),
--   a tabela comunicacoes era populada via webhooks GHL (parcial,
--   apenas inbound, sem direction, sem channel, sem ghl_message_id).
--
--   Agora a API sync puxa TUDO (inbound + outbound) com dados
--   completos e ghl_message_id único. O backfill por contato
--   (backfill_by_contact) reimporta essas mesmas mensagens com
--   dados enriquecidos.
--
-- Critério de exclusão — registro é da era webhook se:
--   channel IS NULL          → coluna adicionada junto com a API sync
--   ghl_message_id IS NULL   → nunca foi sincronizado via API
--
-- Esses registros:
--   - Não têm direction (quem enviou)
--   - Não têm channel (por onde)
--   - Não têm ghl_message_id (sem dedup)
--   - Não têm data_comunicacao da GHL (apenas created_at do Supabase)
--   - São um subconjunto inferior dos dados que a API já trouxe
--
-- Registros que NÃO serão deletados (canal preenchido = veio da API):
--   channel IS NOT NULL → mantidos intactos
-- ============================================================

-- Contar antes (para auditoria no log)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM comunicacoes
  WHERE channel IS NULL AND ghl_message_id IS NULL;

  RAISE NOTICE 'comunicacoes: removendo % registros antigos (channel=NULL, ghl_message_id=NULL)', v_count;
END $$;

-- Deletar registros da era webhook
DELETE FROM comunicacoes
WHERE channel        IS NULL
  AND ghl_message_id IS NULL;

-- Confirmar resultado
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM comunicacoes;
  RAISE NOTICE 'comunicacoes: % registros restantes (todos com channel preenchido)', v_remaining;
END $$;

-- Recarregar schema cache
NOTIFY pgrst, 'reload schema';
