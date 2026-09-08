-- =============================================================================
-- BACKFILL DAS CONVERSAS GHL — buraco de 2026-07-14 12:11 ate 2026-08-04
-- =============================================================================
--
-- POR QUE ISTO EXISTE
-- -------------------
-- A edge function `sync-ghl-conversations` ficou parada de 14/07 a 04/08
-- (guard de service_role desatualizado -> 401, e cron sem tenant no body).
-- Ja foi corrigida e o incremental voltou a rodar a cada 10 minutos.
--
-- MAS o incremental NAO fecha o buraco sozinho. Motivo:
--   - o cursor do incremental e o `lastMessageDate` da CONVERSA;
--   - na primeira execucao pos-correcao nao havia cursor gravado, entao ele
--     comecou em `agora - 1 dia` (04/08 ~16h BRT) e so anda PARA FRENTE;
--   - toda conversa cuja ultima mensagem e anterior a esse ponto (ou seja,
--     praticamente todo o periodo 14/07 -> 03/08) nunca mais sera visitada.
--
-- Portanto: o incremental cuida do "de hoje em diante"; este arquivo cuida do
-- passado. Os dois podem rodar juntos — o upsert e ON CONFLICT (ghl_message_id),
-- ou seja, idempotente: reprocessar a mesma mensagem nao duplica nada.
--
-- ALVO
-- ----
--   workspace_id : 7909d02a-4d15-46ea-a7b8-5debeb6e8351   ("Default", cliente real)
--   location GHL : U8FTcw90CB5QELUnbGUu
--   contatos     : 11.758 (todos com ghl_id preenchido)
--
-- COMO USAR ESTE ARQUIVO
-- ----------------------
-- Ele NAO deve ser executado de ponta a ponta de uma vez. E dividido em passos
-- numerados; rode um passo por vez, na ordem, lendo o comentario de cada um:
--
--   PASSO 1 — medir o "antes"          (so SELECT, seguro)
--   PASSO 2 — criar tabela de controle + funcao de disparo  (DDL)
--   PASSO 3 — teste manual de 1 disparo (valida antes de automatizar)
--   PASSO 4 — agendar o cron TEMPORARIO (o backfill passa a andar sozinho)
--   PASSO 5 — acompanhar o progresso    (so SELECT)
--   PASSO 6 — DESAGENDAR ao terminar    (OBRIGATORIO — nao esquecer)
--   PASSO 7 — medir o "depois" e conferir buracos
--   PASSO 8 — (opcional) limpar os objetos temporarios
--   ANEXO A — lote prioritario por contactId (opcional, ver secao)
--
-- =============================================================================


-- =============================================================================
-- PASSO 1 — MEDICAO DO "ANTES"
-- =============================================================================
-- Rode ANTES de disparar qualquer coisa e GUARDE o resultado. E com ele que
-- voce vai provar, no PASSO 7, que o backfill trouxe mensagem nova.
-- =============================================================================

-- 1.1 Panorama geral do workspace
SELECT
  (SELECT COUNT(*) FROM contatos
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
       AND ghl_id IS NOT NULL)                                   AS contatos_com_ghl_id,
  (SELECT COUNT(DISTINCT c.id)
     FROM contatos c
     JOIN oportunidades o ON o.contato_id = c.id
    WHERE c.workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
      AND c.ghl_id IS NOT NULL
      AND o.data_lead_recebido >= '2026-05-01T00:00:00-03:00')   AS contatos_prioritarios,
  (SELECT COUNT(*) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351') AS msgs_total,
  (SELECT COUNT(*) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
       AND data_comunicacao >= '2026-07-14T00:00:00-03:00'
       AND data_comunicacao <  '2026-08-05T00:00:00-03:00')       AS msgs_no_buraco,
  (SELECT COUNT(DISTINCT ghl_conversation_id) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351') AS conversas_conhecidas;

-- 1.2 Mensagens por dia no periodo do buraco (a "curva" que queremos preencher).
--     Guarde esta tabela — o PASSO 7 repete a mesma query para comparar.
SELECT
  (data_comunicacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  COUNT(*)                                AS msgs,
  COUNT(DISTINCT ghl_conversation_id)     AS convs
FROM comunicacoes
WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND data_comunicacao >= '2026-07-10T00:00:00-03:00'
  AND data_comunicacao <  '2026-08-05T00:00:00-03:00'
GROUP BY 1
ORDER BY 1;

-- 1.3 Saude do incremental que acabou de voltar (para nao confundir com o backfill)
SELECT workspace_id, mode, status,
       COUNT(*)                                       AS execucoes,
       SUM(messages_upserted)                         AS msgs_upsertadas,
       MAX(started_at)                                AS ultima_execucao,
       to_timestamp(MAX(cursor_last_message_date)/1000)
         AT TIME ZONE 'America/Sao_Paulo'             AS cursor_mais_recente_brt
FROM ghl_conversations_sync_log
WHERE started_at > now() - interval '24 hours'
GROUP BY 1, 2, 3
ORDER BY ultima_execucao DESC;


-- =============================================================================
-- PASSO 2 — TABELA DE CONTROLE + FUNCAO DE DISPARO
-- =============================================================================
--
-- O PROBLEMA DO OFFSET (leia antes de rodar)
-- ------------------------------------------
-- A edge function no modo `backfill_by_contact` recebe um `offset` e processa
-- `batch_size` contatos a partir dali, devolvendo `next_offset` no corpo da
-- resposta HTTP. So que quem dispara e o `net.http_post`, que e ASSINCRONO:
-- ele devolve na hora um `request_id` (BIGINT) e a resposta so cai depois na
-- tabela `net._http_response`.
--
-- Ou seja: nao da para "ler o next_offset e continuar" dentro do mesmo disparo.
-- A solucao mais simples que funciona sem supervisao e uma TABELA DE CONTROLE
-- com o offset atual. A cada tick do cron a funcao:
--
--   1. le a linha de controle (offset atual + id do disparo anterior);
--   2. procura em `net._http_response` a resposta do disparo ANTERIOR:
--        - achou e veio `next_offset`  -> usa esse valor (verdade absoluta);
--        - achou e veio `has_more=false` -> marca como CONCLUIDO e para;
--        - nao achou (timeout/perda)   -> avanca "as cegas" offset + batch_size;
--   3. grava o novo offset e dispara a proxima chamada;
--   4. registra tudo em `backfill_conversas_log` para auditoria depois.
--
-- O avanco "as cegas" e o unico caminho que pode PULAR contatos (se a chamada
-- anterior tiver sido truncada pelo deadline de 90s da function). Por isso:
--   - o `batch_size` e propositalmente pequeno (75), para caber folgado nos 90s;
--   - o PASSO 7 tem uma query que detecta exatamente esses saltos, e a correcao
--     e simplesmente redisparar aquele offset a mao.
-- =============================================================================

-- 2.1 Tabela de controle (uma linha por lote de backfill)
CREATE TABLE IF NOT EXISTS public.backfill_conversas_controle (
  id                  TEXT PRIMARY KEY,          -- nome do lote, ex: 'default-2026-08-04'
  workspace_id        UUID        NOT NULL,
  location_id         TEXT        NOT NULL,
  offset_atual        INTEGER     NOT NULL DEFAULT 0,
  batch_size          INTEGER     NOT NULL DEFAULT 75,
  total_contatos      INTEGER,                   -- preenchido pela 1a resposta da function
  ultimo_request_id   BIGINT,                    -- id do net.http_post do tick anterior
  disparos            INTEGER     NOT NULL DEFAULT 0,
  ativo               BOOLEAN     NOT NULL DEFAULT true,   -- false = para de disparar
  concluido_em        TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.backfill_conversas_controle IS
  'TEMPORARIA. Cursor do backfill de conversas GHL (buraco 14/07-04/08/2026). '
  'Pode ser dropada apos a conclusao — ver PASSO 8 de scripts/sql/backfill-conversas-2026-08-04.sql.';

-- Sem RLS-bypass acidental: e tabela de operacao, nao de dado de cliente.
ALTER TABLE public.backfill_conversas_controle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backfill_conversas_controle FROM anon, authenticated;

-- 2.2 Log de auditoria de cada disparo (e o que permite achar buracos depois)
CREATE TABLE IF NOT EXISTS public.backfill_conversas_log (
  id                BIGSERIAL PRIMARY KEY,
  lote_id           TEXT        NOT NULL,
  offset_enviado    INTEGER     NOT NULL,
  batch_size        INTEGER     NOT NULL,
  request_id        BIGINT,
  -- Preenchidos no tick SEGUINTE, quando a resposta ja caiu em net._http_response
  status_code       INTEGER,
  next_offset_lido  INTEGER,
  contatos_proc     INTEGER,
  msgs_upsertadas   INTEGER,
  has_more          BOOLEAN,
  erro              TEXT,
  disparado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backfill_conversas_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backfill_conversas_log FROM anon, authenticated;

-- 2.3 Semear o lote do workspace Default.
--     ON CONFLICT DO NOTHING = rodar de novo nao reseta o progresso.
INSERT INTO public.backfill_conversas_controle
  (id, workspace_id, location_id, offset_atual, batch_size, ativo)
VALUES
  ('default-2026-08-04',
   '7909d02a-4d15-46ea-a7b8-5debeb6e8351',
   'U8FTcw90CB5QELUnbGUu',
   0,
   75,
   true)
ON CONFLICT (id) DO NOTHING;

-- 2.4 A funcao de disparo.
--     Mesmo padrao das funcoes de cron ja existentes no repo
--     (20260808000000_fix_cron_caller_service_role.sql e
--      20261013000000_fix_sync_ghl_conversations_tenant.sql):
--       - SECURITY DEFINER + search_path fixo;
--       - URL e token via get_secret('supabase_url') / get_secret('service_role_key');
--       - Authorization: Bearer <service_role> (a function tem guard de service_role);
--       - timeout_milliseconds folgado (a function tem deadline interno de 90s).
CREATE OR REPLACE FUNCTION public.backfill_conversas_tick(p_lote TEXT DEFAULT 'default-2026-08-04')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ctl         public.backfill_conversas_controle%ROWTYPE;
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_resp        RECORD;
  v_body        JSONB;
  v_next        INTEGER;
  v_request_id  BIGINT;
BEGIN
  -- Lock de linha: se um tick ainda estiver rodando, o proximo nao duplica o disparo.
  SELECT * INTO v_ctl
  FROM public.backfill_conversas_controle
  WHERE id = p_lote
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN 'backfill_conversas_tick: lote ' || p_lote || ' inexistente ou travado (no-op).';
  END IF;

  IF NOT v_ctl.ativo THEN
    RETURN 'backfill_conversas_tick: lote ' || p_lote || ' inativo/concluido (no-op).';
  END IF;

  -- ---------------------------------------------------------------------------
  -- (a) Conciliar o disparo ANTERIOR: le a resposta que ja caiu em net._http_response
  -- ---------------------------------------------------------------------------
  IF v_ctl.ultimo_request_id IS NOT NULL THEN
    SELECT status_code, content, error_msg
      INTO v_resp
    FROM net._http_response
    WHERE id = v_ctl.ultimo_request_id;

    IF FOUND THEN
      BEGIN
        v_body := v_resp.content::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_body := NULL;   -- resposta nao-JSON (erro de plataforma, HTML de gateway)
      END;

      UPDATE public.backfill_conversas_log
         SET status_code      = v_resp.status_code,
             next_offset_lido = NULLIF(v_body->>'next_offset', '')::INTEGER,
             contatos_proc    = NULLIF(v_body->>'contacts_processed', '')::INTEGER,
             msgs_upsertadas  = NULLIF(v_body->>'messages_upserted', '')::INTEGER,
             has_more         = NULLIF(v_body->>'has_more', '')::BOOLEAN,
             erro             = COALESCE(v_resp.error_msg, v_body->>'error')
       WHERE request_id = v_ctl.ultimo_request_id;

      -- Total de contatos: a function devolve o count exato; guardamos para o %.
      IF (v_body->>'total_contacts') IS NOT NULL THEN
        v_ctl.total_contatos := (v_body->>'total_contacts')::INTEGER;
      END IF;

      -- FIM DE VERDADE: a function disse que nao ha mais contatos.
      IF v_body IS NOT NULL
         AND v_resp.status_code = 200
         AND COALESCE((v_body->>'has_more')::BOOLEAN, false) = false
         AND (v_body->>'contacts_processed') IS NOT NULL
      THEN
        UPDATE public.backfill_conversas_controle
           SET ativo = false,
               concluido_em = now(),
               total_contatos = COALESCE(v_ctl.total_contatos, total_contatos),
               atualizado_em = now()
         WHERE id = p_lote;
        RETURN 'backfill_conversas_tick: lote ' || p_lote || ' CONCLUIDO em offset '
               || v_ctl.offset_atual || '. Desagende o cron (PASSO 6).';
      END IF;

      -- Fonte de verdade do avanco: o next_offset devolvido pela function.
      v_next := NULLIF(v_body->>'next_offset', '')::INTEGER;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- (b) Definir o offset deste disparo
  -- ---------------------------------------------------------------------------
  IF v_next IS NOT NULL AND v_next > v_ctl.offset_atual THEN
    -- Caminho normal e correto.
    v_ctl.offset_atual := v_next;
  ELSIF v_ctl.disparos > 0 THEN
    -- Resposta perdida/timeout: avanca as cegas. So e seguro porque batch_size
    -- cabe folgado nos 90s da function; ainda assim o PASSO 7 checa saltos.
    v_ctl.offset_atual := v_ctl.offset_atual + v_ctl.batch_size;
  END IF;
  -- (primeiro disparo: mantem offset_atual = 0)

  -- Trava de seguranca: nunca ultrapassar o total conhecido.
  IF v_ctl.total_contatos IS NOT NULL AND v_ctl.offset_atual >= v_ctl.total_contatos THEN
    UPDATE public.backfill_conversas_controle
       SET ativo = false, concluido_em = now(), atualizado_em = now()
     WHERE id = p_lote;
    RETURN 'backfill_conversas_tick: offset ' || v_ctl.offset_atual
           || ' >= total ' || v_ctl.total_contatos || ' — CONCLUIDO. Desagende o cron.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- (c) Disparar
  -- ---------------------------------------------------------------------------
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'workspace_id', v_ctl.workspace_id,
      'location_id',  v_ctl.location_id,
      'mode',         'backfill_by_contact',
      'offset',       v_ctl.offset_atual,
      'batch_size',   v_ctl.batch_size
    ),
    -- A function tem deadline interno de 90s e ainda fecha o log depois.
    -- O default do pg_net (5s) descartaria a resposta e o offset andaria cego.
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  INSERT INTO public.backfill_conversas_log (lote_id, offset_enviado, batch_size, request_id)
  VALUES (p_lote, v_ctl.offset_atual, v_ctl.batch_size, v_request_id);

  UPDATE public.backfill_conversas_controle
     SET offset_atual      = v_ctl.offset_atual,
         ultimo_request_id = v_request_id,
         total_contatos    = COALESCE(v_ctl.total_contatos, total_contatos),
         disparos          = disparos + 1,
         atualizado_em     = now()
   WHERE id = p_lote;

  RETURN 'backfill_conversas_tick: lote ' || p_lote || ' offset=' || v_ctl.offset_atual
         || ' batch=' || v_ctl.batch_size || ' request_id=' || COALESCE(v_request_id::TEXT, 'null');
END;
$function$;

COMMENT ON FUNCTION public.backfill_conversas_tick(TEXT) IS
  'TEMPORARIA. Um tick do backfill de conversas GHL: concilia a resposta do disparo '
  'anterior (net._http_response), avanca o offset e dispara o proximo lote de '
  'backfill_by_contact. Ver scripts/sql/backfill-conversas-2026-08-04.sql.';

-- Mesma politica das demais funcoes internas: so o cron (service_role) chama.
REVOKE ALL ON FUNCTION public.backfill_conversas_tick(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_conversas_tick(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_conversas_tick(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_conversas_tick(TEXT) TO service_role;


-- =============================================================================
-- PASSO 3 — TESTE MANUAL DE UM DISPARO (antes de automatizar)
-- =============================================================================
-- Objetivo: provar que a chamada chega na edge function (nao volta 401) e que a
-- resposta traz `total_contacts` proximo de 11.758. So depois disso agende o cron.
-- =============================================================================

-- 3.1 Dispara o primeiro lote (offset 0)
SELECT public.backfill_conversas_tick('default-2026-08-04');

-- 3.2 ESPERE ~2 MINUTOS e leia a resposta. Esperado:
--       status_code = 200
--       content com "contacts_processed": 75, "has_more": true,
--                   "next_offset": 75, "total_contacts": 11758
--     Se vier 401 -> o guard de service_role rejeitou (chave errada em get_secret).
--     Se vier 500 -> leia a mensagem: normalmente credencial GHL do workspace.
SELECT l.offset_enviado, l.request_id, r.status_code, r.error_msg,
       left(r.content, 600) AS resposta
FROM public.backfill_conversas_log l
LEFT JOIN net._http_response r ON r.id = l.request_id
WHERE l.lote_id = 'default-2026-08-04'
ORDER BY l.id DESC
LIMIT 3;

-- 3.3 Confirme que entrou mensagem nova no banco por causa DESTE disparo
SELECT COUNT(*) AS linhas_criadas_ultimos_10min
FROM comunicacoes
WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND created_at > now() - interval '10 minutes';


-- =============================================================================
-- PASSO 4 — AGENDAR O CRON TEMPORARIO
-- =============================================================================
--
-- ESCOLHA DOS MINUTOS (isto NAO e arbitrario)
-- -------------------------------------------
-- O limite da API GHL (100 requisicoes / 10 s) e COMPARTILHADO por todos os
-- syncs deste mesmo workspace. Os minutos abaixo evitam de proposito:
--   :00,:10,:20,...  -> sync-ghl-conversations-incremental (roda ate 90s, e o mais pesado)
--   :01,:11,:21,...  -> cauda do incremental + sync-contact-attribution
--   :02,:12,:22,...  -> sync-opp-dates
--   :04,:14,:24,...  -> sync-opp-pipelines
--   :06,:16,:26,...  -> sync-opp-sdr
--   :08,:18,:28,...  -> sync-appointment-dates
--
-- Sobram 24 janelas por hora, espacadas de 2 minutos — folga suficiente para o
-- lote de 90s terminar antes do proximo tick.
-- =============================================================================

SELECT cron.schedule(
  'backfill-conversas-temp',
  '3,5,7,9,13,15,17,19,23,25,27,29,33,35,37,39,43,45,47,49,53,55,57,59 * * * *',
  $$SELECT public.backfill_conversas_tick('default-2026-08-04');$$
);

-- Confirme que entrou:
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'backfill-conversas-temp';


-- =============================================================================
-- PASSO 5 — ACOMPANHAMENTO (rode de hora em hora; so SELECT)
-- =============================================================================

-- 5.1 Onde o backfill esta
SELECT id, offset_atual, total_contatos,
       ROUND(100.0 * offset_atual / NULLIF(total_contatos, 0), 1) AS pct,
       disparos, ativo, concluido_em, atualizado_em
FROM public.backfill_conversas_controle
WHERE id = 'default-2026-08-04';

-- 5.2 Ultimos disparos, com o que a function devolveu
SELECT offset_enviado, status_code, contatos_proc, msgs_upsertadas,
       next_offset_lido, has_more, left(COALESCE(erro,''), 120) AS erro, disparado_em
FROM public.backfill_conversas_log
WHERE lote_id = 'default-2026-08-04'
ORDER BY id DESC
LIMIT 20;

-- 5.3 O que esta efetivamente entrando no banco (linhas NOVAS por hora)
SELECT date_trunc('hour', created_at) AS hora, COUNT(*) AS linhas_novas
FROM comunicacoes
WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND created_at > now() - interval '12 hours'
GROUP BY 1 ORDER BY 1;

-- 5.4 ALARME DE RATE LIMIT: o incremental esta sofrendo por causa do backfill?
--     Se aparecerem varios 'error' ou muitos 'partial' seguidos com
--     messages_upserted = 0, o teto da GHL esta sendo estourado -> ver criterio
--     de PARADA no fim do arquivo.
SELECT mode, status, COUNT(*) AS n, SUM(messages_upserted) AS upserted,
       MAX(started_at) AS ultimo
FROM ghl_conversations_sync_log
WHERE started_at > now() - interval '2 hours'
  AND workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
GROUP BY 1, 2
ORDER BY 1, 2;


-- =============================================================================
-- PASSO 6 — DESAGENDAR (OBRIGATORIO ao terminar)
-- =============================================================================
-- A funcao vira no-op sozinha quando o lote conclui (ativo = false), mas o cron
-- continuaria acordando 24x por hora a toa. Desagende assim que o PASSO 5.1
-- mostrar `ativo = false` (ou se voce decidir abortar).
-- =============================================================================

SELECT cron.unschedule('backfill-conversas-temp');

-- Parada de emergencia SEM mexer no cron (util no meio da madrugada):
--   UPDATE public.backfill_conversas_controle SET ativo = false WHERE id = 'default-2026-08-04';
-- Para retomar depois:
--   UPDATE public.backfill_conversas_controle SET ativo = true  WHERE id = 'default-2026-08-04';


-- =============================================================================
-- PASSO 7 — VERIFICACAO DO "DEPOIS"
-- =============================================================================

-- 7.1 Mesmo panorama do PASSO 1.1 — compare os numeros lado a lado
SELECT
  (SELECT COUNT(*) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351')  AS msgs_total,
  (SELECT COUNT(*) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
       AND data_comunicacao >= '2026-07-14T00:00:00-03:00'
       AND data_comunicacao <  '2026-08-05T00:00:00-03:00')        AS msgs_no_buraco,
  (SELECT COUNT(DISTINCT ghl_conversation_id) FROM comunicacoes
     WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351')  AS conversas_conhecidas;

-- 7.2 Curva dia a dia depois do backfill (compare com o PASSO 1.2)
SELECT
  (data_comunicacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  COUNT(*)                            AS msgs,
  COUNT(DISTINCT ghl_conversation_id) AS convs
FROM comunicacoes
WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND data_comunicacao >= '2026-07-10T00:00:00-03:00'
  AND data_comunicacao <  '2026-08-05T00:00:00-03:00'
GROUP BY 1 ORDER BY 1;

-- 7.3 CHECAGEM DE BURACO NO OFFSET (o unico risco real do avanco "as cegas").
--     Lista offsets consecutivos cujo salto foi MAIOR que o batch_size —
--     ou seja, faixas de contatos que podem ter ficado sem visita.
WITH seq AS (
  SELECT offset_enviado, batch_size,
         LEAD(offset_enviado) OVER (ORDER BY offset_enviado) AS proximo
  FROM public.backfill_conversas_log
  WHERE lote_id = 'default-2026-08-04'
)
SELECT offset_enviado AS faixa_inicio,
       proximo        AS proxima_faixa,
       proximo - offset_enviado AS salto,
       batch_size
FROM seq
WHERE proximo IS NOT NULL
  AND proximo - offset_enviado > batch_size
ORDER BY offset_enviado;
-- Se retornar linhas, redispare cada faixa a mao, por exemplo:
--   SELECT net.http_post(
--     url := get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations',
--     headers := jsonb_build_object('Content-Type','application/json',
--                'Authorization','Bearer ' || get_secret('service_role_key')),
--     body := jsonb_build_object('workspace_id','7909d02a-4d15-46ea-a7b8-5debeb6e8351',
--             'location_id','U8FTcw90CB5QELUnbGUu','mode','backfill_by_contact',
--             'offset', <faixa_inicio>, 'batch_size', 75),
--     timeout_milliseconds := 120000);

-- 7.4 Disparos que falharam (status != 200) — devem ser redisparados igual acima
SELECT offset_enviado, status_code, left(COALESCE(erro,''), 200) AS erro, disparado_em
FROM public.backfill_conversas_log
WHERE lote_id = 'default-2026-08-04'
  AND (status_code IS DISTINCT FROM 200 OR erro IS NOT NULL)
ORDER BY offset_enviado;

-- 7.5 Prova de isolamento: nenhuma mensagem nova caiu em outro workspace
SELECT workspace_id, COUNT(*) AS linhas_criadas_no_backfill
FROM comunicacoes
WHERE created_at > (SELECT criado_em FROM public.backfill_conversas_controle
                    WHERE id = 'default-2026-08-04')
GROUP BY 1;
-- Esperado: so o 7909d02a-... (o incremental do outro workspace pode aparecer
-- com numeros pequenos — o que NAO pode e volume alto num tenant que nao e o alvo).


-- =============================================================================
-- PASSO 8 — LIMPEZA (opcional, depois de tudo conferido)
-- =============================================================================
-- Guarde o log por alguns dias antes de dropar: e a unica evidencia do que foi
-- visitado. Quando nao precisar mais:
--
-- DROP FUNCTION IF EXISTS public.backfill_conversas_tick(TEXT);
-- DROP TABLE    IF EXISTS public.backfill_conversas_log;
-- DROP TABLE    IF EXISTS public.backfill_conversas_controle;


-- =============================================================================
-- ANEXO A — LOTE PRIORITARIO POR contactId (OPCIONAL)
-- =============================================================================
--
-- QUANDO USAR: o PASSO 4 varre os 11.758 contatos em ordem de `ghl_id` — ordem
-- essencialmente aleatoria em relacao a "quem e lead recente". Se voce quer que
-- os 2.871 contatos com oportunidade a partir de 01/05/2026 apareçam certos
-- JA NAS PRIMEIRAS HORAS, rode este anexo ANTES do PASSO 4.
--
-- CUIDADO: nao rode o Anexo A e o PASSO 4 ao mesmo tempo. Os dois consomem a
-- MESMA cota da GHL; juntos, estouram o teto e ambos entram em backoff (fica
-- mais lento do que rodar um de cada vez, alem de prejudicar o incremental).
--
-- CUSTO/BENEFICIO HONESTO: o Anexo A leva ~6h para 2.871 contatos e o PASSO 4
-- leva ~6h para os 11.758 (que INCLUEM esses 2.871). Ou seja, fazer os dois
-- custa ~12h. Se voce nao precisa da priorizacao, pule este anexo.
-- =============================================================================

-- A.1 Fila dos contatos prioritarios
CREATE TABLE IF NOT EXISTS public.backfill_conversas_fila (
  ghl_id       TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'pendente',  -- pendente | disparado
  request_id   BIGINT,
  disparado_em TIMESTAMPTZ
);
ALTER TABLE public.backfill_conversas_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backfill_conversas_fila FROM anon, authenticated;

-- A.2 Semear com os contatos que tem oportunidade a partir de 2026-05-01
INSERT INTO public.backfill_conversas_fila (ghl_id)
SELECT DISTINCT c.ghl_id
FROM contatos c
JOIN oportunidades o ON o.contato_id = c.id
WHERE c.workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND c.ghl_id IS NOT NULL
  AND o.data_lead_recebido >= '2026-05-01T00:00:00-03:00'
ON CONFLICT (ghl_id) DO NOTHING;

SELECT COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
       COUNT(*)                                    AS total
FROM public.backfill_conversas_fila;

-- A.3 Tick do lote prioritario: dispara N contatos por vez.
--     N = 20 por tick e a dose calibrada: cada chamada individual gasta ~2 a 3
--     requisicoes na GHL, entao 20 chamadas simultaneas = ~50 req num intervalo
--     de poucos segundos — dentro do teto de 100/10s, com margem para os outros
--     syncs. Aumentar N acelera, mas encosta no limite.
CREATE OR REPLACE FUNCTION public.backfill_conversas_fila_tick(p_qtd INTEGER DEFAULT 20)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_row         RECORD;
  v_request_id  BIGINT;
  v_n           INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT ghl_id
    FROM public.backfill_conversas_fila
    WHERE status = 'pendente'
    ORDER BY ghl_id
    LIMIT p_qtd
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'workspace_id', '7909d02a-4d15-46ea-a7b8-5debeb6e8351',
        'location_id',  'U8FTcw90CB5QELUnbGUu',
        'mode',         'backfill_by_contact',
        'contactId',    v_row.ghl_id
      ),
      timeout_milliseconds := 60000   -- 1 contato e rapido; nao precisa de 120s
    ) INTO v_request_id;

    UPDATE public.backfill_conversas_fila
       SET status = 'disparado', request_id = v_request_id, disparado_em = now()
     WHERE ghl_id = v_row.ghl_id;

    v_n := v_n + 1;
  END LOOP;

  RETURN 'backfill_conversas_fila_tick: ' || v_n || ' contatos disparados.';
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_conversas_fila_tick(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_conversas_fila_tick(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_conversas_fila_tick(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_conversas_fila_tick(INTEGER) TO service_role;

-- A.4 Agendar (mesmas janelas seguras do PASSO 4)
-- SELECT cron.schedule(
--   'backfill-conversas-fila-temp',
--   '3,5,7,9,13,15,17,19,23,25,27,29,33,35,37,39,43,45,47,49,53,55,57,59 * * * *',
--   $$SELECT public.backfill_conversas_fila_tick(20);$$
-- );

-- A.5 Acompanhar
-- SELECT status, COUNT(*) FROM public.backfill_conversas_fila GROUP BY 1;

-- A.6 Desagendar (quando pendentes = 0) e limpar
-- SELECT cron.unschedule('backfill-conversas-fila-temp');
-- DROP FUNCTION IF EXISTS public.backfill_conversas_fila_tick(INTEGER);
-- DROP TABLE    IF EXISTS public.backfill_conversas_fila;


-- =============================================================================
-- CRITERIOS OBJETIVOS
-- =============================================================================
--
-- "BACKFILL CONCLUIDO" — os QUATRO precisam ser verdade:
--   1. backfill_conversas_controle.ativo = false E concluido_em preenchido,
--      com offset_atual >= total_contatos (~11.758);
--   2. a query 7.3 (buraco de offset) retorna ZERO linhas;
--   3. a query 7.4 (disparos com falha) retorna ZERO linhas;
--   4. a curva 7.2 nao tem mais dias de 2 a 5 mensagens entre 15/07 e 03/08 —
--      esses eram os dias "vazios" do buraco. Referencia de volume: os dias
--      sadios de julho ficam entre 90 e 1.000 mensagens/dia.
--   (Meta de volume: msgs_no_buraco sai de 1.974 e deve chegar na casa das
--    dezenas de milhares. Se subir menos de ~5.000, algo esta errado — investigue
--    antes de dar por encerrado.)
--
-- "DEU ERRADO, PARAR" — qualquer UM destes:
--   a. tres disparos consecutivos com status_code != 200 na query 5.2
--      (401 = guard/credencial; 500 = credencial GHL do workspace);
--   b. o incremental (query 5.4) passa a acumular 'error', ou fica em 'partial'
--      com messages_upserted = 0 por mais de 30 minutos — sinal de que o teto da
--      GHL esta estourado e o backfill esta prejudicando a operacao do dia;
--   c. a query 5.3 mostra zero linha nova por mais de 1 hora com o cron ativo e
--      offset avancando (backfill "rodando a toa" — provavelmente offset furado);
--   d. aparece volume alto de linhas novas em workspace_id que NAO seja o
--      7909d02a-... na query 7.5 (vazamento entre tenants — para IMEDIATAMENTE).
--
--   Parada: UPDATE public.backfill_conversas_controle SET ativo = false
--           WHERE id = 'default-2026-08-04';   e depois PASSO 6.
-- =============================================================================
