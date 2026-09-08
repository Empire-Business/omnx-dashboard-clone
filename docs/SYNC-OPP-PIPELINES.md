# sync-opp-pipelines — Edge Function

Sincroniza `pipeline_id` e `pipeline_name` de oportunidades que chegam com valores NULL via API GHL.

## Por que existe

Oportunidades que chegam via webhook **sem os campos de pipeline (ou com apenas um deles preenchido)** ficam invisíveis nos painéis de tráfego/pré-vendas. Isso ocorre porque:

1. **PostgREST/PostgreSQL trata NULL como UNKNOWN**: queries como `.neq('pipeline_id', null)` silenciosamente excluem registros com `pipeline_id=NULL`
2. **Sem pipeline_name = sem visibilidade**: leads desaparecem do dashboard mesmo com `pipeline_id` preenchido (dashboard filtra por nome, não por ID)
3. **Afetou 745+ opps** (fevereiro-março/2026) — invisíveis até investigação manual

A API REST do GHL retorna `pipelineId` e `pipelineName` no endpoint `/opportunities/{id}`. Esta edge function sincroniza esses campos para oportunidades que ainda estão com NULL em qualquer um deles.

## Endpoint

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{ "batch_size": 100 }
```

**Parâmetros:**
- `batch_size` (opcional, default: 100, máximo: 500) — quantas oportunidades processar por chamada

**Resposta:**
```json
{
  "processed_jobs": 100,
  "updated": 95,
  "dead_jobs": 0,
  "nodata": 5,
  "not_found": 0,
  "invalid_context": 0,
  "enqueued": 100,
  "active_duplicates": 0,
  "remaining": 25,
  "queue_pending": 100,
  "queue_processing": 0
}
```

- `processed_jobs`: jobs concluídos (`done` / `dead`) drenados da fila nesta chamada
- `updated`: quantas foram atualizadas com sucesso
- `nodata`: quantas não retornaram pipeline da API (oportunidade deletada na GHL?)
- `remaining`: quantas oportunidades ainda têm `pipeline_id=NULL` ou `pipeline_name=NULL`

## API GHL utilizada

```
GET https://services.leadconnectorhq.com/opportunities/{ghl_opportunity_id}
Headers:
  Authorization: Bearer {GHL_API_KEY}
  Version: 2021-04-15

Resposta: {
  "opportunity": {
    "pipelineId": "abc123...",
    "pipelineName": "Pré-Vendas MQL",
    ...
  }
}
```

- Rate limit GHL: 100 req/10s
- `pipelineId` + `pipelineName` salvos diretamente na tabela `oportunidades`

## Fluxo atual via fila central

Desde 2026-03-20, esta função trabalha em três etapas:

1. drena jobs concluídos de `ghl_api_jobs` e aplica `pipeline_id` / `pipeline_name`;
2. enfileira novas oportunidades pendentes para o `ghl-api-worker`;
3. drena novamente antes de responder para aplicar jobs que terminaram durante a própria execução.

O rate limit da GHL agora é centralizado no worker, não mais nesta função.

**Ajuste operacional em `2026-03-20 23:03 BRT`:** a função passou a fazer um segundo
`drainCompletedJobs()` no fim da request para fechar a janela em que um job podia ficar `done`
sem reaplicação até o próximo cron.

## Disparadores

### 1. **Cron Job (A cada 10 minutos)**

Automático via PostgreSQL `pg_cron`:

```sql
SELECT cron.schedule(
  'sync-opp-pipelines-cron',
  '4,14,24,34,44,54 * * * *',  -- a cada 10 minutos com offset +4
  -- chama POST à edge function com batch_size=100
);
```

Iniciado pela migration `20260321000000_cron_sync_opp_pipelines.sql`.

### 2. **Manual (Acelerado)**

Para backfill ou validação manual do fluxo assíncrono:

```bash
# 1) enfileira as oportunidades pendentes
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 500}'

# 2) processa a fila central
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/ghl-api-worker \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"

# 3) roda sync-opp-pipelines de novo para aplicar os resultados
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

Em produção, o cron do worker já faz o passo 2 a cada minuto.

## Monitore

**Verificar progresso:**
```sql
SELECT
  COUNT(*) as total_com_pipeline_null,
  (SELECT COUNT(*) FROM oportunidades) as total_oportunidades
FROM oportunidades
WHERE pipeline_id IS NULL;
```

**Ver últimos logs (Supabase → Functions):**
- Dashboard Supabase → Function Logs → `sync-opp-pipelines`
- Buscar por `[sync-opp-pipelines]`

**Exemplo de saída esperada:**
```
{"processed_jobs":2,"updated":2,"dead_jobs":0,"nodata":0,"not_found":0,"invalid_context":0,"enqueued":0,"active_duplicates":0,"remaining":0,"queue_pending":0,"queue_processing":0}
```

## Histórico de Bugs Corrigidos

### Bug 1 — `pipeline_name` sempre NULL (2026-03-20)

**Causa:** Linha `return { pipeline_id, pipeline_name: null }` hardcoded. O código buscava `pipelineId` da API mas ignorava o campo `pipelineName`.

**Efeito:** 57+ opps com `pipeline_id` preenchido mas `pipeline_name = NULL`. Leads visíveis na query bruta mas potencialmente quebrados em filtros por nome de pipeline.

**Fix:** Extrai `data?.opportunity?.pipelineName` e inclui no update somente se não for null (para não sobrescrever valor existente).

**Arquivo:** `supabase/functions/sync-opp-pipelines/index.ts`

---

### Bug 2 — `pipeline_id` sendo zerado por webhooks sem o campo (2026-03-20)

**Causa:** Migration `20260322000000_webhook_always_overwrites.sql` trocou `COALESCE(NULLIF(...), o.pipeline_id)` por `NULLIF(...)` em `extrair_dados_ghl`. Webhooks de atualização de data (ex: SDR marca `data_conectado`) chegam **sem `pipeline_id`** no payload — com `NULLIF`, isso sobrescreve o pipeline com NULL.

**Efeito:** Novos leads com pipeline correto tinham o campo zerado pelo próximo webhook do mesmo lead. Lead desaparecia do painel silenciosamente.

**Fix:** `20260320000003_fix_extrair_dados_ghl_pipeline_coalesce.sql` — reverteu apenas `pipeline_id` e `pipeline_name` para `COALESCE(NULLIF(...), o.campo_atual)`. Outros campos continuam com `NULLIF` (webhook = fonte de verdade para nome, status, etc.).

---

## Query de monitoramento completa

```sql
-- Estado de saúde dos campos de pipeline
SELECT
  COUNT(*) FILTER (WHERE pipeline_id IS NULL)    AS pipeline_id_null,
  COUNT(*) FILTER (WHERE pipeline_name IS NULL
                    AND pipeline_id IS NOT NULL)  AS pipeline_name_null_sem_id,
  COUNT(*) FILTER (WHERE pipeline_id IS NOT NULL
                    AND pipeline_name IS NOT NULL) AS pipeline_ok,
  COUNT(*)                                        AS total
FROM oportunidades;
-- Saúde esperada: pipeline_id_null = 0, pipeline_name_null_sem_id = 0
```

## Se algo ficar NULL mesmo após o cron

1. **Verificar logs de erro** na dashboard Supabase
2. **Checar se é webhook sem pipeline_id** — se o último webhook do lead não tinha `pipeline_id`, o campo pode ter sido zerado pelo bug 2 (já corrigido em 20260320000003). Reprocessar o webhook mais recente que tinha `pipeline_id`:
   ```sql
   -- Encontrar webhook mais recente com pipeline_id para a opp
   SELECT id, created_at, payload->>'pipeline_id', payload->>'pipeline_name'
   FROM webhooks_ghl
   WHERE payload->>'id' = '<ghl_opportunity_id>'
     AND payload->>'pipeline_id' IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;
   ```
3. **Verificar se a oportunidade existe no GHL** (pode ter sido deletada → API retorna 404 → `pipeline_id` nunca é preenchido)
4. **Chamar manualmente:**
   ```bash
   curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     -d '{"batch_size": 500}'
   ```

## Validação em produção

Auditoria concluída em `2026-03-20 23:07 BRT`:

- 3 oportunidades reais foram testadas na fila central
- `ghl-api-worker` processou os jobs com sucesso
- a própria `sync-opp-pipelines` aplicou `pipelineId` / `pipelineName`
- a pendência residual de 1 oportunidade observada entre `processed_at` e `handled_at` foi resolvida
  com o segundo drain na mesma invocação
- backlog final:
  - `pipeline_id IS NULL = 0`
  - `pipeline_name IS NULL AND pipeline_id IS NOT NULL = 0`
