# Plano: Corrigir Extração Completa de Oportunidades

**Projeto:** qzesffnkqgelmtfblzkr  
**Data:** 2026-02-26  
**Problema:** Muitas colunas da tabela oportunidades não são populadas

---

## 🔍 Análise do Problema

### Documentação Clara Existe

O arquivo [`docs/Document_GHL.md`](../docs/Document_GHL.md) contém **regras claras** sobre:

1. **Campos de oportunidade** (prefixo `opportunity.`)
2. **Campos de contato** (sem prefixo)
3. **Fallbacks** entre campos (ex: `mqlno_show` OU `d_mqlno_show`)
4. **Estrutura de customData** onde ficam os campos personalizados

### O Que Está Faltando

A função [`extrair_dados_ghl()`](../supabase/migrations/20260226300100_update_extrair_dados_ghl_oportunidades.sql) atual:

1. ❌ **Não usa fallbacks** conforme documentado
2. ❌ **Formato incorreto das chaves** em customData
3. ❌ **Não extrai campos sem prefixo `d_`** (datas em timestamp)
4. ❌ **Não trata conversão de tipos** adequadamente

---

## 📋 Regras da Documentação (Document_GHL.md)

### Campos com Fallback

```
{{opportunity.mqlno_show}} OU {{ opportunity.sqlno_show }} OU {{ opportunity.d_mqlno_show }} OU {{ opportunity.d_sqlno_show }}
```

**Significado:** Tentar extrair na ordem, usar o primeiro que existir.

### Formato das Chaves no Payload

Segundo a documentação, os campos vêm em `customData` com formato:

```json
{
  "customData": {
    "{{ opportunity.mqlcontato1 }}": "2026-01-15T10:30:00Z",
    "{{ opportunity.d_mqlcontato1 }}": "2026-01-15",
    "{{opportunity.assignedToUsersName}}": "João Silva"
  }
}
```

**Observação:** Espaços e formatação variam!

### Tipos de Dados

- **Campos com `d_`**: Data no formato `YYYY-MM-DD` (string → DATE)
- **Campos sem `d_`**: Timestamp ISO 8601 (string → TIMESTAMPTZ)
- **Campos de texto**: String simples

---

## 🎯 Solução

### Passo 1: Diagnóstico

Executar [`supabase/diagnosticos/verificar-extracao-oportunidades.sql`](../supabase/diagnosticos/verificar-extracao-oportunidades.sql) para:

1. Ver estrutura real dos webhooks
2. Identificar chaves exatas em customData
3. Comparar webhook vs oportunidade

### Passo 2: Criar Função Auxiliar

Criar função `coalesce_custom_field()` que:

1. Tenta múltiplas variações de chave
2. Remove espaços extras
3. Retorna primeiro valor não-nulo

### Passo 3: Atualizar `extrair_dados_ghl()`

Reescrever PASSO 2 (oportunidades) para:

1. Usar fallbacks conforme documentação
2. Tentar variações de formato de chave
3. Converter tipos corretamente
4. Tratar campos vazios vs NULL

### Passo 4: Backfill

Executar backfill em todas as oportunidades existentes.

---

## 🔧 Implementação

### Migration 1: Função Auxiliar

```sql
-- Função para extrair campo de customData com fallbacks
CREATE OR REPLACE FUNCTION extract_custom_field(
    custom_data jsonb,
    field_variations text[]
) RETURNS text AS $$
DECLARE
    variation text;
    value text;
BEGIN
    FOREACH variation IN ARRAY field_variations
    LOOP
        value := NULLIF(TRIM(custom_data->>variation), '');
        IF value IS NOT NULL THEN
            RETURN value;
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Migration 2: Atualizar extrair_dados_ghl()

Reescrever PASSO 2 com:

```sql
-- Exemplo de extração com fallback
data_mql_no_show = COALESCE(
    (extract_custom_field(w.payload->'customData', ARRAY[
        '{{ opportunity.mqlno_show }}',
        '{{opportunity.mqlno_show}}',
        '{{ opportunity.sqlno_show }}',
        '{{opportunity.sqlno_show}}',
        '{{ opportunity.d_mqlno_show }}',
        '{{opportunity.d_mqlno_show}}',
        '{{ opportunity.d_sqlno_show }}',
        '{{opportunity.d_sqlno_show}}'
    ]))::TIMESTAMPTZ,
    NULL
)
```

### Migration 3: Backfill

Executar função atualizada em todos os webhooks existentes.

---

## 📊 Campos a Corrigir

### Campos Diretos (não em customData)

- ✅ `pipeline_name` → `payload->>'pipeline_name'`
- ✅ `opportunity_name` → `payload->>'opportunity_name'`
- ✅ `status` → `payload->>'status'`

### Campos em customData (com fallback)

| Campo DB | Variações a Tentar | Tipo |
|----------|-------------------|------|
| `vendedor_closer` | `{{opportunity.assignedToUsersName}}`, `{{ opportunity.assignedToUsersName }}` | text |
| `opportunity_source` | `{{ opportunity.source }}`, `{{opportunity.source}}` | text |
| `data_mql_lead_recebido` | `mqlleads_recebidos`, `d_mqlleads_recebidos` | timestamp |
| `data_mql_contato_1` | `mqlcontato1`, `d_mqlcontato1` | timestamp |
| `data_mql_contato_2` | `mqlcontato2`, `d_mqlcontato2` | timestamp |
| `data_mql_contato_3` | `mqlcontato3`, `d_mqlcontato3` | timestamp |
| `data_mql_contato_4` | `mqlcontato4`, `d_mqlcontato4` | timestamp |
| `data_mql_contato_5` | `mqlcontato5`, `d_mqlcontato5` | timestamp |
| `data_mql_contato_6` | `mqlcontato6`, `d_mqlcontato6` | timestamp |
| `data_mql_contato_7` | `mqlcontato7`, `d_mqlcontato7` | timestamp |
| `data_mql_contato_8` | `mqlcontato8`, `d_mqlcontato8` | timestamp |
| `data_mql_no_show` | `mqlno_show`, `sqlno_show`, `d_mqlno_show`, `d_sqlno_show` | timestamp |
| `data_mql_conectado` | `mqlconectado`, `d_mqlconectado` | timestamp |
| `data_mql_perdido` | `mqlperdido`, `d_mqlperdido` | timestamp |
| `data_mql_reuniao_marcada` | `mqlreunio_marcada`, `d_mqlreunio_marcada` | timestamp |
| `data_sql_perdido` | `sqlperdida`, `d_sqlperdida` | timestamp |
| `data_sql_reuniao_agendada` | `sqlreunio_agendada`, `d_sqlreunio_agendada` | timestamp |
| `data_sql_reuniao_realizada` | `sqlreunio_realizada`, `d_sqlreunio_realizada` | timestamp |
| `data_sql_negociacao` | `sqlnegociao`, `d_sqlnegociao` | timestamp |
| `data_pendencias_preenchimento` | `sqlpendencias_preenchimento`, `d__sqlpendencias_preenchimento` | timestamp |
| `data_reuniao_agendada` | `data_da_reunio` | timestamp |
| `data_reuniao_realizada` | `reuniao_realizada`, `data_da_reunio_realizada` | timestamp |
| `resumo_ia` | `resumo_ia` | text |
| `percepcao_closer` | `percepo_do_closer` | text |
| `lost_reason` | `lost_reason` | text |

---

## ✅ Checklist de Execução

- [ ] Executar diagnóstico
- [ ] Analisar estrutura real dos webhooks
- [ ] Criar função auxiliar `extract_custom_field()`
- [ ] Atualizar `extrair_dados_ghl()` com fallbacks
- [ ] Testar em webhook de exemplo
- [ ] Executar backfill
- [ ] Validar dados extraídos
- [ ] Documentar em MUDANCAS.md

---

## 🚨 Atenção

1. **Não assumir formato de chave**: Testar com dados reais primeiro
2. **Usar COALESCE**: Para fallbacks entre variações
3. **Tratar strings vazias**: `NULLIF(TRIM(...), '')` sempre
4. **Conversão de tipo**: Usar `::TIMESTAMPTZ` ou `::DATE` conforme necessário
5. **Idempotência**: Função deve poder rodar múltiplas vezes

---

**Próximo passo:** Executar diagnóstico para ver estrutura real dos webhooks.
