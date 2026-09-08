# SYNC-CONTACT-TASKS

## O que é

Sistema que sincroniza tasks pendentes dos contatos do GHL para a tabela `ghl_tasks` no Supabase, exibindo-as no painel de discagem como alertas de retorno agendado.

---

## Tabela: `ghl_tasks`

Criada em `supabase/migrations/20260511000006_create_ghl_tasks.sql`.

| Campo               | Tipo        | Descrição                                      |
|---------------------|-------------|------------------------------------------------|
| `ghl_task_id`       | TEXT UNIQUE | ID da task no GHL                              |
| `contact_ghl_id`    | TEXT        | GHL ID do contato                              |
| `contato_id`        | UUID        | FK para `contatos.id`                          |
| `title`             | TEXT        | Título da task (ex: "Retornar às 15h")         |
| `due_date`          | TIMESTAMPTZ | Data/hora de vencimento                        |
| `completed`         | BOOLEAN     | `true` quando concluída                        |
| `deleted`           | BOOLEAN     | `true` quando deletada                         |
| `assigned_to_ghl_id`| TEXT        | GHL ID do usuário responsável                  |
| `task_type`         | TEXT        | Tipo (`Call`, `Email`, etc.) — default `Call`  |

---

## Camadas de sincronização

### 1. Webhook em tempo real (camada principal)

A função `processar_task_ghl()` é chamada pelo trigger `trigger_extrair_dados_ghl` após cada INSERT em `webhooks_ghl`. Processa os eventos:

| Evento GHL    | Ação                              |
|---------------|-----------------------------------|
| `TaskCreate`  | INSERT ou UPDATE (upsert)         |
| `TaskUpdate`  | UPDATE via upsert                 |
| `TaskComplete`| `completed = true`                |
| `TaskDelete`  | `deleted = true`                  |

### 2. Cron periódico (backfill / tolerância a falhas)

Edge function `sync-contact-tasks` roda a cada 15 minutos via pg_cron (migration `20260512000001_cron_sync_contact_tasks.sql`).

- Busca contatos ativos nos pipelines de discagem (`Pré-Vendas MQL`, `Auto Agendamento`)
- Para cada contato: `GET /contacts/{ghl_id}/tasks` na API GHL
- Filtra `completed=false` e faz upsert em `ghl_tasks`
- Processa em batches de 20 com delay de 150ms para respeitar rate limit

---

## Exibição no painel de discagem

### Prioridade 2 — "Task agendada"

Leads com task com `due_date` = hoje (SP) são classificados como **Prioridade 2** no `useDiscagem`. Aparecem na segunda seção da lista, antes de `Respondeu` e `Últimos 3 dias`.

### Bloco "Pedidos de retorno"

Exibido acima da lista de leads em `DiscagemTab.tsx` quando há leads P2 não marcados como "já liguei". Formato:

> **[Nome do lead]** pediu para falar a partir do dia **DD/MM/AAAA** · _título da task_

Cada linha é clicável e abre o LeadCard do lead.

---

## Verificação

```sql
-- Tasks pendentes por contato
SELECT c.nome, t.title, t.due_date
FROM ghl_tasks t
JOIN contatos c ON c.id = t.contato_id
WHERE NOT t.completed AND NOT t.deleted
ORDER BY t.due_date;

-- Tasks para hoje (SP)
SELECT COUNT(*) FROM ghl_tasks
WHERE NOT completed AND NOT deleted
  AND due_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND due_date <  (now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '1 day';
```
