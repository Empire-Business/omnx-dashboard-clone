-- Migration: reduz a janela do sync de tags de 90 → 7 dias (DEFAULT) e fixa o cron em 7.
--
-- Contexto: o cron `sync-tags-from-webhook` (a cada 5 min) chama
-- `sync_tags_from_latest_webhook()` sem argumento → caía no DEFAULT de 90 dias.
-- O scan de 90 dias de `webhooks_ghl` estoura statement timeout de forma
-- intermitente — evidência em produção em 2026-07-16: 50 execuções `failed`
-- em 24h (17%), tags ficando desatualizadas entre uma execução boa e outra.
-- Como o cron roda 288×/dia, uma janela de 7 dias cobre com folga qualquer
-- webhook recente; backfills maiores seguem possíveis chamando a função com
-- argumento explícito (ex.: `SELECT sync_tags_from_latest_webhook(90);`).
--
-- Aprovado pelo dono em 2026-07-16.
--
-- Observação: CREATE OR REPLACE preserva as ACLs — os REVOKEs/GRANTs de
-- `20260921000000_revoke_internal_security_definer.sql` (EXECUTE só p/
-- postgres+service_role) permanecem intactos.

CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(p_days_back integer DEFAULT 7)
 RETURNS TABLE(updated_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

COMMENT ON FUNCTION public.sync_tags_from_latest_webhook(integer) IS
'Atualiza contatos.tags a partir do webhook mais recente por contact_id.
DEFAULT da janela: 7 dias (era 90 — reduzido em 20260922000000 por timeouts
intermitentes do cron, 50 falhas/24h). Para backfill maior, chamar com
argumento explícito: SELECT sync_tags_from_latest_webhook(90);';

-- Reagenda o cron com o argumento explícito: a intenção fica documentada no
-- próprio job, sem depender do DEFAULT da função.
SELECT cron.unschedule('sync-tags-from-webhook');
SELECT cron.schedule('sync-tags-from-webhook', '*/5 * * * *', $$SELECT sync_tags_from_latest_webhook(7)$$);
