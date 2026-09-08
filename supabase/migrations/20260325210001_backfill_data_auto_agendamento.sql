-- Migration: backfill data_auto_agendamento a partir de webhooks existentes
--
-- Para cada oportunidade, pega o webhook mais recente que tenha o campo
-- mqlauto_agendamento preenchido e extrai a data.

UPDATE oportunidades o
SET
    data_auto_agendamento = parse_date_flexible(
        extract_custom_field(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlauto_agendamento }}',
            '{{opportunity.mqlauto_agendamento}}'
        ])
    ),
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (TRIM(payload->>'id'))
        TRIM(payload->>'id') AS ghl_opportunity_id,
        payload
    FROM webhooks_ghl
    WHERE payload->>'id' IS NOT NULL
      AND TRIM(payload->>'id') != ''
      -- só processar webhooks que realmente têm o campo preenchido
      AND (
          payload->'customData'->>'{{ opportunity.mqlauto_agendamento }}' IS NOT NULL
          OR payload->'customData'->>'{{opportunity.mqlauto_agendamento}}' IS NOT NULL
      )
    ORDER BY TRIM(payload->>'id'), created_at DESC
) w
WHERE o.ghl_opportunity_id = w.ghl_opportunity_id
  AND o.data_auto_agendamento IS NULL;

-- Verificar resultado
-- SELECT COUNT(*) FILTER (WHERE data_auto_agendamento IS NOT NULL) AS preenchidos,
--        COUNT(*) AS total
-- FROM oportunidades;
