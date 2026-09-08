# Meta Ads Sync - Diagnóstico e Solução

## 🔴 Problema Identificado

A sincronização não estava rodando automaticamente porque:
1. **Job do cron existia** mas a função `sync_meta_ads_job()` não tinha as variáveis configuradas
2. **Variável `app.settings.service_role_key`** não estava definida no PostgreSQL

---

## ✅ SOLUÇÃO APLICADA

A migration `20260225100500_create_meta_ads_sync_infra.sql` foi aplicada com sucesso:
- ✅ Job do cron recriado com `cron.schedule()`
- ✅ Funções atualizadas
- ✅ pg_net habilitado

---

## 🔧 PASSO FINAL: Configurar a Service Role Key

**Execute este comando no SQL Editor do Supabase:**

```sql
-- Substitua pelo valor real da sua Service Role Key
-- Pegue em: Supabase Dashboard > Settings > API > service_role
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJ...SUA_SERVICE_ROLE_KEY';
```

**Depois teste:**

```sql
-- Verificar se funcionou
SELECT sync_meta_ads_job();

-- Verificar log
SELECT * FROM meta_ads_sync_log ORDER BY started_at DESC LIMIT 1;
```

---

## 📊 Verificar se está Funcionando

```sql
-- 1. Verificar jobs do cron
SELECT * FROM cron.job WHERE jobname = 'sync-meta-ads-hourly';

-- 2. Verificar últimas execuções
SELECT * FROM cron.job_run_details WHERE jobid = 2 ORDER BY start_time DESC LIMIT 5;

-- 3. Verificar última sincronização
SELECT * FROM meta_ads_sync_log ORDER BY started_at DESC LIMIT 1;

-- 4. Verificar dados mais recentes
SELECT MAX(fetched_at) as ultima_att FROM meta_ads_insights;
```

---

## 📁 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/20260225100500_create_meta_ads_sync_infra.sql` | Migration com tabelas, funções e cron |
| `supabase/diagnosticos/verificar-meta-ads-sync.sql` | Script de diagnóstico |
| `supabase/diagnosticos/configurar-sync-settings.sql` | Script de configuração |

---

*Documento atualizado em: 2026-02-25*
