-- ============================================================
-- Migration: Corrige trigger "conectado" — usa data_comunicacao real
--
-- PROBLEMA:
--   Webhooks do GHL chegam fora de ordem. O bot SDR IA responde (outbound)
--   antes do webhook do botão do lead (inbound) chegar ao banco.
--   O trigger checava "existe outbound?" sem comparar timestamps →
--   o botão do lead marcava conectado mesmo o outbound sendo posterior.
--
-- REGRA CORRETA:
--   Conectado = existe outbound com data_comunicacao < data_comunicacao
--   do inbound atual. Dois fluxos válidos:
--
--   Flow 1 (botão): inbound_botão(T1) → outbound_bot(T2) → inbound_reply(T3)
--     Trigger em inbound_reply(T3): outbound em T2 < T3 → CONECTADO ✓
--     Trigger em inbound_botão(T1): nenhum outbound antes de T1 → NÃO ✓
--
--   Flow 2 (proativo): outbound_proativo(T1) → inbound_reply(T2)
--     Trigger em inbound_reply(T2): outbound em T1 < T2 → CONECTADO ✓
--
-- FIX: adicionar AND com.data_comunicacao < NEW.data_comunicacao
-- ============================================================

CREATE OR REPLACE FUNCTION auto_tag_conectado_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ghl_id    TEXT;
  v_tags      TEXT;
  v_tags_json JSONB;
BEGIN
  -- Saída rápida: só processa mensagens inbound
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  -- Só conecta se existe outbound com timestamp ANTERIOR ao desta mensagem.
  -- Isso resolve o webhook fora de ordem: o botão do lead (inbound T1)
  -- chega após o outbound do bot (T2 > T1), mas data_comunicacao do botão
  -- é T1 < T2, então nenhum outbound é "antes" de T1 → não conecta.
  IF NOT EXISTS (
    SELECT 1
      FROM comunicacoes com
     WHERE com.contato_id       = NEW.contato_id
       AND com.direction        = 'outbound'
       AND com.data_comunicacao < NEW.data_comunicacao
  ) THEN
    RETURN NEW;
  END IF;

  -- Lê ghl_id e tags atuais do contato
  SELECT ghl_id, tags
    INTO v_ghl_id, v_tags
    FROM contatos
   WHERE id = NEW.contato_id;

  IF v_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já tem a tag → nada a fazer
  IF EXISTS (
    SELECT 1
      FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
     WHERE LOWER(TRIM(t.tag)) = 'conectado'
  ) THEN
    RETURN NEW;
  END IF;

  -- 1. Atualiza contatos.tags localmente
  UPDATE contatos
     SET tags = CASE
                  WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                  ELSE tags || ',conectado'
                END
   WHERE id = NEW.contato_id;

  -- 2. Preenche data_conectado nas oportunidades abertas (se NULL)
  UPDATE oportunidades
     SET data_conectado = NEW.data_comunicacao::DATE
   WHERE contato_id = NEW.contato_id
     AND data_conectado IS NULL
     AND status != 'lost';

  -- 3. Monta array de tags para o GHL
  SELECT jsonb_agg(tag ORDER BY tag)
    INTO v_tags_json
    FROM (
      SELECT LOWER(TRIM(t.tag)) AS tag
        FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
       WHERE TRIM(t.tag) != ''
      UNION
      SELECT 'conectado'
    ) sub;

  IF v_tags_json IS NULL THEN
    v_tags_json := '["conectado"]'::JSONB;
  END IF;

  -- 4. Enfileira PUT no GHL via fila centralizada
  INSERT INTO ghl_api_jobs (
    url, method, body, caller, priority, idempotency_key, context
  )
  VALUES (
    'https://services.leadconnectorhq.com/contacts/' || v_ghl_id,
    'PUT',
    jsonb_build_object('tags', v_tags_json),
    'auto-tag-conectado',
    3,
    'auto-tag-conectado:' || NEW.contato_id::TEXT,
    jsonb_build_object(
      'contato_id', NEW.contato_id,
      'ghl_id',     v_ghl_id,
      'tag_added',  'conectado'
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_tag_conectado_on_inbound() IS
'Trigger em comunicacoes: marca "conectado" quando inbound tem data_comunicacao
posterior a um outbound. Suporta dois fluxos SDR IA:
  Flow 1 (botão): inbound_botão → outbound → inbound_reply → conectado no reply
  Flow 2 (proativo): outbound → inbound_reply → conectado no reply
Webhook fora de ordem não afeta pois usa data_comunicacao real, não insertion order.
Atualizado em 2026-05-11.';
