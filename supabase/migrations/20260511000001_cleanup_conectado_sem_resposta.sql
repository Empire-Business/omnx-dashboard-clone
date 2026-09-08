-- ============================================================
-- Migration: Remove "conectado" de leads que nunca responderam
--            após mensagem da IA/SDR (comportamento antigo do trigger)
--
-- PROBLEMA:
--   O trigger antigo marcava qualquer mensagem inbound como "conectado",
--   incluindo a primeira mensagem do botão — antes de qualquer resposta
--   da IA/SDR. Não existe stage "Conectado" em nenhum pipeline, então
--   data_conectado só pode ter sido setado por esse trigger.
--
-- CRITÉRIO: lead só é "conectado" quando tem ao menos uma mensagem
--   inbound POSTERIOR a uma mensagem outbound da IA/SDR.
--
-- EFEITOS:
--   1. Remove tag "conectado" de contatos.tags (+ enfileira PUT no GHL)
--   2. Zera data_conectado em oportunidades ABERTAS sem inbound pós-outbound
--   Won/lost não são tocados — dados históricos fechados.
-- ============================================================

-- ── Passo 1: Contatos com tag "conectado" mas sem resposta real ──

CREATE TEMP TABLE _cleanup_tag AS
SELECT DISTINCT c.id AS contato_id, c.ghl_id, c.tags AS tags_atual
FROM contatos c
WHERE EXISTS (
  SELECT 1
  FROM unnest(string_to_array(COALESCE(c.tags, ''), ',')) t(tag)
  WHERE LOWER(TRIM(t.tag)) = 'conectado'
)
AND NOT EXISTS (
  SELECT 1
  FROM comunicacoes inb
  WHERE inb.contato_id = c.id
    AND inb.direction = 'inbound'
    AND EXISTS (
      SELECT 1 FROM comunicacoes outb
      WHERE outb.contato_id = c.id
        AND outb.direction = 'outbound'
        AND outb.data_comunicacao < inb.data_comunicacao
    )
);

-- Remove tag localmente
UPDATE contatos c
SET tags = NULLIF(
  TRIM(BOTH ',' FROM
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        COALESCE(c.tags, ''),
        '(^|,)\s*conectado\s*($|,)', '\1\2', 'gi'
      ),
      ',{2,}', ',', 'g'
    )
  ), ''
)
WHERE c.id IN (SELECT contato_id FROM _cleanup_tag);

-- Enfileira PUT no GHL para remover a tag também no CRM
INSERT INTO ghl_api_jobs (url, method, body, caller, priority, idempotency_key, context)
SELECT
  'https://services.leadconnectorhq.com/contacts/' || cl.ghl_id,
  'PUT',
  jsonb_build_object(
    'tags',
    COALESCE(
      (
        SELECT jsonb_agg(LOWER(TRIM(t.tag)) ORDER BY LOWER(TRIM(t.tag)))
        FROM unnest(string_to_array(COALESCE(c.tags, ''), ',')) t(tag)
        WHERE TRIM(t.tag) != ''
      ),
      '[]'::jsonb
    )
  ),
  'cleanup-conectado-migration',
  2,
  'cleanup-conectado:' || cl.contato_id::TEXT,
  jsonb_build_object('contato_id', cl.contato_id, 'ghl_id', cl.ghl_id, 'tag_removed', 'conectado')
FROM _cleanup_tag cl
JOIN contatos c ON c.id = cl.contato_id
WHERE cl.ghl_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP TABLE _cleanup_tag;

-- ── Passo 2: Oportunidades abertas com data_conectado indevido ──
-- Cobre casos onde data_conectado foi setado mas a tag não existe
-- (ou foi removida do GHL) — e não há inbound posterior a outbound.

UPDATE oportunidades o
SET data_conectado = NULL
WHERE o.status = 'open'
  AND o.data_conectado IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM comunicacoes inb
    WHERE inb.contato_id = o.contato_id
      AND inb.direction = 'inbound'
      AND EXISTS (
        SELECT 1 FROM comunicacoes outb
        WHERE outb.contato_id = o.contato_id
          AND outb.direction = 'outbound'
          AND outb.data_comunicacao < inb.data_comunicacao
      )
  );
