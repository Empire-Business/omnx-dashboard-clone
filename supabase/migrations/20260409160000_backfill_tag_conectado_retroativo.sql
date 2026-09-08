-- ============================================================
-- Migration: backfill retroativo — tag "conectado" + data_conectado
--
-- ESCOPO:
--   Contatos que enviaram pelo menos uma mensagem inbound desde
--   2026-03-01 e ainda não têm a tag "conectado" nas tags locais.
--
-- O QUE ESTE SCRIPT FAZ (por contato elegível):
--   1. Adiciona "conectado" em contatos.tags
--   2. Preenche oportunidades.data_conectado com a data da PRIMEIRA
--      mensagem inbound recebida (se ainda NULL)
--   3. Enfileira job PUT /contacts/{ghl_id} na ghl_api_jobs (priority=10)
--      para sincronizar a tag ao GHL em background
--
-- NOTAS:
--   • Priority 10 = backfill lento, não compete com jobs urgentes (1-3)
--   • Idempotency key impede jobs duplicados se a migration rodar mais
--     de uma vez
--   • data_conectado só é definido se atualmente NULL (preserva datas manuais)
--   • O worker existente (ghl-api-worker, cron */1 * * * *) processa
--     automaticamente — nenhuma mudança no worker é necessária
-- ============================================================

DO $$
DECLARE
  v_rec           RECORD;
  v_tags_json     JSONB;
  v_first_inbound DATE;
  v_count         INT := 0;
BEGIN

  FOR v_rec IN
    SELECT DISTINCT ON (c.id)
      c.id         AS contato_id,
      c.ghl_id,
      c.tags
    FROM contatos c
    INNER JOIN comunicacoes com ON com.contato_id = c.id
    WHERE com.direction = 'inbound'
      AND com.data_comunicacao >= '2026-03-01'
      AND c.ghl_id IS NOT NULL
      -- Exclui quem já tem a tag (match exato, case-insensitive)
      AND NOT EXISTS (
        SELECT 1
          FROM UNNEST(string_to_array(COALESCE(c.tags, ''), ',')) AS t(tag)
         WHERE LOWER(TRIM(t.tag)) = 'conectado'
      )
  LOOP

    -- --------------------------------------------------------
    -- 1. Atualiza tags localmente
    -- --------------------------------------------------------
    UPDATE contatos
       SET tags = CASE
                    WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                    ELSE tags || ',conectado'
                  END
     WHERE id = v_rec.contato_id;

    -- --------------------------------------------------------
    -- 2. Data da PRIMEIRA mensagem inbound do contato desde março
    -- --------------------------------------------------------
    SELECT MIN(com.data_comunicacao)::DATE
      INTO v_first_inbound
      FROM comunicacoes com
     WHERE com.contato_id = v_rec.contato_id
       AND com.direction   = 'inbound'
       AND com.data_comunicacao >= '2026-03-01';

    -- Preenche data_conectado nas oportunidades sem data
    IF v_first_inbound IS NOT NULL THEN
      UPDATE oportunidades
         SET data_conectado = v_first_inbound
       WHERE contato_id    = v_rec.contato_id
         AND data_conectado IS NULL
         AND status        != 'lost';
    END IF;

    -- --------------------------------------------------------
    -- 3. Monta array completo de tags para o GHL
    -- --------------------------------------------------------
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

    -- --------------------------------------------------------
    -- 4. Enfileira job de backfill (priority 10 = lento)
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
      'https://services.leadconnectorhq.com/contacts/' || v_rec.ghl_id,
      'PUT',
      jsonb_build_object('tags', v_tags_json),
      'auto-tag-conectado-backfill',
      10,
      'auto-tag-conectado-backfill:' || v_rec.contato_id::TEXT,
      jsonb_build_object(
        'contato_id',     v_rec.contato_id,
        'ghl_id',         v_rec.ghl_id,
        'tag_added',      'conectado',
        'first_inbound',  v_first_inbound::TEXT
      )
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill "conectado" concluído: % contatos atualizados e % jobs enfileirados',
               v_count, v_count;
END;
$$;
