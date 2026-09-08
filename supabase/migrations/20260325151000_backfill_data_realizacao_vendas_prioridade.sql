-- Backfill: recalcular data_realizacao_vendas com a nova prioridade
--
-- A migration anterior (20260325150000) corrigiu a função extrair_dados_ghl
-- para priorizar {{ opportunity.data_da_reunio_realizada }} sobre sqlreunio_realizada.
-- Este backfill aplica a mesma lógica aos dados já existentes.
--
-- Impacto estimado: ~265 opps mudam de valor + ~28 ganham valor que antes era NULL.

WITH latest_webhooks AS (
    SELECT DISTINCT ON (TRIM(payload->>'id'))
        TRIM(payload->>'id') AS opp_id,
        payload
    FROM webhooks_ghl
    WHERE payload->>'id' IS NOT NULL
      AND TRIM(payload->>'id') != ''
    ORDER BY TRIM(payload->>'id'), created_at DESC
)
UPDATE oportunidades o
SET data_realizacao_vendas = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))
)
FROM latest_webhooks w
WHERE w.opp_id = o.ghl_opportunity_id;
