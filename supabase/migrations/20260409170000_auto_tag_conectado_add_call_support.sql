-- ============================================================
-- Migration: estende trigger "conectado" para ligações atendidas
--
-- ANTES:  só disparava para direction = 'inbound' (mensagens do lead)
-- AGORA:  dispara também para ligações com phone_call_status = 'completed'
--         (cobre: lead ligou pra gente OU SDR ligou e lead atendeu)
--
-- phone_call_status = 'completed' é o único valor que indica
-- que a ligação foi efetivamente atendida. Os demais valores
-- (no-answer, failed, busy, canceled) indicam chamadas não atendidas.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_tag_conectado_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ghl_id    TEXT;
  v_tags      TEXT;
  v_tags_json JSONB;
BEGIN
  -- Saída rápida: só processa:
  --   (1) mensagens inbound do lead, OU
  --   (2) ligações atendidas (channel=call, status=completed) — qualquer direção
  IF NOT (
    NEW.direction = 'inbound'
    OR (NEW.channel = 'call' AND NEW.phone_call_status = 'completed')
  ) THEN
    RETURN NEW;
  END IF;

  -- Lê ghl_id e tags atuais do contato
  SELECT ghl_id, tags
    INTO v_ghl_id, v_tags
    FROM contatos
   WHERE id = NEW.contato_id;

  -- Sem contato ou sem ghl_id → nada a fazer
  IF v_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica se "conectado" já está presente (match exato, case-insensitive)
  -- Usa UNNEST para não confundir com substrings como "mqlconectado"
  IF EXISTS (
    SELECT 1
      FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
     WHERE LOWER(TRIM(t.tag)) = 'conectado'
  ) THEN
    RETURN NEW;
  END IF;

  -- --------------------------------------------------------
  -- 1. Atualiza contatos.tags localmente (efeito imediato)
  -- --------------------------------------------------------
  UPDATE contatos
     SET tags = CASE
                  WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                  ELSE tags || ',conectado'
                END
   WHERE id = NEW.contato_id;

  -- --------------------------------------------------------
  -- 2. Preenche data_conectado nas oportunidades abertas (se NULL)
  -- --------------------------------------------------------
  UPDATE oportunidades
     SET data_conectado = NEW.data_comunicacao::DATE
   WHERE contato_id = NEW.contato_id
     AND data_conectado IS NULL
     AND status != 'lost';

  -- --------------------------------------------------------
  -- 3. Monta o array de tags para o GHL (todas as atuais + "conectado")
  -- --------------------------------------------------------
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

  -- --------------------------------------------------------
  -- 4. Enfileira job PUT no GHL via fila centralizada
  -- --------------------------------------------------------
  INSERT INTO ghl_api_jobs (
    url,
    method,
    body,
    caller,
    priority,
    idempotency_key,
    context
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
  'Trigger em comunicacoes: adiciona tag "conectado" (local + GHL API) e preenche '
  'data_conectado nas oportunidades quando um lead envia mensagem inbound OU '
  'uma ligação é atendida (phone_call_status = completed).';
