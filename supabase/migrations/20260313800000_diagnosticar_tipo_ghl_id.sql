-- ============================================================
-- Migration: Diagnosticar tipo e valor real de ghl_opportunity_id
-- ============================================================

DO $$
DECLARE
    v_record RECORD;
BEGIN
    RAISE NOTICE '=== DIAGNÓSTICO FINAL ===';

    -- Mostrar registro para esse contato
    FOR v_record IN
        SELECT
            c.email,
            o.id as opp_db_id,
            o.ghl_opportunity_id,
            o.ghl_opportunity_id::text as opp_as_text,
            pg_typeof(o.ghl_opportunity_id) as opp_type,
            o.pipeline_name,
            o.valor,
            o.data_lead_recebido,
            o.data_fechado
        FROM contatos c
        LEFT JOIN oportunidades o ON c.id = o.contato_id
        WHERE c.email = 'danieltiago107@gmail.com'
    LOOP
        RAISE NOTICE 'Email: %', v_record.email;
        RAISE NOTICE '  Opp DB ID: %', v_record.opp_db_id;
        RAISE NOTICE '  ghl_opportunity_id: % (type: %)', v_record.ghl_opportunity_id, v_record.opp_type;
        RAISE NOTICE '  Pipeline: %', v_record.pipeline_name;
        RAISE NOTICE '  Valor: %, Data Lead: %, Data Fechado: %', v_record.valor, v_record.data_lead_recebido, v_record.data_fechado;
    END LOOP;

    -- Buscar webhooks com esse ID
    RAISE NOTICE '';
    RAISE NOTICE '=== WEBHOOKS COM ESSE EMAIL ===';
    FOR v_record IN
        SELECT DISTINCT
            TRIM(w.payload->>'id') as payload_id,
            COUNT(*) as count
        FROM webhooks_ghl w
        WHERE LOWER(w.payload->>'email') = LOWER('danieltiago107@gmail.com')
        GROUP BY TRIM(w.payload->>'id')
    LOOP
        RAISE NOTICE 'Webhook payload_id: % (count: %)', v_record.payload_id, v_record.count;
    END LOOP;

END $$;
