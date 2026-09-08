-- ============================================================
-- Migration: zera custom fields mqlconectado/d_mqlconectado nas opps GHL
--
-- PRÉ-REQUISITO:
--   A migration 20260409190000 deve ter rodado E o worker deve ter
--   processado o job 'revert-discover-opp-fields' (status = 'done').
--   Se ainda não processou, esta migration falha com aviso claro.
--
-- O QUE FAZ:
--   1. Lê o resultado do GET /locations/.../customFields
--   2. Extrai os field definition IDs para mqlconectado e d_mqlconectado
--   3. Para cada oportunidade dos 499 contatos, enfileira
--      PUT /opportunities/{id} zerando esses campos no GHL
-- ============================================================

DO $$
DECLARE
  v_discovery_result  JSONB;
  v_id_mqlconectado   TEXT;
  v_id_d_mqlconectado TEXT;
  v_field             JSONB;
  v_field_key         TEXT;
  v_rec               RECORD;
  v_opp_count         INT := 0;
  v_enqueued_count    INT := 0;
BEGIN

  -- --------------------------------------------------------
  -- 1. Lê o resultado do job de discovery
  -- --------------------------------------------------------
  SELECT result INTO v_discovery_result
    FROM ghl_api_jobs
   WHERE caller = 'revert-discover-opp-fields'
     AND status = 'done'
   ORDER BY processed_at DESC
   LIMIT 1;

  IF v_discovery_result IS NULL THEN
    RAISE EXCEPTION
      'Job de discovery ainda não processado. Aguarde o worker (cron */1 * * * *) '
      'executar o job "revert-discover-opp-fields" e rode esta migration novamente.';
  END IF;

  -- --------------------------------------------------------
  -- 2. Extrai os IDs dos campos mqlconectado e d_mqlconectado
  --    O resultado pode vir como result.customFields[] ou result[]
  -- --------------------------------------------------------
  FOR v_field IN
    SELECT jsonb_array_elements(
      CASE
        WHEN v_discovery_result ? 'customFields' THEN v_discovery_result->'customFields'
        ELSE v_discovery_result
      END
    )
  LOOP
    -- fieldKey pode ser "opportunity.mqlconectado" ou só "mqlconectado"
    v_field_key := LOWER(COALESCE(
      v_field->>'fieldKey',
      v_field->>'key',
      v_field->>'name',
      ''
    ));

    IF v_field_key LIKE '%d_mqlconectado%' OR v_field_key LIKE '%d mql%' THEN
      v_id_d_mqlconectado := v_field->>'id';
    ELSIF v_field_key LIKE '%mqlconectado%' OR v_field_key LIKE '%mql-conectado%' OR v_field_key LIKE '%mqlconectado%' THEN
      v_id_mqlconectado := v_field->>'id';
    END IF;
  END LOOP;

  IF v_id_mqlconectado IS NULL AND v_id_d_mqlconectado IS NULL THEN
    RAISE EXCEPTION
      'Nenhum field ID encontrado para mqlconectado/d_mqlconectado. '
      'Verifique o resultado do job em: '
      'SELECT result FROM ghl_api_jobs WHERE caller = ''revert-discover-opp-fields'' ORDER BY processed_at DESC LIMIT 1;';
  END IF;

  RAISE NOTICE 'Field IDs encontrados — mqlconectado: % | d_mqlconectado: %',
               COALESCE(v_id_mqlconectado, 'não encontrado'),
               COALESCE(v_id_d_mqlconectado, 'não encontrado');

  -- --------------------------------------------------------
  -- 3. Para cada oportunidade dos contatos revertidos,
  --    enfileira PUT para zerar os campos no GHL
  -- --------------------------------------------------------
  FOR v_rec IN
    SELECT DISTINCT
      o.ghl_opportunity_id,
      (j.context->>'contato_id')::UUID AS contato_id
    FROM ghl_api_jobs j
    JOIN oportunidades o ON o.contato_id = (j.context->>'contato_id')::UUID
    WHERE j.caller = 'auto-tag-conectado-backfill-calls'
      AND o.ghl_opportunity_id IS NOT NULL
      -- Só para opps cujo data_conectado foi zerado (confirma que foram revertidas)
      AND o.data_conectado IS NULL
      AND o.status != 'lost'
      -- Sem mensagem inbound (os contatos que devem ser revertidos)
      AND NOT EXISTS (
        SELECT 1 FROM comunicacoes com
        WHERE com.contato_id = (j.context->>'contato_id')::UUID
          AND com.direction = 'inbound'
          AND com.data_comunicacao >= '2026-03-01'
      )
  LOOP
    v_opp_count := v_opp_count + 1;

    -- Monta customFields apenas com os IDs que foram encontrados
    DECLARE
      v_custom_fields JSONB := '[]'::JSONB;
    BEGIN
      IF v_id_mqlconectado IS NOT NULL THEN
        v_custom_fields := v_custom_fields || jsonb_build_array(
          jsonb_build_object('id', v_id_mqlconectado, 'field_value', '')
        );
      END IF;
      IF v_id_d_mqlconectado IS NOT NULL THEN
        v_custom_fields := v_custom_fields || jsonb_build_array(
          jsonb_build_object('id', v_id_d_mqlconectado, 'field_value', '')
        );
      END IF;

      INSERT INTO ghl_api_jobs (url, method, body, caller, priority, idempotency_key, context)
      VALUES (
        'https://services.leadconnectorhq.com/opportunities/' || v_rec.ghl_opportunity_id,
        'PUT',
        jsonb_build_object('customFields', v_custom_fields),
        'revert-opp-fields-conectado',
        3,
        'revert-opp-fields-conectado:' || v_rec.ghl_opportunity_id,
        jsonb_build_object(
          'contato_id',          v_rec.contato_id,
          'ghl_opportunity_id',  v_rec.ghl_opportunity_id
        )
      )
      ON CONFLICT DO NOTHING;

      v_enqueued_count := v_enqueued_count + 1;
    END;
  END LOOP;

  -- Marca job de discovery como handled
  UPDATE ghl_api_jobs
     SET handled_at = NOW()
   WHERE caller = 'revert-discover-opp-fields'
     AND status = 'done'
     AND handled_at IS NULL;

  RAISE NOTICE 'Oportunidades encontradas: % | PUTs enfileirados: %',
               v_opp_count, v_enqueued_count;

END;
$$;
