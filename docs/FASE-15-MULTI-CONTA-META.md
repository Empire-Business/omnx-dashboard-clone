# Fase 15 — Múltiplas contas de anúncio Meta por workspace (design)

> **Status:** design aprovado para implementação (dono, 2026-07-17 — decisões de modelo e UI registradas em `docs/ROADMAP.md` §Fase 15).
> **Decisões do dono (2026-07-15):** abordagem 1 (um token Meta + lista de contas na credencial), com contrato/schema já prevendo a evolução para a abordagem 2 (uma credencial por conta); UI com investimento **somado** por padrão + **filtro por conta**; prioridade: fim do roadmap (sem cliente pedindo — implementado agora por decisão de 2026-07-17).

## 1. Problema

Hoje um workspace conecta **uma** conta Meta (`workspace_integration_credentials` tem `UNIQUE(workspace_id, provider)` e `sync-meta-ads` lê `metadata.ad_account_id` como string única). Cliente com várias contas (marcas, regiões) não soma/compara investimento no mesmo painel.

## 2. Estado atual (fatos verificados em produção, 2026-07-17)

- `workspace_meta_ad_accounts (workspace_id, account_id, is_active, created_at)` já existe, é a **fonte de verdade** do vínculo conta ↔ workspace, com RLS e índice único parcial (`account_id` ativa pertence a um único workspace). Seed: workspace Default ↔ `act_716772443330289`.
- Credencial meta do Default: `metadata = {"ad_account_id": "act_716772443330289"}` (rotation_version 1).
- Triggers `trg_validar_meta_ad_account_workspace` rejeitam escrita de dados cujo `account_id` não esteja ativo para o workspace (raw, insights, account_daily, campaigns).
- Tabelas de dados já carregam `account_id` e são únicas por `(workspace_id, ad_id, date)` etc. — **a camada de armazenamento já suporta N contas sem migration de schema**.
- `test-workspace-credential` (meta) testa uma conta via `GET /act_{id}?fields=id,name` (`_shared/test-workspace-credential-logic.ts`).

## 3. Decisões de design

**D1 — `workspace_meta_ad_accounts` é a única fonte de verdade do escopo de sync.**
Nenhuma tabela nova. O sync itera as contas `is_active = true` do workspace. A lista em `metadata.ad_account_ids` da credencial é a **interface de configuração** — e o RPC de save mantém as duas consistentes atomicamente.

**D2 — Contrato da credencial (abordagem 1, preparada para a 2):**
- `save_workspace_credential` com `provider = 'meta'` aceita `metadata.ad_account_ids: string[]`.
  - Normalização: trim, remove vazios/duplicados, adiciona prefixo `act_` se vier só números; rejeita entradas que não casem `^act_[0-9]+$` (erro 22023).
  - Legado: `metadata.ad_account_id: string` continua aceito e é normalizado para `ad_account_ids = [x]`.
  - O RPC sempre grava **os dois**: `ad_account_ids` (lista canônica) e `ad_account_id` (primeiro da lista — compat com código que ainda lê o singular).
  - **Merge defensivo:** se o save vier sem nenhuma das duas chaves (ex.: UI trocando só o token), a lista de contas existente é **preservada** (nunca apagada por omissão).
- Na mesma transação (SECURITY DEFINER), o RPC sincroniza `workspace_meta_ad_accounts`:
  - ids da lista → `INSERT ... ON CONFLICT (workspace_id, account_id) DO UPDATE SET is_active = true`;
  - ids ativos do workspace **ausentes** da nova lista → `is_active = false` (só quando a lista foi fornecida explicitamente; histórico de dados é preservado e a conta fica livre para outro workspace);
  - pré-checagem amigável: se algum id está ativo em **outro** workspace → erro claro (antes do índice único estourar).
- **Preparação abordagem 2 (futura):** quando houver caso de contas em Business Managers diferentes, adicionar `credential_id uuid NULL` em `workspace_meta_ad_accounts` apontando para a credencial da conta, e o sync resolve o token por linha. Nenhuma mudança de contrato de leitura será necessária — o filtro por conta da UI e o formato das tabelas já estão por conta.

**D3 — Sync itera contas com isolamento de falha por conta:**
- `sync-meta-ads`: resolve o token uma vez; lê contas ativas; aceita `account_id` opcional no body (sync de uma conta só); sem ele, itera todas as ativas. Falha de uma conta (API, permissão) é registrada e **não aborta** as demais; resposta agrega `{ accounts: [{ account_id, status, ... }] }`.
- `sync-meta-ads-backfill`: mesma regra de iteração e parâmetro `account_id`.
- Crons por workspace (`20260728000000`) chamam sem `account_id` → cobrem todas as contas automaticamente. Sem migration de cron.
- Inserts de raw seguem o contrato atual (`params.account_id` + `params.workspace_id`) — triggers e processadores já validam.

**D4 — Teste de conexão cobre todas as contas:**
`test-workspace-credential` (meta) testa cada conta da lista (`GET /act_{id}?fields=id,name`) e retorna resultados por conta; `ok: true` somente se todas passam. Com uma conta, comportamento idêntico ao atual.

**D5 — UI:**
- **Integrações → card Meta:** gerenciar a lista de contas (chips adicionar/remover, validação `act_\d+`), salvar via `save_workspace_credential` (`metadata.ad_account_ids`), teste exibindo resultado por conta.
- **Tráfego:** filtro "Conta Meta" (opções = contas ativas do workspace via `workspace_meta_ad_accounts`); padrão = **Todas (somado)** — estado atual, nenhuma query muda; com filtro, queries de investimento/métricas ganham `.eq('account_id', ...)`. Escopo do filtro nesta fatia: `useTrafego.ts` (painel principal). Aquisição/Pré-Vendas seguem o mesmo padrão em fatia futura se houver demanda.

**D6 — Compatibilidade:** produção tem 1 conta na credencial e na tabela; nada muda até alguém adicionar uma segunda conta. Sem backfill, sem migração de dados.

## 4. Entregas (slices)

1. **Migration** `20260926000000_fase15_meta_multi_conta.sql` — `CREATE OR REPLACE save_workspace_credential` com D2 (normalização, merge defensivo, sync da tabela, erro amigável de conta alheia). Sem mudança de tabela. `docs/UML.md` atualizado no **mesmo commit** (gate).
2. **Testes de integração** `__tests__/integration/meta-ads-multi-account.test.ts` — save com lista sincroniza a tabela; legado singular normaliza; merge defensivo preserva lista; remoção desativa e libera conta para outro workspace; não-admin é recusado; formato inválido é recusado.
3. **Edge functions** — `sync-meta-ads`, `sync-meta-ads-backfill` (loop por conta + `account_id` opcional), `test-workspace-credential`/`_shared/test-workspace-credential-logic.ts` (teste por conta). Deploy exige gate de segurança (verdict PASS do dia).
4. **UI** — card Meta (lista de contas) em Integrações + filtro "Conta Meta" no Tráfego.
5. **Docs** — este arquivo, `docs/UML.md`, status da Fase 15 no `docs/ROADMAP.md`.

## 5. Invariantes

- `workspace_meta_ad_accounts` continua a única fonte de verdade do vínculo conta ↔ workspace (já é invariante no UML).
- Nenhuma escrita de dados Meta ocorre para conta inativa ou não vinculada ao workspace (trigger fail-closed já existente).
- A chave Meta nunca sai do Vault; UI vê apenas ids de conta e status.
- Investimento padrão é a soma de todas as contas ativas; filtro por conta é sempre opcional e explícito.
