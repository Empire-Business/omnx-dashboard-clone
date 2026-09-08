-- ============================================================
-- Migration: corrige tags no trigger de webhook
--
-- PROBLEMA:
--   A função extrair_dados_ghl() não atualiza contatos.tags.
--   O campo foi removido do UPDATE de contatos em migrations
--   posteriores e nunca foi adicionado ao INSERT (contatos nascem
--   com tags=NULL). A única salvaguarda era o cron
--   sync-tags-from-webhook — que estava quebrado desde 2026-03-26
--   (corrigido pela migration 20260406000001).
--
-- SOLUÇÃO:
--   Modifica trigger_extrair_dados_ghl() para chamar
--   sync_tags_from_webhook_target() após extrair_dados_ghl().
--   Isso garante que, logo após cada webhook ser processado,
--   as tags do contato são imediatamente sincronizadas com o
--   webhook mais recente que contenha tags.
--
--   Por que sync_tags_from_webhook_target() e não extrair_dados_ghl()?
--   Porque sync_tags_from_webhook_target() busca ESPECIFICAMENTE
--   o webhook mais recente com payload->'tags' não nulo — ignorando
--   webhooks de opportunity update que chegam sem tags. Isso evita
--   sobrescrever tags válidas com NULL.
--
--   O índice idx_webhooks_ghl_contact_id_created (migration 20260326000002)
--   garante que a lookup por contact_id seja eficiente (sem full scan).
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_extrair_dados_ghl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_contact_ghl_id TEXT;
BEGIN
  -- Passo 1: processar dados do webhook (contatos, opps, vendas)
  PERFORM extrair_dados_ghl(NEW.id);

  -- Passo 2: sincronizar tags do contato imediatamente
  -- Busca o webhook mais recente COM tags para o contact_id deste webhook.
  -- Não depende do cron — roda em tempo real para cada webhook.
  -- sync_tags_from_webhook_target é no-op se contact_id for NULL ou vazio.
  v_contact_ghl_id := TRIM(NEW.payload->>'contact_id');
  IF v_contact_ghl_id IS NOT NULL AND v_contact_ghl_id != '' THEN
    PERFORM sync_tags_from_webhook_target(v_contact_ghl_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_extrair_dados_ghl IS
'Trigger function: após cada INSERT em webhooks_ghl, chama extrair_dados_ghl(NEW.id)
para processar contatos/opps/vendas, e depois sync_tags_from_webhook_target() para
garantir que contatos.tags reflete o webhook mais recente com tags. Defense-in-depth:
o cron sync-tags-from-webhook também roda a cada 5 min como fallback.';
