-- sync_tags_from_latest_webhook: janela configurável + índice que a torna barata.
--
-- PROBLEMA (medido em produção em 05/08/2026)
-- O cron `sync-tags-from-webhook` rodava `sync_tags_from_latest_webhook(7)` a cada
-- 10 minutos: varria 7 DIAS de `webhooks_ghl` (352 mil linhas, 2,9 GB — a maior
-- tabela do banco) para achar o webhook mais recente de cada contato.
--
--   média 34,9s · pico 80,2s · 144 execuções/dia ≈ 1h24 de banco ocupado por dia
--
-- Refazendo 99% do mesmo trabalho a cada rodada. Além do desperdício, competia com
-- o dashboard e encurtava a margem até o `statement_timeout` de quem carregava a
-- tela (a aba Produtividade chegou a quebrar por isso, ver PR #74).
--
-- DUAS CAUSAS SOMADAS
--   1. Não existia índice em `created_at`. Só havia `(contact_id, created_at)`, que
--      não serve para filtrar por tempo — o Postgres percorria o índice inteiro,
--      todos os contatos, desde sempre.
--   2. Janela de 7 dias para um cron de 10 minutos é desproporcional.
--
-- GANHO MEDIDO (com o índice em vigor)
--   7 dias  → ~35.000 ms
--   1 dia   →     843 ms
--   1 hora  →      55 ms
--
-- AGENDAMENTO RESULTANTE (aplicado via cron.alter_job/cron.schedule)
--   jobid 92  a cada 10 min   sync_tags_from_latest_webhook(interval '2 hours')
--   jobid 95  diário 04:40    sync_tags_from_latest_webhook(7)   -- rede de segurança
--
-- NOTA SOBRE O ÍNDICE
-- Em produção ele foi criado com CREATE INDEX CONCURRENTLY, que NÃO roda dentro de
-- transação e por isso não cabe numa migration. Aqui vai a versão comum, para que
-- um ambiente montado do zero fique idêntico; em produção o IF NOT EXISTS torna
-- este comando inócuo.
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_created_at
  ON public.webhooks_ghl (created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(p_window interval)
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
      AND created_at >= NOW() - p_window
    ORDER BY TRIM(payload->>'contact_id'), created_at DESC
  ),
  atualizado AS (
    UPDATE contatos c
    SET tags = lwc.tags_value,
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

COMMENT ON FUNCTION public.sync_tags_from_latest_webhook(interval) IS
  'Sincroniza contatos.tags a partir do webhook mais recente de cada contato dentro da janela. Depende de idx_webhooks_ghl_created_at para o filtro de tempo.';

-- A versão em dias passa a delegar — mesma lógica, um lugar só.
CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(p_days_back integer DEFAULT 7)
RETURNS TABLE(updated_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.sync_tags_from_latest_webhook((p_days_back || ' days')::interval);
$function$;
