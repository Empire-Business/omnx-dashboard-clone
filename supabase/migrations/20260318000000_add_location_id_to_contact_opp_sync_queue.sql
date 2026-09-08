-- Migration: Adicionar location_id à tabela contact_opp_sync_queue
--
-- Problema: API GHL exige location_id em GET /opportunities?contact_id=X&location_id=Y
-- Solução: Armazenar location_id junto com ghl_contact_id para que edge function saiba qual location processar

ALTER TABLE public.contact_opp_sync_queue
ADD COLUMN location_id TEXT;

-- Criar índice composto (ghl_contact_id, location_id, status) para deduplicação correta
DROP INDEX IF EXISTS idx_contact_opp_sync_queue_pending;

CREATE UNIQUE INDEX idx_contact_opp_sync_queue_pending
ON public.contact_opp_sync_queue(ghl_contact_id, location_id)
WHERE status = 'pending';

DO $$
BEGIN
  RAISE NOTICE 'Coluna location_id adicionada à contact_opp_sync_queue. Índice atualizado.';
END;
$$;
