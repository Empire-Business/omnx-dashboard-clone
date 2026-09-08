# Diagnóstico de Inconsistências nos Dados de Leads

**Criado:** 2026-05-08  
**Contexto:** Verificações de qualidade dos dados de oportunidades e contatos

---

## Checklist de qualidade — execute no Supabase SQL Editor

### 1. Oportunidades sem pipeline_id

```sql
SELECT COUNT(*) AS sem_pipeline
FROM oportunidades
WHERE pipeline_id IS NULL
  AND ghl_opportunity_id IS NOT NULL;
-- Esperado: 0
```

### 2. Oportunidades sem data_lead_recebido

```sql
SELECT COUNT(*) AS sem_data_lead
FROM oportunidades
WHERE data_lead_recebido IS NULL
  AND ghl_opportunity_id IS NOT NULL;
-- Se > 0: sync-opp-dates não rodou para esses leads
```

### 3. SDR Name NULL (sem SDR atribuído)

```sql
SELECT
  COUNT(*) FILTER (WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL) AS pendentes,
  COUNT(*) FILTER (WHERE sdr_name IS NOT NULL) AS preenchidos
FROM oportunidades;
-- pendentes esperado: 0 (sync-opp-sdr cobre isso)
```

### 4. Contatos com tags NULL

```sql
SELECT COUNT(*) AS tags_null
FROM contatos
WHERE tags IS NULL
  AND ghl_id IS NOT NULL;
-- Se > 0: cron sync-tags-from-webhook precisa rodar
```

### 5. MQLs não aparecendo (leads com tag mql mas sem pipeline MQL)

```sql
SELECT COUNT(*) AS mqls_com_tag
FROM contatos
WHERE tags ILIKE '%,mql,%'
   OR tags ILIKE 'mql,%'
   OR tags ILIKE '%,mql'
   OR tags = 'mql';
```

### 6. Leads conectados sem mensagem outbound prévia (novo bug corrigido em 2026-05-08)

```sql
-- Leads marcados como conectados mas sem mensagem outbound prévia
SELECT COUNT(*) AS conectados_sem_outbound
FROM oportunidades o
WHERE o.data_conectado IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM comunicacoes com
    WHERE com.contato_id = o.contato_id
      AND com.direction = 'outbound'
  );
-- Esses são leads que foram marcados conectados pela mensagem de botão da página
-- Pode ser necessário limpar data_conectado para esses casos
```

### 7. Oportunidades duplicadas por contato no mesmo período

```sql
SELECT
  contato_id,
  COUNT(*) AS num_opps,
  MIN(data_lead_recebido) AS primeira,
  MAX(data_lead_recebido) AS ultima
FROM oportunidades
WHERE data_lead_recebido >= NOW() - INTERVAL '90 days'
GROUP BY contato_id
HAVING COUNT(*) > 1
ORDER BY num_opps DESC
LIMIT 20;
-- Isso é ESPERADO para contatos que submeteram o formulário mais de uma vez
-- NÃO é um bug, mas o usuário pode perceber como "duplicado"
```

### 8. Vendas sem data_pagamento_entrada

```sql
SELECT COUNT(*) AS vendas_sem_pagamento
FROM vendas_fechamento
WHERE data_pagamento_entrada IS NULL;
-- Esses não aparecem como "fechados" nos dashboards — correto
```

---

## Causas comuns de "inconsistências" percebidas

| Problema percebido | Causa real |
|-------------------|------------|
| Mesmo lead aparece 2x | Contato submeteu formulário 2x (comportamento correto) |
| Lead "conectado" sem ter respondido | Corrigido pela migration 20260508000002 |
| Data de criação 3h errada | Corrigido pela migration 20260508000001 (backfill) |
| SDR aparece como "—" | sdr_name NULL + owner_name NULL; sync-opp-sdr pendente |
| Tags erradas/antigas | Cron sync-tags-from-webhook pode estar atrasado |
| MQL invisible | pipeline_id NULL ou tag "mql" não presente |
