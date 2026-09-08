# sync-contact-opportunities + reconcile-contact-opportunities

Documentação operacional do subsistema que garante que o banco tenha **todas as oportunidades de todos os contatos**.

## Problema que este subsistema resolve

O webhook do GHL não é suficiente para manter `oportunidades` completa.

Dois motivos:

1. O webhook de contato novo pode trazer só a oportunidade mais recente.
2. Alterações em oportunidades antigas do mesmo contato podem não chegar de forma confiável no banco.

Na prática, isso gera dois tipos de falha:

- **cobertura incompleta**: contato existe no GHL com várias oportunidades, mas o Supabase conhece só uma parte
- **desatualização silenciosa**: oportunidade antiga muda no GHL, mas o banco continua com versão velha

Para resolver isso, o sistema foi dividido em duas camadas:

- `sync-contact-opportunities`: reação rápida a `ContactCreate`
- `reconcile-contact-opportunities`: auditoria/backfill/reconciliação contínua

---

## Visão Geral do Fluxo

### Camada 1: contato novo

```text
Webhook ContactCreate
  -> trigger enqueue_contact_opp_sync()
  -> contact_opp_sync_queue
  -> cron sync-contact-opportunities (*/5, até 100 contatos por execução efetiva)
  -> GET /opportunities/search?contact_id=...
  -> upsert por ghl_opportunity_id
```

### Camada 2: reconciliação completa

```text
starter noturno 03:00 BRT
  -> reconcile-contact-opportunities action=start mode=write
  -> cria run + enfileira todos os contatos
  -> processor */5 pega batches do run
  -> compara GHL vs banco
  -> audit-only ou write
  -> em mode=write atualiza contadores em contatos
```

---

## Edge Function: `sync-contact-opportunities`

### Objetivo

Quando chega um `ContactCreate`, buscar **todas** as oportunidades daquele contato no GHL e garantir que o banco não fique só com a “última” que o webhook trouxe.

### Endpoint

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-opportunities" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 50, "max_batches": 2, "stale_after_minutes": 30}'
```

### Resposta

```json
{
  "processed": 100,
  "batches_run": 2,
  "batch_size": 50,
  "max_batches": 2,
  "done": 100,
  "retried": 0,
  "errored": 0,
  "stale_requeued": 0,
  "upserted": 71,
  "remaining": 6985,
  "elapsed_ms": 85844
}
```

### Vazão operacional padrão

- `batch_size` efetivo padrão: `50`
- `max_batches` padrão: `2`
- capacidade efetiva por execução do cron: **até 100 contatos**
- limite de tempo por execução: ~`110s`

Importante:

- o cron legado do banco ainda envia `{"batch_size":20}`, mas a edge function agora eleva o lote efetivo para `50`
- para teste pequeno e controlado, envie `{"batch_size": 5, "exact_batch_size": true}`

### Melhorias implementadas em 2026-03-20

- claim atômico via RPC `claim_contact_opp_sync_queue()`
- recuperação de itens presos em `processing` via `requeue_stale_contact_opp_sync_queue()`
- retry real usando `attempts` correto
- fallback para `nome_contato` e `contato_id` antes do `upsert`
- merge com oportunidade já existente para não zerar campos bons quando a API vier parcial
- fallback explícito de `location_id` via `GHL_LOCATION_ID` quando a tabela `contatos` não tiver esse campo preenchido
- processamento multi-batch por execução com limite de tempo para aumentar vazão sem depender de alterar o cron SQL
- suporte a `exact_batch_size=true` para testes manuais pequenos sem afetar o modo operacional padrão

### Regra de escrita em `oportunidades`

- identidade = `ghl_opportunity_id`
- se a opportunity já existe, o registro é **atualizado**
- se não existe, é **criado**
- `data_lead_recebido` continua **intocável** aqui
- `pipeline_id`, `pipeline_name` e outros campos não devem ser sobrescritos por `null` vindo da API

### Fila: `contact_opp_sync_queue`

Campos relevantes:

- `status`: `pending | processing | done | error`
- `attempts`: quantas tentativas reais já aconteceram
- `claimed_at`: quando o worker pegou o item
- `last_error`: último erro técnico conhecido

Regras:

- item preso em `processing` por mais de `stale_after_minutes` volta para `pending`
- na 3ª falha real, vai para `error`
- `done` representa processamento concluído daquele item da fila, não garantia absoluta de consistência eterna do contato

---

## Edge Function: `reconcile-contact-opportunities`

### Objetivo

Executar reconciliação completa entre:

- o que o GHL diz que o contato tem hoje
- o que a tabela `oportunidades` tem para esse contato

### Ações suportadas

#### `action=start`

Cria um run e enfileira todos os contatos.

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/reconcile-contact-opportunities" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action":"start","mode":"audit","scope":"all_contacts","source":"manual"}'
```

#### `action=process`

Processa um lote do run ativo.

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/reconcile-contact-opportunities" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action":"process","batch_size":25,"stale_after_minutes":30}'
```

#### `action=status`

Retorna resumo do run ativo ou de um `run_id`.

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/reconcile-contact-opportunities" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action":"status"}'
```

### Modos

#### `mode=audit`

Não grava oportunidades. Só mede:

- `ghl_total`
- `db_total`
- `missing_in_db`
- `extra_in_db`
- `updated_in_db`

#### `mode=write`

Faz a mesma comparação e também executa `upsert` corretivo do que estiver faltando ou divergente.

Além disso, grava em `contatos`:

- `total_oportunidades_ghl`
- `total_oportunidades_db`

---

## Tabelas Novas

### `ghl_opp_reconcile_runs`

Um run representa uma execução macro de reconciliação.

Campos principais:

- `mode`
- `scope`
- `source`
- `status`
- `total_contacts`
- `processed_contacts`
- `success_contacts`
- `error_contacts`
- `opportunities_missing`
- `opportunities_extra`
- `opportunities_inserted`
- `opportunities_updated`

Status possíveis:

- `pending`
- `running`
- `done`
- `done_with_errors`
- `failed`

### `ghl_opp_reconcile_items`

Um item representa um contato específico dentro de um run.

Campos principais:

- `run_id`
- `contato_id`
- `ghl_contact_id`
- `location_id`
- `status`
- `attempts`
- `claimed_at`
- `last_error`
- `ghl_total`
- `db_total`
- `missing_in_db`
- `extra_in_db`
- `updated_in_db`
- `inserted_count`
- `updated_count`

Leitura de `db_total`:

- `mode=audit`: contagem atual do banco sem escrita
- `mode=write`: contagem do banco após o `upsert` corretivo daquele contato

---

## Contadores em `contatos`

Para facilitar cron corretivo e triagem rápida, a reconciliação noturna grava dois contadores no próprio contato:

- `total_oportunidades_ghl`: quantas oportunidades a API GHL retornou para o contato
- `total_oportunidades_db`: quantas oportunidades o banco ficou tendo para o contato após a reconciliação `write`

### Query operacional de defasagem

```sql
SELECT
  id,
  ghl_id,
  nome,
  email,
  total_oportunidades_ghl,
  total_oportunidades_db
FROM contatos
WHERE total_oportunidades_ghl IS NOT NULL
  AND total_oportunidades_ghl IS DISTINCT FROM total_oportunidades_db
ORDER BY
  ABS(total_oportunidades_ghl - total_oportunidades_db) DESC,
  nome NULLS LAST;
```

Interpretação:

- `ghl > db`: faltam oportunidades no banco
- `ghl < db`: o banco tem oportunidades a mais para revisão
- `ghl = db`: contato reconciliado em contagem

---

## Crons

### `sync-contact-opportunities`

- Frequência: `*/5 * * * *`
- Função: consumir a fila de contatos novos
- Vazão efetiva padrão: até `2` batches de `50` por execução = **até 100 contatos por cron** (~`1200/h`)

### `ghl-opp-reconcile-nightly-start`

- Frequência: `0 6 * * *`
- Equivalência: **03:00 BRT**
- Função: iniciar run noturno `mode=write`
- Efeito esperado: atualizar `total_oportunidades_ghl` e `total_oportunidades_db` em `contatos`

### `ghl-opp-reconcile-processor`

- Frequência: `*/5 * * * *`
- Função: consumir os itens do run ativo em batches

---

## Como auditar se está funcionando

### 1. Ver fila de contato novo

```sql
SELECT status, COUNT(*)
FROM contact_opp_sync_queue
GROUP BY status
ORDER BY status;
```

### 2. Ver itens presos

```sql
SELECT id, ghl_contact_id, attempts, created_at, claimed_at, last_error
FROM contact_opp_sync_queue
WHERE status = 'processing'
ORDER BY created_at ASC;
```

### 3. Ver runs de reconciliação

```sql
SELECT
  id,
  mode,
  source,
  status,
  total_contacts,
  processed_contacts,
  success_contacts,
  error_contacts,
  opportunities_missing,
  opportunities_inserted,
  started_at,
  finished_at
FROM ghl_opp_reconcile_runs
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Ver divergências nominais de um run

```sql
SELECT
  ghl_contact_id,
  nome_contato,
  email_contato,
  ghl_total,
  db_total,
  missing_in_db,
  extra_in_db,
  updated_in_db,
  last_error
FROM ghl_opp_reconcile_items
WHERE run_id = '{run_id}'
ORDER BY status, created_at;
```

### 5. Script consolidado

```bash
SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-ghl-sync-health.js
```

### 6. Ver contatos com defasagem de contagem

```sql
SELECT
  nome,
  email,
  total_oportunidades_ghl,
  total_oportunidades_db
FROM contatos
WHERE total_oportunidades_ghl IS NOT NULL
  AND total_oportunidades_ghl IS DISTINCT FROM total_oportunidades_db
ORDER BY ABS(total_oportunidades_ghl - total_oportunidades_db) DESC, nome;
```

---

## Decisões de negócio preservadas

- mesma `opportunity_id` = mesma oportunidade
- lead continua sendo oportunidade
- `data_lead_recebido` continua exclusiva da API GHL
- oportunidade de Recuperação não vira lead novo por contato; a exclusão continua sendo por oportunidade/pipeline, não pelo contato inteiro

---

## Observação importante sobre `location_id`

Em produção, a tabela `contatos` historicamente ficou com `location_id = NULL` para praticamente todos os contatos. Por isso:

- `sync-contact-opportunities` e `reconcile-contact-opportunities` usam fallback por `GHL_LOCATION_ID`
- se esse secret não estiver configurado, usam o ID padrão da OMNX já validado no ambiente atual

Sem isso, a chamada `GET /opportunities/search?contact_id=...&location_id=...` pode falhar com `422`.
