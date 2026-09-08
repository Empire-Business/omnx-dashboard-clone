-- =============================================================================
-- Fix: sync de conversas GHL parado desde 2026-07-14 (chat dos leads sem sincronizar)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- O workspace real ficou 3 semanas sem receber mensagem nova em `comunicacoes`
-- (ultima: 2026-07-14 12:11). Duas causas encadeadas:
--
--   1. Guard de service_role desatualizado nas functions deployadas em 14/07
--      -> HTTP 401. Corrigido por REDEPLOY (2026-08-04), sem migration.
--
--   2. `sync_ghl_conversations_job()` dispara UMA chamada com body
--      '{"mode":"incremental"}' — sem workspace_id nem location_id. A edge
--      function exige tenant desde a Fase 2 e falha fechado. Esta migration
--      corrige (2), seguindo o mesmo padrao ja usado por `sync_ghl_users_job`
--      (20260808000000) e pelos crons Meta por workspace (20260728000000).
--
-- Tres achados adicionais tratados aqui:
--
--   a) `ghl_conversations_sync_log` nao tem `workspace_id`. O marco temporal do
--      incremental (`getLastIncrementalSyncTime`) filtra so por mode/status:
--      com 2+ workspaces, o primeiro a terminar avanca o relogio do outro, que
--      perde a janela e nunca volta atras (perda permanente de mensagens).
--
--   b) O CHECK de `mode` so aceita 'incremental' e 'full_backfill'. O modo
--      'backfill_by_contact' — usado pelo caminho do webhook de mensagem —
--      VIOLA a constraint, entao o INSERT do log falha e a execucao roda sem
--      registro nenhum. Bug silencioso desde a criacao do modo.
--
--   c) Nao havia como registrar execucao PARCIAL (estourou o orcamento de 120s
--      com janela por ler). Marcada como 'success', ela avancava o marco por
--      cima de dados nao lidos. Agora existe o status 'partial', que o codigo
--      grava nesse caso e que NAO conta como marco (o filtro e status='success').
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tenant no log de sync
-- -----------------------------------------------------------------------------
ALTER TABLE public.ghl_conversations_sync_log
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.ghl_conversations_sync_log.workspace_id IS
  'Tenant da execucao. Nullable de proposito: o log e aberto ANTES de resolver a '
  'credencial, entao falhas de tenant tambem precisam ser registradas. Sem esta '
  'coluna o marco temporal do incremental e global e um workspace avanca o do outro.';

CREATE INDEX IF NOT EXISTS idx_ghl_conv_sync_log_ws_mode_finished
  ON public.ghl_conversations_sync_log (workspace_id, mode, status, finished_at DESC);

-- -----------------------------------------------------------------------------
-- 2. CHECKs: aceitar o modo real e o status parcial
-- -----------------------------------------------------------------------------
ALTER TABLE public.ghl_conversations_sync_log
  DROP CONSTRAINT IF EXISTS ghl_conversations_sync_log_mode_check;

ALTER TABLE public.ghl_conversations_sync_log
  ADD CONSTRAINT ghl_conversations_sync_log_mode_check
  CHECK (mode = ANY (ARRAY['incremental', 'full_backfill', 'backfill_by_contact']));

ALTER TABLE public.ghl_conversations_sync_log
  DROP CONSTRAINT IF EXISTS ghl_conversations_sync_log_status_check;

ALTER TABLE public.ghl_conversations_sync_log
  ADD CONSTRAINT ghl_conversations_sync_log_status_check
  CHECK (status = ANY (ARRAY['running', 'success', 'error', 'partial']));

-- -----------------------------------------------------------------------------
-- 3. Cron por workspace
-- -----------------------------------------------------------------------------
-- Uma chamada POR WORKSPACE com credencial GHL ativa, em vez de uma chamada sem
-- dono. O JOIN com ghl_integration_settings (is_active) evita disparar contra
-- tenant desligado — o de demonstracao, por exemplo, tem is_active = false.
CREATE OR REPLACE FUNCTION public.sync_ghl_conversations_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_ws          RECORD;
  v_request_id  BIGINT;
  v_count       INTEGER := 0;
  v_ids         TEXT := '';
BEGIN
  FOR v_ws IN
    SELECT DISTINCT c.workspace_id, s.ghl_location_id
    FROM public.workspace_integration_credentials c
    JOIN public.ghl_integration_settings s
      ON s.workspace_id = c.workspace_id
    WHERE c.provider = 'ghl'
      AND c.workspace_id IS NOT NULL
      AND s.is_active = true
      AND s.ghl_location_id IS NOT NULL
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'workspace_id', v_ws.workspace_id,
        'location_id',  v_ws.ghl_location_id,
        'mode',         'incremental'
      ),
      -- O handler tem orcamento interno de 120s; o default do pg_net (5s)
      -- descartaria a resposta antes do fim e o log ficaria preso em 'running'.
      timeout_milliseconds := 150000
    ) INTO v_request_id;

    v_count := v_count + 1;
    v_ids   := v_ids || v_ws.workspace_id::text || '=' || COALESCE(v_request_id::text, 'null') || '; ';
  END LOOP;

  IF v_count = 0 THEN
    RETURN 'sync_ghl_conversations_job: nenhum workspace com credencial ghl ativa (no-op).';
  END IF;

  RETURN 'sync_ghl_conversations_job: workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.sync_ghl_conversations_job() IS
  'Cron sync-ghl-conversations: dispara UMA vez por workspace com credencial '
  'provider=ghl e ghl_integration_settings.is_active. Corrigido em 2026-08-04 — '
  'antes disparava 1x com body {"mode":"incremental"} sem tenant, e a function '
  'exige workspace_id desde a Fase 2 (fail-closed). Ver docs/COMUNICACOES-GHL-SYNC.md.';

-- Mesma politica das demais funcoes internas (20260921000000): so o cron chama.
REVOKE ALL ON FUNCTION public.sync_ghl_conversations_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_ghl_conversations_job() FROM anon;
REVOKE ALL ON FUNCTION public.sync_ghl_conversations_job() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ghl_conversations_job() TO service_role;
