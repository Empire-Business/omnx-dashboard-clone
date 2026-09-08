# Migração Completa: Extração de Oportunidades

## Resumo do Problema

A função `update_oportunidade_from_webhook()` está **incompleta**, deixando milhares de registros sem extração adequada.

## Gap Identificado

| Campo | Dados no Webhook | Dados na Tabela | Registros Perdidos |
|-------|------------------|-----------------|-------------------|
| mqlcontato2 | 3494 | 1242 | **2252** |
| mqlcontato3 | 2990 | 1072 | **1918** |
| mqlno_show | 983 | 236 | **747** |
| mqlperdido | 1888 | 916 | **972** |
| sqlperdida | 491 | 245 | **246** |
| sqlreunio_realizada | 786 | 356 | **430** |
| sqlnegociao | 462 | 201 | **261** |
| sqlfechada | 94 | 43 | **51** |

**Total de registros perdidos: ~6877**

## Migração 1: Atualizar Função Trigger

### Arquivo: `supabase/migrations/20260226210000_update_trigger_oportunidades_completo.sql`

```sql
-- =====================================================
-- MIGRAÇÃO: Atualizar trigger de extração de oportunidades
-- Objetivo: Implementar TODOS os campos documentados
-- =====================================================

CREATE OR REPLACE FUNCTION update_oportunidade_from_webhook()
RETURNS TRIGGER AS $function$
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
            
            data_ultima_atividade = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.ltima_atividade }}',
                    '{{opportunity.ltima_atividade}}'
                ]),
                data_ultima_atividade
            ),
            
            -- =====================================================
            -- CAMPOS DE DATA - MQL
            -- =====================================================
            
            -- data_mql_lead_recebido: com fallback para date_created
            data_mql_lead_recebido = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlleads_recebidos}}',
                    '{{ opportunity.mqlleads_recebidos }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlleads_recebidos }}',
                    '{{opportunity.d_mqlleads_recebidos}}'
                ])),
                (NEW.payload->>'date_created')::TIMESTAMPTZ,
                data_mql_lead_recebido
            ),
            
            -- data_mql_contato_1 a 8: com fallbacks
            data_mql_contato_1 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato1}}',
                    '{{ opportunity.mqlcontato1 }}',
                    '{{ opportunity.d_mqlcontato1 }}',
                    '{{opportunity.d_mqlcontato1}}'
                ])),
                data_mql_contato_1
            ),
            
            data_mql_contato_2 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato2}}',
                    '{{ opportunity.mqlcontato2 }}',
                    '{{ opportunity.d_mqlcontato2 }}',
                    '{{opportunity.d_mqlcontato2}}'
                ])),
                data_mql_contato_2
            ),
            
            data_mql_contato_3 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato3}}',
                    '{{ opportunity.mqlcontato3 }}',
                    '{{ opportunity.d_mqlcontato3 }}',
                    '{{opportunity.d_mqlcontato3}}'
                ])),
                data_mql_contato_3
            ),
            
            data_mql_contato_4 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato4}}',
                    '{{ opportunity.mqlcontato4 }}',
                    '{{ opportunity.d_mqlcontato4 }}',
                    '{{opportunity.d_mqlcontato4}}'
                ])),
                data_mql_contato_4
            ),
            
            data_mql_contato_5 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato5}}',
                    '{{ opportunity.mqlcontato5 }}',
                    '{{ opportunity.d_mqlcontato5 }}',
                    '{{opportunity.d_mqlcontato5}}'
                ])),
                data_mql_contato_5
            ),
            
            data_mql_contato_6 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato6}}',
                    '{{ opportunity.mqlcontato6 }}',
                    '{{ opportunity.d_mqlcontato6 }}',
                    '{{opportunity.d_mqlcontato6}}'
                ])),
                data_mql_contato_6
            ),
            
            data_mql_contato_7 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato7}}',
                    '{{ opportunity.mqlcontato7 }}',
                    '{{ opportunity.d_mqlcontato7 }}',
                    '{{opportunity.d_mqlcontato7}}'
                ])),
                data_mql_contato_7
            ),
            
            data_mql_contato_8 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato8}}',
                    '{{ opportunity.mqlcontato8 }}',
                    '{{ opportunity.d_mqlcontato8 }}',
                    '{{opportunity.d_mqlcontato8}}'
                ])),
                data_mql_contato_8
            ),
            
            -- data_mql_no_show: fallback entre mqlno_show, sqlno_show, d_mqlno_show, d_sqlno_show
            data_mql_no_show = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlno_show}}',
                    '{{ opportunity.mqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}',
                    '{{ opportunity.sqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlno_show }}',
                    '{{opportunity.d_mqlno_show}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlno_show }}',
                    '{{opportunity.d_sqlno_show}}'
                ])),
                data_mql_no_show
            ),
            
            -- data_mql_conectado
            data_mql_conectado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlconectado}}',
                    '{{ opportunity.mqlconectado }}',
                    '{{ opportunity.d_mqlconectado }}',
                    '{{opportunity.d_mqlconectado}}'
                ])),
                data_mql_conectado
            ),
            
            -- data_mql_reuniao_marcada: fallback entre mqlreunio_marcada, sqlreunio_agendada, d_mqlreunio_marcada
            data_mql_reuniao_marcada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlreunio_marcada}}',
                    '{{ opportunity.mqlreunio_marcada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}',
                    '{{ opportunity.sqlreunio_agendada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlreunio_marcada }}',
                    '{{opportunity.d_mqlreunio_marcada}}'
                ])),
                data_mql_reuniao_marcada
            ),
            
            -- data_mql_perdido: fallback entre mqlperdido, d_mqlperdido
            data_mql_perdido = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.mqlperdido }}',
                    '{{opportunity.mqlperdido}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlperdido }}',
                    '{{opportunity.d_mqlperdido}}'
                ])),
                data_mql_perdido
            ),
            
            -- =====================================================
            -- CAMPOS DE DATA - SQL
            -- =====================================================
            
            -- data_sql_no_show
            data_sql_no_show = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}',
                    '{{ opportunity.sqlno_show }}',
                    '{{ opportunity.d_sqlno_show }}',
                    '{{opportunity.d_sqlno_show}}'
                ])),
                data_sql_no_show
            ),
            
            -- data_sql_perdido: fallback entre sqlperdida, d_sqlperdida
            data_sql_perdido = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlperdida }}',
                    '{{opportunity.sqlperdida}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlperdida }}',
                    '{{opportunity.d_sqlperdida}}'
                ])),
                data_sql_perdido
            ),
            
            -- data_sql_reuniao_agendada
            data_sql_reuniao_agendada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}',
                    '{{ opportunity.sqlreunio_agendada }}',
                    '{{ opportunity.d_sqlreunio_agendada }}',
                    '{{opportunity.d_sqlreunio_agendada}}'
                ])),
                data_sql_reuniao_agendada
            ),
            
            -- data_sql_reuniao_realizada
            data_sql_reuniao_realizada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlreunio_realizada }}',
                    '{{opportunity.sqlreunio_realizada}}'
                ])),
                data_sql_reuniao_realizada
            ),
            
            -- data_sql_negociacao: fallback entre sqlnegociao, d_sqlnegociao
            data_sql_negociacao = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlnegociao }}',
                    '{{opportunity.sqlnegociao}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlnegociao }}',
                    '{{opportunity.d_sqlnegociao}}'
                ])),
                data_sql_negociacao
            ),
            
            -- data_sql_fechada
            data_sql_fechada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}',
                    '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}',
                    '{{opportunity.d_sqlfechada}}'
                ])),
                data_sql_fechada
            ),
            
            -- data_pendencias_preenchimento
            data_pendencias_preenchimento = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlpendencias_preenchimento }}',
                    '{{opportunity.sqlpendencias_preenchimento}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d__sqlpendencias_preenchimento }}',
                    '{{opportunity.d__sqlpendencias_preenchimento}}'
                ])),
                data_pendencias_preenchimento
            ),
            
            -- =====================================================
            -- CAMPOS DE DATA - REUNIÃO
            -- =====================================================
            
            data_reuniao_agendada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.data_da_reunio }}',
                    '{{opportunity.data_da_reunio}}'
                ])),
                data_reuniao_agendada
            ),
            
            data_reuniao_realizada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.reuniao_realizada }}',
                    '{{opportunity.reuniao_realizada}}',
                    '{{ opportunity.data_da_reunio_realizada }}',
                    '{{opportunity.data_da_reunio_realizada}}'
                ])),
                data_reuniao_realizada
            ),
            
            -- =====================================================
            -- TIMESTAMP
            -- =====================================================
            updated_at = NOW()
            
        WHERE ghl_opportunity_id = TRIM(NEW.payload->>'id');
    END IF;
    
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Comentário documentando a função
COMMENT ON FUNCTION update_oportunidade_from_webhook() IS 'Trigger function que extrai dados de webhooks GHL para a tabela oportunidades. Implementa TODOS os campos documentados em Document_GHL.md com fallbacks apropriados.';
```

## Migração 2: Backfill de Dados Históricos

### Arquivo: `supabase/migrations/20260226210100_backfill_oportunidades_completo.sql`

```sql
-- =====================================================
-- MIGRAÇÃO: Backfill de dados históricos de oportunidades
-- Objetivo: Recuperar ~6877 registros perdidos
-- =====================================================

-- Backfill de data_mql_contato_2
UPDATE oportunidades o
SET data_mql_contato_2 = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{opportunity.mqlcontato2}}',
        '{{ opportunity.mqlcontato2 }}',
        '{{ opportunity.d_mqlcontato2 }}',
        '{{opportunity.d_mqlcontato2}}'
    ])),
    o.data_mql_contato_2
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_mql_contato_2 IS NULL;

-- Backfill de data_mql_contato_3
UPDATE oportunidades o
SET data_mql_contato_3 = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{opportunity.mqlcontato3}}',
        '{{ opportunity.mqlcontato3 }}',
        '{{ opportunity.d_mqlcontato3 }}',
        '{{opportunity.d_mqlcontato3}}'
    ])),
    o.data_mql_contato_3
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_mql_contato_3 IS NULL;

-- Backfill de data_mql_no_show (com múltiplos fallbacks)
UPDATE oportunidades o
SET data_mql_no_show = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{opportunity.mqlno_show}}',
        '{{ opportunity.mqlno_show }}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{opportunity.sqlno_show}}',
        '{{ opportunity.sqlno_show }}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_mqlno_show }}',
        '{{opportunity.d_mqlno_show}}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_sqlno_show }}',
        '{{opportunity.d_sqlno_show}}'
    ])),
    o.data_mql_no_show
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_mql_no_show IS NULL;

-- Backfill de data_mql_perdido
UPDATE oportunidades o
SET data_mql_perdido = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.mqlperdido }}',
        '{{opportunity.mqlperdido}}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_mqlperdido }}',
        '{{opportunity.d_mqlperdido}}'
    ])),
    o.data_mql_perdido
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_mql_perdido IS NULL;

-- Backfill de data_sql_perdido
UPDATE oportunidades o
SET data_sql_perdido = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.sqlperdida }}',
        '{{opportunity.sqlperdida}}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_sqlperdida }}',
        '{{opportunity.d_sqlperdida}}'
    ])),
    o.data_sql_perdido
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_sql_perdido IS NULL;

-- Backfill de data_sql_reuniao_realizada
UPDATE oportunidades o
SET data_sql_reuniao_realizada = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.sqlreunio_realizada }}',
        '{{opportunity.sqlreunio_realizada}}'
    ])),
    o.data_sql_reuniao_realizada
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_sql_reuniao_realizada IS NULL;

-- Backfill de data_sql_negociacao
UPDATE oportunidades o
SET data_sql_negociacao = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.sqlnegociao }}',
        '{{opportunity.sqlnegociao}}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_sqlnegociao }}',
        '{{opportunity.d_sqlnegociao}}'
    ])),
    o.data_sql_negociacao
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_sql_negociacao IS NULL;

-- Backfill de data_sql_fechada
UPDATE oportunidades o
SET data_sql_fechada = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.sqlfechada }}',
        '{{opportunity.sqlfechada}}',
        '{{ opportunity.d_sqlfechada }}',
        '{{opportunity.d_sqlfechada}}'
    ])),
    o.data_sql_fechada
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_sql_fechada IS NULL;

-- Backfill de data_ultima_atividade
UPDATE oportunidades o
SET data_ultima_atividade = COALESCE(
    extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.ltima_atividade }}',
        '{{opportunity.ltima_atividade}}'
    ]),
    o.data_ultima_atividade
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_ultima_atividade IS NULL;

-- Backfill de data_reuniao_agendada
UPDATE oportunidades o
SET data_reuniao_agendada = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.data_da_reunio }}',
        '{{opportunity.data_da_reunio}}'
    ])),
    o.data_reuniao_agendada
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_reuniao_agendada IS NULL;

-- Backfill de data_reuniao_realizada
UPDATE oportunidades o
SET data_reuniao_realizada = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.reuniao_realizada }}',
        '{{opportunity.reuniao_realizada}}',
        '{{ opportunity.data_da_reunio_realizada }}',
        '{{opportunity.data_da_reunio_realizada}}'
    ])),
    o.data_reuniao_realizada
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_reuniao_realizada IS NULL;

-- Backfill de data_pendencias_preenchimento
UPDATE oportunidades o
SET data_pendencias_preenchimento = COALESCE(
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.sqlpendencias_preenchimento }}',
        '{{opportunity.sqlpendencias_preenchimento}}'
    ])),
    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d__sqlpendencias_preenchimento }}',
        '{{opportunity.d__sqlpendencias_preenchimento}}'
    ])),
    o.data_pendencias_preenchimento
)
FROM webhooks_ghl w
WHERE w.payload->>'id' = o.ghl_opportunity_id
  AND o.data_pendencias_preenchimento IS NULL;
```

## Migração 3: Backfill de data_mql_qualificado

O campo `data_mql_qualificado` existe na tabela mas NÃO está documentado. Precisamos decidir:

**Opção A:** Remover coluna (se não é usada)
**Opção B:** Documentar e implementar extração

### Verificar se há dados:

```sql
-- Verificar se há dados em mqlqualificado
SELECT COUNT(*)
FROM webhooks_ghl
WHERE payload->'customData'->>'{{ opportunity.mqlqualificado }}' != ''
   OR payload->'customData'->>'{{ opportunity.d_mqlqualificado }}' != '';
```

**Resultado:** 0 registros com dados

**Recomendação:** Manter coluna para uso futuro, mas não implementar extração (dados não existem no GHL).

## Próximos Passos

1. [ ] Aplicar Migração 1 (trigger completo)
2. [ ] Aplicar Migração 2 (backfill)
3. [ ] Verificar preenchimento pós-migração
4. [ ] Atualizar AI-INSTRUCTIONS.md
