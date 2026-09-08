# Credenciais GHL por Workspace

> **Data:** 2026-07-08 15:14 BRT  
> **Fase:** 5 — Multiplicação do Empire (Opção A: instância isolada por cliente)  
> **Objetivo:** Tornar as credenciais GHL configuráveis por workspace de forma segura e melhorar o rastreamento de webhooks por `location_id`.

---

## Contexto

Na arquitetura de instância isolada por cliente, cada projeto Supabase/Vercel atende uma única conta GHL. O sistema precisa:

1. Saber qual `location_id` enviou cada webhook (auditoria e preparação para multi-tenant).
2. Armazenar apenas o `ghl_location_id` e `webhook_secret` por workspace.
3. Ler a `ghl_api_key` exclusivamente do secret `GHL_API_KEY` das edge functions do Supabase, nunca do banco ou do frontend.

---

## Schema

### `ghl_integration_settings`

Tabela criada na Fase 1 (`20260707000000_create_ghl_mapping_foundation.sql`) e atualizada em `20260709120000_remove_ghl_api_key_from_settings.sql`. Armazena por workspace:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `workspace_id` | UUID | Referência ao workspace |
| `ghl_location_id` | TEXT | Location ID da conta GHL |
| `webhook_secret` | TEXT | Segredo usado para validar webhooks vindos do GHL |
| `webhook_url` | TEXT | URL do webhook (geralmente `/functions/v1/webhook-ghl`) |
| `is_active` | BOOLEAN | Indica se a integração está ativa |

A coluna `ghl_api_key` foi removida. A chave deve ser configurada como secret `GHL_API_KEY` nas edge functions do Supabase (`supabase secrets set GHL_API_KEY="..."`).

RLS: leitura para membros ativos do workspace; escrita apenas para `owner`/`admin`; `service_role` tem acesso total.

### `webhooks_ghl.location_id`

A Fase 5 adiciona a coluna:

```sql
ALTER TABLE webhooks_ghl ADD COLUMN IF NOT EXISTS location_id TEXT;
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_location_id ON webhooks_ghl(location_id);
```

A migration não faz backfill automático de webhooks antigos para evitar statement timeout em tabelas grandes. Webhooks históricos permanecem com `location_id` NULL; novos webhooks gravam o valor automaticamente. Se for necessário preencher registros antigos, execute um update em lotes pequenos fora do horário de pico.

---

## Edge Functions

### `setup-ghl-integration`

Configura ou atualiza as credenciais GHL de um workspace.

- **Endpoint:** `POST /functions/v1/setup-ghl-integration`
- **Autenticação:** JWT no header `Authorization: Bearer <token>`
- **verify_jwt:** `false` (validação interna)
- **Permissão:** apenas `owner` ou `admin` do workspace

**Body:**

```json
{
  "workspace_id": "uuid-do-workspace",
  "ghl_location_id": "mn9aWzjF...",
  "webhook_secret": "opcional"
}
```

> A `ghl_api_key` não é mais enviada no body. A edge function e todas as outras leem a chave da variável de ambiente `GHL_API_KEY`.

**Resposta de sucesso:**

```json
{
  "success": true,
  "workspace_id": "uuid-do-workspace",
  "ghl_location_id": "mn9aWzjF...",
  "webhook_secret_configured": true
}
```

### `webhook-ghl`

Recebe webhooks do GHL e grava o payload bruto.

A Fase 5 alterou a function para extrair `location_id` do payload antes de responder `202`. As variações suportadas são:

- `payload.locationId`
- `payload.location.id`
- `payload.location_id`

O `location_id` é gravado junto com o payload:

```ts
await supabase.from('webhooks_ghl').insert({ payload, location_id: locationId })
```

A lógica existente foi preservada:

- Resposta `202` imediata.
- Processamento assíncrono via `EdgeRuntime.waitUntil`.
- Disparo de `sync-ghl-conversations` para eventos de mensagem/ligação.
- Tratamento de webhooks de workflow (`Customer Replied`).

---

## Validação de Webhooks

A edge function `webhook-ghl` valida o segredo via header `x-webhook-secret` ou `Authorization: Bearer <secret>`. O segredo ainda vem da variável de ambiente `WEBHOOK_SECRET` da instância.

Futuramente, quando houver múltiplos workspaces na mesma instância, o segredo poderá ser lido de `ghl_integration_settings.webhook_secret` com base no `location_id` do payload.

---

## Segurança

- `ghl_api_key` não é mais armazenada no banco nem coletada pelo frontend.
- A chave é lida exclusivamente do secret `GHL_API_KEY` das edge functions do Supabase.
- Apenas `owner`/`admin` do workspace pode chamar `setup-ghl-integration`.
- O frontend salva apenas `ghl_location_id`, `webhook_secret`, `webhook_url` e `is_active` via RLS.
- `webhook-ghl` continua respondendo `202` imediatamente, sem executar queries lentas antes da resposta.

---

## Arquivos Alterados / Criados

- `supabase/migrations/20260709120000_remove_ghl_api_key_from_settings.sql`
- `supabase/migrations/20260708000006_add_location_id_to_webhooks_ghl.sql`
- `supabase/functions/webhook-ghl/index.ts`
- `supabase/functions/setup-ghl-integration/index.ts`
- `supabase/functions/discover-ghl-config/index.ts`
- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx`
- `eb-dash2/src/hooks/useGhlIntegrationSettings.ts`
- `eb-dash2/src/types/ghl-config.ts`
- `docs/GHL-CONFIG-UI.md`
- `docs/GHL-CREDENCIAIS.md`
- `CLAUDE.md` (índice)

---

## Como Validar

### Verificar coluna e índice

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'webhooks_ghl' AND column_name = 'location_id';

SELECT indexname
FROM pg_indexes
WHERE tablename = 'webhooks_ghl' AND indexname = 'idx_webhooks_ghl_location_id';
```

### Verificar que novos webhooks gravam location_id

```sql
SELECT id, location_id, created_at
FROM webhooks_ghl
WHERE location_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

### Verificar configuração da edge function

```bash
supabase functions list
```

Deve aparecer `setup-ghl-integration` com `verify_jwt = false`.
