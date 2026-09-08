# Plano: Corrigir Extração de Oportunidades - Completo

## ✅ RESOLVIDO: Não havia gap real

### Descoberta Final

A análise inicial estava **incorreta**. O que parecia ser "6877 registros perdidos" na verdade eram:
- **Webhooks duplicados**: Cada oportunidade pode ter múltiplos webhooks
- **Exemplo**: 3494 webhooks com `mqlcontato2` → apenas1242 oportunidades únicas

### Verificação Final

| Campo | Oportunidades Únicas | Extraídos | Gap |
|-------|---------------------|-----------|-----|
| mqlno_show | 236 | 236 | **0** |
| mqlperdido | 915 | 916 | **0** |
| sqlperdida | 245 | 245 | **0** |
| sqlreunio_realizada | 356 | 356 | **0** |
| sqlnegociao | 201 | 201 | **0** |

**Conclusão: Todos os dados disponíveis nos webhooks foram corretamente extraídos.**

---

## Problema Inicial (Análise Incorreta)

A função `update_oportunidade_from_webhook()` parecia estar **incompleta** - ela só atualiza alguns campos, deixando muitos campos documentados sem extração.

## Diagnóstico Atual

### Preenchimento dos Campos (4762 registros)

| Campo | Preenchido | % | Status |
|-------|------------|---|--------|
| ghl_opportunity_id | 4762 | 100% | ✅ OK |
| pipeline_id | 4762 | 100% | ✅ OK |
| pipeline_stage_id | 4762 | 100% | ✅ OK |
| status | 4762 | 100% | ✅ OK |
| titulo | 4762 | 100% | ✅ OK |
| valor | 4762 | 100% | ✅ OK |
| data_mql_lead_recebido | 4762 | 100% | ✅ OK (com fallback) |
| data_mql_contato_1 | 1804 | 38% | ✅ OK |
| data_mql_contato_2 | 1242 | 26% | ✅ OK |
| data_mql_contato_3 | 1072 | 22% | ✅ OK |
| data_mql_contato_4 | 784 | 16% | ✅ OK |
| data_mql_contato_5 | 651 | 14% | ✅ OK |
| data_mql_contato_6 | 715 | 15% | ✅ OK |
| data_mql_contato_7 | 556 | 12% | ✅ OK |
| data_mql_contato_8 | 435 | 9% | ✅ OK |
| data_mql_no_show | 236 | 5% | ✅ OK |
| data_mql_conectado | 1372 | 29% | ✅ OK |
| data_mql_perdido | 916 | 19% | ✅ OK |
| data_mql_qualificado | 0 | 0% | ⚠️ Não documentado |
| data_mql_reuniao_marcada | 627 | 13% | ✅ OK |
| data_sql_perdido | 245 | 5% | ✅ OK |
| data_sql_reuniao_agendada | 609 | 13% | ✅ OK |
| data_sql_reuniao_realizada | 356 | 7% | ✅ OK |
| data_sql_negociacao | 201 | 4% | ✅ OK |
| data_sql_fechada | 43 | 1% | ✅ OK |
| vendedor_closer | 816 | 17% | ✅ OK |
| resumo_ia | 1421 | 30% | ✅ OK |
| percepcao_closer | 348 | 7% | ✅ OK |
| lost_reason | 1255 | 26% | ✅ OK |
| opportunity_source | 4596 | 97% | ✅ OK |

## Mapeamento Documentação → Implementação

### Campos de Data com Fallbacks (conforme Document_GHL.md)

| Campo Tabela | Campos GHL (com fallback) | Linha Doc |
|--------------|---------------------------|-----------|
| data_mql_no_show | `{{opportunity.mqlno_show}}` → `{{ opportunity.sqlno_show }}` → `{{ opportunity.d_mqlno_show }}` → `{{ opportunity.d_sqlno_show }}` | 64 |
| data_mql_lead_recebido | `{{opportunity.mqlleads_recebidos}}` → `{{ opportunity.d_mqlleads_recebidos }}` → `date_created` | 66 |
| data_mql_contato_1 | `{{opportunity.mqlcontato1}}` → `{{ opportunity.d_mqlcontato1 }}` | 68 |
| data_mql_contato_2 | `{{opportunity.mqlcontato2}}` → `{{ opportunity.d_mqlcontato2 }}` | 70 |
| data_mql_contato_3 | `{{opportunity.mqlcontato3}}` → `{{ opportunity.d_mqlcontato3 }}` | 72 |
| data_mql_contato_4 | `{{opportunity.mqlcontato4}}` → `{{ opportunity.d_mqlcontato4 }}` | 74 |
| data_mql_contato_5 | `{{opportunity.mqlcontato5}}` → `{{ opportunity.d_mqlcontato5 }}` | 76 |
| data_mql_contato_6 | `{{opportunity.mqlcontato6}}` → `{{ opportunity.d_mqlcontato6 }}` | 78 |
| data_mql_contato_7 | `{{opportunity.mqlcontato7}}` → `{{ opportunity.d_mqlcontato7 }}` | 80 |
| data_mql_contato_8 | `{{opportunity.mqlcontato8}}` → `{{ opportunity.d_mqlcontato8 }}` | 82 |
| data_mql_conectado | `{{ opportunity.mqlconectado }}` → `{{ opportunity.d_mqlconectado }}` | 84 |
| data_mql_reuniao_marcada | `{{ opportunity.mqlreunio_marcada }}` → `{{opportunity.sqlreunio_agendada}}` → `{{ opportunity.d_mqlreunio_marcada }}` | 86 |
| data_mql_perdido | `{{ opportunity.mqlperdido }}` → `{{ opportunity.d_mqlperdido }}` | 88 |
| data_sql_perdido | `{{ opportunity.sqlperdida }}` → `{{ opportunity.d_sqlperdida }}` | 90 |
| data_sql_reuniao_realizada | `{{ opportunity.sqlreunio_realizada }}` | 92 |
| data_sql_negociacao | `{{ opportunity.sqlnegociao }}` → `{{ opportunity.d_sqlnegociao }}` | 94 |
| data_pendencias_preenchimento | `{{ opportunity.sqlpendencias_preenchimento }}` → `{{ opportunity.d__sqlpendencias_preenchimento }}` | 96 |

### Campos de Texto

| Campo Tabela | Campos GHL | Linha Doc |
|--------------|------------|-----------|
| titulo | `{{ opportunity.name }}` | 98 |
| status | `{{ opportunity.status }}` | 100 |
| vendedor_closer | `{{opportunity.assignedToUsersName}}` | 102 |
| data_reuniao_agendada | `{{ opportunity.data_da_reunio }}` | 104 |
| data_reuniao_realizada | `{{ opportunity.reuniao_realizada }}` | 106 |
| percepcao_closer | `{{ opportunity.percepo_do_closer }}` | 108 |
| resumo_ia | `{{ opportunity.resumo_ia }}` | 110 |
| data_ultima_atividade | `{{ opportunity.ltima_atividade }}` | 112 |
| valor | `{{opportunity.lead_value}}` | 114 |

## Análise da Função Atual

A função `update_oportunidade_from_webhook()` atualiza APENAS:
- pipeline_name
- opportunity_source
- vendedor_closer
- lost_reason
- resumo_ia
- percepcao_closer
- data_mql_lead_recebido
- data_mql_contato_1
- data_mql_conectado
- data_mql_reuniao_marcada

**CAMPOS FALTANDO no trigger:**
- data_mql_contato_2 até data_mql_contato_8
- data_mql_no_show
- data_mql_perdido
- data_sql_no_show
- data_sql_perdido
- data_sql_reuniao_agendada
- data_sql_reuniao_realizada
- data_sql_negociacao
- data_sql_fechada
- data_reuniao_agendada
- data_reuniao_realizada
- data_pendencias_preenchimento
- data_ultima_atividade

## Solução Proposta

### Passo 1: Atualizar Função Trigger

Criar migração para atualizar `update_oportunidade_from_webhook()` com TODOS os campos documentados.

### Passo 2: Backfill de Dados Históricos

Criar migração de backfill para preencher campos que já existem nos webhooks mas não foram extraídos.

### Passo 3: Verificar Campo data_mql_qualificado

Este campo existe na tabela mas NÃO está documentado. Decisão:
- Remover coluna? OU
- Documentar uso?

## Próximos Passos

1. [ ] Criar migração com função trigger completa
2. [ ] Criar migração de backfill
3. [ ] Decidir sobre data_mql_qualificado
4. [ ] Atualizar AI-INSTRUCTIONS.md
5. [ ] Testar e verificar
