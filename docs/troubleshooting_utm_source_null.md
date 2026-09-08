# Soluções: Trazer Leads Desaparecidos do Painel Tráfego

## 🔍 Problema Confirmado
Leads de fevereiro com `utm_source = NULL` foram excluídos pelo filtro server-side.  
**Causa raiz:** Webhooks não continham utm_source quando chegaram pela primeira vez.

---

## ✅ Solução 1: Atualizar utm_source via GHL Sync (RECOMENDADO)

**Risco:** Baixo  
**Tempo:** Automático (próximo webhook)  
**Ação:** Triggerar novo webhook do GHL

### Passos:

1. Abrir GHL para cada lead desaparecido (mcharliston, etc)
2. Editar o lead e salvar (sem mudar nada)
   → Dispara webhook `contact.updated`
3. Webhook chegará com utm_source capturado
4. Função `extrair_dados_ghl()` atualizará `contatos.utm_source`
5. Lead reaparecerá no painel automaticamente

**Quando:** Assim que tiver novo webhook  
**SQL para monitorar:**
```sql
SELECT COUNT(*) FROM contatos WHERE nome ILIKE '%mcharliston%' AND utm_source IS NOT NULL;
```

---

## ✅ Solução 2: Backfill Manual (IMEDIATO, MAS REQUER CONFIRMAÇÃO)

**Risco:** Médio (pode atribuir utm_source errado)  
**Tempo:** Imediato  
**Ação:** SQL UPDATE

### Se tem CERTEZA que são iads-28:

```sql
-- Trazer TODOS os leads com utm_source NULL de fevereiro para 'iads-28'
UPDATE contatos c
SET utm_source = 'iads-28'
WHERE c.utm_source IS NULL
  AND c.id IN (
    SELECT DISTINCT o.contato_id 
    FROM oportunidades o
    WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
      AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
  );
```

### Se quer ser ESPECÍFICO (apenas mcharliston):

```sql
-- Trazer APENAS mcharliston para 'iads-28'
UPDATE contatos SET utm_source = 'iads-28'
WHERE nome ILIKE '%mcharliston%' AND utm_source IS NULL;

-- Verificar resultado
SELECT nome, utm_source FROM contatos WHERE nome ILIKE '%mcharliston%';
```

**Verificação pós-update:**
```sql
-- Deve aparecer no painel agora
SELECT COUNT(*) FROM contatos 
WHERE nome ILIKE '%mcharliston%' AND utm_source = 'iads-28';
```

---

## ✅ Solução 3: Investigar em GHL (MAIS SEGURO)

**Risco:** Mínimo  
**Tempo:** Manual  
**Ação:** Confirmar dados em GHL

### Passos:

1. Abrir GHL → Search por "mcharliston"
2. Abrir o contato/lead
3. Verificar field customizado ou attribution:
   - Qual é o `utm_source` atual?
   - Veio de qual campanha?
4. Se utm_source diferente de 'iads-28':
   ```sql
   -- Usar o valor REAL
   UPDATE contatos SET utm_source = '[valor_real]'
   WHERE nome ILIKE '%mcharliston%' AND utm_source IS NULL;
   ```
5. Se tem utm_source mas é blank/não definido:
   - Este lead é realmente orgânico?
   - Conferir se deve estar no painel Tráfego
   - Se não, deixar como NULL (correto comportamento)

---

## 🛡️ Proteção: Evitar Problema no Futuro

### Problema: UPDATE sem proteção COALESCE

**Atual (linha 483-516 em extrair_dados_ghl):**
```sql
UPDATE oportunidades o
SET
  pipeline_name = TRIM(w.payload->>'pipeline_name'),
  vendedor_closer = COALESCE(...),  -- ✅ Tem COALESCE
  lost_reason = COALESCE(...),      -- ✅ Tem COALESCE
  -- MAS contatos.utm_source NÃO está aqui (está em INSERT, não UPDATE)
```

**Status:** ✅ OK no momento (utm_source é setado só em INSERT)  
**Mas:** Se precisar atualizar utm_source via webhook, adicionar:

```sql
-- Em extrair_dados_ghl() UPDATE section:
utm_source = COALESCE(
  NULLIF(TRIM(w.payload->>'utm_source'), ''), 
  NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmSource'), ''),
  c.utm_source  -- Não sobrescreve se ambos NULL
)
```

---

## 📋 Checklist: Qual Solução Usar?

| Cenário | Solução | Ação |
|---------|---------|------|
| **Tem certeza: mcharliston = iads-28** | #2 | `UPDATE contatos SET utm_source = 'iads-28' WHERE nome ILIKE '%mcharliston%'` |
| **Quer confirmar em GHL primeiro** | #3 | Abrir GHL, verificar attribution |
| **Pode esperar novo evento do GHL** | #1 | Editar lead em GHL, salvar, aguardar sync |
| **Múltiplos leads desaparecidos** | #1 ou #2 | Usar WHERE IN (lista) ou data_lead_recebido range |

---

## ✅ Validação Pós-Solução

Após aplicar qualquer solução:

```sql
-- 1. Verificar utm_source foi atualizado
SELECT nome, utm_source FROM contatos WHERE nome IN ('mcharliston', 'danieltiago107');

-- 2. Verificar leads aparecem no painel (contagem)
SELECT COUNT(*) FROM contatos c
WHERE c.utm_source IN (SELECT utm_source FROM utm_sources)
  AND c.id IN (
    SELECT DISTINCT o.contato_id FROM oportunidades o
    WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
      AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
  );

-- 3. Comparar com anterior
-- Antes: 2 leads (eduardosampaio.mb, danieltiago107)
-- Depois: 3+ leads (incluindo mcharliston)
```

---

## 📌 Resumo

| Item | Status |
|------|--------|
| **Extrator de webhooks** | ✅ Funciona corretamente |
| **Filtro server-side** | ✅ Implementado corretamente |
| **Causa do problema** | ⚠️ Dados incompletos (utm_source = NULL) |
| **Solução recomendada** | #1 (Aguardar webhook) ou #2 (Backfill imediato) |
| **Tempo esperado** | #1: até 24h (próximo evento) / #2: minutos (SQL) |

