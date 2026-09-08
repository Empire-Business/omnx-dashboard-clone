-- ============================================================
-- Migration: Zera data_conectado em oportunidades LOST incorretas
--
-- As migrations anteriores (000001, 000003) corrigiram apenas
-- oportunidades com status='open'. Identificamos 196 oportunidades
-- status='lost' com data_conectado indevido pelo mesmo critério:
-- nenhum inbound com data_comunicacao posterior a um outbound.
--
-- Caso Helcio De Padua (opp 1c47986b): inbound 19:31:02, outbound
-- 19:31:40 — inbound chegou ANTES do outbound (webhook fora de ordem),
-- data_conectado setado incorretamente pelo trigger antigo.
-- ============================================================

UPDATE oportunidades o
SET data_conectado = NULL
WHERE o.status = 'lost'
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
