# Sync GHL Users

> **Edge function:** `sync-ghl-users`  
> **Cron:** `sync-ghl-users-cron` — a cada 6 horas (`0 */6 * * *`)  
> **Migration:** `20260508000000_sync_ghl_users.sql`

---

## O que faz

Sincroniza a tabela `ghl_users` com a lista real de usuários do location GHL via API.

- **Upsert:** insere novos usuários, atualiza nome/email/role_ghl se mudaram
- **Soft delete:** marca `deleted = true` em usuários que saíram do location
- **Preservação:** não altera `papeis`, `auth_user_id` nem `clara_habilitado` (campos administrados manualmente no dashboard)

---

## Endpoint da API GHL

```
GET https://services.leadconnectorhq.com/users/?locationId=U8FTcw90CB5QELUnbGUu
```

Resposta:
```json
{
  "users": [
    {
      "id": "...",
      "name": "...",
      "email": "...",
      "deleted": false,
      "roles": { "role": "admin" }
    }
  ],
  "traceId": "..."
}
```

---

## Por que não usa `ghl_api_jobs`

A API de usuários retorna a lista completa em uma única chamada (atualmente ~28 usuários). Não há paginação nem necessidade de enfileirar múltiplos jobs.

---

## Backfill de 2026-05-08

**Novos usuários inseridos:**
- Caroline Alves
- Gabrielle Oliveira
- Ramon Gonçalves
- SDR RC1
- WEBINAR PRO

**Usuários marcados como deleted (saíram do location):**
- Juninho Dalfré
- Marcelo Tetzner
- Matheus Alves Webinar
- PRY Moraes Webinar
- Williams Batista
- Leticia Costa

---

## Como invocar manualmente

```bash
# Deploy da edge function
supabase functions deploy sync-ghl-users --project-ref qzesffnkqgelmtfblzkr

# Invocar via HTTP (anon key)
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-ghl-users \
  -H "Authorization: Bearer <anon-key>"
```

---

*Documento criado em 2026-05-08 BRT*
