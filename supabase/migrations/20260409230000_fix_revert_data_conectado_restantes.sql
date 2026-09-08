-- ============================================================
-- Migration: zera data_conectado nos contatos do call-backfill
--            que o revert anterior não conseguiu zerar
--
-- PROBLEMA:
--   A migration 20260409190000 zerava data_conectado apenas onde
--   data_conectado = first_call::DATE. Mas ~140 contatos tinham
--   data_conectado setado pelo webhook GHL (campo customizado
--   mqlconectado extraído por extrair_dados_ghl), com uma data
--   diferente da ligação → revert não bateu → campo ficou setado.
--   Resultado: contatos aparecem como "conectado" no painel mesmo
--   com a tag já removida do GHL.
--
-- O QUE FAZ:
--   1. Zera data_conectado para todos os contatos do call-backfill
--      sem mensagem inbound que ainda têm o campo preenchido
--   2. Enfileira PUT /opportunities/{id} para zerar mqlconectado
--      e d_mqlconectado no GHL (pulando os 28 já enviados)
-- ============================================================

DO $$
DECLARE
  v_rec         RECORD;
  v_zeroed      INT := 0;
  v_rows        INT;
  v_enqueued    INT := 0;

  -- Field IDs descobertos pela migration 20260409210000
  v_id_mqlconectado   CONSTANT TEXT := 'k0FoGd5CUKeMGQdBss3c';
  v_id_d_mqlconectado CONSTANT TEXT := 'nSWDnawzbrezk77T9EyF';

  v_custom_fields JSONB := jsonb_build_array(
    jsonb_build_object('id', 'k0FoGd5CUKeMGQdBss3c', 'field_value', ''),
    jsonb_build_object('id', 'nSWDnawzbrezk77T9EyF', 'field_value', '')
  );
BEGIN

  -- --------------------------------------------------------
  -- 1. Zera data_conectado no banco para os contatos restantes
  --    (os que não foram zerados pelo revert anterior porque a
  --    data veio do webhook GHL, não da ligação)
  -- --------------------------------------------------------
  FOR v_rec IN
    SELECT DISTINCT (j.context->>'contato_id')::UUID AS contato_id
    FROM ghl_api_jobs j
    WHERE j.caller = 'auto-tag-conectado-backfill-calls'
      AND NOT EXISTS (
        SELECT 1 FROM comunicacoes com
        WHERE com.contato_id = (j.context->>'contato_id')::UUID
          AND com.direction  = 'inbound'
          AND com.data_comunicacao >= '2026-03-01'
      )
  LOOP
    UPDATE oportunidades
       SET data_conectado = NULL
     WHERE contato_id     = v_rec.contato_id
       AND data_conectado IS NOT NULL   -- pega apenas os que sobraram
       AND status         != 'lost';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_zeroed := v_zeroed + v_rows;
  END LOOP;

  -- --------------------------------------------------------
  -- 2. Enfileira PUT /opportunities/{id} para zerar os campos
  --    customizados mqlconectado e d_mqlconectado no GHL,
  --    apenas para as opps que ainda não receberam esse PUT
  -- --------------------------------------------------------
  FOR v_rec IN
    SELECT DISTINCT
      o.ghl_opportunity_id,
      (j.context->>'contato_id')::UUID AS contato_id
    FROM ghl_api_jobs j
    JOIN oportunidades o ON o.contato_id = (j.context->>'contato_id')::UUID
    WHERE j.caller = 'auto-tag-conectado-backfill-calls'
      AND o.ghl_opportunity_id IS NOT NULL
      AND o.status             != 'lost'
      AND NOT EXISTS (
        SELECT 1 FROM comunicacoes com
        WHERE com.contato_id     = (j.context->>'contato_id')::UUID
          AND com.direction      = 'inbound'
          AND com.data_comunicacao >= '2026-03-01'
      )
      -- Evita duplicar os 28 PUTs já enviados pela migration 20260409210000
      AND NOT EXISTS (
        SELECT 1 FROM ghl_api_jobs existing
        WHERE existing.caller          = 'revert-opp-fields-conectado'
          AND existing.idempotency_key = 'revert-opp-fields-conectado:' || o.ghl_opportunity_id
      )
  LOOP

    INSERT INTO ghl_api_jobs (url, method, body, caller, priority, idempotency_key, context)
    VALUES (
      'https://services.leadconnectorhq.com/opportunities/' || v_rec.ghl_opportunity_id,
      'PUT',
      jsonb_build_object('customFields', v_custom_fields),
      'revert-opp-fields-conectado',
      3,
      'revert-opp-fields-conectado:' || v_rec.ghl_opportunity_id,
      jsonb_build_object(
        'contato_id',         v_rec.contato_id,
        'ghl_opportunity_id', v_rec.ghl_opportunity_id,
        'reason',             'data_conectado_from_webhook_not_zeroed_by_previous_revert'
      )
    )
    ON CONFLICT DO NOTHING;

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RAISE NOTICE 'data_conectado zerados no banco: % | PUTs GHL enfileirados: %',
               v_zeroed, v_enqueued;

END;
$$;
