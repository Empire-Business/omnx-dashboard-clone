-- ============================================================
-- Migration: Procurar data_fechado nos campos customizados
-- ============================================================

DO $$
DECLARE
    v_record RECORD;
    v_count INT := 0;
BEGIN
    RAISE NOTICE '=== BUSCANDO data_fechado NOS WEBHOOKS ===';

    -- Procurar em todos os webhooks desse lead
    FOR v_record IN
        SELECT
            w.id as webhook_id,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.sqlfechada }}',
                '{{opportunity.sqlfechada}}',
                '{{ opportunity.d_sqlfechada }}',
                '{{opportunity.d_sqlfechada}}'
            ]) as data_fechado_str,
            parse_safe_date(
                extract_custom_field(w.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}',
                    '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}',
                    '{{opportunity.d_sqlfechada}}'
                ])
            ) as data_fechado_parsed,
            w.payload->>'status' as status,
            w.created_at
        FROM webhooks_ghl w
        WHERE TRIM(w.payload->>'id') = 'ezFeX5Cs2pVHqIFfX6eN'
        ORDER BY w.created_at DESC
        LIMIT 5
    LOOP
        v_count := v_count + 1;
        RAISE NOTICE 'Webhook %: status=%, data_fechado_str=%, data_fechado_parsed=%, created_at=%',
            v_count, v_record.status, v_record.data_fechado_str, v_record.data_fechado_parsed, v_record.created_at;

        IF v_record.data_fechado_parsed IS NOT NULL THEN
            RAISE NOTICE '  ✅ ENCONTRADO: %', v_record.data_fechado_parsed;
        END IF;
    END LOOP;

    -- Se achou, atualizar a oportunidade
    IF v_count > 0 THEN
        UPDATE oportunidades o
        SET data_fechado = (
            SELECT parse_safe_date(
                extract_custom_field(w.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}',
                    '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}',
                    '{{opportunity.d_sqlfechada}}'
                ])
            )
            FROM webhooks_ghl w
            WHERE TRIM(w.payload->>'id') = 'ezFeX5Cs2pVHqIFfX6eN'
              AND parse_safe_date(
                  extract_custom_field(w.payload->'customData', ARRAY[
                      '{{ opportunity.sqlfechada }}',
                      '{{opportunity.sqlfechada}}',
                      '{{ opportunity.d_sqlfechada }}',
                      '{{opportunity.d_sqlfechada}}'
                  ])
              ) IS NOT NULL
            ORDER BY w.created_at DESC
            LIMIT 1
        )
        WHERE ghl_opportunity_id = 'ezFeX5Cs2pVHqIFfX6eN'
          AND data_fechado IS NULL;

        RAISE NOTICE '';
        RAISE NOTICE 'Atualizado data_fechado da oportunidade';

        -- Verificar resultado
        SELECT data_fechado INTO v_record
        FROM oportunidades
        WHERE ghl_opportunity_id = 'ezFeX5Cs2pVHqIFfX6eN';

        RAISE NOTICE 'Resultado: data_fechado = %', v_record.data_fechado;
    ELSE
        RAISE NOTICE 'Nenhum webhook encontrado';
    END IF;

END $$;
