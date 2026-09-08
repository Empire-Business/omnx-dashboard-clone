-- ============================================================
-- Migration: Procurar todos os webhooks de danieltiago107
--
-- Objetivo: Encontrar webhooks associados a esse lead
--           para recuperar dados de valor e data_fechado
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
    v_webhook RECORD;
    v_contact_email text := 'danieltiago107@gmail.com';
BEGIN
    RAISE NOTICE '=== BUSCANDO WEBHOOKS PARA: % ===', v_contact_email;

    -- Contar webhooks que mencionam esse email
    SELECT COUNT(*)
    INTO v_count
    FROM webhooks_ghl w
    WHERE w.payload->>'email' = v_contact_email
       OR w.payload->>'full_name' ILIKE '%' || v_contact_email || '%'
       OR LOWER(w.payload->>'email') = LOWER(v_contact_email);

    RAISE NOTICE 'Total de webhooks com esse email: %', v_count;

    -- Mostrar detalhes dos primeiros 10
    FOR v_webhook IN
        SELECT
            w.id as webhook_id,
            w.created_at,
            w.payload->>'event' as event,
            w.payload->>'email' as email,
            w.payload->>'id' as payload_id,
            w.payload->>'lead_value' as lead_value,
            w.payload->>'status' as status,
            w.payload->>'pipeline_name' as pipeline_name
        FROM webhooks_ghl w
        WHERE w.payload->>'email' = v_contact_email
           OR LOWER(w.payload->>'email') = LOWER(v_contact_email)
        ORDER BY w.created_at DESC
        LIMIT 10
    LOOP
        RAISE NOTICE 'Webhook %: event=%, payload_id=%, lead_value=%, pipeline=%',
            v_webhook.webhook_id, v_webhook.event, v_webhook.payload_id, v_webhook.lead_value, v_webhook.pipeline_name;
    END LOOP;

END $$;
