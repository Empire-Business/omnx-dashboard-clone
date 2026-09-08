-- ============================================================
-- Migration: Corrigir mismatch de opportunity IDs
--
-- Problema: Oportunidade tem ghl_opportunity_id (formato UUID)
--          mas webhooks têm payload_id (formato GHL)
--
-- Solução: Atualizar ghl_opportunity_id para usar ID GHL correto
-- ============================================================

DO $$
DECLARE
    v_opp_uuid_old text := '73a0bc40-584f-4eed-9e2d-938d2cac7e22';
    v_ghl_id text := 'ezFeX5Cs2pVHqIFfX6eN';
    v_found_id uuid;
BEGIN
    RAISE NOTICE '=== CORRIGINDO OPORTUNIDADE ID ===';

    -- Encontrar a oportunidade pelo antigo UUID
    SELECT id INTO v_found_id
    FROM oportunidades
    WHERE ghl_opportunity_id = v_opp_uuid_old;

    IF v_found_id IS NOT NULL THEN
        RAISE NOTICE 'Oportunidade encontrada: %', v_found_id;

        -- Atualizar para usar o ID GHL correto
        UPDATE oportunidades
        SET ghl_opportunity_id = v_ghl_id
        WHERE id = v_found_id;

        RAISE NOTICE 'Atualizado ghl_opportunity_id: % → %', v_opp_uuid_old, v_ghl_id;

        -- Re-extrair dados do webhook agora que IDs correspondem
        UPDATE oportunidades o
        SET
            valor = COALESCE(
                (w.payload->>'lead_value')::DECIMAL,
                o.valor
            ),
            data_fechado = COALESCE(
                parse_safe_date(
                    extract_custom_field(w.payload->'customData', ARRAY[
                        '{{ opportunity.sqlfechada }}',
                        '{{opportunity.sqlfechada}}',
                        '{{ opportunity.d_sqlfechada }}',
                        '{{opportunity.d_sqlfechada}}'
                    ])
                ),
                o.data_fechado
            ),
            status = COALESCE(
                NULLIF(TRIM(w.payload->>'status'), ''),
                o.status
            ),
            updated_at = NOW()
        FROM webhooks_ghl w
        WHERE TRIM(w.payload->>'id') = v_ghl_id
          AND o.id = v_found_id;

        RAISE NOTICE 'Dados re-extraídos do webhook';

        -- Verificar resultado final
        SELECT
            ghl_opportunity_id,
            COALESCE(valor, 0)::text,
            COALESCE(data_fechado::text, 'NULL'),
            COALESCE(status, 'NULL'),
            pipeline_name
        INTO v_ghl_id, v_opp_uuid_old, v_opp_uuid_old, v_opp_uuid_old, v_opp_uuid_old
        FROM oportunidades
        WHERE id = v_found_id;

        RAISE NOTICE 'Resultado final: ghl_opportunity_id=%, valor=%, data_fechado=%, pipeline=%',
            v_ghl_id, v_opp_uuid_old, v_opp_uuid_old, v_opp_uuid_old;

    ELSE
        RAISE NOTICE '❌ ERRO: Oportunidade não encontrada com ID %', v_opp_uuid_old;
    END IF;

END $$;
