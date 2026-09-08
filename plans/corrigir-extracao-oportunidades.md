# Plano de Execução: Corrigir Extração de Oportunidades

## 📋 Visão Geral

**Problema:** A função `extrair_dados_ghl()` usa chaves incorretas para acessar campos do `customData`
**Impacto:** ~70% das colunas de oportunidades não são populadas corretamente
**Solução:** Corrigir o mapeamento de chaves e executar backfill

---

## ✅ Fase 1: Mapeamento Completo

### Chaves customData Identificadas (do webhook real)

| Chave no GHL | Coluna DB | Tipo | Status |
|--------------|-----------|------|--------|
| `d_MQL-Leads Recebidos` | op_dateAdded | timestamptz | ✅ Mapeado |
| `d_MQL-Contato1` | mql_contato_1 | text | ✅ Mapeado |
| `d_MQL-Contato2` | mql_contato_2 | text | ✅ Mapeado |
| `d_MQL-Contato3` | mql_contato_3 | text | ✅ Mapeado |
| `d_MQL-Contato4` | mql_contato_4 | text | ✅ Mapeado |
| `d_MQL-Contato5` | mql_contato_5 | text | ✅ Mapeado |
| `d_MQL-Contato6` | mql_contato_6 | text | ✅ Mapeado |
| `d_MQL-Contato7` | mql_contato_7 | text | ✅ Mapeado |
| `d_MQL-Contato8` | mql_contato_8 | text | ✅ Mapeado |
| `d_MQL-Conectado` | date_mql_connected | timestamptz | ✅ Mapeado |
| `d_MQL-No Show` | date_no_show | timestamptz | ✅ Mapeado |
| `d_MQL-Perdido` | date_mql_lost | timestamptz | ✅ Mapeado |
| `d_MQL-Qualificado` | - | timestamptz | ⚠️ Sem coluna |
| `d_MQL-Reunião Marcada` | date_meeting | timestamptz | ✅ Mapeado |
| `d_SQL-Reunião Agendada` | date_sql_scheduled | timestamptz | ✅ Mapeado |
| `d_SQL-Reunião Realizada` | date_sql_completed | timestamptz | ✅ Mapeado |
| `d_SQL-Negociação` | - | timestamptz | ⚠️ Sem coluna |
| `d_SQL-Fechada` | - | timestamptz | ⚠️ Sem coluna |
| `d_SQL-No Show` | date_no_show | timestamptz | ✅ Mapeado (fallback) |
| `d_SQL-Perdida` | date_mql_lost | timestamptz | ✅ Mapeado (fallback) |
| `d_ SQL-Pendencias Preenchimento` | - | timestamptz | ⚠️ Sem coluna |
| `Data da Reunião` | date_meeting | timestamptz | ✅ Mapeado |
| `Data da reunião realizada` | date_meeting_completed | timestamptz | ✅ Mapeado |
| `Lost Reason` | lost_reason | text | ✅ Mapeado |
| `Opportunity Source` | opportunity_source | text | ✅ Mapeado |
| `Owner (SDR ou SS)` | owner_name | text | ✅ Mapeado |
| `Resumo IA` | - | text | ⚠️ Sem coluna |
| `Percepção do closer` | - | text | ⚠️ Sem coluna |
| `Última Atividade` | - | text | ⚠️ Sem coluna |

---

## 📝 Fase 2: Tasks de Implementação

### Task 1: Criar Migration de Correção
**Arquivo:** `supabase/migrations/YYYYMMDD_fix_customdata_keys_extraction.sql`

**O que fazer:**
1. Criar nova função `extrair_dados_ghl_v2()` com chaves corretas
2. Manter função antiga como backup
3. Adicionar lógica de fallback para campos com múltiplas chaves

**Chaves a corrigir:**
```sql
-- ANTES (incorreto):
w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'

-- DEPOIS (correto):
w.payload->'customData'->>'d_MQL-Leads Recebidos'
```

### Task 2: Criar Script de Backfill
**Arquivo:** `supabase/migrations/YYYYMMDD_backfill_oportunidades_customdata.sql`

**O que fazer:**
1. Update em todas as oportunidades existentes
2. Usar webhooks armazenados em `webhook_events`
3. Fazer join por `ghl_opportunity_id`

### Task 3: Atualizar Documentação
**Arquivo:** `docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md`

**O que fazer:**
1. Adicionar seção de customData keys
2. Documentar mapeamento correto
3. Incluir exemplos reais

### Task 4: Criar Query de Validação
**Arquivo:** `supabase/diagnosticos/validar-extracao-oportunidades.sql`

**O que fazer:**
1. Query para verificar % de preenchimento
2. Comparar antes/depois
3. Identificar anomalias

---

## 🔧 Fase 3: Execução

### Ordem de Execução:
1. ⬜ Criar migration de correção
2. ⬜ Aplicar migration em desenvolvimento
3. ⬜ Executar backfill em desenvolvimento
4. ⬜ Validar dados em desenvolvimento
5. ⬜ Aplicar migration em produção
6. ⬜ Executar backfill em produção
7. ⬜ Validar dados em produção
8. ⬜ Atualizar documentação

---

## 📊 Métricas de Sucesso

### Antes (estado atual):
| Coluna | % Preenchida |
|--------|--------------|
| lost_reason | 25.6% |
| date_mql_connected | 28.8% |
| date_sql_scheduled | 11.0% |
| custom_fields | 0% |

### Depois (esperado):
| Coluna | % Preenchida |
|--------|--------------|
| lost_reason | >80% |
| date_mql_connected | >80% |
| date_sql_scheduled | >80% |
| custom_fields | 100% |

---

## ⚠️ Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Chaves podem variar | Implementar fallback para múltiplas chaves |
| Dados históricos diferentes | Verificar webhooks antigos antes do backfill |
| Encoding de caracteres | Usar TRIM e NULLIF para limpeza |

---

## 📅 Timeline

- **Fase 1:** Mapeamento - ✅ Completo
- **Fase 2:** Implementação - A definir
- **Fase 3:** Validação - A definir

---

*Documento atualizado em: 2026-02-26*
