# GHL Config UI — Fase 3

> Interface do frontend para configurar a integração GoHighLevel (GHL) e mapear campos, pipelines e stages de forma visual, parte da expansão multi-conta do Empire.

---

## 🎯 Propósito

Permitir que **owners e admins** de um workspace configurem a conexão com uma conta GHL e traduzam seus campos/pipelines/stages para os conceitos do Empire, sem editar código ou banco manualmente.

---

## 📁 Arquivos

### Página e componentes

- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx` — página principal com abas "Assistente IA" e "Mapeamento avançado".
- `eb-dash2/src/components/ghl-mapping/GhlMappingAssistant.tsx` — assistente conversacional de mapeamento por IA.
- `eb-dash2/src/components/ghl-mapping/GhlMappingChatInput.tsx` — textarea amigável com exemplos de descrição.
- `eb-dash2/src/components/ghl-mapping/GhlMappingProposalReview.tsx` — revisão visual da proposta da IA.
- `eb-dash2/src/components/ghl-mapping/GhlMappingWizard.tsx` — wizard técnico de mapeamento (modo avançado).

### Hooks (TanStack Query)

- `eb-dash2/src/hooks/useGhlIntegrationSettings.ts` — CRUD de `ghl_integration_settings` (apenas `ghl_location_id`, `webhook_secret`, `webhook_url`, `is_active`).
- `eb-dash2/src/hooks/useGhlFieldMappings.ts` — CRUD de `ghl_field_mappings`.
- `eb-dash2/src/hooks/useGhlPipelineMappings.ts` — CRUD de `ghl_pipeline_mappings`.
- `eb-dash2/src/hooks/useGhlStageMappings.ts` — CRUD de `ghl_stage_mappings`.
- `eb-dash2/src/hooks/useGhlDiscovery.ts` — chama a edge function `discover-ghl-config`.
- `eb-dash2/src/hooks/useGhlFieldMappingTemplates.ts` — lista o template `Empire Default`.

### Tipos

- `eb-dash2/src/types/ghl-config.ts` — interfaces das tabelas, discovery e enums.

### Roteamento e navegação

- `eb-dash2/src/App.tsx` — rota `/workspace/ghl-config` dentro do portal `/workspace`, protegida por `AdminRoute`. Único ponto de entrada da conexão GHL.
- `eb-dash2/src/components/layout/WorkspaceLayout.tsx` — item **"Conectar GHL"** no menu lateral (renomeado de "Integração GHL" em 2026-07-14 — ver seção "Consolidação 2026-07-14" abaixo). O item "Meta Ads" (`/workspace/integracoes`) é uma página separada, só para a credencial Meta Ads.
- `eb-dash2/src/components/layout/AdminMenu.tsx` — atalho no dropdown admin do header.

---

## 🔐 Segurança

- A rota exige `owner` ou `admin` do workspace (`AdminRoute`).
- A **chave GHL (Private Integration Token) é BYOK real** (Fase 4, Vault) — nunca fica em texto plano no banco nem em variável de ambiente global. Ver `docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md`.
- `webhook_secret` continua em `ghl_integration_settings` (coluna própria, não é Vault — usado para validar a assinatura dos webhooks recebidos).
- Toda a persistência respeita RLS: só owner/admin pode escrever nas tabelas de mapeamento e na credencial.

---

## Consolidação 2026-07-14 — fim da dessincronia de location_id

**Achado real** (burn-in do multi-tenant, ao testar a conexão de um workspace novo em produção): existiam duas telas e duas fontes de verdade para "o GHL está conectado", que nunca se falavam:

- `/workspace/integracoes` (BYOK, Vault) — gravava `workspace_integration_credentials.metadata.location_id`, usado para **chamar** a API do GHL.
- `/workspace/ghl-config` (formulário antigo, pré-BYOK) — gravava `ghl_integration_settings.ghl_location_id`, usado para **rotear webhooks recebidos** ao workspace certo. O formulário ainda dizia *"a API Key não é mais armazenada no banco, configure como secret `GHL_API_KEY`"* — texto do modelo single-tenant anterior à Fase 4, sem chave nenhuma para colar.

Um workspace podia ficar com um dos dois preenchido e o outro não, sem nenhum aviso — inclusive o card "Integração GHL" da Visão Geral do Admin (`GhlStatusCard.tsx`) tinha dois itens de checklist **decorativos** ("API Key configurada", "Webhook GHL configurado") que só refletiam se o `location_id` antigo existia, nunca a credencial BYOK real.

**Correção aplicada:**

1. **Uma página só, fluxo em 2 passos.** `/workspace/ghl-config` agora tem o **Passo 1 — Conectar GHL** (chave + Location ID, BYOK real via `useSaveCredential`/`useCredentialsStatus`/`useTestConnection`, o mesmo padrão de `/workspace/integracoes`) seguido do **Passo 2 — mapeamento** (Assistente IA / Avançado), que só aparece depois que o Passo 1 confirma uma credencial GHL conectada. `webhook_secret` virou um campo opcional dentro do próprio Passo 1 (`<details>` "Avançado"), não uma tela separada.
2. **`save_workspace_credential` (migration `20260825000000`) sincroniza `ghl_integration_settings.ghl_location_id`** na mesma transação, sempre que `provider='ghl'` e `metadata.location_id` vem preenchido — fonte única de verdade, sem digitar o mesmo valor em dois lugares. Se o `location_id` já estiver ativo em outro workspace, a credencial inteira falha (nem o Vault grava) — impossível dois workspaces ativos com o mesmo `location_id`.
3. **`GhlStatusCard` lê o status real** (`useCredentialsStatus`, provider `ghl`) para "Chave GHL conectada", e `settings?.webhook_secret` de verdade para "Webhook GHL configurado" — nada mais decorativo.
4. **`/workspace/integracoes` ficou só para Meta Ads** (GHL saiu do `PROVIDERS` map dessa página) — elimina a ambiguidade entre "Chaves de API" (nome antigo, genérico) e "Integração GHL".

---

## 🚀 Fluxo de uso (atual)

1. **Passo 1 — Conectar GHL** (`/workspace/ghl-config`, topo da página)
   - Colar o **Location ID** e a **chave de acesso** (Private Integration Token) → clicar "Conectar".
   - A chave vai para o Vault (nunca mais aparece em tela); o `location_id` sincroniza automaticamente com o roteamento de webhook.
   - Botão "Testar conexão" confirma a chave contra a API do GHL de verdade (`test-workspace-credential`).
   - Campo opcional "Avançado — Webhook Secret" para configurar a assinatura de webhook.

2. **Configurar webhook no GHL**
   - A URL `https://<projeto>.supabase.co/functions/v1/webhook-ghl` é exibida com botão "Copiar", na barra lateral.

3. **Passo 2 — Mapear via Assistente IA (recomendado para usuários leigos)** — só aparece após o Passo 1 confirmar conexão.
   - O usuário descreve a estrutura do GHL em português.
   - O sistema executa discovery, identifica o que ainda não está mapeado e a edge function `ai-ghl-mapping` propõe apenas os itens pendentes.
   - O usuário revisa a proposta e clica em "Salvar mapeamentos".
   - Botão "Verificar novidades no GHL" no card de status permite detectar campos/pipelines/stages novos sem precisar descrever nada.

4. **Mapear via modo avançado**
   - Aba "Mapeamento avançado" mantém o wizard técnico.
   - Botão "Descobrir campos do GHL" invoca a edge function `discover-ghl-config`.
   - O usuário seleciona manualmente campos, pipelines e stages.

5. **Salvar mapeamentos**
   - Ambos os modos persistem via upsert nas tabelas `ghl_field_mappings`, `ghl_pipeline_mappings` e `ghl_stage_mappings`.

---

## 🧠 Regras de match automático

- Nome e chave dos campos GHL são normalizados (lowercase, sem acentos, sem espaços/pontuação).
- Comparação por LCS (longest common subsequence) com os `logical_name` do template.
- Score ≥ 0.6 gera uma sugestão clicável.
- Pipelines e stages usam regras léxicas específicas (ex: nome com "recuper" → `recuperacao`; "conect" → `conectado`).
- Mapeamentos já salvos têm prioridade sobre as sugestões.

---

## ⚠️ Regras Críticas

1. **A chave GHL é BYOK (Vault) desde a Fase 4** — nunca em variável de ambiente global `GHL_API_KEY`, nunca em texto plano. `location_id` é gerenciado por `save_workspace_credential` (sincroniza `ghl_integration_settings` automaticamente); não edite `ghl_location_id` diretamente sem passar pela credencial.
2. **Apenas owner/admin** acessa a página e salva.
3. **Todos os hooks usam `getWorkspaceId()`** para resolver o workspace atual.
4. **Paginação não é necessária** para as tabelas de mapeamento — volumes são pequenos por workspace.
5. **A edge function `discover-ghl-config` é chamada com `workspace_id`** no body.
6. **Um `location_id` só pode estar ativo em um workspace por vez** — segunda tentativa de conectar o mesmo `location_id` em outro workspace é recusada pela RPC (constraint no banco), não só pela UI.

---

## 📚 Relacionados

- [`docs/GHL-MAPPING-ASSISTENTE-IA.md`](GHL-MAPPING-ASSISTENTE-IA.md) — assistente conversacional de mapeamento.
- [`docs/GHL-MAPPING-WIZARD.md`](GHL-MAPPING-WIZARD.md) — wizard técnico (modo avançado).
- [`docs/GHL-MAPEAMENTO-CAMPOS.md`](GHL-MAPEAMENTO-CAMPOS.md) — schema de mapeamento multi-conta.
- [`docs/GHL-CAMPOS-EXTRAS.md`](GHL-CAMPOS-EXTRAS.md) — campo sem correspondência no vocabulário do template: prefixo `extra.`, exibição passiva no LeadCard (novo item no wizard manual, "Guardar como campo extra").
- [`docs/GHL-DISCOVERY.md`](GHL-DISCOVERY.md) — edge function de descoberta.
- [`docs/ROADMAP.md`](ROADMAP.md) — progresso das fases multi-conta.
- [`docs/MUDANCAS.md`](MUDANCAS.md) — changelog.

---

*Última atualização: 2026-07-14 BRT*
