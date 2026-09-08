-- Migration: Atualizar trigger para extrair location_id
--
-- Modifica enqueue_contact_opp_sync() para extrair location_id do webhook
-- e armazenar junto com ghl_contact_id na fila

DROP TRIGGER IF EXISTS tr_enqueue_contact_opp_sync ON webhooks_ghl;

CREATE OR REPLACE FUNCTION public.enqueue_contact_opp_sync()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id TEXT;
  v_location_id TEXT;
BEGIN
  -- Só processa eventos de criação de contato
  -- Suporta variações: 'ContactCreate', 'contact.created'
  IF NEW.payload->>'type' NOT IN ('ContactCreate', 'contact.created') THEN
    RETURN NEW;
  END IF;

  -- Extrai contact_id — suporta variações de nome de campo
  v_contact_id := COALESCE(
    NEW.payload->>'contact_id',
    NEW.payload->>'contactId',
    NEW.payload->'contact'->>'id'
  );

  -- Valida: contact_id não pode ser vazio
  IF v_contact_id IS NULL OR TRIM(v_contact_id) = '' THEN
    RETURN NEW;
  END IF;

  -- Extrai location_id do webhook — suporta variações
  v_location_id := COALESCE(
    NEW.payload->'location'->>'id',
    NEW.payload->>'locationId',
    NEW.payload->>'location_id'
  );

  -- Valida: location_id é obrigatório
  IF v_location_id IS NULL OR TRIM(v_location_id) = '' THEN
    RAISE WARNING '[enqueue_contact_opp_sync] location_id vazio para contact_id=%', v_contact_id;
    RETURN NEW;
  END IF;

  -- ON CONFLICT DO NOTHING = deduplicação automática
  -- Se o contato+location já está em status='pending', não insere novamente
  INSERT INTO contact_opp_sync_queue (ghl_contact_id, location_id)
  VALUES (TRIM(v_contact_id), TRIM(v_location_id))
  ON CONFLICT (ghl_contact_id, location_id) WHERE status = 'pending' DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar trigger
CREATE TRIGGER tr_enqueue_contact_opp_sync
AFTER INSERT ON webhooks_ghl
FOR EACH ROW
EXECUTE FUNCTION enqueue_contact_opp_sync();

DO $$
BEGIN
  RAISE NOTICE 'Trigger atualizado para extrair location_id do webhook';
END;
$$;
