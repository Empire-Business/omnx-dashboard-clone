# Configuração do Webhook GHL

## URL do Webhook
```
https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/webhook-ghl
```

## Headers Obrigatórios

```http
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
x-webhook-secret: <GHL_WEBHOOK_SECRET>
Content-Type: application/json
```

| Header | Valor | Descrição |
|--------|-------|-----------|
| `apikey` | `<SUPABASE_ANON_KEY>` | Supabase Anon Key (configure em `SUPABASE_ANON_KEY`) |
| `Authorization` | `Bearer <SUPABASE_ANON_KEY>` | Supabase Anon Key (mesmo valor) |
| `x-webhook-secret` | `<GHL_WEBHOOK_SECRET>` | Chave secreta do webhook (configure em `GHL_WEBHOOK_SECRET`) |
| `Content-Type` | `application/json` | Tipo do conteúdo |

> ⚠️ Nunca commite valores reais. Use variáveis de ambiente ou secrets do Supabase.

## Tabela `webhooks_ghl`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | ID único |
| `payload` | jsonb | **JSON bruto do webhook** |
| `created_at` | timestamptz | Data de recebimento |

## Teste

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/webhook-ghl" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-webhook-secret: $GHL_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event": "contact.created", "contact": {"id": "123", "email": "test@test.com"}}'
```

## Configuração no GHL

1. Acesse: **GHL → Settings → Webhooks**
2. **URL**: `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/webhook-ghl`
3. **Headers Customizados**:
   - `apikey`: `<SUPABASE_ANON_KEY>`
   - `Authorization`: `Bearer <SUPABASE_ANON_KEY>`
   - `x-webhook-secret`: `<GHL_WEBHOOK_SECRET>`
4. **Selecione os eventos** desejados

## Segurança RLS
- **INSERT**: Anon (via Edge Function) ✅
- **SELECT**: Autenticados ✅
- **UPDATE/DELETE**: Negado ❌
