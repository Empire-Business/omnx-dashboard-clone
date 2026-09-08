# Bug Fix: 745 Oportunidades com pipeline_id = NULL

**Data:** 2026-03-18
**Status:** ✅ RESOLVIDO (692/745 corrigidas)
**Afetados:** Charles Oliveira + 744 mais leads invisíveis

---

## 📋 Resumo Executivo

Um problema crítico tornou **745 oportunidades invisíveis nos painéis** do dashboard. Leads com dados válidos (datas de recebimento, fechamento) não apareciam em nenhuma aba de pré-vendas porque tinham `pipeline_id = NULL`.

**Causa:** PostgREST + PostgreSQL filtram silenciosamente linhas com `NULL` em operações `.neq()`, então o filtro `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)` excluía esses registros sem erro.

**Solução:** 3 migrations para backfill + diagnóstico.
**Resultado:** 692/745 (92.9%) corrigidas. 53 restantes são casos extremos.

---

## 🔍 Problema Detalhado

### Como Descobrir

Um usuário reportou: *"Por que Charles Oliveira não aparece em janeiro na aba de pré-vendas?"*

Lead tinha:
- ✅ `data_lead_recebido = 2026-01-05` (janeiro)
- ✅ `data_fechado = 2026-01-28` (venda fechada)
- ✅ `status = "won"`
- ❌ `pipeline_id = NULL` ← **CULPADO**
- ❌ `pipeline_name = NULL`

### Causa Raiz: PostgREST + SQL NULL Semantics

```typescript
// Frontend - usePreVendas.ts:163
.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
```

Em SQL, quando você compara `NULL` com qualquer valor:
```sql
NULL != 'Sn1Guqcm6zwZNTVOOf5L'  -- retorna UNKNOWN (não true, não false)
```

**PostgREST transforma UNKNOWN em exclusão silenciosa:**
- Linhas com `true` → incluídas
- Linhas com `false` → excluídas
- Linhas com `UNKNOWN` → **EXCLUÍDAS (silenciosamente)**

Resultado: leads com `pipeline_id=NULL` desaparecem dos resultados **sem mensagem de erro**.

### Por Que pipeline_id Ficou NULL?

Rastreamento:

1. **2026-03-13 14:36:50** — Webhook recebido COM pipeline:
   ```json
   {
     "id": "dfie7A34yZGz013M45uU",
     "pipeline_id": "ZWuCjEXM2VDyLCx8CtGU",
     "pipeline_name": "Vendas SQL"
   }
   ```

2. **Antes disso** — Edge function `sync-contact-opportunities` executada:
   - Buscou oportunidades via API GHL: `GET /opportunities/search?contact_id=X&location_id=Y`
   - API retornou `pipeline: null` para esta opp (bug ou opp sem pipeline atribuído no GHL)
   - **Inseriu com pipeline_id=NULL, pipeline_name=NULL**

3. **Webhook processado depois:**
   - Função `extrair_dados_ghl()` faz UPDATE
   - Usa `COALESCE(webhook_value, existing_value)` para não sobrescrever
   - Mas isso NÃO corrige NULL! `NULL` é mantido porque `COALESCE(webhook_value, NULL)` = webhook_value
   - Entretanto, se o webhook tinha vindo **antes** de sync-contact-opportunities, teria funcionado
   - **Problema:** ordem de execução

### Números do Problema

```sql
SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL;
-- 745 registros
```

Distribuição:
- **743 com data_lead_recebido** (válidas, sincronizadas)
- **2 com data_fechado** (vendas completamente invisíveis!)
- **Não há erro de validação** — colunas nullable permitem NULL
- **Sem alerta** — ninguém percebeu até investigação manual

---

## ✅ Solução Implementada

### Migration 1: Fix Individual (Charles Oliveira)

**20260318100000_fix_charles_oliveira_pipeline.sql**

```sql
UPDATE oportunidades o
SET
    pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU',
    pipeline_name = 'Vendas SQL',
    updated_at = NOW()
WHERE o.ghl_opportunity_id = 'dfie7A34yZGz013M45uU'
  AND o.pipeline_id IS NULL;
```

**Resultado:** 1 opp corrigida (prova de conceito).

### Migration 2: Backfill em Massa (692 Opps)

**20260318110000_backfill_pipeline_id_all_nulls.sql**

Estratégia:
1. Para cada opp com `pipeline_id = NULL`
2. Busca o webhook mais recente desse ghl_opportunity_id
3. Extrai `pipeline_id` e `pipeline_name` do webhook
4. Faz UPDATE

```sql
WITH webhook_pipelines AS (
    SELECT DISTINCT ON (o.id)
        o.id as opp_id,
        TRIM(w.payload->>'pipeline_id') as webhook_pipeline_id,
        TRIM(w.payload->>'pipeline_name') as webhook_pipeline_name
    FROM oportunidades o
    INNER JOIN webhooks_ghl w ON w.payload->>'id' = o.ghl_opportunity_id
    WHERE o.pipeline_id IS NULL
      AND w.payload->>'pipeline_id' IS NOT NULL
      AND TRIM(w.payload->>'pipeline_id') != ''
    ORDER BY o.id, w.created_at DESC
)
UPDATE oportunidades o
SET
    pipeline_id = wp.webhook_pipeline_id,
    pipeline_name = wp.webhook_pipeline_name,
    updated_at = NOW()
FROM webhook_pipelines wp
WHERE o.id = wp.opp_id;
```

**Resultado:**
- ✅ 692 opps corrigidas
- ✅ 2 vendas fechadas agora visíveis
- ⚠️ 53 ainda com NULL (webhooks também não tinham pipeline)

### Migration 3: Diagnóstico das 53 Restantes

**20260318120000_sync_remaining_53_pipelines_from_ghl.sql**

Essas 53 opps não têm pipeline em **nenhuma fonte:**
- Webhook: `pipeline_id = NULL`
- API GHL anterior: `pipeline = null`

Possíveis causas:
- Opps sem pipeline atribuído no GHL
- Bug na sincronização API GHL
- Dados antigos/órfãos

**Próximos passos:** Chamar API GHL atualizada para tentar recuperar ou marcar como "VERIFICAR_PIPELINE".

---

## 📊 Antes e Depois

### Antes

```
Total com pipeline_id = NULL: 745
├── Vendas fechadas invisíveis: 2
│   ├── ajsousaneto@yahoo.com.br (fechado em 2026-01-18)
│   └── Thiago Rodrigues (fechado em 2026-01-14)
└── Leads válidos invisíveis: 743
```

### Depois

```
Total com pipeline_id = NULL: 53 (7.1% restantes)
├── Vendas fechadas corrigidas: 2 ✅
├── Leads válidos corrigidos: 692 ✅
└── Casos extremos ainda NULL: 53 ⚠️
```

---

## 🔐 Regra Crítica para Futuro

**TODA oportunidade DEVE ter `pipeline_id` + `pipeline_name` preenchidos.**

Se inserir opps sem pipeline:

1. ❌ Dashboard não exibe (filtro `.neq()` com NULL = silêncio)
2. ❌ Sem alertas ou logs — é invisível
3. ❌ Sem validação de NOT NULL — banco aceita

### Solução: Validação na Edge Function

Toda edge function que insere opps (sync-contact-opportunities, sync-opp-dates, etc) deve:

```typescript
if (!opportunity.pipelineId || !opportunity.pipelineName) {
  console.error(`[sync-opp] OPP sem pipeline: ${opportunity.id}`);
  // Opção A: Skip e enfileirar para retry
  // Opção B: Usar pipeline padrão (e alertar)
  // Opção C: Falhar e retornar erro
}
```

### Solução: Constraint no Banco

```sql
-- Evitar opps sem pipeline no futuro
ALTER TABLE oportunidades
ADD CONSTRAINT chk_pipeline_not_null
CHECK (pipeline_id IS NOT NULL AND pipeline_name IS NOT NULL);
```

⚠️ **Não adicionar agora** (bloquearia backfill), mas considerar para futuro.

---

## 📝 Lições Aprendidas

1. **PostgREST/SQL NULL semantics são silenciosas**
   - `.neq()` com NULL resulta em UNKNOWN → exclusão automática
   - Não há erro, não há log, desaparece silenciosamente
   - Solução: validar NOT NULL no schema ou código

2. **Webhooks são fonte de verdade, mas nem sempre têm tudo**
   - API GHL (`sync-contact-opportunities`) pode retornar dados incompletos
   - Sempre ter fallback ou validação

3. **Ordem de execução importa**
   - Se webhook chegasse antes de sync-contact-opportunities, teria funcionado
   - Race conditions invisíveis em dados

4. **Monitorar colunas críticas**
   - `pipeline_id` não deveria ser nullable
   - Todo insert/update deveria validar

---

## 📚 Referências

- [`docs/PADRAO-TIMEZONE.md`](PADRAO-TIMEZONE.md) — tipos de data
- [`TABELAS-SISTEMA.md`](../TABELAS-SISTEMA.md) — schema oportunidades
- Edge function: `supabase/functions/sync-contact-opportunities/index.ts`
- Função: `supabase/migrations/20260317030000_fix_extrair_dados_ghl_insert_cte.sql`
