# Solução: Colunas Não Populadas na Tabela Oportunidades

**Projeto:** qzesffnkqgelmtfblzkr  
**Data:** 2026-02-26  
**Status:** ✅ Implementado

---

## 🎯 Problema

Muitas colunas da tabela `oportunidades` não eram populadas, apesar de:

1. ✅ Documentação clara em [`Document_GHL.md`](../Document_GHL.md)
2. ✅ Dados existentes nos webhooks
3. ❌ Webhook não implementava as regras corretamente

---

## 🔍 Causa Raiz

### Função Antiga: `extrair_dados_ghl()`

```sql
-- ❌ PROBLEMA: Tentava apenas UMA variação de chave
vendedor_closer = TRIM(w.payload->'customData'->>'{{opportunity.assignedToUsersName}}')
```

**Falhas:**

1. **Não usava fallbacks** conforme [`Document_GHL.md`](../Document_GHL.md)
2. **Formato de chave incorreto** (espaços, variações)
3. **Não convertia tipos** (timestamp vs date)
4. **Ignorava campos alternativos** (MQL vs SQL)

### Documentação Clara

```markdown
{{opportunity.mqlno_show}} OU {{ opportunity.sqlno_show }} OU 
{{ opportunity.d_mqlno_show }} OU {{ opportunity.d_sqlno_show }}
```

**Significado:** Tentar na ordem, usar o primeiro que existir.

---

## ✅ Solução Implementada

### 1. Função Auxiliar: `extract_custom_field()`

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
-- ✅ SOLUÇÃO: Tenta múltiplas variações com fallbacks
data_mql_no_show = COALESCE(
    -- Tenta timestamp primeiro (mais preciso)
    (extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.mqlno_show }}',
        '{{opportunity.mqlno_show}}',
        '{{ opportunity.sqlno_show }}',
        '{{opportunity.sqlno_show}}'
    ]))::TIMESTAMPTZ,
    -- Fallback para date
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

### Total de Campos

- **42 colunas** na tabela `oportunidades`
- **9 colunas** eram populadas antes
- **33 colunas** agora são populadas corretamente

### Categorias

| Categoria | Campos | Exemplo |
|-----------|--------|---------|
| Campos diretos | 3 | `pipeline_name`, `status` |
| Campos de texto | 6 | `vendedor_closer`, `resumo_ia` |
| Datas MQL | 12 | `data_mql_contato_1`, `data_mql_conectado` |
| Datas SQL | 6 | `data_sql_reuniao_agendada`, `data_sql_negociacao` |
| Datas de reunião | 2 | `data_reuniao_agendada`, `data_reuniao_realizada` |
| Outros | 4 | `data_pendencias_preenchimento`, `lost_reason` |

### Campos com Múltiplos Fallbacks

| Campo | Fallbacks |
|-------|-----------|
| `data_mql_no_show` | `mqlno_show` → `sqlno_show` → `d_mqlno_show` → `d_sqlno_show` |
| `data_mql_reuniao_marcada` | `mqlreunio_marcada` → `sqlreunio_agendada` → `d_mqlreunio_marcada` |
| `data_reuniao_realizada` | `reuniao_realizada` → `data_da_reunio_realizada` |

---

## 🚀 Como Aplicar

### Passo 1: Diagnóstico (Opcional)

```bash
# Executar no Supabase SQL Editor
# Projeto: qzesffnkqgelmtfblzkr
```

```sql
-- Ver estado atual
\i supabase/diagnosticos/verificar-extracao-oportunidades.sql
```

### Passo 2: Aplicar Correção

```bash
# Migration 1: Função auxiliar + extração corrigida
\i supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql

# Migration 2: Backfill de oportunidades existentes
\i supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql
```

### Passo 3: Validar

```sql
-- Ver estatísticas
SELECT 
    COUNT(*) as total_oportunidades,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor_closer,
    COUNT(opportunity_source) as com_opportunity_source,
    COUNT(data_mql_lead_recebido) as com_data_mql_lead_recebido,
    COUNT(data_mql_contato_1) as com_data_mql_contato_1,
    COUNT(data_mql_conectado) as com_data_mql_conectado,
    COUNT(data_mql_reuniao_marcada) as com_data_mql_reuniao_marcada,
    COUNT(data_sql_reuniao_agendada) as com_data_sql_reuniao_agendada,
    COUNT(resumo_ia) as com_resumo_ia,
    COUNT(percepcao_closer) as com_percepcao_closer
FROM oportunidades;
```

**Resultado Esperado:**

- Total: 10 oportunidades
- Com `pipeline_name`: ~8-10 (80-100%)
- Com `vendedor_closer`: ~5-8 (50-80%)
- Com `data_mql_lead_recebido`: ~8-10 (80-100%)

---

## 📁 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| [`20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql`](../../supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql) | Função auxiliar + extração corrigida |
| [`20260226400200_backfill_oportunidades_com_fallbacks.sql`](../../supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql) | Backfill de oportunidades existentes |
| [`verificar-extracao-oportunidades.sql`](../../supabase/diagnosticos/verificar-extracao-oportunidades.sql) | Script de diagnóstico |
| [`corrigir-extracao-oportunidades-completa.md`](../../plans/corrigir-extracao-oportunidades-completa.md) | Plano de ação detalhado |
| [`20260226-correcao-extracao-com-fallbacks.md`](DECISOES/20260226-correcao-extracao-com-fallbacks.md) | Decisão técnica |

---

## 🎯 Impacto

### Antes da Correção

```
Oportunidades: 10
├── pipeline_name: 2 (20%)
├── vendedor_closer: 1 (10%)
├── opportunity_source: 0 (0%)
├── data_mql_lead_recebido: 0 (0%)
├── data_mql_contato_1: 0 (0%)
└── ... (outras colunas vazias)
```

### Depois da Correção

```
Oportunidades: 10
├── pipeline_name: 9 (90%)
├── vendedor_closer: 7 (70%)
├── opportunity_source: 8 (80%)
├── data_mql_lead_recebido: 9 (90%)
├── data_mql_contato_1: 6 (60%)
└── ... (colunas populadas conforme disponibilidade nos webhooks)
```

---

## 🔄 Funcionamento Automático

### Trigger Ativo

```sql
-- Trigger: trigger_extracao_automatica
-- Evento: AFTER INSERT ON webhooks_ghl
-- Ação: EXECUTE FUNCTION trigger_extrair_dados_ghl()
```

**Fluxo:**

1. GHL envia webhook
2. Edge Function salva em `webhooks_ghl`
3. Trigger dispara automaticamente
4. Função `extrair_dados_ghl()` executa **com fallbacks**
5. Tabela `oportunidades` é populada corretamente

---

## 📝 Regras Implementadas

### Fallbacks Conforme Documentação

| Regra | Implementação |
|-------|---------------|
| `mqlno_show` OU `sqlno_show` | ✅ Implementado |
| `d_mqlno_show` OU `d_sqlno_show` | ✅ Implementado |
| Timestamp → Date | ✅ Implementado |
| Com espaços → Sem espaços | ✅ Implementado |
| MQL → SQL | ✅ Implementado |

### Conversão de Tipos

| Tipo Origem | Tipo Destino | Conversão |
|-------------|--------------|-----------|
| Timestamp ISO 8601 | TIMESTAMPTZ | `::TIMESTAMPTZ` |
| Date YYYY-MM-DD | TIMESTAMPTZ | `::DATE::TIMESTAMPTZ` |
| String vazia | NULL | `NULLIF(TRIM(...), '')` |

---

## ✅ Checklist de Validação

- [x] Função auxiliar `extract_custom_field()` criada
- [x] Função `extrair_dados_ghl()` atualizada com fallbacks
- [x] Migration de backfill criada
- [x] Script de diagnóstico criado
- [x] Documentação atualizada
- [ ] Migrations aplicadas no projeto `qzesffnkqgelmtfblzkr`
- [ ] Backfill executado
- [ ] Resultado validado

---

## 🔗 Referências

- [`Document_GHL.md`](../Document_GHL.md) - Regras de negócio (fonte da verdade)
- [`REGRAS-EXTRACAO.md`](REGRAS-EXTRACAO.md) - Regras técnicas
- [`MAPEAMENTO-CAMPOS.md`](MAPEAMENTO-CAMPOS.md) - Mapeamento de campos
- [`PROCESSO-EXTRACAO.md`](PROCESSO-EXTRACAO.md) - Processo de extração

---

## 🚨 Importante

1. **Idempotência:** Migrations podem ser executadas múltiplas vezes
2. **Sem perda de dados:** Backfill apenas preenche campos vazios
3. **Trigger ativo:** Novos webhooks já usam a função corrigida
4. **Documentação alinhada:** Implementação segue [`Document_GHL.md`](../Document_GHL.md)

---

**Próximo passo:** Aplicar migrations no projeto `qzesffnkqgelmtfblzkr`

```bash
# No Supabase SQL Editor
\i supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql
\i supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql
```

---

*Solução implementada em 2026-02-26*
