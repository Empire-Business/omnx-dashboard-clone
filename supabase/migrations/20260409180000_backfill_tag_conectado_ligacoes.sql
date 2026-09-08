-- ============================================================
-- Migration: backfill retroativo — tag "conectado" via ligações atendidas
--
-- ESCOPO:
--   Contatos que tiveram ao menos uma ligação com
--   phone_call_status = 'completed' desde 2026-03-01
--   e ainda não têm a tag "conectado".
--
--   Complementa o backfill de mensagens (migration 20260409160000).
-- ============================================================

DO $$
DECLARE
  v_rec           RECORD;
  v_tags_json     JSONB;
  v_first_call    DATE;
  v_count         INT := 0;
BEGIN

  FOR v_rec IN
    SELECT DISTINCT ON (c.id)
      c.id      AS contato_id,
      c.ghl_id,
      c.tags
    FROM contatos c
    INNER JOIN comunicacoes com ON com.contato_id = c.id
    WHERE com.channel             = 'call'
      AND com.phone_call_status   = 'completed'
      AND com.data_comunicacao   >= '2026-03-01'
      AND c.ghl_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM UNNEST(string_to_array(COALESCE(c.tags, ''), ',')) AS t(tag)
         WHERE LOWER(TRIM(t.tag)) = 'conectado'
      )
  LOOP

    -- 1. Atualiza tags localmente
    UPDATE contatos
       SET tags = CASE
                    WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                    ELSE tags || ',conectado'
                  END
     WHERE id = v_rec.contato_id;

    -- 2. Data da primeira ligação atendida (para data_conectado)
    SELECT MIN(com.data_comunicacao)::DATE
      INTO v_first_call
      FROM comunicacoes com
     WHERE com.contato_id          = v_rec.contato_id
       AND com.channel             = 'call'
       AND com.phone_call_status   = 'completed'
       AND com.data_comunicacao   >= '2026-03-01';

    IF v_first_call IS NOT NULL THEN
      UPDATE oportunidades
         SET data_conectado = v_first_call
       WHERE contato_id    = v_rec.contato_id
         AND data_conectado IS NULL
         AND status        != 'lost';
    END IF;

    -- 3. Monta array completo de tags para o GHL
    SELECT jsonb_agg(tag ORDER BY tag)
      INTO v_tags_json
      FROM (
        SELECT LOWER(TRIM(t.tag)) AS tag
          FROM UNNEST(string_to_array(COALESCE(v_rec.tags, ''), ',')) AS t(tag)
         WHERE TRIM(t.tag) != ''
        UNION
        SELECT 'conectado'
      ) sub;

    IF v_tags_json IS NULL THEN
      v_tags_json := '["conectado"]'::JSONB;
    END IF;

    -- 4. Enfileira job (priority 10 = backfill lento)
    INSERT INTO ghl_api_jobs (
      url, method, body, caller, priority, idempotency_key, context
    )
    VALUES (
      'https://services.leadconnectorhq.com/contacts/' || v_rec.ghl_id,
      'PUT',
      jsonb_build_object('tags', v_tags_json),
      'auto-tag-conectado-backfill-calls',
      10,
      'auto-tag-conectado-backfill-calls:' || v_rec.contato_id::TEXT,
      jsonb_build_object(
        'contato_id',   v_rec.contato_id,
        'ghl_id',       v_rec.ghl_id,
        'tag_added',    'conectado',
        'first_call',   v_first_call::TEXT
      )
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill ligações "conectado": % contatos atualizados e % jobs enfileirados',
               v_count, v_count;
END;
$$;
