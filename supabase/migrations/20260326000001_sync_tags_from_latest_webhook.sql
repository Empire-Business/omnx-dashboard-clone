-- ============================================================
-- Migration: sync_tags_from_latest_webhook — fonte de verdade
-- são as tags do último webhook recebido por contato.
--
-- PROBLEMA ANTERIOR:
--   sync-contact-tags (edge function) só enfileirava contatos com
--   tags IS NULL. Uma vez que o contato ganhava qualquer valor,
--   nunca mais era re-sincronizado. Tags ficavam congeladas.
--
-- NOVA ABORDAGEM:
--   Função SQL pura que lê diretamente de webhooks_ghl e
--   atualiza contatos.tags a partir do webhook mais recente
--   que contiver o campo tags. Sem chamada à API GHL.
--   Cron a cada 5 min garante sincronização contínua.
--
-- FONTE DE VERDADE: último webhook por contact_id, campo payload->'tags'
-- ============================================================

-- ============================================================
-- Função: sync_tags_from_latest_webhook
-- Atualiza contatos.tags para todos os contatos a partir do
-- webhook mais recente que tenha tags preenchido.
-- Só atualiza registros onde o valor mudou (IS DISTINCT FROM).
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook()
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH latest_webhook_per_contact AS (
    -- Para cada contact_id, pega o webhook mais recente que tem tags
    SELECT DISTINCT ON (TRIM(payload->>'contact_id'))
      TRIM(payload->>'contact_id')           AS ghl_id,
      extract_ghl_tags(payload->'tags')      AS tags_value
    FROM webhooks_ghl
    WHERE payload->>'contact_id' IS NOT NULL
      AND TRIM(payload->>'contact_id') != ''
      AND payload->'tags' IS NOT NULL
      AND jsonb_typeof(payload->'tags') != 'null'
    ORDER BY TRIM(payload->>'contact_id'), created_at DESC
  ),
  atualizado AS (
    UPDATE contatos c
    SET
      tags       = lwc.tags_value,
      updated_at = NOW()
    FROM latest_webhook_per_contact lwc
    WHERE c.ghl_id = lwc.ghl_id
      AND lwc.tags_value IS NOT NULL
      AND (c.tags IS DISTINCT FROM lwc.tags_value)  -- só toca quem mudou
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM atualizado;

  RETURN QUERY SELECT v_updated;
END;
$$;

COMMENT ON FUNCTION public.sync_tags_from_latest_webhook IS
'Atualiza contatos.tags a partir do webhook mais recente por contact_id.
Não faz chamadas à API GHL. Cron recomendado: */5 * * * *.
Fonte de verdade: payload->tags do último webhook recebido.';

-- ============================================================
-- Cron: rodar a cada 5 minutos
-- ============================================================

SELECT cron.unschedule('sync-tags-from-webhook')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-tags-from-webhook'
);

SELECT cron.schedule(
  'sync-tags-from-webhook',
  '*/5 * * * *',
  'SELECT sync_tags_from_latest_webhook()'
);
