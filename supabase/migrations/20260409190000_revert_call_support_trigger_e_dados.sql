-- ============================================================
-- Migration: revert do suporte a ligações na tag "conectado"
--
-- CONTEXTO:
--   A migration 20260409170000 estendeu o trigger para ligações atendidas
--   e a migration 20260409180000 marcou 499 contatos retroativamente.
--   O usuário optou por manter o critério apenas em mensagens inbound.
--
-- O QUE ESTE SCRIPT FAZ:
--   Parte A: Reverte função do trigger para aceitar só direction='inbound'
--   Parte B: Remove tag "conectado" e data_conectado dos 499 contatos que
--            receberam a tag APENAS por ligação (sem mensagem inbound)
--             — cancela jobs pendentes, enfileira PUTs corretivos para
--               os que já foram enviados ao GHL
--   Parte C: Enfileira 1 job GET para descobrir os UUIDs dos custom fields
--            de oportunidade (mqlconectado / d_mqlconectado) no GHL.
--            A migration 20260409210000 usa esse resultado para zerá-los.
-- ============================================================

-- ============================================================
-- PARTE A: Reverte trigger para messages-only
-- ============================================================
CREATE OR REPLACE FUNCTION auto_tag_conectado_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ghl_id    TEXT;
  v_tags      TEXT;
  v_tags_json JSONB;
BEGIN
  -- Saída rápida: só processa mensagens inbound do lead
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT ghl_id, tags
    INTO v_ghl_id, v_tags
    FROM contatos
   WHERE id = NEW.contato_id;

  IF v_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
     WHERE LOWER(TRIM(t.tag)) = 'conectado'
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE contatos
     SET tags = CASE
                  WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                  ELSE tags || ',conectado'
                END
   WHERE id = NEW.contato_id;

  UPDATE oportunidades
     SET data_conectado = NEW.data_comunicacao::DATE
   WHERE contato_id = NEW.contato_id
     AND data_conectado IS NULL
     AND status != 'lost';

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

  INSERT INTO ghl_api_jobs (url, method, body, caller, priority, idempotency_key, context)
  VALUES (
    'https://services.leadconnectorhq.com/contacts/' || v_ghl_id,
    'PUT',
    jsonb_build_object('tags', v_tags_json),
    'auto-tag-conectado',
    3,
    'auto-tag-conectado:' || NEW.contato_id::TEXT,
    jsonb_build_object('contato_id', NEW.contato_id, 'ghl_id', v_ghl_id, 'tag_added', 'conectado')
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_tag_conectado_on_inbound() IS
  'Trigger em comunicacoes: adiciona tag "conectado" (local + GHL API) e preenche '
  'data_conectado quando um lead envia mensagem inbound. Apenas mensagens — ligações excluídas.';


-- ============================================================
-- PARTE B: Revert dos 499 contatos marcados por ligação
-- ============================================================
DO $$
DECLARE
  v_rec              RECORD;
  v_current_tags     TEXT;
  v_tags_json        JSONB;
  v_reverted_count   INT := 0;
  v_cancelled_count  INT := 0;
  v_corrective_count INT := 0;
BEGIN

  FOR v_rec IN
    SELECT DISTINCT ON (j.idempotency_key)
      (j.context->>'contato_id')::UUID AS contato_id,
      j.context->>'ghl_id'             AS ghl_id,
      j.context->>'first_call'         AS first_call,
      j.status
    FROM ghl_api_jobs j
    JOIN contatos c ON c.id = (j.context->>'contato_id')::UUID
    WHERE j.caller = 'auto-tag-conectado-backfill-calls'
      -- Só reverte quem NÃO tem mensagem inbound (esses foram marcados SÓ por ligação)
      AND NOT EXISTS (
        SELECT 1 FROM comunicacoes com
        WHERE com.contato_id = (j.context->>'contato_id')::UUID
          AND com.direction = 'inbound'
          AND com.data_comunicacao >= '2026-03-01'
      )
      -- Confirmação: contato ainda tem a tag (idempotência)
      AND EXISTS (
        SELECT 1
        FROM UNNEST(string_to_array(COALESCE(c.tags, ''), ',')) AS t(tag)
        WHERE LOWER(TRIM(t.tag)) = 'conectado'
      )
    ORDER BY j.idempotency_key, j.id DESC
  LOOP

    -- 1. Remove "conectado" das tags locais
    UPDATE contatos
       SET tags = NULLIF(
                    array_to_string(
                      ARRAY(
                        SELECT TRIM(t)
                          FROM UNNEST(string_to_array(tags, ',')) AS t(t)
                         WHERE LOWER(TRIM(t)) != 'conectado'
                           AND TRIM(t) != ''
                      ), ','
                    ), ''
                  )
     WHERE id = v_rec.contato_id;

    -- 2. Zera data_conectado apenas onde bate com a data que o backfill inseriu
    IF v_rec.first_call IS NOT NULL THEN
      UPDATE oportunidades
         SET data_conectado = NULL
       WHERE contato_id    = v_rec.contato_id
         AND data_conectado = v_rec.first_call::DATE
         AND status        != 'lost';
    END IF;

    v_reverted_count := v_reverted_count + 1;

    -- 3. Trata o job GHL conforme seu status atual
    IF v_rec.status IN ('pending', 'processing', 'dead') THEN
      -- PUT ainda não foi (ou não foi com sucesso) ao GHL — cancela
      UPDATE ghl_api_jobs
         SET status = 'dead',
             error  = 'cancelado: revert de tagging por ligação'
       WHERE caller          = 'auto-tag-conectado-backfill-calls'
         AND idempotency_key = 'auto-tag-conectado-backfill-calls:' || v_rec.contato_id::TEXT
         AND status         IN ('pending', 'processing');

      v_cancelled_count := v_cancelled_count + 1;

    ELSIF v_rec.status = 'done' THEN
      -- PUT já chegou ao GHL — enfileira PUT corretivo sem "conectado"

      SELECT tags INTO v_current_tags
        FROM contatos WHERE id = v_rec.contato_id;

      SELECT COALESCE(jsonb_agg(tag ORDER BY tag), '[]'::JSONB)
        INTO v_tags_json
        FROM (
          SELECT LOWER(TRIM(t.tag)) AS tag
            FROM UNNEST(string_to_array(COALESCE(v_current_tags, ''), ',')) AS t(tag)
           WHERE TRIM(t.tag) != ''
        ) sub;

      INSERT INTO ghl_api_jobs (url, method, body, caller, priority, idempotency_key, context)
      VALUES (
        'https://services.leadconnectorhq.com/contacts/' || v_rec.ghl_id,
        'PUT',
        jsonb_build_object('tags', v_tags_json),
        'revert-tag-conectado-calls',
        3,
        'revert-tag-conectado-calls:' || v_rec.contato_id::TEXT,
        jsonb_build_object(
          'contato_id',  v_rec.contato_id,
          'ghl_id',      v_rec.ghl_id,
          'tag_removed', 'conectado'
        )
      )
      ON CONFLICT DO NOTHING;

      v_corrective_count := v_corrective_count + 1;
    END IF;

  END LOOP;

  RAISE NOTICE 'Revert ligações: % tags removidas localmente | % jobs cancelados (GHL não recebeu) | % PUTs corretivos enfileirados (GHL já recebeu)',
               v_reverted_count, v_cancelled_count, v_corrective_count;
END;
$$;


-- ============================================================
-- PARTE C: Enfileira discovery dos field IDs de oportunidade
--
-- Precisamos dos UUIDs de definição dos custom fields "mqlconectado"
-- e "d_mqlconectado" para enviar PUTs que os zeram nas oportunidades.
-- GET /locations/{id}/customFields retorna todos os campos com seus IDs.
-- Location ID fixo do workspace: U8FTcw90CB5QELUnbGUu
-- ============================================================
INSERT INTO ghl_api_jobs (url, method, caller, priority, idempotency_key, context)
VALUES (
  'https://services.leadconnectorhq.com/locations/U8FTcw90CB5QELUnbGUu/customFields?model=opportunity',
  'GET',
  'revert-discover-opp-fields',
  1,  -- urgente: precisa rodar antes da próxima migration
  'revert-discover-opp-fields:mqlconectado:U8FTcw90CB5QELUnbGUu',
  '{"purpose": "discover_mqlconectado_field_ids", "location_id": "U8FTcw90CB5QELUnbGUu"}'::JSONB
)
ON CONFLICT DO NOTHING;
