# Setup: sync-opp-pipelines — Próximos Passos

## Status Atual

✅ **Concluído:**
- Edge function `sync-opp-pipelines` deployada
- Migration com cron job aplicada (Supabase PostgreSQL)
- Documentação completa (`docs/SYNC-OPP-PIPELINES.md`)
- Código commitado

⏳ **Aguardando:**
- GHL API Key válida para ativar sincronização

---

## O que está pronto

### 1. Edge Function (`sync-opp-pipelines`)
- Arquivo: `supabase/functions/sync-opp-pipelines/index.ts`
- Função: Busca `pipeline_id` + `pipeline_name` via API GHL
- Status: ✅ Deployada em `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines`

### 2. Cron Job (PostgreSQL)
- Arquivo: `supabase/migrations/20260321000000_cron_sync_opp_pipelines.sql`
- Cronograma: **A cada 10 minutos** (`*/10 * * * *`)
- Batch por execução: **100 oportunidades**
- Status: ✅ Migrations aplicadas

### 3. Documentação
- Arquivo: `docs/SYNC-OPP-PIPELINES.md`
- Conteúdo: Explicação completa, uso, rate limiting, troubleshooting

---

## Próximo Passo: Configurar a GHL API Key

### 1. Obtenha a API Key

Você precisa da **GHL API Key válida** do seu account GHL:
- Acesse: GHL Dashboard → Settings → API Keys
- Copie a chave (formato: `<GHL_API_KEY>`)

### 2. Configure no Supabase

```bash
# Terminal, na pasta do projeto
supabase secrets set GHL_API_KEY="<SUA_GHL_API_KEY_AQUI>"
```

> ⚠️ Nunca commite a chave real. Ela deve ficar apenas no `.env.local` e/ou nos secrets do Supabase.

### 3. Redeploy da Edge Function

```bash
supabase functions deploy sync-opp-pipelines
```

### 4. Verificar se está funcionando

Aguarde 10 minutos para o cron job executar automaticamente, ou teste manualmente:

```bash
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 100}'
```

---

## Status do Backfill

**Problema Crítico Identificado:**
- **4356 oportunidades** têm `pipeline_id = NULL`
- Estas ficam **invisíveis** no dashboard (PostgREST filtra NULL automaticamente)

**Como o Cron Job Resolve:**
1. A cada 10 minutos, pega 100 opps com `pipeline_id=NULL`
2. Busca dados da API GHL
3. Preenche `pipeline_id` + `pipeline_name`
4. Contínua até não haver mais opps NULL

**Timeline:**
- Com 100 opps/10min: ~7 horas para sincronizar todos os 4356
- Pode acelerar rodando manualmente com `batch_size: 500` (mas cuidado com rate limits GHL)

---

## Monitorar o Progresso

### Via Dashboard Supabase

1. **Functions → Logs**
   - Buscar por `[sync-opp-pipelines]`
   - Ver processados/atualizados/restantes

2. **SQL Query**
```sql
SELECT COUNT(*) as "opps_com_pipeline_null"
FROM oportunidades
WHERE pipeline_id IS NULL;
```

Esperado: começar em 4356 e diminuir gradualmente

### Logs do Cron Job

Também na aba **Extensions → Cron** você pode ver o histórico:

```sql
SELECT * FROM cron.job WHERE jobname = 'sync-opp-pipelines-cron';
SELECT * FROM cron.job_run_details WHERE job_id = ... LIMIT 10;
```

---

## Troubleshooting

### "Failed to execute sync-opp-pipelines"

**Causa:** GHL API Key inválida ou não configurada

**Solução:**
```bash
# Verificar secrets
supabase secrets list

# Verificar se GHL_API_KEY está lá
# Se não estiver, configurar:
supabase secrets set GHL_API_KEY="sua_chave"
supabase functions deploy sync-opp-pipelines
```

### "429 Too Many Requests"

**Causa:** Rate limit do GHL (100 req/10s)

**Solução:** Cron job já implementa rate limiting. Se persistir:
- Reduzir `batch_size` no cron job (editar migration)
- Ou aumentar delay entre requests

### "Oportunidade não encontrada na API"

**Causa:** Oportunidade foi deletada no GHL

**Resultado:** A função marca como "sem dados" e continua (não trava)

---

## Próximas Melhorias

- [ ] Adicionar endpoint para rodae backfill manual acelerado
- [ ] Dashboard com gráfico de progresso do backfill
- [ ] Notificação quando backfill completar
- [ ] Retry automático para opps com erro

---

## Refs

- `docs/SYNC-OPP-PIPELINES.md` — Documentação técnica completa
- `supabase/functions/sync-opp-pipelines/index.ts` — Código source
- `supabase/migrations/20260321000000_cron_sync_opp_pipelines.sql` — Migration com cron
- `docs/SYNC-OPP-DATES.md` — Padrão similar (para referência)
