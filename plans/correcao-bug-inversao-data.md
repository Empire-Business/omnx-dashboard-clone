# Plano de Correção: Bug de Inversão Mês/Dia no Campo data_lead_recebido

## Data: 2026-02-27
## Status: Planejamento

---

## 1. Resumo do Problema

### Sintoma
- Registros na tabela `oportunidades` com datas incorretas no campo `data_lead_recebido`
- Exemplo: `2026-02-12` aparece como `2026-12-02` (mês e dia invertidos)
- **209 registros afetados** com datas em meses futuros (impossíveis)

### Causa Raiz Identificada
O bug **NÃO está no webhook bruto** - os dados chegam corretos do GHL:
- Webhook bruto `date_created`: `2026-02-13T01:17:19.806Z` ✅
- Webhook bruto `d_mqlleads_recebidos`: `2026-02-12` ✅
- Tabela `oportunidades.data_lead_recebido`: `2026-12-02 22:21:00+00` ❌

**O problema está na conversão de datas do customData durante a extração.**

---

## 2. Análise Técnica

### Formato dos Dados no Webhook
```json
{
  "date_created": "2026-02-13T01:17:19.806Z",  // ISO8601 com timezone
  "customData": {
    "{{ opportunity.d_mqlleads_recebidos }}": "2026-02-12"  // ISO8601 date only
  }
}
```

### Código Problemático (hipótese)
A conversão `::DATE::TIMESTAMPTZ` pode estar interpretando a string de forma ambígua dependendo do `DateStyle` do PostgreSQL (`ISO, MDY`).

---

## 3. Plano de Execução

### Fase 1: Criar Função Segura de Parse de Data

**Arquivo:** `supabase/migrations/20260227110000_create_safe_date_parse.sql`

```sql
CREATE OR REPLACE FUNCTION public.parse_safe_date(p_date_string text)
RETURNS timestamptz AS $$
DECLARE
    v_result timestamptz;
    v_cleaned text;
BEGIN
    -- Retornar NULL se vazio
    IF p_date_string IS NULL OR NULLIF(TRIM(p_date_string), '') IS NULL THEN
        RETURN NULL;
    END IF;
    
    v_cleaned := TRIM(p_date_string);
    
    -- Tentar parse como ISO8601 timestamp completo primeiro
    BEGIN
        v_result := v_cleaned::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar para próximo método
    END;
    
    -- Tentar parse como data ISO (YYYY-MM-DD)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'YYYY-MM-DD')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar para próximo método
    END;
    
    -- Tentar parse como data brasileira (DD/MM/YYYY)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'DD/MM/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date IS 
'Converte string de data para timestamptz de forma segura, tentando múltiplos formatos';
```

### Fase 2: Corrigir Função extrair_dados_ghl()

**Arquivo:** `supabase/migrations/20260227120000_fix_date_parsing_extrair_dados_ghl.sql`

Substituir todas as conversões diretas `::DATE::TIMESTAMPTZ` por `parse_safe_date()`.

**Antes:**
```sql
(extract_custom_field(w.payload->'customData', ARRAY[...]))::DATE::TIMESTAMPTZ
```

**Depois:**
```sql
parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY[...]))
```

### Fase 3: Backfill dos Dados Corrigidos

**Arquivo:** `supabase/migrations/20260227130000_backfill_correct_dates.sql`

```sql
-- Atualizar data_lead_recebido com dados corretos do webhook bruto
UPDATE oportunidades o
SET data_lead_recebido = parse_safe_date(
    w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'
)
FROM webhooks_ghl w
WHERE o.ghl_opportunity_id = w.payload->>'id'
  AND w.payload->>'pipeline_name' = 'Pré-Vendas MQL'
  AND (
    -- Registros com data no futuro
    EXTRACT(MONTH FROM o.data_lead_recebido) > 2
    OR o.data_lead_recebido IS NULL
  );

-- Para registros sem data no customData, usar date_created do webhook
UPDATE oportunidades o
SET data_lead_recebido = (w.payload->>'date_created')::timestamptz
FROM webhooks_ghl w
WHERE o.ghl_opportunity_id = w.payload->>'id'
  AND w.payload->>'pipeline_name' = 'Pré-Vendas MQL'
  AND o.data_lead_recebido IS NULL;
```

### Fase 4: Validação

```sql
-- Verificar se ainda há registros com datas no futuro
SELECT COUNT(*) as registros_com_problema
FROM oportunidades
WHERE pipeline_name = 'Pré-Vendas MQL'
  AND EXTRACT(YEAR FROM data_lead_recebido) = 2026
  AND EXTRACT(MONTH FROM data_lead_recebido) > 2;

-- Comparar amostra de registros
SELECT 
    o.nome_contato,
    o.data_lead_recebido as data_atual,
    w.payload->>'date_created' as webhook_date_created,
    w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}' as webhook_custom_data
FROM oportunidades o
JOIN webhooks_ghl w ON w.payload->>'id' = o.ghl_opportunity_id
WHERE o.pipeline_name = 'Pré-Vendas MQL'
ORDER BY o.data_lead_recebido DESC
LIMIT 10;
```

---

## 4. Riscos e Mitigações

| Risco | Mitigação |
|-------|------------|
| Dados sobrescritos incorretamente | Fazer backup antes do backfill |
| Performance do UPDATE em lote | Executar em batches de1000 registros |
| Novos webhooks com problema | Corrigir função primeiro, depois backfill |

---

## 5. Ordem de Execução

1. ✅ Criar função `parse_safe_date()`
2. ✅ Corrigir função `extrair_dados_ghl()`
3. ✅ Executar backfill
4. ✅ Validar resultados
5. ✅ Documentar

---

## 6. Estimativa de Registros Afetados

- **Total de MQLs:** ~4.771
- **Registros com problema:** 209 (datas em meses > 2)
- **Registros válidos:** ~4.562

---

## 7. Próximos Passos

- [x] Aprovar plano
- [x] Executar migration de criação da função `parse_safe_date()`
- [x] Executar migration de correção da extração `extrair_dados_ghl()`
- [x] Executar backfill
- [x] Validar com queries de teste

---

## 8. Resultado da Correção (2026-02-27)

### Status: ✅ CONCLUÍDO

### Migrações Aplicadas:
1. `20260227110000_create_safe_date_parse.sql` - Função `parse_safe_date()`
2. `backfill_correct_dates_oportunidades` - Backfill dos dados
3. `fix_extrair_dados_ghl_use_safe_date` - Correção da função de extração

### Validação:
- **Registros com datas no futuro (antes):** 87
- **Registros com datas no futuro (depois):** 0✅
- **Caso de teste (Eugenio):** `2026-12-02` → `2026-02-12` ✅

### MQLs Fevereiro/2026 (Após Correção):
- **Total:** 89 MQLs
- **Em Aberto:** 88
- **Ganhos:** 0
- **Perdidos:** 0
