# Status dos Cron Jobs — Empire GHL-SUPABASE

Última auditoria local: **2026-07-08 15:14 BRT** — índice e crons atualizados após entregas de julho/2026.

> Todas as correções nesta seção já foram **aplicadas em produção** (deploy + migrations confirmados).

---

## Incidente Recente — 2026-03-27 10:31 BRT

### `sync-appointment-dates-cron` — reunião fantasma após cancelamento

**Sintoma real:** lead ainda aparecia com reunião prevista mesmo com appointment cancelado no GHL.

**Causa raiz:** a edge function `sync-appointment-dates` filtrava apenas `deleted = false`. Um appointment com `appointmentStatus = canceled` continuava entrando no cálculo e preservava `data_reuniao_agendada`.

**Correção no código:** a função agora:
- ignora appointments com status `canceled` / `cancelled`
- limpa `data_reuniao_agendada` quando não sobra nenhum appointment ativo

**Leitura operacional após deploy:** cancelamentos e deleções passam a ser corrigidos automaticamente pelo cron de `:03` / `:08` / `:13` / etc., sem depender de intervenção manual.

### `sync-appointment-dates-cron` — reunião válida ficando para trás no refresh

**Sintoma real:** lead com appointment ativo no GHL não aparecia no painel porque `data_reuniao_agendada` continuava com data antiga no banco.

**Exemplo confirmado:** `guilherme@egservicosdigitais.com.br` tinha appointment `confirmed` em `2026-03-31 14:00:00`, mas a oportunidade ainda mostrava `data_reuniao_agendada = 2026-03-27` até o reprocessamento manual.

**Causa raiz:** o sync frequente estava cobrindo um universo operacional grande demais, incluindo histórico antigo, com apenas um lote por request. Isso reduz a prioridade efetiva dos leads com reunião atual.

**Correção aplicada no código da function:**
- janela de refresh caiu de `25` para `10` minutos
- a function passou a processar múltiplos sublotes por request
- o escopo rápido foi restringido a oportunidades recentes/ativas (últimos 60 dias) fora de Recuperação

**Leitura operacional:** a function publicada em produção agora está mais alinhada com uso diário do painel. O próximo ajuste recomendado é atualizar o job SQL do cron para enviar um payload compatível com a nova capacidade (`batch_size`/`max_cycles`) e formalizar isso em migration.

---

## Mapa Completo de Crons

| Nome do Job | Edge Function | Schedule (cron.job) | Frequência | Status |
|---|---|---|---|---|
| `sync-ghl-conversations-incremental` | `sync-ghl-conversations` | `*/10 * * * *` | A cada 10 min em `:00` | ✅ |
| `sync-opp-dates` | `sync-opp-dates` | `2,12,22,32,42,52 * * * *` | A cada 10 min em `:02` | ✅ |
| `sync-opp-pipelines-cron` | `sync-opp-pipelines` | `4,14,24,34,44,54 * * * *` | A cada 10 min em `:04` | ✅ |
| `sync-opp-sdr-cron` | `sync-opp-sdr` | `6,16,26,36,46,56 * * * *` | A cada 10 min em `:06` | ✅ |
| `sync-contact-opportunities` | `sync-contact-opportunities` | `*/5 * * * *` | A cada 5 min, até 100 contatos por execução efetiva | ✅ |
| `sync-contact-attribution` | `sync-contact-attribution` | `1,6,11,16,21,26,31,36,41,46,51,56 * * * *` | A cada 5 min em `:01` | ✅ |
| `sync-appointment-dates-cron` | `sync-appointment-dates` | `3,8,13,18,23,28,33,38,43,48,53,58 * * * *` | A cada 5 min em `:03` | ✅ |
| `sync-contact-tags` | `sync-contact-tags` | `*/15 * * * *` | A cada 15 min | ✅ |
| `ghl-api-worker-cron` | `ghl-api-worker` | `* * * * *` | Todo minuto | ✅ |
| `ghl-opp-reconcile-nightly-start` | `reconcile-contact-opportunities` | `0 6 * * *` | 03:00 BRT (06:00 UTC) | ✅ |
| `ghl-opp-reconcile-processor` | `reconcile-contact-opportunities` | `*/5 * * * *` | A cada 5 min | ✅ |
| `sync-meta-ads-hourly` | `sync-meta-ads` | `0 * * * *` | A cada hora | ✅ |
| `recalcular-discagem-scores` | SQL interno | `*/5 * * * *` | A cada 5 min | ✅ |
| `weekly-reports-start` | `compute-weekly-reports` | `0 7 * * 1` | Segundas 04:00 BRT (07:00 UTC) | ✅ |
| `weekly-reports-process` | `compute-weekly-reports` | `*/10 * * * *` | A cada 10 min | ✅ |
| `weekly-reprocess-cohort` | SQL interno | `0 8 * * 1` | Segundas 05:00 BRT (08:00 UTC) | ✅ |
| `admin-cron-health-check` | `admin-cron-health` | `*/15 * * * *` | A cada 15 min | ✅ |

> **Nota:** `sync-opp-dates` e `sync-opp-pipelines-cron` foram escalonados com offsets de +2 e +4 minutos respectivamente para evitar thundering herd (ver seção abaixo).

### `openclaw-contrato-assinado-retry` — ❌ REMOVIDO em 2026-07-11

Decisão do dono: a integração OpenClaw foi descontinuada por completo. O cron, os
triggers e as funções PL/pgSQL correspondentes foram removidos via migration
`20260824000000_remove_openclaw_integration.sql`. Detalhes completos (o que foi
removido, o que foi preservado, estado em produção) em
[`docs/REMOCAO-OPENCLAW.md`](REMOCAO-OPENCLAW.md). O histórico de implementação
original (mar/2026) permanece abaixo só como registro — não reflete mais o sistema
atual.

<details>
<summary>Histórico (implementação original, mar/2026 — descontinuada)</summary>

**Status na validacao manual:** wrapper SQL e funcoes internas responderam sem erro no remoto.

- criado pela migration `20260324030000_make_openclaw_delivery_confirmed_and_retryable.sql`
- schedule: `* * * * *`
- wrapper SQL testado manualmente em `2026-03-22 22:21 BRT`
- retorno observado:
  - `sync={"falharam":0,"expirados":0,"pendentes":0,"confirmados":0,"processados":0}`
  - `retry={"avaliadas":0,"enfileiradas":0}`
- smoke test adicional: `sincronizar_status_openclaw_contrato_assinado(20)` respondeu `{"falharam":0,"expirados":0,"pendentes":0,"confirmados":0,"processados":0}`
- teste controlado posterior no lead fake `testewfgdfb@teste.xxocom` mostrou a causa real do incidente:
  - antes: timeout de `5000 ms`
  - depois da migration `20260324031000`: `status_code = 200` no mesmo fluxo

**Leitura operacional:** o cron novo existe para dois trabalhos: confirmar resposta real do OpenClaw e reenfileirar falhas/timeout sem depender de novo drag do card.

</details>

---

## Resultado da Auditoria de 2026-03-20 23:07 BRT

### `sync-contact-opportunities` ⚠️

**Estado observado antes do ajuste de vazão:**

- `contact_opp_sync_queue.total`: **17.473**
- `pending`: **7.273**
- `processing`: **0**
- `done`: **10.200**
- `error`: **0**

**Correção aplicada em produção às 22:43 BRT:**

- a edge function `sync-contact-opportunities` passou a consumir **até 2 batches por execução**
- cada batch usa tamanho efetivo **50**
- o cron do banco continua em `*/5`, mas cada disparo agora consegue processar **até 100 contatos**

**Validação manual real em produção após o deploy:**

- chamada feita com payload legado do cron: `{"batch_size":20,"stale_after_minutes":30}`
- resposta:
  - `processed = 100`
  - `batches_run = 2`
  - `batch_size = 50`
  - `done = 100`
  - `retried = 0`
  - `errored = 0`
  - `elapsed_ms = 85844`
- backlog caiu de `pending = 7105` para `pending = 6985`
- `processing` voltou para **0**

**Leitura operacional atual:** o cron não estava quebrado; o problema era vazão baixa para uma rajada grande de `ContactCreate`. Antes, a capacidade teórica era ~`240 contatos/h`. Agora é ~`1200 contatos/h`.

**Impacto no atraso estimado:**

- atraso observado do item mais antigo: ~`11,28h`
- tempo para drenar `6985 pending` sem entrada nova:
  - vazão antiga: ~`29,1h`
  - vazão nova: ~`5,82h`

### `reconcile-contact-opportunities` 🆕

**Status na validação final:** ativo e processando o run atual.

- `ghl-opp-reconcile-processor` executou com sucesso em `2026-03-20 22:10 BRT`
- run ativo `5be3f36d-894a-46ef-abb6-8839bde46afd`
- progresso observado durante a auditoria: `processed_contacts` subiu de `2800` para `2850`

**Validação do cron diário (`ghl-opp-reconcile-nightly-start`):**

- o job está `active = true`
- o wrapper SQL foi testado manualmente: `SELECT ghl_opp_reconcile_start_nightly_job()` retornou `Request ID: 13715`
- a edge function `reconcile-contact-opportunities` com `action=start` devolveu o run ativo existente, então o caminho do cron noturno está funcional sem duplicar execução

### `sync-opp-dates` ✅

**O que faz hoje:** enfileira `GET /opportunities/{id}` em `ghl_api_jobs`, deixa o `ghl-api-worker` chamar a API e depois aplica `createdAt` no banco.

**Teste manual executado na auditoria:**

- chamada manual da edge function
- processamento real pelo `ghl-api-worker`
- segunda chamada para drenar jobs concluídos

**Correção residual aplicada às 23:03 BRT:** a edge ganhou um segundo `drainCompletedJobs()` no
fim da request. Isso eliminou a janela curta em que o worker já tinha concluído o job, mas o
caller ainda não tinha marcado `handled_at`.

**Resultado final:** `data_lead_recebido = NULL: 0`

### `sync-opp-pipelines` ✅

**O que faz hoje:** enfileira `GET /opportunities/{id}` em `ghl_api_jobs`, deixa o `ghl-api-worker` chamar a API e depois aplica `pipelineId` / `pipelineName`.

**Teste manual executado na auditoria:**

- chamada manual da edge function
- enfileiramento de 3 oportunidades reais
- processamento pelo `ghl-api-worker`
- reaplicação do resultado pela própria edge function

**Correção residual aplicada às 23:03 BRT:** o fluxo passou a fazer um segundo drain no fim da
mesma invocação. A pendência residual observada de 1 oportunidade não era erro de cron; era uma
janela entre `processed_at` e reaplicação.

**Resultado final:** `pipeline_id = NULL: 0` e `pipeline_name = NULL com pipeline preenchido: 0`

### `sync-contact-tags` ✅

**O que faz hoje:** enfileira `GET /contacts/{id}` em `ghl_api_jobs` e aplica `contact.tags[]` no banco após o worker processar.

### `sync-contact-attribution` ✅

**O que faz hoje:** repara leads `Facebook + [cp] form-fb` com `utm_*` vazios. A function:

- enfileira `GET /contacts/{id}` em `ghl_api_jobs`
- lê `attributionSource` / `lastAttributionSource` do contato remoto
- traduz o tracking code Meta para o padrão interno do projeto
- preenche `contatos.utm_*` localmente só nas lacunas
- enfileira `PUT /contacts/{id}` para preencher os custom fields equivalentes no GHL só quando estiverem vazios

**Schedule:** `1,6,11,16,21,26,31,36,41,46,51,56 * * * *`

**Observações operacionais:**

- o cron depende da tabela `ghl_custom_field_mappings`; se faltar algum mapeamento lógico obrigatório, a function falha rápido com erro explícito
- o fluxo atual é assíncrono em duas passadas:
  - uma execução enfileira `GET /contacts/{id}`
  - a execução seguinte consome o resultado, atualiza `contatos` e enfileira o `PUT /contacts/{id}`
- em 2026-04-09 foi validado que leads novos do dia (`Domerval Júnior`, `Marcus serrano`, `Diego Alves`) foram corrigidos após o ciclo completo
- permanecem 2 contatos antigos sem `utm_*` porque o próprio `attributionSource` do GHL veio sem `utmContent`, `campaignId` e `adId`: `Rubens Cunha` e `Tatiana Coelho`

**Validação final:**

- 1 contato real sem tags foi enfileirado, processado e aplicado na auditoria
- backlog final `contatos.tags IS NULL: 0`
- dois jobs antigos continuam `dead` apenas como histórico, mas já tratados (`handled_at` preenchido)
- contatos inexistentes no GHL deixam de gerar loop: agora o worker trata `404` e `"Contact not found"` como `not_found` terminal

### `sync-ghl-conversations` ✅

**Estado observado:** saudável pela fonte de verdade correta, `ghl_conversations_sync_log`.

Última execução observada:

- início: `2026-03-20 22:10:01 BRT`
- fim: `2026-03-20 22:11:09 BRT`
- status: `success`
- `messages_upserted`: `3440`

O cron está ativo com schedule `*/10 * * * *`, e o wrapper SQL de produção está alinhado com esse schedule.

### `sync-meta-ads` ✅

**Estado observado:** operacional. Último `cron.job_run_details` visto com `status='succeeded'` em `2026-03-20 22:00 BRT`.

### Snapshot final dos crons validados

| Job | Evidência |
|---|---|
| `ghl-api-worker-cron` | `succeeded` em `2026-03-20 22:14 BRT` |
| `sync-opp-dates` | `succeeded` em `2026-03-20 22:12 BRT` |
| `sync-opp-pipelines-cron` | `succeeded` em `2026-03-20 22:14 BRT` |
| `sync-contact-opportunities` | `succeeded` em `2026-03-20 22:10 BRT` + validação manual às `2026-03-20 22:42 BRT` (`processed=100`, `errored=0`) |
| `sync-contact-tags` | `succeeded` em `2026-03-20 22:00 BRT` |
| `sync-ghl-conversations-incremental` | `succeeded` em `2026-03-20 22:10 BRT` |
| `ghl-opp-reconcile-processor` | `succeeded` em `2026-03-20 22:10 BRT` |
| `ghl-opp-reconcile-nightly-start` | `active=true` + wrapper SQL validado manualmente (`Request ID: 13715`) |
| `sync-meta-ads-hourly` | `succeeded` em `2026-03-20 22:00 BRT` |

**Snapshot final de produção após o fix residual:**
- `pipeline_id NULL = 0`
- `pipeline_name NULL com pipeline preenchido = 0`
- `data_lead_recebido NULL = 0`
- `ghl_api_jobs pending = 0`
- `ghl_api_jobs processing = 0`

---

## Verificação Rápida de Saúde

```sql
-- Oportunidades com backlog técnico
SELECT
  COUNT(*) FILTER (WHERE pipeline_id IS NULL)                            AS opp_pipeline_id_null,
  COUNT(*) FILTER (WHERE pipeline_name IS NULL AND pipeline_id IS NOT NULL) AS opp_pipeline_name_null,
  COUNT(*) FILTER (WHERE data_lead_recebido IS NULL)                     AS opp_data_lead_null
FROM oportunidades;

-- Fila do contato novo
SELECT status, COUNT(*)
FROM contact_opp_sync_queue
GROUP BY status
ORDER BY status;

-- Runs de reconciliação
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
  opportunities_updated,
  started_at,
  finished_at
FROM ghl_opp_reconcile_runs
ORDER BY created_at DESC
LIMIT 10;

-- Contatos com defasagem entre GHL e banco
SELECT
  nome,
  email,
  total_oportunidades_ghl,
  total_oportunidades_db
FROM contatos
WHERE total_oportunidades_ghl IS NOT NULL
  AND total_oportunidades_ghl IS DISTINCT FROM total_oportunidades_db
ORDER BY ABS(total_oportunidades_ghl - total_oportunidades_db) DESC, nome;

-- Logs de conversas
SELECT started_at, status, messages_upserted
FROM ghl_conversations_sync_log
ORDER BY started_at DESC
LIMIT 5;
```

---

## Script de Auditoria

```bash
SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-ghl-sync-health.js
```

O script consolida:

- backlog de `oportunidades`
- status exato de `contact_opp_sync_queue`
- exemplos de itens antigos/presos
- runs recentes de reconciliação
- logs recentes de conversas
- último refresh de tags e Meta Ads

---

## Histórico de Incidentes Relevantes

| Data | Cron / rotina | Problema | Causa | Status |
|---|---|---|---|---|
| 2026-03-17 | `sync-opp-dates` | Parado silenciosamente | secret de service role vazio | ✅ Corrigido |
| 2026-03-20 | `sync-opp-pipelines` | `pipeline_name` não era preenchido | código retornava `null` hardcoded | ✅ Corrigido |
| 2026-03-20 | `sync-contact-opportunities` | fila acumulada + itens presos | retry quebrado + erros de `NOT NULL` + ausência de reclaim | ✅ Corrigido em produção |
| 2026-03-20 | `sync-contact-opportunities` | erro de constraint ao requeue de stale | `requeue_stale` tentava criar `pending` duplicado | ✅ Corrigido em produção |
| 2026-03-20 | todos os crons de 10 min | thundering herd — todos disparavam juntos | schedule `*/10` sem offset — todos em `:00, :10...` | ✅ Corrigido (stagger +2/+4 min) |
| 2026-03-20 | reconciliação de opps | inexistente | não havia infraestrutura de run/backfill | ✅ Implementada e rodando |
| 2026-03-20 | `sync-contact-tags` | 2 contatos em loop de erro | GHL devolvia `"Contact not found"` e worker tratava como erro fatal | ✅ Corrigido com tratamento `not_found` terminal |
