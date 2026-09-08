-- ============================================================
-- Migration: corrige ambiguidade de overload em sync_tags_from_latest_webhook
--            e executa backfill completo de tags
--
-- PROBLEMA:
--   A migration 20260326000002 criou um segundo overload de
--   sync_tags_from_latest_webhook() com assinatura diferente
--   (p_days_back INT DEFAULT 90). O PostgreSQL passou a ter dois
--   candidatos para a chamada sem parâmetros:
--     1. sync_tags_from_latest_webhook()            -- criada em 20260326000001
--     2. sync_tags_from_latest_webhook(INT DEFAULT) -- criada em 20260326000002
--   Resultado: ERROR "function is not unique" em todas as 3.130
--   execuções do cron desde 2026-03-26 17:20. Nenhuma tag foi
--   atualizada pelo cron desde então. 78 MQLs invisíveis no painel.
--
-- SOLUÇÃO:
--   1. DROP na versão sem parâmetro (que virou lixo depois da 00002)
--   2. A versão com DEFAULT 90 passa a ser a única — cron funciona
--   3. Backfill com janela de 365 dias para cobrir todos os afetados
--   4. Reagendar o cron para garantir que está ativo
-- ============================================================

-- ============================================================
-- PASSO 1: Remove overload ambíguo (versão sem parâmetro)
-- ============================================================
DROP FUNCTION IF EXISTS public.sync_tags_from_latest_webhook();

-- Verificação: agora só deve existir a versão com (p_days_back INT DEFAULT 90)
-- SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
-- WHERE proname = 'sync_tags_from_latest_webhook';

-- ============================================================
-- PASSO 2: Backfill completo — últimos 365 dias
--   Cobre todos os contatos afetados desde que o bug foi introduzido
--   (2026-03-26). A janela de 365 dias garante que nenhum contato
--   ativo seja deixado para trás.
-- ============================================================
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  SELECT updated_count INTO v_updated
  FROM sync_tags_from_latest_webhook(365);

  RAISE NOTICE 'Backfill de tags concluído: % contatos atualizados', v_updated;
END;
$$;

-- ============================================================
-- PASSO 3: Reagendar cron para garantir que está ativo
--   O comando SELECT sync_tags_from_latest_webhook() agora funciona
--   porque só existe um overload (com DEFAULT 90).
-- ============================================================
SELECT cron.unschedule('sync-tags-from-webhook')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-tags-from-webhook'
);

SELECT cron.schedule(
  'sync-tags-from-webhook',
  '*/5 * * * *',
  $$SELECT sync_tags_from_latest_webhook()$$
);

-- ============================================================
-- PASSO 4: Também corrige contatos com tags = '' (string vazia)
--   A edge function sync-contact-tags escreve '' quando a API GHL
--   retorna sem tags. O sync_tags_from_latest_webhook só atualiza
--   quem é IS DISTINCT FROM — string vazia é distinta de NULL mas
--   não é distinta de '' própria. Precisamos forçar re-sync dos
--   contatos com tags = '' que tenham webhooks com tags válidas.
-- ============================================================
DO $$
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
      AND created_at >= NOW() - INTERVAL '365 days'
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
      AND (c.tags = '' OR c.tags IS NULL)  -- cobre tanto NULL quanto string vazia
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM atualizado;

  RAISE NOTICE 'Backfill de tags vazias ("") concluído: % contatos atualizados', v_updated;
END;
$$;
