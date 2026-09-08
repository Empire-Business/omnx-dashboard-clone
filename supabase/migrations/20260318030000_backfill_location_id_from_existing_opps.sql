-- Migration: Preencher location_id NULL com a location padrão (Empire Business)
--
-- Contatos que não têm webhook de ContactCreate têm location_id=NULL.
-- Todos os dados são da Empire Business (U8FTcw90CB5QELUnbGUu),
-- então é seguro usar essa como padrão.

UPDATE contact_opp_sync_queue
SET location_id = 'U8FTcw90CB5QELUnbGUu'
WHERE location_id IS NULL;

-- Verificação
DO $$
DECLARE
  v_count_before INT;
  v_count_after INT;
BEGIN
  SELECT COUNT(*) INTO v_count_after
  FROM contact_opp_sync_queue
  WHERE location_id IS NULL;

  RAISE NOTICE 'Backfill concluído. Registros ainda com location_id=NULL: %', v_count_after;
END;
$$;
