# Onde Configurar a Integração Notion

## Resumo Rápido

Você precisa configurar **3 variáveis de ambiente** no Supabase Dashboard:

| Variável | Onde pegar o valor | Exemplo |
|----------|-------------------|---------|
| `NOTION_API_KEY` | Notion → My integrations → copiar token | `secret_abc123...` |
| `NOTION_DATABASE_ID_PAID` | URL do database de criativos pagos | `1a2b3c4d-5e6f-7890-abcd-ef1234567890` |
| `NOTION_DATABASE_ID_ORGANIC` | URLs dos databases orgânicos (separados por vírgula) | `id1,id2,id3` |

---

## Passo a Passo Completo

### 1. Criar a integração e pegar o token

1. Acesse: **https://www.notion.so/profile/integrations**
2. Clique em **"+ New integration"**
3. Preencha:
   - Name: `OMNX Dashboard`
   - Type: `Internal`
   - Capability: ✅ **Read content**
4. Clique em **Submit**
5. **Copie o token** que aparece (começa com `secret_...`)

Esse token é o `NOTION_API_KEY`.

---

### 2. Pegar o ID do database de criativos PAGOS

1. Abra o database de criativos pagos no Notion
2. Copie a URL do browser:
   ```
   https://www.notion.so/workspace/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX?v=...
   ```
3. O ID são os **32 caracteres** antes do `?v=`

Esse ID é o `NOTION_DATABASE_ID_PAID`.

---

### 3. Pegar os IDs dos databases de criativos ORGÂNICOS

Você tem **múltiplas tabelas** no Notion (uma por perfil, por exemplo).

Para cada tabela:
1. Abra o database no Notion
2. Copie a URL
3. Extraia o ID (32 caracteres antes do `?v=`)

Depois, **junte todos os IDs separados por vírgula**:
```
id1,id2,id3
```

Esse é o `NOTION_DATABASE_ID_ORGANIC`.

**Exemplo:**
```
1a2b3c4d5e6f7890abcdef1234567890,9876543210fedcba0987654321fedcba,abcdef1234567890abcdef1234567890
```

---

### 4. Conectar a integração a CADA database

⚠️ **Sem isso, a API retorna erro 404.**

Para **cada** database (pagos + todos os orgânicos):

1. Abra o database no Notion
2. Clique nos **`...`** (três pontos) no canto superior direito
3. Vá em **"Connections"** → **"Add connections"**
4. Busque por **"OMNX Dashboard"**
5. Clique em **"Confirm"**

---

### 5. Configurar os Secrets no Supabase

1. Acesse: **https://supabase.com/dashboard**
2. Selecione o projeto
3. Vá em **Project Settings → Vault (Secrets)**
4. Clique em **"New secret"** para cada uma:

**Secret 1:**
- Name: `NOTION_API_KEY`
- Value: `secret_...` (o token que você copiou no passo 1)

**Secret 2:**
- Name: `NOTION_DATABASE_ID_PAID`
- Value: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (ID do database pago)

**Secret 3:**
- Name: `NOTION_DATABASE_ID_ORGANIC`
- Value: `id1,id2,id3` (IDs dos databases orgânicos separados por vírgula, sem espaços)

5. Clique em **"Save"** em cada um

---

## Checklist de Configuração

```
[ ] Criar integração em notion.so/profile/integrations
    [ ] Capability: Read content
    [ ] Copiar o token (secret_...)

[ ] Pegar ID do database de criativos PAGOS
    [ ] Abrir database no Notion
    [ ] Copiar URL
    [ ] Extrair os 32 caracteres antes do ?v=

[ ] Pegar IDs dos databases de criativos ORGÂNICOS
    [ ] Para cada database:
        [ ] Abrir no Notion
        [ ] Copiar URL
        [ ] Extrair ID
    [ ] Juntar todos os IDs separados por vírgula

[ ] Conectar a integração a CADA database
    [ ] Database de criativos pagos: ... → Connections → Add → OMNX Dashboard
    [ ] Database orgânico 1: ... → Connections → Add → OMNX Dashboard
    [ ] Database orgânico 2: ... → Connections → Add → OMNX Dashboard
    [ ] (repetir para todos os databases orgânicos)

[ ] Configurar secrets no Supabase
    [ ] Ir em Project Settings → Vault (Secrets)
    [ ] Adicionar secret NOTION_API_KEY
    [ ] Adicionar secret NOTION_DATABASE_ID_PAID
    [ ] Adicionar secret NOTION_DATABASE_ID_ORGANIC (IDs separados por vírgula, sem espaços)
    [ ] Salvar cada um

[ ] Rodar as migrations no Supabase
    [ ] supabase/migrations/20260226200000_create_notion_sync_infra.sql
    [ ] supabase/migrations/20260226200100_configure_notion_sync_cron.sql

[ ] Deployar a Edge Function
    [ ] supabase functions deploy notion-creatives-sync

[ ] Configurar settings do CRON
    [ ] Rodar supabase/diagnosticos/configurar-notion-sync-settings.sql
    [ ] Substituir SUPABASE_URL e ANON_KEY pelos valores reais

[ ] Testar sincronização manual
    [ ] Chamar a Edge Function via dashboard ou curl
    [ ] Verificar se os criativos apareceram em notion_creatives
```

---

## Exemplo de Configuração Completa

### Secrets no Supabase Dashboard (Project Settings → Vault)

```
NOTION_API_KEY=secret_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890
NOTION_DATABASE_ID_PAID=1a2b3c4d5e6f7890abcdef1234567890
NOTION_DATABASE_ID_ORGANIC=9876543210fedcba0987654321fedcba,abcdef1234567890abcdef1234567890
```

### Como cadastrar os orgânicos (várias tabelas)

Você tem **múltiplas tabelas** no Notion, uma para cada perfil. Exemplo:
- Tabela 1: Criativos do perfil @aliancadealtovalor
- Tabela 2: Criativos do perfil @empirebusiness
- Tabela 3: Criativos do perfil @outroperfil

**Passo a passo:**
1. Abra a Tabela 1 no Notion → copie a URL → extraia o ID → anote: `id1`
2. Abra a Tabela 2 no Notion → copie a URL → extraia o ID → anote: `id2`
3. Abra a Tabela 3 no Notion → copie a URL → extraia o ID → anote: `id3`
4. Junte tudo separado por vírgula (sem espaços): `id1,id2,id3`
5. Cole esse valor no secret `NOTION_DATABASE_ID_ORGANIC`

**Exemplo real:**
```
NOTION_DATABASE_ID_ORGANIC=1a2b3c4d5e6f7890abcdef1234567890,9876543210fedcba0987654321fedcba,abcdef1234567890abcdef1234567890
```

A Edge Function vai:
1. Ler `NOTION_DATABASE_ID_ORGANIC`
2. Fazer split por vírgula → `['id1', 'id2', 'id3']`
3. Para cada ID, chamar a API do Notion e buscar os criativos
4. Consolidar tudo em uma única tabela `notion_creatives` no Supabase
5. Cada criativo fica marcado com `database_type = 'organic'` e `notion_database_id = 'id1'` (ou id2, id3...)

### Como testar manualmente (via curl)

```bash
curl -X POST https://[PROJECT_ID].supabase.co/functions/v1/notion-creatives-sync \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "database_type": "paid",
    "request_source": "manual"
  }'
```

### Como verificar se funcionou

```sql
-- Ver criativos sincronizados
SELECT external_id, name, status, database_type, synced_at
FROM notion_creatives
ORDER BY synced_at DESC
LIMIT 10;

-- Ver log de execuções
SELECT database_type, status, records_fetched, records_inserted, started_at, finished_at
FROM notion_sync_runs
ORDER BY started_at DESC
LIMIT 5;
```

---

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `404 Not Found` | Database não conectado à integração | Ir em `...` → Connections no database e adicionar a integração |
| `401 Unauthorized` | `NOTION_API_KEY` inválida | Verificar a variável no Supabase Edge Functions |
| `403 Forbidden` | Integração sem permissão de leitura | Recriar a integração com "Read content" habilitado |
| Nenhum criativo sincronizado | Campo `ID` vazio ou tipo errado | Verificar se o campo é do tipo `unique_id` no Notion |
| `external_id` sempre `null` | Campo não se chama exatamente `ID` | Renomear o campo no Notion para `ID` |
| Filtro por data não funciona | Campo não se chama `Concluído` | Renomear para `Concluído` (com acento) |
| `Perfil` sempre `null` | Campo é `multi_select` em vez de `select` | Mudar o tipo do campo para `select` (seleção única) |
