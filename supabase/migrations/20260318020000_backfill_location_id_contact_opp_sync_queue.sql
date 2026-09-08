-- Migration: Backfill de location_id para registros existentes (otimizado)
--
-- Preenche location_id em registros que já estavam na fila
-- Usa CTE com window function para evitar timeout

WITH webhook_locations AS (
  -- Pega o webhook mais recente de CADA contact_id com ContactCreate
  SELECT DISTINCT ON (payload->>'contact_id')
    payload->>'contact_id' as contact_id,
    COALESCE(
      payload->'location'->>'id',
      payload->>'locationId'
    ) as location_id
  FROM webhooks_ghl
  WHERE payload->>'type' IN ('ContactCreate', 'contact.created')
    AND (payload->'location'->>'id' IS NOT NULL OR payload->>'locationId' IS NOT NULL)
  ORDER BY payload->>'contact_id', created_at DESC
)
UPDATE contact_opp_sync_queue coq
SET location_id = wl.location_id
FROM webhook_locations wl
WHERE coq.location_id IS NULL
  AND coq.ghl_contact_id = wl.contact_id;

-- Verificação
DO $$
DECLARE
  v_still_null INT;
BEGIN
  SELECT COUNT(*) INTO v_still_null
  FROM contact_opp_sync_queue
  WHERE location_id IS NULL;

  RAISE NOTICE 'Backfill concluído. Registros ainda com location_id=NULL: %', v_still_null;
END;
$$;
