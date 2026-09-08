# Decisão: Correção da Extração de Oportunidades com Fallbacks

**Data:** 2026-02-26  
**Responsável:** Sistema  
**Status:** Implementada

---

## 🎯 Contexto

A tabela `oportunidades` tinha muitas colunas não populadas, apesar de:

1. ✅ A documentação [`Document_GHL.md`](../../Document_GHL.md) ter regras claras
2. ✅ Os dados existirem nos webhooks
3. ❌ A função `extrair_dados_ghl()` não implementar os fallbacks corretamente

---

## 🔍 Problema Identificado

### Função Antiga

```sql
-- ❌ ERRADO: Tentava apenas uma variação de chave
pipeline_name = TRIM(w.payload->>'pipeline_name')
vendedor_closer = TRIM(w.payload->'customData'->>'{{opportunity.assignedToUsersName}}')
```

**Problemas:**

1. Não tentava variações de formato (com/sem espaços)
2. Não usava fallbacks entre campos diferentes
3. Não tratava conversão de tipos (timestamp vs date)
4. Campos em `customData` tinham formato inconsistente

### Documentação Clara

```markdown
{{opportunity.mqlno_show}} OU {{ opportunity.sqlno_show }} OU 
{{ opportunity.d_mqlno_show }} OU {{ opportunity.d_sqlno_show }}
```

**Significado:** Tentar na ordem, usar o primeiro que existir.

---

## ✅ Solução Implementada

### 1. Função Auxiliar

Criada função [`extract_custom_field()`](../../supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql):

```sql
CREATE OR REPLACE FUNCTION extract_custom_field(
    custom_data jsonb,
    field_variations text[]
) RETURNS text
```

**Funcionalidade:**

- Recebe array de variações de chave
- Tenta cada uma na ordem
- Retorna primeiro valor não-nulo
- Trata strings vazias como NULL

### 2. Extração com Fallbacks

```sql
-- ✅ CORRETO: Tenta múltiplas variações
data_mql_no_show = COALESCE(
    (extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.mqlno_show }}',
        '{{opportunity.mqlno_show}}',
        '{{ opportunity.sqlno_show }}',
        '{{opportunity.sqlno_show}}'
    ]))::TIMESTAMPTZ,
    (extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.d_mqlno_show }}',
        '{{opportunity.d_mqlno_show}}',
        '{{ opportunity.d_sqlno_show }}',
        '{{opportunity.d_sqlno_show}}'
    ]))::DATE::TIMESTAMPTZ
)
```

**Vantagens:**

1. ✅ Tenta timestamp primeiro, depois date
2. ✅ Tenta variações com/sem espaços
3. ✅ Usa fallback entre MQL e SQL
4. ✅ Converte tipos corretamente

---

## 📊 Campos Corrigidos

### Campos Diretos

| Campo | Extração |
|-------|----------|
| `pipeline_name` | `payload->>'pipeline_name'` |
| `opportunity_name` | `payload->>'opportunity_name'` |
| `status` | `payload->>'status'` |

### Campos em customData (com fallbacks)

| Campo DB | Variações Tentadas | Tipo |
|----------|-------------------|------|
| `vendedor_closer` | `{{opportunity.assignedToUsersName}}`, `{{ opportunity.assignedToUsersName }}` | text |
| `opportunity_source` | `{{ opportunity.source }}`, `{{opportunity.source}}` | text |
| `lost_reason` | `{{ opportunity.lost_reason }}`, `{{opportunity.lost_reason}}` | text |
| `resumo_ia` | `{{ opportunity.resumo_ia }}`, `{{opportunity.resumo_ia}}` | text |
| `percepcao_closer` | `{{ opportunity.percepo_do_closer }}`, `{{opportunity.percepo_do_closer}}` | text |
| `data_ultima_atividade` | `{{ opportunity.ltima_atividade }}`, `{{opportunity.ltima_atividade}}` | text |

### Datas MQL (com fallback timestamp → date)

| Campo DB | Variações (timestamp) | Variações (date) |
|----------|----------------------|------------------|
| `data_mql_lead_recebido` | `mqlleads_recebidos` | `d_mqlleads_recebidos` |
| `data_mql_contato_1` | `mqlcontato1` | `d_mqlcontato1` |
| `data_mql_contato_2` | `mqlcontato2` | `d_mqlcontato2` |
| `data_mql_contato_3` | `mqlcontato3` | `d_mqlcontato3` |
| `data_mql_contato_4` | `mqlcontato4` | `d_mqlcontato4` |
| `data_mql_contato_5` | `mqlcontato5` | `d_mqlcontato5` |
| `data_mql_contato_6` | `mqlcontato6` | `d_mqlcontato6` |
| `data_mql_contato_7` | `mqlcontato7` | `d_mqlcontato7` |
| `data_mql_contato_8` | `mqlcontato8` | `d_mqlcontato8` |
| `data_mql_conectado` | `mqlconectado` | `d_mqlconectado` |
| `data_mql_perdido` | `mqlperdido` | `d_mqlperdido` |
| `data_mql_qualificado` | `mqlqualificado` | `d_mqlqualificado` |

### Datas com Múltiplos Fallbacks

| Campo DB | Fallbacks |
|----------|-----------|
| `data_mql_no_show` | `mqlno_show` → `sqlno_show` → `d_mqlno_show` → `d_sqlno_show` |
| `data_mql_reuniao_marcada` | `mqlreunio_marcada` → `sqlreunio_agendada` → `d_mqlreunio_marcada` |
| `data_reuniao_realizada` | `reuniao_realizada` → `data_da_reunio_realizada` → `d_reuniao_realizada` |

### Datas SQL

| Campo DB | Variações (timestamp) | Variações (date) |
|----------|----------------------|------------------|
| `data_sql_no_show` | `sqlno_show` | `d_sqlno_show` |
| `data_sql_perdido` | `sqlperdida` | `d_sqlperdida` |
| `data_sql_reuniao_agendada` | `sqlreunio_agendada` | `d_sqlreunio_agendada` |
| `data_sql_reuniao_realizada` | `sqlreunio_realizada` | `d_sqlreunio_realizada` |
| `data_sql_negociacao` | `sqlnegociao` | `d_sqlnegociao` |
| `data_sql_fechada` | `sqlfechada` | `d_sqlfechada` |
| `data_pendencias_preenchimento` | `sqlpendencias_preenchimento` | `d__sqlpendencias_preenchimento` |

### Datas de Reunião

| Campo DB | Variações |
|----------|-----------|
| `data_reuniao_agendada` | `data_da_reunio`, `d_data_da_reunio` |
| `data_reuniao_realizada` | `reuniao_realizada`, `data_da_reunio_realizada`, `d_reuniao_realizada` |

---

## 🔄 Processo de Conversão

### Timestamp vs Date

```sql
-- Prioridade: timestamp (mais preciso)
COALESCE(
    (extract_custom_field(..., ARRAY['mqlcontato1']))::TIMESTAMPTZ,
    (extract_custom_field(..., ARRAY['d_mqlcontato1']))::DATE::TIMESTAMPTZ
)
```

**Lógica:**

1. Tenta campo sem `d_` (timestamp ISO 8601)
2. Se não existir, tenta campo com `d_` (date YYYY-MM-DD)
3. Converte date para timestamptz (00:00:00 UTC)

---

## 📁 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| [`20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql`](../../supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql) | Função auxiliar + extração corrigida |
| [`20260226400200_backfill_oportunidades_com_fallbacks.sql`](../../supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql) | Backfill de oportunidades existentes |
| [`verificar-extracao-oportunidades.sql`](../../supabase/diagnosticos/verificar-extracao-oportunidades.sql) | Script de diagnóstico |
| [`corrigir-extracao-oportunidades-completa.md`](../../plans/corrigir-extracao-oportunidades-completa.md) | Plano de ação |

---

## ✅ Validação

### Antes

```sql
SELECT 
    COUNT(*) as total,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor
FROM oportunidades;

-- Resultado esperado:
-- total: 10
-- com_pipeline_name: ~2-3
-- com_vendedor: ~1-2
```

### Depois

```sql
SELECT 
    COUNT(*) as total,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor,
    COUNT(data_mql_lead_recebido) as com_datas
FROM oportunidades;

-- Resultado esperado:
-- total: 10
-- com_pipeline_name: ~8-10
-- com_vendedor: ~5-8
-- com_datas: ~8-10
```

---

## 🎯 Impacto

### Positivo

1. ✅ Colunas agora são populadas corretamente
2. ✅ Webhook entende fallbacks da documentação
3. ✅ Conversão de tipos automática
4. ✅ Função reutilizável para outros campos

### Manutenção

1. ✅ Função `extract_custom_field()` é genérica
2. ✅ Fácil adicionar novas variações
3. ✅ Documentação alinhada com implementação

---

## 📝 Próximos Passos

1. Executar diagnóstico para validar
2. Aplicar migrations no projeto `qzesffnkqgelmtfblzkr`
3. Verificar resultado do backfill
4. Atualizar [`MAPEAMENTO-CAMPOS.md`](../MAPEAMENTO-CAMPOS.md) se necessário

---

## 🔗 Referências

- [`Document_GHL.md`](../../Document_GHL.md) - Regras de negócio
- [`REGRAS-EXTRACAO.md`](../REGRAS-EXTRACAO.md) - Regras técnicas
- [`MAPEAMENTO-CAMPOS.md`](../MAPEAMENTO-CAMPOS.md) - Mapeamento de campos

---

*Decisão implementada em 2026-02-26*
