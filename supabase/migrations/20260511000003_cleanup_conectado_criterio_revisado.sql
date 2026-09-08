-- ============================================================
-- Migration: Limpeza histórica "conectado" com critério revisado
--
-- CRITÉRIO (alinhado com o trigger corrigido em 20260511000002):
--   Conectado = existe outbound com data_comunicacao < data_comunicacao
--   de algum inbound do contato.
--
--   Suporta Flow 1 (botão) e Flow 2 (proativo).
--   Não conecta leads onde o único inbound tem timestamp ANTERIOR
--   ao outbound (webhook fora de ordem — padrão SDR IA falso positivo).
-- ============================================================

-- Passo 1: Zerar data_conectado em oportunidades abertas incorretas
UPDATE oportunidades o
SET data_conectado = NULL
WHERE o.status = 'open'
  AND o.data_conectado IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM comunicacoes outb
    WHERE outb.contato_id = o.contato_id
      AND outb.direction  = 'outbound'
      AND EXISTS (
        SELECT 1 FROM comunicacoes inb
        WHERE inb.contato_id       = o.contato_id
          AND inb.direction        = 'inbound'
          AND inb.data_comunicacao > outb.data_comunicacao
      )
  );

-- Passo 2: Identificar contatos cuja tag deve ser removida
CREATE TEMP TABLE _cleanup_v2 AS
SELECT DISTINCT c.id AS contato_id, c.ghl_id
FROM contatos c
WHERE EXISTS (
  SELECT 1
  FROM unnest(string_to_array(COALESCE(c.tags, ''), ',')) t(tag)
  WHERE LOWER(TRIM(t.tag)) = 'conectado'
)
-- Não tem oportunidade com data_conectado (nenhum evento de conexão válido)
AND NOT EXISTS (
  SELECT 1 FROM oportunidades o
  WHERE o.contato_id = c.id AND o.data_conectado IS NOT NULL
)
-- Também não satisfaz o critério real de conexão
AND NOT EXISTS (
  SELECT 1
  FROM comunicacoes outb
  WHERE outb.contato_id = c.id
    AND outb.direction  = 'outbound'
    AND EXISTS (
      SELECT 1 FROM comunicacoes inb
      WHERE inb.contato_id       = c.id
        AND inb.direction        = 'inbound'
        AND inb.data_comunicacao > outb.data_comunicacao
    )
);

-- Passo 3: Remover tag localmente
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
WHERE c.id IN (SELECT contato_id FROM _cleanup_v2);

-- Passo 4: Enfileirar PUT no GHL (lê tags JÁ atualizadas)
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
  'cleanup-conectado-v2',
  2,
  'cleanup-conectado-v2:' || cl.contato_id::TEXT,
  jsonb_build_object('contato_id', cl.contato_id, 'ghl_id', cl.ghl_id, 'tag_removed', 'conectado')
FROM _cleanup_v2 cl
JOIN contatos c ON c.id = cl.contato_id
WHERE cl.ghl_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP TABLE _cleanup_v2;
