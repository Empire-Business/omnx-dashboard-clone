# Onboarding de Novo Cliente — Sistema Empire

> Guia passo a passo para replicar o Sistema Empire em uma nova conta GoHighLevel.
> Arquitetura aprovada: **instância isolada por cliente** (novo Supabase + novo Vercel + credenciais próprias).
> **Atualizado em:** 2026-07-08 15:14 BRT

---

## 1. Criar o projeto Supabase

Cada cliente deve ter seu próprio projeto Supabase isolado.

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Clique em **New project**.
3. Escolha a organização e defina:
   - **Name:** sugerimos `<cliente>-empire` (ex: `acme-empire`).
   - **Database Password:** gere uma senha forte e guarde em cofre.
   - **Region:** `South America (Saõ Paulo)` (`sa-east-1`) para menor latência.
4. Aguarde o provisionamento (pode levar alguns minutos).
5. Após a criação, vá em **Project Settings → API** e anote:
   - `URL` (ex: `https://abc123.supabase.co`)
   - `anon public` key
   - `service_role` key (nunca exponha no frontend)

---

## 2. Rodar o script de provisionamento

O script `scripts/provision-new-client.ts` automatiza a maior parte do setup.

### Requisitos

- Node.js 18+
- CLI do Supabase instalada e logada (`supabase --version`)
- CLI do Vercel instalada e logada, caso vá deployar (`vercel --version`)
- `@supabase/supabase-js` disponível (já está nas dependências do projeto)

### Modo dry-run (padrão)

Recomendado para validar o fluxo antes de executar de verdade:

```bash
npx tsx scripts/provision-new-client.ts \
  --client-name "acme" \
  --workspace-name "Acme Empire" \
  --owner-email "admin@acme.com" \
  --owner-password "<senha-forte>" \
  --supabase-url "https://<ref>.supabase.co" \
  --supabase-anon-key "<anon-key>" \
  --supabase-service-role-key "<service-role-key>" \
  --ghl-api-key "<ghl-private-token>" \
  --ghl-location-id "<ghl-location-id>" \
  --webhook-secret "<segredo-forte>"
```

### Modo real

Adicione `--create-supabase` e/ou `--deploy-vercel` conforme o que deseja automatizar:

```bash
# Cria projeto Supabase, aplica migrations, deploya functions e prepara Vercel
npx tsx scripts/provision-new-client.ts \
  --create-supabase \
  --deploy-vercel \
  --client-name "acme" \
  --workspace-name "Acme Empire" \
  --owner-email "admin@acme.com" \
  --owner-password "<senha-forte>" \
  --supabase-url "https://<ref>.supabase.co" \
  --supabase-anon-key "<anon-key>" \
  --supabase-service-role-key "<service-role-key>" \
  --ghl-api-key "<ghl-private-token>" \
  --ghl-location-id "<ghl-location-id>" \
  --vercel-token "<vercel-token>"
```

### Variáveis de ambiente

Todos os inputs acima também podem ser lidos de variáveis de ambiente (prioridade: argumentos > env vars > prompt):

- `GHL_API_KEY`
- `GHL_LOCATION_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_SECRET`
- `VERCEL_TOKEN`

Exemplo:

```bash
export GHL_API_KEY="<ghl-private-token>"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

npx tsx scripts/provision-new-client.ts \
  --dry-run \
  --client-name "acme" \
  --workspace-name "Acme Empire" \
  --owner-email "admin@acme.com" \
  --owner-password "<senha-forte>"
```

### O que o script faz

1. Valida os inputs obrigatórios.
2. (Opcional) Cria/links o projeto Supabase.
3. Aplica todas as migrations (`supabase db push`).
4. Configura secrets das edge functions:
   - `GHL_API_KEY`
   - `GHL_LOCATION_ID`
   - `WEBHOOK_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Faz deploy das edge functions (`supabase functions deploy`).
6. Cria o workspace inicial no banco.
7. Faz seed de apps e permissões (`setup_workspace_apps_and_permissions`).
8. Importa o template de mapeamento `Empire Default` (via trigger + reforço idempotente).
9. (Opcional) Cria projeto no Vercel e configura variáveis de ambiente.
10. Exibe a URL do webhook e próximos passos.

---

## 3. Configurar as variáveis de ambiente no Vercel

Se você não usou `--deploy-vercel`, crie o projeto manualmente e importe as variáveis do arquivo `.env.new-client-template`.

### Variáveis obrigatórias

| Variável | Onde encontrar |
|----------|----------------|
| `VITE_SUPABASE_URL` | Dashboard Supabase → Settings → API → URL |
| `VITE_SUPABASE_ANON_KEY` | Dashboard Supabase → Settings → API → `anon public` |
| `VITE_GHL_LOCATION_ID` | GoHighLevel → Settings → Business Profile → Location ID |

### Passos no Vercel

1. Acesse [https://vercel.com/dashboard](https://vercel.com/dashboard).
2. Crie um novo projeto ou importe do GitHub.
3. Vá em **Settings → Environment Variables**.
4. Adicione as variáveis acima.
5. Faça deploy (`git push` na branch configurada ou `vercel --prod`).

---

## 4. Onde encontrar a API key do GHL (Private Integration Token)

1. Faça login na conta GoHighLevel do cliente.
2. Vá em **Settings → Business Profile → API**
3. Clique em **Generate Private Integration Token**.
4. Copie o token e guarde em cofre — ele não é exibido novamente.

> **Atenção:** use o token da **sub-conta (location)** do cliente, não da agência, a menos que a arquitetura exija.

---

## 5. Configurar o webhook no GHL do cliente

1. No GHL, vá em **Settings → Integrations → Webhooks** (ou **Settings → API → Webhooks**).
2. Crie um novo webhook com:
   - **URL:** `https://<ref-do-supabase>.supabase.co/functions/v1/webhook-ghl`
   - **Secret:** o mesmo valor configurado em `WEBHOOK_SECRET`
3. Selecione os eventos:
   - `contact.create`
   - `contact.update`
   - `opportunity.create`
   - `opportunity.update`
   - `opportunity.status_update`
   - `opportunity.assignedToUpdate` (se disponível)
4. Salve.

---

## 6. Acessar `/workspace/ghl-config` e fazer o mapeamento

1. Acesse o frontend deployado no Vercel.
2. Faça login com o e-mail owner configurado no script.
3. Vá em **Configurações → Integração GHL** (`/workspace/ghl-config`).
4. Confira/salve:
   - `ghl_location_id`
   - `webhook_secret`
5. Clique em **Descobrir campos do GHL**.
6. Mapeie pipelines e stages para os conceitos canônicos do Empire:
   - Pré-Vendas
   - Vendas
   - Recuperação
   - Excluir
7. Revise o mapeamento de campos e ajuste se necessário.
8. Salve.

---

## 7. Como testar se o primeiro webhook chegou

1. No GHL, crie ou atualize um contato/oportunidade para disparar um evento.
2. No Supabase Dashboard, abra o **SQL Editor** e rode:

```sql
SELECT id, event_type, location_id, created_at, payload->>'id' as ghl_id
FROM webhooks_ghl
ORDER BY created_at DESC
LIMIT 5;
```

3. Se aparecer uma linha recente, o webhook está funcionando.
4. Verifique se `contatos` e `oportunidades` foram populados:

```sql
SELECT count(*) AS total_contatos FROM contatos;
SELECT count(*) AS total_oportunidades FROM oportunidades;
```

5. Verifique se o mapeamento foi aplicado corretamente:

```sql
SELECT logical_name, ghl_field_key
FROM ghl_field_mappings
WHERE workspace_id = '<workspace-id>'
ORDER BY logical_name;
```

---

## 8. Checklist de go-live

- [ ] Projeto Supabase criado e isolado.
- [ ] Migrations aplicadas sem erros.
- [ ] Edge functions deployadas.
- [ ] Secrets configuradas no Supabase.
- [ ] Usuário owner criado e consegue logar.
- [ ] Workspace criado com apps e permissões ativas.
- [ ] Template `Empire Default` importado para o workspace.
- [ ] Projeto Vercel criado com variáveis de ambiente.
- [ ] Frontend acessível e login funciona.
- [ ] GHL Private Integration Token salvo em cofre.
- [ ] Webhook configurado no GHL com URL e secret corretos.
- [ ] Primeiro webhook recebido e registrado em `webhooks_ghl`.
- [ ] Discovery de campos/pipelines executado com sucesso.
- [ ] Mapeamento de pipelines/stages revisado.
- [ ] Lead/oportunidade de teste aparece nos painéis.

---

## Referências

- [`docs/REPLICACAO-TECNICA.md`](REPLICACAO-TECNICA.md) — arquitetura e processo de atualização em lote.
- [`docs/GHL-CREDENCIAIS.md`](GHL-CREDENCIAIS.md) — credenciais GHL por workspace.
- [`docs/GHL-CONFIG-UI.md`](GHL-CONFIG-UI.md) — interface de mapeamento visual.
- [`scripts/provision-new-client.ts`](../scripts/provision-new-client.ts) — script de provisionamento.
- [`.env.new-client-template`](../.env.new-client-template) — template de variáveis Vercel.
- [`CLAUDE.md`](../CLAUDE.md) — índice e regras do projeto.
