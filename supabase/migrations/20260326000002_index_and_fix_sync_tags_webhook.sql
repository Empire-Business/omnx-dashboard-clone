-- ============================================================
-- Migration: índice para sync_tags_from_latest_webhook
-- e versão otimizada com janela de 90 dias.
--
-- O scan completo de webhooks_ghl (tabela enorme) causava timeout.
-- Solução: índice parcial em (contact_id_expr, created_at DESC)
-- + janela de 90 dias para o DISTINCT ON.
-- ============================================================

-- Índice para acelerar DISTINCT ON (contact_id) ORDER BY created_at DESC
-- Expressão extrai contact_id do JSONB para o índice ser eficiente.
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_contact_id_created
  ON webhooks_ghl ((TRIM(payload->>'contact_id')), created_at DESC)
  WHERE payload->>'contact_id' IS NOT NULL
    AND TRIM(payload->>'contact_id') != '';

-- ============================================================
-- Recriar a função com janela de 90 dias (cobre todos os ativos)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(
  p_days_back INT DEFAULT 90
)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH latest_webhook_per_contact AS (
    SELECT DISTINCT ON (TRIM(payload->>'contact_id'))
      TRIM(payload->>'contact_id')           AS ghl_id,
      extract_ghl_tags(payload->'tags')      AS tags_value
    FROM webhooks_ghl
    WHERE payload->>'contact_id' IS NOT NULL
      AND TRIM(payload->>'contact_id') != ''
      AND payload->'tags' IS NOT NULL
      AND jsonb_typeof(payload->'tags') != 'null'
      AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL
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
      AND (c.tags IS DISTINCT FROM lwc.tags_value)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM atualizado;

  RETURN QUERY SELECT v_updated;
END;
$$;

COMMENT ON FUNCTION public.sync_tags_from_latest_webhook(INT) IS
'Atualiza contatos.tags a partir do webhook mais recente por contact_id.
Parâmetro p_days_back (default 90) define a janela de busca.
Não faz chamadas à API GHL. Cron: */5 * * * *.
Fonte de verdade: payload->tags do último webhook recebido.';
