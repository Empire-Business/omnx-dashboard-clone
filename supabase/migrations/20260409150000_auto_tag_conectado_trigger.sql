-- ============================================================
-- Migration: trigger automático de tag "conectado" em comunicacoes
--
-- PROBLEMA:
--   SDRs precisam adicionar manualmente a tag "conectado" no GHL
--   quando um lead responde. Quando esquecem:
--     1. A tag não aparece no contato no GHL
--     2. oportunidades.data_conectado fica NULL
--     3. Leaderboard SDR e funil de cohort contam zero para o lead
--
-- SOLUÇÃO:
--   Trigger AFTER INSERT em comunicacoes:
--   • Detecta mensagens inbound de contatos sem a tag "conectado"
--   • Atualiza contatos.tags localmente de imediato
--   • Preenche oportunidades.data_conectado (se NULL) com a data da mensagem
--   • Enfileira job PUT /contacts/{id} na ghl_api_jobs para sincronizar a tag ao GHL
--
-- NOTAS TÉCNICAS:
--   • Verifica tag com UNNEST + LOWER/TRIM para não confundir com "mqlconectado"
--   • O PUT no GHL envia array completo de tags (GHL substitui, não acumula)
--   • Idempotency key evita jobs duplicados quando chegam múltiplas mensagens
--     do mesmo contato antes do worker processar
--   • data_conectado só é definido se atualmente NULL (preserva datas manuais)
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
  --    Usa a data da mensagem inbound como marco de "conectado"
  -- --------------------------------------------------------
  UPDATE oportunidades
     SET data_conectado = NEW.data_comunicacao::DATE
   WHERE contato_id = NEW.contato_id
     AND data_conectado IS NULL
     AND status != 'lost';

  -- --------------------------------------------------------
  -- 3. Monta o array de tags para o GHL (todas as tags atuais + "conectado")
  --    GHL substitui tags por completo — deve incluir as existentes
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

  -- Garante pelo menos ["conectado"] se v_tags era NULL/vazio
  IF v_tags_json IS NULL THEN
    v_tags_json := '["conectado"]'::JSONB;
  END IF;

  -- --------------------------------------------------------
  -- 4. Enfileira job PUT no GHL via fila centralizada
  --    Priority 3 = entre urgente (2) e normal (5)
  --    Idempotency key garante um job por contato na fila ativa
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
  ON CONFLICT DO NOTHING;  -- partial index: status IN ('pending','processing')

  RETURN NEW;
END;
$$;

-- ============================================================
-- Cria o trigger na tabela comunicacoes
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_tag_conectado ON comunicacoes;

CREATE TRIGGER trg_auto_tag_conectado
  AFTER INSERT ON comunicacoes
  FOR EACH ROW
  EXECUTE FUNCTION auto_tag_conectado_on_inbound();

-- ============================================================
-- Comentário explicativo nas funções
-- ============================================================
COMMENT ON FUNCTION auto_tag_conectado_on_inbound() IS
  'Trigger em comunicacoes: adiciona tag "conectado" (local + GHL API) e preenche '
  'data_conectado nas oportunidades quando um lead envia a primeira mensagem inbound.';
