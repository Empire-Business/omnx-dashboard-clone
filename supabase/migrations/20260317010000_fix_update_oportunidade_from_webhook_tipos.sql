-- Migration: corrigir update_oportunidade_from_webhook — dois bugs de tipo
--
-- BUG 1: data_ultima_atividade é coluna DATE, mas usava COALESCE(extract_custom_field(), date)
--        extract_custom_field() retorna TEXT → COALESCE(text, date) = erro de tipo
--        Correção: envolver em parse_date_flexible() para retornar DATE
--
-- BUG 2: data_lead_recebido era atualizada pelo webhook, violando a regra do CLAUDE.md
--        ("data_lead_recebido é preenchida EXCLUSIVAMENTE pela edge function sync-opp-dates")
--        Correção: remover data_lead_recebido do trigger update

CREATE OR REPLACE FUNCTION public.update_oportunidade_from_webhook()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Se o webhook tem opportunity_id, atualizar a oportunidade correspondente
    IF NEW.payload->>'id' IS NOT NULL AND TRIM(NEW.payload->>'id') != '' THEN
        UPDATE oportunidades
        SET
            -- =====================================================
            -- CAMPOS DE TEXTO
            -- =====================================================
            pipeline_name = NULLIF(TRIM(NEW.payload->>'pipeline_name'), ''),

            opportunity_source = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.source }}',
                    '{{opportunity.source}}'
                ]),
                opportunity_source
            ),

            vendedor_closer = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.assignedToUsersName}}',
                    '{{ opportunity.assignedToUsersName }}'
                ]),
                vendedor_closer
            ),

            lost_reason = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.lost_reason }}',
                    '{{opportunity.lost_reason}}'
                ]),
                lost_reason
            ),

            resumo_ia = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.resumo_ia }}',
                    '{{opportunity.resumo_ia}}'
                ]),
                resumo_ia
            ),

            percepcao_closer = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.percepo_do_closer }}{{ opportunity.percepo_do_closer }}',
                    '{{opportunity.percepo_do_closer}}'
                ]),
                percepcao_closer
            ),

            -- data_ultima_atividade: coluna DATE — envolver em parse_date_flexible (fix bug tipo text vs date)
            data_ultima_atividade = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.ltima_atividade }}',
                    '{{opportunity.ltima_atividade}}'
                ])),
                data_ultima_atividade
            ),

            -- data_lead_recebido: NAO ATUALIZADA pelo webhook.
            -- Gerenciada exclusivamente pela edge function sync-opp-dates via API GHL.

            -- =====================================================
            -- CAMPOS DE DATA - TENTATIVAS (tipo DATE)
            -- =====================================================
            data_tentativa_1 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato1}}', '{{ opportunity.mqlcontato1 }}',
                    '{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}'
                ])),
                data_tentativa_1
            ),
            data_tentativa_2 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato2}}', '{{ opportunity.mqlcontato2 }}',
                    '{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}'
                ])),
                data_tentativa_2
            ),
            data_tentativa_3 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato3}}', '{{ opportunity.mqlcontato3 }}',
                    '{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}'
                ])),
                data_tentativa_3
            ),
            data_tentativa_4 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato4}}', '{{ opportunity.mqlcontato4 }}',
                    '{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}'
                ])),
                data_tentativa_4
            ),
            data_tentativa_5 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato5}}', '{{ opportunity.mqlcontato5 }}',
                    '{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}'
                ])),
                data_tentativa_5
            ),
            data_tentativa_6 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato6}}', '{{ opportunity.mqlcontato6 }}',
                    '{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}'
                ])),
                data_tentativa_6
            ),
            data_tentativa_7 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato7}}', '{{ opportunity.mqlcontato7 }}',
                    '{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}'
                ])),
                data_tentativa_7
            ),
            data_tentativa_8 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato8}}', '{{ opportunity.mqlcontato8 }}',
                    '{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}'
                ])),
                data_tentativa_8
            ),

            -- =====================================================
            -- CAMPOS DE DATA - PRÉ-VENDA (tipo DATE)
            -- =====================================================
            data_no_show = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlno_show}}', '{{ opportunity.mqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}', '{{ opportunity.sqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}'
                ])),
                data_no_show
            ),
            data_conectado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlconectado}}', '{{ opportunity.mqlconectado }}',
                    '{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}'
                ])),
                data_conectado
            ),
            data_agendamento_reuniao = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlreunio_marcada}}', '{{ opportunity.mqlreunio_marcada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.sqlreunio_agendada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlreunio_marcada }}', '{{opportunity.d_mqlreunio_marcada}}'
                ])),
                data_agendamento_reuniao
            ),
            data_perdido = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}'
                ])),
                data_perdido
            ),
            data_qualificado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlqualificado}}', '{{ opportunity.mqlqualificado }}',
                    '{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}'
                ])),
                data_qualificado
            ),

            -- =====================================================
            -- CAMPOS DE DATA - VENDAS (tipo DATE)
            -- =====================================================
            data_no_show_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}', '{{ opportunity.sqlno_show }}',
                    '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}'
                ])),
                data_no_show_vendas
            ),
            data_perdido_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}'
                ])),
                data_perdido_vendas
            ),
            data_agendamento_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.sqlreunio_agendada }}',
                    '{{ opportunity.d_sqlreunio_agendada }}', '{{opportunity.d_sqlreunio_agendada}}'
                ])),
                data_agendamento_vendas
            ),
            data_realizacao_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'
                ])),
                data_realizacao_vendas
            ),
            data_negociacao = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}'
                ])),
                data_negociacao
            ),
            data_fechado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}'
                ])),
                data_fechado
            ),
            data_pendencias_preenchimento = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}'
                ])),
                data_pendencias_preenchimento
            ),

            -- =====================================================
            -- CAMPOS DE DATA - REUNIÃO (tipo DATE)
            -- =====================================================
            data_reuniao_agendada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}'
                ])),
                data_reuniao_agendada
            ),
            data_reuniao_realizada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}',
                    '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'
                ])),
                data_reuniao_realizada
            ),

            updated_at = NOW()

        WHERE ghl_opportunity_id = TRIM(NEW.payload->>'id');
    END IF;

    RETURN NEW;
END;
$function$;
