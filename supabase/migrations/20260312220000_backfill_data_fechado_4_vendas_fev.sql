-- Migration: backfill data_fechado e outras datas de pipeline para os 4 leads
-- de fevereiro/2026 que sabidamente fecharam mas podem ter data_fechado = NULL.
--
-- Causa: migration 20260312100006 corrigiu o trigger para atualizar datas,
-- mas os leads mcharliston@gmail.com e danieltiago107@gmail.com foram descobertos
-- apenas em 2026-03-12 (via fix de utm_source). O backfill anterior não os alcançou.
--
-- Estratégia: UPDATE direto de todas as datas de pipeline a partir do webhook mais
-- recente de cada oportunidade desses 4 leads. Não sobrescreve valores já existentes.

-- Passo 1: Atualizar data_fechado (critério primário — faz o cohort exibir 4 fechados)
UPDATE oportunidades o
SET
    data_fechado = parse_date_flexible(
        COALESCE(
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'
            ]),
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}'
            ])
        )
    )
FROM (
    SELECT DISTINCT ON (w.payload->>'id')
        w.payload->>'id' AS opp_id,
        w.payload
    FROM webhooks_ghl w
    INNER JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
    WHERE c.email IN (
        'eduardosampaio.mb@gmail.com',
        'raissa@ennerconcept.com',
        'mcharliston@gmail.com',
        'danieltiago107@gmail.com'
    )
    AND (
        extract_custom_field(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'
        ]) IS NOT NULL
        OR
        extract_custom_field(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}'
        ]) IS NOT NULL
    )
    ORDER BY w.payload->>'id', w.created_at DESC
) w
WHERE o.ghl_opportunity_id = w.opp_id
  AND o.data_fechado IS NULL;

-- Passo 2: Atualizar demais datas de pipeline que possam estar NULL
-- para cada uma das 4 oportunidades, usando o webhook mais recente com o campo preenchido.
UPDATE oportunidades o
SET
    data_realizacao_vendas = COALESCE(
        o.data_realizacao_vendas,
        parse_date_flexible(
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'
            ])
        )
    ),
    data_negociacao = COALESCE(
        o.data_negociacao,
        parse_date_flexible(
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'
            ])
        )
    ),
    data_agendamento_vendas = COALESCE(
        o.data_agendamento_vendas,
        parse_date_flexible(
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'
            ])
        )
    ),
    data_conectado = COALESCE(
        o.data_conectado,
        parse_date_flexible(
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}',
                '{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}'
            ])
        )
    ),
    data_agendamento_reuniao = COALESCE(
        o.data_agendamento_reuniao,
        parse_date_flexible(
            COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY[
                    '{{ opportunity.mqlreunio_marcada }}', '{{opportunity.mqlreunio_marcada}}'
                ]),
                extract_custom_field(w.payload->'customData', ARRAY[
                    '{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'
                ])
            )
        )
    ),
    pipeline_name = COALESCE(
        o.pipeline_name,
        NULLIF(TRIM(w.payload->>'pipeline_name'), '')
    ),
    vendedor_closer = COALESCE(
        o.vendedor_closer,
        extract_custom_field(w.payload->'customData', ARRAY[
            '{{ opportunity.assignedToUsersName }}', '{{opportunity.assignedToUsersName}}'
        ])
    )
FROM (
    SELECT DISTINCT ON (w.payload->>'id')
        w.payload->>'id' AS opp_id,
        w.payload
    FROM webhooks_ghl w
    INNER JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
    WHERE c.email IN (
        'eduardosampaio.mb@gmail.com',
        'raissa@ennerconcept.com',
        'mcharliston@gmail.com',
        'danieltiago107@gmail.com'
    )
    ORDER BY w.payload->>'id', w.created_at DESC
) w
WHERE o.ghl_opportunity_id = w.opp_id;

-- Verificação pós-migração (executar manualmente):
-- SELECT
--   c.email,
--   o.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo' AS lead_recebido_sp,
--   o.data_fechado       AT TIME ZONE 'America/Sao_Paulo' AS fechado_sp,
--   o.pipeline_name,
--   o.status
-- FROM oportunidades o
-- JOIN contatos c ON c.id = o.contato_id
-- WHERE c.email IN (
--   'eduardosampaio.mb@gmail.com',
--   'raissa@ennerconcept.com',
--   'mcharliston@gmail.com',
--   'danieltiago107@gmail.com'
-- )
-- ORDER BY o.data_lead_recebido;
-- Resultado esperado: 4 linhas com data_fechado IS NOT NULL, data_lead_recebido em fev/2026.
