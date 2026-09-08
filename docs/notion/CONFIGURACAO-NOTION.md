# Guia de Configuração: Integração Notion

> **Versão:** 1.0  
> **Data:** 2026-02-26  
> **Público:** Dev / Admin do sistema OMNX

---

## Visão Geral

O sistema sincroniza criativos do Notion para o Supabase. A integração é **unidirecional** (só lê, nunca escreve).

```
Notion Database(s) → Edge Function notion-creatives-sync → notion_creatives (Supabase)
                                                          → notion_sync_runs (log)
```

### Dois tipos de criativos

| Tipo | Variável de Ambiente | Estrutura no Notion | Onde aparece no Dashboard |
|------|---------------------|---------------------|--------------------------|
| **Pagos** | `NOTION_DATABASE_ID_PAID` | **1 database único** | Aba ANÚNCIOS → Produção de Criativos (Notion) |
| **Orgânicos** | `NOTION_DATABASE_ID_ORGANIC` | **Múltiplos databases** (separados por vírgula) | Aba ORGÂNICO → Produção |

---

## Passo 1: Criar a Integração no Notion

1. Acesse: **[https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations)**
2. Clique em **"+ New integration"**
3. Preencha:
   - **Name:** `OMNX Dashboard`
   - **Associated workspace:** seu workspace Notion
   - **Type:** `Internal` ← importante (não precisa de OAuth)
4. Em **Capabilities**, marque apenas:
   - ✅ **Read content** (obrigatório)
5. Clique em **"Submit"**
6. Copie o **"Internal Integration Token"** → começa com `secret_...`

Esse token é o valor de `NOTION_API_KEY`.

> ⚠️ **Guarde esse token em segurança.** Ele dá acesso de leitura ao seu workspace Notion.

---

## Passo 2: Identificar os Database IDs

### Como encontrar o ID de um Database Notion

**Pela URL do browser:**
1. Abra o database no Notion (clique nele para abrir em tela cheia)
2. A URL será algo como:
   ```
   https://www.notion.so/workspace/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX?v=...
   ```
3. O ID são os **32 caracteres hexadecimais** antes do `?v=`
4. Você pode usar com ou sem hífens — a API aceita os dois formatos:
   - Com hífens: `1a2b3c4d-5e6f-7890-abcd-ef1234567890`
   - Sem hífens: `1a2b3c4d5e6f7890abcdef1234567890`

**Pelo botão "Share":**
1. Abra o database
2. Clique em **"Share"** (canto superior direito)
3. Clique em **"Copy link"**
4. O ID está na URL copiada (mesma posição descrita acima)

---

## Passo 3: Conectar a Integração aos Databases

⚠️ **Etapa crítica** — sem isso a API retorna erro 404.

Para **cada** database Notion que você quer sincronizar:

1. Abra o database no Notion
2. Clique nos **`...`** (três pontos) no canto superior direito
3. Vá em **"Connections"** → **"Add connections"**
4. Busque por **"OMNX Dashboard"**
5. Clique em **"Confirm"**

Repita para:
- O database de criativos pagos
- Cada database de criativos orgânicos (se tiver múltiplos)

---

## Passo 4: Estrutura Esperada dos Databases

### Campos obrigatórios (nomes exatos)

| Nome do campo no Notion | Tipo no Notion | Campo no Supabase | Observação |
|------------------------|----------------|-------------------|------------|
| `ID` | `unique_id` | `external_id` | Combina prefix + number → `CR-188` |
| `Nome` | `title` | `name` | Texto do título |
| `Status` | `status` | `status` | Nome do status selecionado |
| `Concluído` | `date` | `available_date` | Data de início (com acento!) |
| `Formato` | `multi_select` | `format` | Apenas o **primeiro** item |
| `Objetivo CTA` | `multi_select` | `cta_objective` | Apenas o **primeiro** item |
| `Pasta dos videos` | `url` | `videos_folder_url` | Sem acento em "videos"! |
| `Arquivo final` | `url` | `final_asset_url` | |
| `Perfil` | `select` | `profile` | Select simples (não multi) |

### Detalhes importantes

**`ID` (unique_id):**
- O Notion gera IDs únicos com prefix + number
- Exemplo: prefix `CR`, number `188` → sistema combina em `CR-188`
- **Registros sem ID válido são descartados silenciosamente**
- É a chave de identificação do criativo em todo o sistema

**`Concluído` (date):**
- Usado como filtro de período na sincronização parcial
- O nome precisa ser exatamente `Concluído` (com acento)
- Apenas a data de início é lida (ignora `.end` se for intervalo)

**`Formato` e `Objetivo CTA` (multi_select):**
- Ambos aceitam múltiplos valores, mas o sistema pega apenas o **primeiro**
- Se vazio, salva `null`

**`Pasta dos videos` (url):**
- Nome sem acento em "videos" — exatamente assim
- Se errar o nome, o campo fica `null` silenciosamente

**`Perfil` (select):**
- Deve ser `select` simples, não `multi_select`
- Se for `multi_select`, o extractor ignora e salva `null`

---

## Passo 5: Configurar os Secrets no Supabase

1. Acesse o **Supabase Dashboard**
2. Selecione o projeto
3. Vá em **Project Settings → Edge Functions → Environment Variables**
   _(ou Project Settings → Vault / Secrets, dependendo da versão)_
4. Adicione cada variável abaixo:

**Variável 1:**
```
Name:  NOTION_API_KEY
Value: secret_...  (token do Passo 1)
```

**Variável 2:**
```
Name:  NOTION_DATABASE_ID_PAID
Value: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  (ID do database pago)
```

**Variável 3:**
```
Name:  NOTION_DATABASE_ID_ORGANIC
Value: id1,id2,id3  (IDs separados por vírgula, sem espaços)
```

> As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente — não precisa configurar.

---

## Passo 6: Deploy da Edge Function

```bash
# Na raiz do projeto
supabase functions deploy notion-creatives-sync
```

Verificar no Dashboard → Edge Functions → se `notion-creatives-sync` aparece com status ativo.

---

## Passo 7: Rodar as Migrations

```bash
# Rodar no Supabase (via dashboard SQL Editor ou CLI)
supabase db push
```

Ou executar manualmente os arquivos:
- `supabase/migrations/20260226200000_create_notion_sync_infra.sql`
- `supabase/migrations/20260226200100_configure_notion_sync_cron.sql`

---

## Passo 8: Configurar o CRON

Editar e rodar o arquivo de diagnóstico:
```
supabase/diagnosticos/configurar-notion-sync-settings.sql
```

Substituir `SUPABASE_URL` e `ANON_KEY` pelos valores reais do projeto antes de executar.

---

## Checklist Completo

```
[ ] Passo 1 — Criar integração Notion
    [ ] Acessar notion.so/profile/integrations
    [ ] Criar integração: nome "OMNX Dashboard", tipo Internal
    [ ] Capability: Read content habilitado
    [ ] Copiar token (secret_...)

[ ] Passo 2 — Identificar Database IDs
    [ ] Abrir database de criativos PAGOS → copiar URL → extrair 32 chars antes de ?v=
    [ ] Para cada database ORGÂNICO: extrair ID da URL
    [ ] Montar string para orgânicos: "id1,id2,id3"

[ ] Passo 3 — Conectar integração a cada database
    [ ] Database de criativos pagos → ... → Connections → Add → OMNX Dashboard
    [ ] Cada database orgânico → ... → Connections → Add → OMNX Dashboard

[ ] Passo 4 — Verificar estrutura dos databases
    [ ] Campo ID (unique_id) existe
    [ ] Campo Nome (title) existe
    [ ] Campo Status (status) existe
    [ ] Campo Concluído (date, com acento) existe
    [ ] Campo Formato (multi_select) existe
    [ ] Campo Objetivo CTA (multi_select) existe
    [ ] Campo Pasta dos videos (url, sem acento) existe
    [ ] Campo Arquivo final (url) existe
    [ ] Campo Perfil (select simples, não multi_select) existe

[ ] Passo 5 — Configurar secrets no Supabase
    [ ] Project Settings → Edge Functions → Environment Variables
    [ ] Adicionar NOTION_API_KEY
    [ ] Adicionar NOTION_DATABASE_ID_PAID
    [ ] Adicionar NOTION_DATABASE_ID_ORGANIC

[ ] Passo 6 — Deploy da Edge Function
    [ ] supabase functions deploy notion-creatives-sync
    [ ] Verificar no Dashboard → Edge Functions

[ ] Passo 7 — Rodar migrations
    [ ] 20260226200000_create_notion_sync_infra.sql
    [ ] 20260226200100_configure_notion_sync_cron.sql

[ ] Passo 8 — Configurar CRON
    [ ] Editar configurar-notion-sync-settings.sql com SUPABASE_URL e ANON_KEY reais
    [ ] Executar no SQL Editor do Supabase

[ ] Teste final
    [ ] Clicar em "Sincronizar" no dashboard → toast de sucesso
    [ ] Verificar registros em notion_creatives no Supabase
    [ ] Verificar log em notion_sync_runs
```

---

## Como Testar Manualmente (curl)

```bash
curl -X POST https://[PROJECT_ID].supabase.co/functions/v1/notion-creatives-sync \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"database_type": "paid", "request_source": "manual"}'
```

Resposta esperada (sucesso):
```json
{
  "success": true,
  "run_id": "uuid",
  "database_type": "paid",
  "databases_synced": 1,
  "stats": { "fetched": 42, "inserted": 42, "updated": 0, "skipped": 0 }
}
```

---

## Troubleshooting

| Erro / Sintoma | Causa | Solução |
|----------------|-------|---------|
| `404 Not Found` da API Notion | Database não conectado à integração | `...` → Connections → Add no database |
| `401 Unauthorized` | `NOTION_API_KEY` inválida ou ausente | Verificar secret no Supabase |
| `403 Forbidden` | Integração sem permissão de leitura | Recriar integração com "Read content" |
| Nenhum criativo sincronizado | Campo `ID` vazio ou tipo errado | Campo deve ser `unique_id` no Notion |
| `external_id` sempre `null` | Campo não se chama exatamente `ID` | Renomear para `ID` no Notion |
| Filtro por data não funciona | Campo não se chama `Concluído` | Renomear para `Concluído` (com acento) |
| `profile` sempre `null` | Campo `Perfil` é `multi_select` em vez de `select` | Mudar tipo para `select` simples |
| `videos_folder_url` sempre `null` | Campo se chama `Pasta dos vídeos` (com acento) | Renomear para `Pasta dos videos` (sem acento) |
| Edge Function não aparece | Não foi deployada | `supabase functions deploy notion-creatives-sync` |
| Função existe mas retorna 500 | Secrets não configurados | Verificar todas as 3 variáveis no Dashboard |
