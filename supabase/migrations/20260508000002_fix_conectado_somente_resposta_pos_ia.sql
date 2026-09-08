-- ============================================================
-- Migration: Corrige trigger de "conectado" — só conta resposta pós-IA
--
-- PROBLEMA:
--   O trigger trg_auto_tag_conectado marcava qualquer mensagem inbound
--   como "conectado", incluindo a primeira mensagem do lead que chega
--   via botão da página (antes de qualquer interação da IA/SDR).
--   Isso inflava artificialmente o funil de conexão.
--
-- REGRA CORRETA:
--   Um lead só é "conectado" quando responde DEPOIS de a IA ou o SDR
--   já ter mandado ao menos uma mensagem outbound para ele.
--   Primeira mensagem do lead (sem outbound prévio) = NÃO conectado.
--
-- IMPLEMENTAÇÃO:
--   Antes de marcar como conectado, verificar se existe ao menos uma
--   mensagem direction='outbound' para o mesmo contato na tabela
--   comunicacoes que seja anterior à mensagem inbound atual.
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

  -- ────────────────────────────────────────────────────────────
  -- NOVA REGRA: só marca como conectado se houve mensagem outbound
  -- prévia da IA/SDR para este contato.
  -- Lead que manda a primeira mensagem no botão da página não conta.
  -- ────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1
      FROM comunicacoes com
     WHERE com.contato_id = NEW.contato_id
       AND com.direction   = 'outbound'
       AND com.id         != NEW.id
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

  -- 3. Monta array de tags para o GHL (inclui todas as tags existentes)
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
'Trigger em comunicacoes: adiciona tag "conectado" (local + GHL API) e preenche
data_conectado nas oportunidades quando um lead responde APÓS a IA/SDR já ter
enviado ao menos uma mensagem outbound.
Leads que mandam a primeira mensagem (sem outbound prévio) NÃO são marcados como conectado.
Regra atualizada em 2026-05-08: exige outbound prévio.';

-- O trigger já existe, a função foi atualizada com CREATE OR REPLACE.
-- DROP/CREATE do trigger não é necessário pois o nome e tabela não mudaram.
