# Replicação Técnica — Sistema Empire

> Documentação da arquitetura e do processo de replicação do Empire para múltiplos clientes GoHighLevel.

---

## Arquitetura de replicação (Fase 7 — modelo híbrido)

**Atualizado em 2026-07-11.** A decisão original (Opção A — instância isolada por
cliente) permanece válida para o tier enterprise/alto risco, mas deixou de ser a
**única** opção depois do plano multi-tenant Agency (`docs/PLANO-MULTI-TENANT-AGENCY.md`).
Hoje `scripts/provision-new-client.ts` suporta dois modos — a decisão de qual usar
é por cliente, não uma escolha única de arquitetura para todo o produto:

| Modo | Quando usar | O que cria |
|---|---|---|
| `--mode=isolated-instance` (padrão, comportamento original) | Tier enterprise/alto risco, ou cliente que exige isolamento físico total do banco (ex: exigência contratual/regulatória) | Projeto Supabase novo + deploy Vercel novo + workspace único nesse projeto |
| `--mode=agency-subaccount` (Fase 7, novo) | Tier padrão — a maioria dos clientes | Workspace **dentro** da instância Agency já existente (mesmo Supabase/Vercel), vinculado via `agency_workspaces` |

> Em conjunto com o **Single-Tenant Lock** (ver [`docs/SINGLE-TENANT-LOCK.md`](SINGLE-TENANT-LOCK.md)), cada instância `isolated-instance` (Supabase + Vercel) atende **apenas uma empresa** — essa parte do modelo não mudou. O que mudou é que agora existe uma segunda opção (`agency-subaccount`) que NÃO cria uma instância nova: o cliente vira uma sub-conta isolada por RLS (`agency_workspaces` + políticas aditivas, ver `docs/PLANO-MULTI-TENANT-AGENCY.md` seções 1 e 3) dentro de uma instância Agency que atende múltiplos clientes.

Cada novo cliente em `isolated-instance` recebe:

| Recurso | Isolado por cliente? | Onde fica |
|---------|----------------------|-----------|
| Banco de dados | ✅ Sim | Novo projeto Supabase |
| Backend (edge functions) | ✅ Sim | Deploy no Supabase do cliente |
| Credenciais GHL | ✅ Sim | Secrets do Supabase + `ghl_integration_settings` |
| Frontend | ✅ Sim | Novo deploy Vercel |
| Workspace | ✅ Sim | Banco do cliente |
| Código-fonte | ❌ Não | Repositório único (branchs/instalações separadas no Vercel) |
| Template de mapeamento | ❌ Não | Tabela global `ghl_field_mapping_templates` (commitado via migration) |

Cada novo cliente em `agency-subaccount` recebe:

| Recurso | Isolado por cliente? | Onde fica |
|---------|----------------------|-----------|
| Banco de dados | ❌ Não (isolado por RLS, não fisicamente) | Instância Agency compartilhada |
| Backend (edge functions) | ❌ Não | Instância Agency compartilhada — já resolve credencial por workspace (Fase 2) |
| Credenciais GHL | ✅ Sim, por workspace | `workspace_integration_credentials` (Vault) — cliente conecta via BYOK, `/workspace/integracoes` |
| Frontend | ❌ Não | Instância Agency compartilhada |
| Workspace | ✅ Sim | Mesmo banco, isolado por `workspace_id` + RLS + `agency_workspaces` |
| Vínculo com a agência | ✅ Sim | `agency_workspaces` (`agency_id`, `workspace_id`, `status`, `provisioning_mode`) |

---

## O que é compartilhado vs. isolado

### Compartilhado (código-fonte)

- Repositório GitHub com todo o código do frontend (`eb-dash2`) e das edge functions (`supabase/functions`).
- Migrations do Supabase (`supabase/migrations`).
- Template padrão de mapeamento GHL (`ghl_field_mapping_templates`).
- Documentação em `docs/`.

### Isolado (por cliente)

- Projeto Supabase com banco zerado.
- Deploy das edge functions no projeto do cliente.
- Secrets das edge functions (`GHL_API_KEY`, `GHL_LOCATION_ID`, `WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
- Deploy Vercel com variáveis de ambiente do cliente.
- Workspaces, usuários, permissões e dados de negócio no banco.

---

## Fluxo de provisionamento

```text
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│   Código-fonte  │────▶│  scripts/provision-new-client.ts  │────▶│  Novo Supabase  │
│   (este repo)   │     │      (dry-run por padrão)   │     │   (banco zero)  │
└─────────────────┘     └─────────────────────────────┘     └─────────────────┘
                                                                      │
                                                                      ▼
                                                             ┌─────────────────┐
                                                             │ Deploy das edge │
                                                             │   functions     │
                                                             └─────────────────┘
                                                                      │
                                                                      ▼
                                                             ┌─────────────────┐
                                                             │ Workspace + apps│
                                                             │   + template    │
                                                             └─────────────────┘
                                                                      │
                                                                      ▼
                                                             ┌─────────────────┐
                                                             │  Deploy Vercel  │
                                                             │  (frontend)     │
                                                             └─────────────────┘
```

### Etapas detalhadas

1. **Criar projeto Supabase** (manual ou via `--create-supabase`).
2. **Aplicar migrations** (`supabase db push`) — cria tabelas, funções, triggers, RLS e seeds.
3. **Configurar secrets** das edge functions via CLI (`supabase secrets set`).
4. **Deploy das edge functions** (`supabase functions deploy`).
5. **Criar workspace** via RPC `create_workspace_with_owner`.
6. **Seed de apps/permissões** via `setup_workspace_apps_and_permissions`.
7. **Importar template Empire Default** — automático por trigger + reforço idempotente no script.
8. **Deploy no Vercel** (manual ou via `--deploy-vercel`).
9. **Configurar webhook no GHL** do cliente.

---

## Fluxo de provisionamento — `agency-subaccount`

```text
┌─────────────────┐     ┌──────────────────────────────────────┐     ┌──────────────────────┐
│  Instância       │────▶│  provision-new-client.ts              │────▶│  Novo workspace       │
│  Agency já       │     │  --mode=agency-subaccount --execute  │     │  (mesmo banco)        │
│  existente       │     │  (dry-run por padrão)                 │     └──────────────────────┘
└─────────────────┘     └──────────────────────────────────────┘               │
                                                                                  ▼
                                                                         ┌──────────────────────┐
                                                                         │ agency_workspaces     │
                                                                         │ status=active|pending │
                                                                         └──────────────────────┘
                                                                                  │
                                                                                  ▼
                                                                         ┌──────────────────────┐
                                                                         │ Cliente conecta a     │
                                                                         │ própria chave GHL     │
                                                                         │ (BYOK, Fase 4)        │
                                                                         └──────────────────────┘
```

### Etapas detalhadas

1. **Validar que a agência existe** (`agencies.id`) — sem isso, o script recusa
   antes de criar qualquer coisa (fail-closed).
2. **Criar workspace + owner** — reaproveita a mesma lógica de `isolated-instance`
   (`create_workspace_with_owner`, `setup_workspace_apps_and_permissions`,
   import do template Empire Default). Não cria projeto Supabase nem faz deploy.
3. **Vincular à agência** — `INSERT` em `agency_workspaces`
   (`provisioning_mode='manual_byok'`). Se `--ghl-location-id` foi informado,
   nasce `status='active'`; senão nasce `status='pending'` (o cliente conecta a
   própria chave depois). Índice único `uq_agency_workspaces_location_active`
   impede dois workspaces ativos com o mesmo `location_id` (erro claro, não
   silencioso).
4. **Cliente conecta a própria chave** via `/workspace/integracoes` (BYOK, Fase 4)
   — não há `GHL_API_KEY` global nem secret novo a configurar.

**Não-atomicidade conhecida:** se a etapa 3 falhar (ex.: `location_id` já ativo em
outro workspace), o workspace e o usuário owner da etapa 2 **já foram criados** e
ficam órfãos (sem vínculo de agência). Isso espelha o comportamento já existente
do modo `isolated-instance` (que também não faz rollback entre etapas — ex.: se o
deploy Vercel falhar depois do workspace já ter sido criado). Em caso de erro,
o operador deve conferir manualmente (`SELECT * FROM workspaces WHERE name = '...'`)
e decidir se reaproveita o workspace (corrigindo o `location_id` e rodando de novo
só a etapa de vínculo) ou remove o órfão.

**Exemplo dry-run:**

```bash
npx tsx scripts/provision-new-client.ts \
  --mode=agency-subaccount \
  --agency-id "<agency-uuid>" \
  --client-name "acme" \
  --workspace-name "Acme (sub-conta)" \
  --owner-email "admin@acme.com" \
  --owner-password "<senha-forte>" \
  --supabase-url "https://<ref-da-instancia-existente>.supabase.co" \
  --supabase-anon-key "<anon>" \
  --supabase-service-role-key "<service-role>"
```

Adicione `--execute` para sair do dry-run (nesse modo, `--create-supabase`/
`--deploy-vercel` não se aplicam, então `--execute` é o único jeito de rodar de
verdade).

---

## Como atualizar o template padrão

O template `Empire Default` está na tabela global `ghl_field_mapping_templates` e é propagado para novos workspaces via trigger `trg_new_workspace_ghl_field_mappings`.

### Para alterar o template

1. Edite a migration correspondente (ex: `supabase/migrations/20260708000000_update_empire_default_template_full.sql`) ou crie uma nova migration.
2. Atualize os registros de `ghl_field_mapping_templates`.
3. Aplique a migration em **todos** os projetos Supabase dos clientes.
4. (Opcional) Faça backfill dos workspaces existentes com um `INSERT ... ON CONFLICT` de `ghl_field_mappings` a partir do template.

### Exemplo de backfill idempotente

```sql
INSERT INTO ghl_field_mappings
    (workspace_id, logical_name, ghl_field_key, field_type, variations, is_required)
SELECT
    w.id,
    t.logical_name,
    t.ghl_field_key,
    t.field_type,
    t.variations,
    t.is_required
FROM workspaces w
CROSS JOIN ghl_field_mapping_templates t
WHERE t.name = 'Empire Default'
ON CONFLICT (workspace_id, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;
```

---

## Como atualizar o código em todos os clientes

### Atualizações de banco (migrations)

1. Crie a nova migration em `supabase/migrations/`.
2. Aplique em cada projeto Supabase do cliente:

```bash
# Para cada cliente:
supabase link --project-ref <REF_DO_CLIENTE>
supabase db push
```

3. Em cenários com muitos clientes, automatize via script/CI iterando sobre a lista de refs.

### Atualizações de edge functions

1. Altere o código em `supabase/functions/`.
2. Deploy em cada cliente:

```bash
# Para cada cliente:
supabase link --project-ref <REF_DO_CLIENTE>
supabase functions deploy
```

### Atualizações de frontend

1. Commite o código no repositório.
2. Cada projeto Vercel do cliente faz deploy automaticamente no push (se configurado com Git integration).
3. Ou faça deploy manual:

```bash
cd eb-dash2
vercel --prod --cwd . --project <NOME_DO_PROJETO_CLIENTE>
```

---

## Automação recomendada (futuro)

Para escalar para dezenas de clientes, considere:

- **Lista centralizada de clientes** em um arquivo JSON/YAML seguro fora do repo.
- **Script CI/CD** que itera sobre a lista e executa `supabase db push` + `supabase functions deploy`.
- **Deploy previews por PR** no Vercel para validar antes de promover à produção.
- **Monitoramento por cliente** via webhook health-check e tabela `webhooks_ghl`.

---

## Segurança

- Nunca commite `ghl_api_key`, `SUPABASE_SERVICE_ROLE_KEY` ou `WEBHOOK_SECRET`.
- O script recebe secrets via **prompt interativo** ou **variáveis de ambiente/argumentos**.
- **`isolated-instance`:** a tabela `ghl_integration_settings` armazena a API key no
  banco, mas nunca a expõe no frontend.
- **`agency-subaccount`:** não recebe `ghl_api_key` nenhuma — o script nunca pede
  nem processa essa credencial nesse modo. O cliente cola a própria chave depois
  via BYOK (`/workspace/integracoes`), que grava no Vault
  (`workspace_integration_credentials`), nunca em texto plano.
- Cada cliente deve ter seu próprio conjunto de credenciais.

## Quando usar cada modo (critério de decisão — Fase 7)

| Pergunta | `isolated-instance` | `agency-subaccount` |
|---|---|---|
| O cliente exige isolamento físico do banco (contrato/regulatório)? | Sim → use este | Não |
| É um tenant de baixo risco/interno (primeiro adicional, per a regra de ouro do roadmap)? | — | Sim → use este |
| Precisa de um projeto Supabase/Vercel dedicado para customização própria? | Sim → use este | Não |
| Quer o menor custo operacional e o cliente aceita BYOK (conecta a própria chave)? | Não | Sim → use este |

**Regra de ouro (herdada do roadmap):** nunca aceitar a 2ª sub-conta **real/paga**
antes das Fases 2 e 8 completas com burn-in em produção. O primeiro tenant
adicional (via `agency-subaccount`) deve ser **interno ou de baixo risco** — é
exatamente o que este modo foi construído para viabilizar sem esperar a Fase 8
(LGPD/DPA) inteira.

---

## Referências

- [`docs/ONBOARDING-NOVO-CLIENTE.md`](ONBOARDING-NOVO-CLIENTE.md) — guia operacional de setup.
- [`scripts/provision-new-client.ts`](../scripts/provision-new-client.ts) — script de provisionamento.
- [`.env.new-client-template`](../.env.new-client-template) — template de variáveis Vercel.
- [`docs/GHL-MAPEAMENTO-CAMPOS.md`](GHL-MAPEAMENTO-CAMPOS.md) — tabelas de mapeamento GHL.
- [`docs/GHL-CREDENCIAIS.md`](GHL-CREDENCIAIS.md) — gestão segura de credenciais.
