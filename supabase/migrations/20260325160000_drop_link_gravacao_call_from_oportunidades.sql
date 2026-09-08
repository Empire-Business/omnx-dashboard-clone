-- Migration: Remover coluna link_gravacao_call de oportunidades
--
-- MOTIVO: O link de gravação da call de vendas já existe em
-- vendas_fechamento.link_gravacao_call_vendas (migration 20260325140000),
-- onde é extraído automaticamente via trigger.
-- Manter em dois lugares criaria risco de dessincronização.
-- A coluna em oportunidades nunca foi populada (trigger não implementado).

ALTER TABLE oportunidades
  DROP COLUMN IF EXISTS link_gravacao_call;
