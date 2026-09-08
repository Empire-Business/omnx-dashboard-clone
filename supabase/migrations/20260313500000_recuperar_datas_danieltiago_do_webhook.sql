-- ============================================================
-- Migration: Recuperar data_fechado e valor de danieltiago107 do webhook
--
-- Problema: Lead tem data_lead_recebido corrigida, mas:
--   - data_fechado = NULL
--   - valor = 0
--
-- Solução: Re-extrair do webhook original
-- ============================================================

DO $$
DECLARE
    v_webhook_id uuid;
    v_ghl_opp_id text := '73a0bc40-584f-4eed-9e2d-938d2cac7e22';
    v_value decimal;
    v_data_fechado timestamptz;
BEGIN
    -- Buscar webhook mais recente para essa oportunidade
    SELECT id
    INTO v_webhook_id
    FROM webhooks_ghl w
    WHERE TRIM(w.payload->>'id') = v_ghl_opp_id
    ORDER BY w.created_at DESC
    LIMIT 1;

    IF v_webhook_id IS NOT NULL THEN
        RAISE NOTICE 'Webhook encontrado: %', v_webhook_id;

        -- Extrair valor e data_fechado do webhook
        SELECT
            COALESCE((w.payload->>'lead_value')::DECIMAL, 0),
            parse_safe_date(
                extract_custom_field(w.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}',
                    '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}',
                    '{{opportunity.d_sqlfechada}}'
                ])
            )
        INTO v_value, v_data_fechado
        FROM webhooks_ghl w
        WHERE w.id = v_webhook_id;

        RAISE NOTICE 'Extraído do webhook: valor = %, data_fechado = %', v_value, v_data_fechado;

        -- Atualizar oportunidade
        UPDATE oportunidades
        SET
            valor = COALESCE(v_value, valor),
            data_fechado = COALESCE(v_data_fechado, data_fechado)
        WHERE ghl_opportunity_id = v_ghl_opp_id;

        RAISE NOTICE 'Oportunidade atualizada';

        -- Verificar resultado
        SELECT valor, data_fechado
        INTO v_value, v_data_fechado
        FROM oportunidades
        WHERE ghl_opportunity_id = v_ghl_opp_id;

        RAISE NOTICE 'Resultado final: valor = %, data_fechado = %', v_value, v_data_fechado;

    ELSE
        RAISE NOTICE '❌ Nenhum webhook encontrado para essa oportunidade';
    END IF;

END $$;
