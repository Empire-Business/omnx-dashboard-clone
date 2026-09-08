-- ============================================================
-- Migration: Trigger e Cron para sync-contact-opportunities
--
-- 1. Função enqueue_contact_opp_sync():
--    Dispara quando ContactCreate webhook chega → enfileira contact_id
--
-- 2. Trigger AFTER INSERT em webhooks_ghl:
--    Monitora novos webhooks, chama função se type=ContactCreate
--
-- 3. Cron schedule (a cada 5 minutos):
--    Executa edge function sync-contact-opportunities para processar fila
--
-- Fluxo:
--   ContactCreate webhook → enqueue_contact_opp_sync()
--      ↓ (deduplicação automática — ON CONFLICT DO NOTHING)
--   contact_opp_sync_queue (status=pending)
--      ↓ (cron a cada 5 min)
--   sync-contact-opportunities (edge function)
--      ↓
--   GET /opportunities?contact_id=X (API GHL, paginado)
--      ↓
--   UPSERT em oportunidades (ON CONFLICT ghl_opportunity_id DO UPDATE)
--      ↓
--   queue status → done / error
-- ============================================================

-- ============================================================
-- Função: enqueue_contact_opp_sync
--
-- Dispara quando um novo webhook de ContactCreate chega.
-- Enfileira o contact_id para sincronização posterior de TODAS
-- as oportunidades via API GHL.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_contact_opp_sync()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id TEXT;
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

  -- ON CONFLICT DO NOTHING = deduplicação automática
  -- Se o contato já está em status='pending', não insere novamente
  INSERT INTO contact_opp_sync_queue (ghl_contact_id)
  VALUES (TRIM(v_contact_id))
  ON CONFLICT (ghl_contact_id) WHERE status = 'pending' DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger: tr_enqueue_contact_opp_sync
--
-- AFTER INSERT em webhooks_ghl
-- Chama enqueue_contact_opp_sync() para cada novo webhook
-- ============================================================

DROP TRIGGER IF EXISTS tr_enqueue_contact_opp_sync ON webhooks_ghl;

CREATE TRIGGER tr_enqueue_contact_opp_sync
AFTER INSERT ON webhooks_ghl
FOR EACH ROW
EXECUTE FUNCTION enqueue_contact_opp_sync();

-- ============================================================
-- Função: sync_contact_opportunities_job
--
-- Chama a edge function sync-contact-opportunities via HTTP
-- para processar a fila de contatos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_contact_opportunities_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{"batch_size": 20}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

-- ============================================================
-- Cron: sync-contact-opportunities
--
-- Agenda a cada 5 minutos
-- Processa até 20 contatos por execução (batch_size controlado na edge function)
--
-- Intervalo 5 min = 288 execuções/dia
-- Com 20 contatos/execução = 5760 contatos/dia
-- Importação de 1000 contatos leva ~3 horas com deduplicação automática
-- ============================================================

SELECT cron.unschedule('sync-contact-opportunities')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-contact-opportunities'
);

SELECT cron.schedule(
  'sync-contact-opportunities',
  '*/5 * * * *',
  'SELECT sync_contact_opportunities_job()'
);

-- Verificação
DO $$
BEGIN
  RAISE NOTICE 'Trigger e cron sync-contact-opportunities criados. Agenda: */5 * * * * (a cada 5 minutos)';
END;
$$;
