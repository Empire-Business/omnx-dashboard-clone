# Integração omnx-desk (ex-EmpireDesk) → Vendas — Diagnóstico, Correção e Multi-Tenant

> **Atualizado em:** 2026-07-18 BRT
> **Prioridade:** CRÍTICO
> **Supersede:** [`docs/INTEGRACAO-EMPIREDESK-VENDAS.md`](INTEGRACAO-EMPIREDESK-VENDAS.md) (plano original, terminologia antiga)
> **Doc de configuração do usuário:** [`docs/CONFIG-OMNX-DESK-USUARIO.md`](CONFIG-OMNX-DESK-USUARIO.md)

Este documento é a fonte da verdade técnica para: (1) por que vendas registradas no
omnx-desk não aparecem em alguns painéis, (2) o que corrigir (código + retroativo),
(3) como isolar a integração por tenant (preparação para o futuro), e (4) a renomeação
**EmpireDesk → omnx-desk** em todo o sistema.

---

## 0. Renomeação obrigatória: EmpireDesk → omnx-desk

O produto que envia as vendas mudou de nome de **EmpireDesk** para **omnx-desk**. A troca
precisa ser feita em todo o sistema, mas de forma **compatível** (sem quebrar as 16 vendas
já gravadas com `origem='empiredesk'`).

**Escopo real medido em 2026-07-18** (9 arquivos, 39 ocorrências):

| Arquivo | O que muda |
|---|---|
| `supabase/functions/crm-registrar-venda/index.ts` | `EMPIREDESK_BRIDGE_SECRET`→`OMNX_DESK_BRIDGE_SECRET` (com fallback), header `x-empiredesk-secret`→aceitar `x-omnx-desk-secret` **e** o antigo, `origem: 'empiredesk'`→`'omnx_desk'` |
| `supabase/functions/crm-buscar-lead/index.ts` | secret/header idem |
| `supabase/functions/crm-sync-stats/index.ts` | secret/header idem |
| `supabase/migrations/20260527000000_*.sql` | comentários + default de `origem` |
| `supabase/migrations/20260527000001_*.sql` | comentários |
| `supabase/migrations/20260218000000_baseline_public_schema.sql` | baseline (não editar — histórico) |
| `eb-dash2/src/hooks/useLeads.ts` | rótulo de origem exibido |
| `eb-dash2/src/components/leads/LeadCard.tsx` | rótulo de origem exibido |
| `scripts/edge-functions-health-check-v2.mjs` | nome do secret no check |

**Regra de compatibilidade (inegociável):**
- A edge function deve aceitar **os dois** headers/secrets durante a transição (novo `x-omnx-desk-secret` + antigo `x-empiredesk-secret`) para não derrubar integrações já configuradas.
- Novas vendas gravam `origem='omnx_desk'`. As 16 linhas históricas `'empiredesk'` são migradas por migration de dados (ver §6). O frontend passa a exibir "omnx-desk" para os dois valores.
- Nenhuma tabela/coluna é renomeada — só valores e labels.

---

## 1. Como a integração funciona hoje

O omnx-desk é um sistema **externo**. Quando uma venda é fechada lá, ele chama a edge
function-ponte `crm-registrar-venda` (a "Porta 2" de entrada de vendas; a "Porta 1" é o
webhook do GHL). Fluxo:

1. omnx-desk faz `POST /functions/v1/crm-registrar-venda` com secret compartilhado.
2. A função resolve o `contato_id` a partir do `oportunidade_id` enviado.
3. Deriva os campos financeiros a partir da lista rica `pagamentos` (`derivarFinanceiro`).
4. Copia os comprovantes para o bucket `vendas-comprovantes`.
5. Faz `UPSERT` em `vendas_fechamento` (chave `oportunidade_id`), com `origem='empiredesk'`.
6. Um trigger `BEFORE INSERT` preenche `workspace_id` via join do contato/oportunidade.

Detalhe do formato de entrada e da configuração → [`docs/CONFIG-OMNX-DESK-USUARIO.md`](CONFIG-OMNX-DESK-USUARIO.md).

---

## 2. Diagnóstico de produção (rodado em 2026-07-18, projeto `qzesffnkqgelmtfblzkr`)

Executado via Management API (somente `SELECT`). Números reais:

- **16 vendas** `origem='empiredesk'` no total. **Todas** têm `data_pagamento_entrada`, `workspace_id` e `pagamentos` preenchidos. **O código de gravação está funcionando — nenhuma venda foi perdida no banco.** Soma das entradas: R$ 228.000.
- Todas as 16 estão no workspace **`Default`** (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`). O 2º workspace (`Burn-in Interno`) não tem nenhuma.
- **8 das 16** ficam **invisíveis nos painéis de Tráfego/Produção/Aquisição**: 7 por `utm_source` não-pago (leads orgânicos/importados), 2 por pipeline Recuperação (1 sobreposição) → **8 vendas, ~R$ 101.000 em entradas**.
- Nos **últimos 30 dias por data de pagamento**: 5 vendas; **3 passam** no filtro de Aquisição (tráfego pago + não-recuperação) = **R$ 41.000** (Lótus Transportes, Victor Lacôrte, Bruno Sevarolli). Mesmo assim, **Aquisição → Produtividade exibe 0** → **bug real** (ver §4.4).
- Existem **2 workspaces**. A tabela `workspace_integration_credentials` já tem providers `ghl` (2) e `openrouter` (1) — é onde o provider `omnx_desk` por tenant vai encaixar (§7).
- **Nenhuma venda omnx-desk desde 2026-07-07.** Se o time registrou vendas depois disso e elas não estão no banco, é um problema separado (ponte não chamada / secret errado) — investigar antes de assumir que é só filtro.

---

## 3. As duas "camadas" de exibição (entender antes de corrigir)

O dashboard não filtra vendas diretamente. Ele filtra **oportunidades** primeiro e depois
mantém só as vendas cujas oportunidades passaram. Isso cria duas realidades:

| Camada | Filtra tráfego pago? | Exclui Recuperação? | Universo de vendas |
|---|---|---|---|
| **Tráfego / Produção / Aquisição** | **Sim** (só `utm_source` registrado em `utm_sources`) | Sim | vendas de leads pagos, não-recuperação |
| **Página de Vendas (Cohort)** | Não | Sim | qualquer venda cujo lead caiu na janela |

Consequência: uma venda de **lead orgânico** é real, mas os painéis de Tráfego a
escondem **por design** (para o ROAS de anúncio ficar correto). Ela **deveria** aparecer
em um painel de **faturamento total** — e é isso que precisamos garantir.

---

## 4. Causas-raiz (por que vendas "somem")

### 4.1 Filtro de tráfego pago (comportamento por design, mas incompleto)
`useTrafego`/`useProducao`/`useAquisicao` mantêm só oportunidades cujo `contatos.utm_source`
está registrado como fonte paga. Vendas de leads orgânicos/importados são descartadas
**antes** de buscar a receita. Correto para ROAS de anúncio; **errado** se o objetivo do
painel é faturamento total.

### 4.2 Exclusão da pipeline Recuperação
`.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)` está em quase todos os hooks. Vendas
registradas em oportunidades da pipeline Recuperação somem de tudo — inclusive da página
de Vendas. Para faturamento, uma venda de Recuperação é dinheiro real.

### 4.3 Cohort limita vendas pela data do lead
No modo Cohort, o universo de vendas é limitado às oportunidades cujo **lead chegou** no
período (`filterByContactDate`). Uma venda paga em julho de um lead que chegou em maio é
descartada se o período for "julho". Isso contradiz a regra do `CONCEITOS-NEGOCIO.md`:
métricas operacionais (vendas) usam a **data do próprio evento** (`data_pagamento_entrada`),
não a data de geração do lead.

### 4.4 🐞 BUG confirmado (raiz identificada): "0 vendas" intermitente em Produtividade
- **Sintoma reportado:** Aquisição → Produtividade exibindo 0 vendas em 30 dias.
- **Verificação ao vivo (Playwright contra produção, 2026-07-18):** no momento do teste, Aquisição → Produtividade exibiu **5 vendas / R$ 209.000 / caixa R$ 74.000** — **exatamente** o que o banco diz (cross-check SQL bateu 100%). Ou seja: a lógica de contagem está **correta** e o "0" **não é permanente**.
- **Causa raiz (confirmada por evidência):** os hooks de Produtividade lançam `TypeError: Failed to fetch` de forma **intermitente** — capturado no console em `useProducao.ts`, `usePreVendasProducao.ts` e `useCloserProdutividade.ts`. Esses erros são **engolidos silenciosamente** (ex: `catch {}` em `AquisicaoPage.tsx:299`), então a tela mostra **0 vendas sem nenhum aviso**. Fatores que aumentam a chance de falha: a query de oportunidades da Produtividade em `AquisicaoPage.tsx:157` carrega a **tabela inteira** (`.neq(recuperacao)` sem filtro de data, paginada) — pesada e propensa a timeout/abort.
- **Ação (fix definitivo):**
  1. **Nunca engolir erro:** substituir os `catch {}` silenciosos por estado de erro visível + botão "tentar de novo" (o usuário precisa saber que falhou, não ver 0).
  2. **Aliviar a query:** filtrar a busca de oportunidades da Produtividade por data (a Produtividade só precisa de opps com algum evento no período) em vez de puxar a tabela toda.
  3. **Retry/backoff** nas queries de receita de Produtividade.
- **Nota:** Tráfego exibiu 0 vendas no teste; provavelmente **correto** para o período default (nenhuma venda de lead **pago** com data de lead no período), mas confirmar o período default do Tráfego antes de descartar.

### 4.5 ⚠️ Risco: UPSERT sem COALESCE pode apagar dado bom
`crm-registrar-venda` faz `upsert` setando as colunas **diretamente**. Se a venda já
existia (criada antes pelo webhook GHL, "Porta 1") e o omnx-desk enviar um payload sem
`data_pagamento_entrada` derivável (ex: `pagamentos` sem `data`), o upsert **sobrescreve a
data boa com null**, tornando invisível uma venda que aparecia. A "Porta 1" usa `COALESCE`
e é protegida; a "Porta 2" **não**. Corrigir para preservar valor existente quando o novo
vier nulo (COALESCE no lado do servidor ou merge explícito antes do upsert).

### 4.6 Truncamento de 1000 linhas (latente)
Algumas queries de receita não paginam (`useProducao.ts`, `usePreVendas.ts`,
`GeralTab.tsx`, `goals/service.ts`). Hoje o volume é baixo, mas com o cap de 1000 do
PostgREST isso vira perda silenciosa quando o histórico crescer. Padronizar `.range()`.

---

## 5. Plano de correção (código)

> Cada item vira migration/PR próprio, seguindo as regras do `CLAUDE.md` (branch dedicada,
> UML/segurança/níveis-de-acesso antes de PR, migration para tudo que toca o banco).

1. **Ponte robusta (`crm-registrar-venda`)**
   - COALESCE/merge no upsert: nunca sobrescrever `data_pagamento_entrada`, `valor_entrada`, etc. com null (§4.5).
   - Validar `pagamentos`: se não houver entrada com `data`, **rejeitar com 422** e mensagem clara, em vez de gravar venda "cega". (Ver formato exigido no doc do usuário.)
   - Passar a gravar `origem='omnx_desk'`; aceitar os dois secrets (§0).

2. **Painel de faturamento total (decisão de exibição — recomendação)**
   - Manter Tráfego/Produção filtrando só pago (ROAS correto).
   - Garantir que a **página de Vendas / Faturamento** mostre **todas** as vendas confirmadas, inclusive orgânicas **e** Recuperação. Hoje a página de Vendas ainda exclui Recuperação; criar um modo/aba de "Faturamento total" sem esse `.neq`.
   - **Decisão do dono pendente:** ver as 3 opções registradas no ROADMAP (Tráfego só pago + Vendas mostra tudo — recomendado / faturamento total em todo lugar / manter como está).

3. **Corrigir o bug de Produtividade (§4.4)** — remover catch silencioso, reproduzir ao vivo, corrigir a causa real.

4. **Alinhar Produtividade à regra Cohort×Produtividade (§4.3)** — no modo Produtividade, o universo de vendas deve ser dirigido por `data_pagamento_entrada` no período, independente da data do lead. Auditar `useAquisicao`/`useTrafego` para não limitar vendas pela data do lead nesse modo.

5. **Paginação (§4.6)** — padronizar `.range()` nas queries de receita que faltam.

---

## 6. Correção retroativa (dados)

**Importante:** as 16 vendas **não precisam de backfill de dados financeiros** — elas já
estão corretas no banco. A "correção retroativa" aqui é:

1. **Migration de dados:** `UPDATE vendas_fechamento SET origem='omnx_desk' WHERE origem='empiredesk'` (16 linhas). Idempotente.
2. **Visibilidade retroativa:** assim que os itens 2 e 3/4 da §5 forem aplicados, as 8 vendas hoje ocultas (R$ 101k) passam a aparecer no painel de faturamento total — sem tocar nos dados, só na lógica de exibição.
3. **Verificar a lacuna pós-07/jul:** confirmar com o dono se houve vendas registradas no omnx-desk depois de 2026-07-07. Se sim e não estão no banco, é incidente de ingestão (secret/roteamento), não de exibição — abrir item separado.

---

## 7. Multi-tenant: isolamento por conta omnx-desk (preparação para o futuro)

> **Urgência:** preparação (decisão do dono: hoje só 1 conta). Arquitetura pronta e
> documentada; execução quando entrar o 2º tenant.

**Problema atual:** a ponte usa **um único** `EMPIREDESK_BRIDGE_SECRET` global e infere o
workspace a partir do `oportunidade_id` enviado. Não há nada que amarre uma **conta
omnx-desk** a um **workspace** específico — um segundo tenant não teria isolamento: com o
secret global, poderia (em teoria) escrever em qualquer workspace via o `oportunidade_id`.

**Arquitetura alvo (reusa a infra da Fase 2 já em produção):**

1. **Credencial por workspace:** novo provider `omnx_desk` em `workspace_integration_credentials` (Vault), guardando o **secret exclusivo daquele tenant**. Cada conta omnx-desk recebe um secret diferente.
2. **Roteamento por secret, não por payload:** a edge function passa a (a) ler o secret recebido, (b) resolver **qual workspace** é dono daquele secret (via `resolve-workspace-credentials`), (c) só aceitar `oportunidade_id` que **pertença àquele workspace** — rejeitando (403) qualquer tentativa de escrever numa oportunidade de outro tenant. Fail-closed.
3. **`workspace_id` explícito no insert:** derivar do secret/tenant resolvido, não só do trigger por contato — assim uma oportunidade órfã não cai no workspace errado.
4. **Kill-switch/rotação:** reusa o mecanismo da Fase 2 (`DELETE` da credencial → fail-closed; `rotation_version` propaga em ≤10s). Ver [`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`](FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md).
5. **Teste de isolamento cross-tenant:** adicionar caso à suíte — tenant A não consegue registrar venda na oportunidade do tenant B mesmo conhecendo o `oportunidade_id`.

Referências: [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md),
[`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`](FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md).

---

## 8. Checklist de execução (ordem sugerida)

> **Status 2026-07-18 (retomada liberada):** feature entregue na branch `feat/omnx-desk-vendas`,
> gate de segurança PASS (`security-report/audit-2026-07-18-omnx.md`). Decisões do dono:
> manter filtros/painéis como estão (o filtro Recuperação já cobre a visibilidade — sem
> painel de faturamento total e sem reescrever a regra Cohort×Produtividade); fazer o
> isolamento multi-tenant agora; sem lacuna de ingestão pós-07/jul.

- [x] **Migration de dados:** `origem 'empiredesk' → 'omnx_desk'` (migration `20261002000000`, idempotente). Default da coluna é `'ghl'` (Porta 1) — **não** alterado.
- [x] **Rename compatível** nas 3 edge functions `crm-*` (aceitam `x-omnx-desk-secret` e o antigo) + rótulos no frontend + script de health-check.
- [x] **Robustez da ponte:** COALESCE server-side no upsert + `422` se `pagamentos` não deriva data de entrada e não há venda existente (§4.5, §5.1).
- [x] **Bug Produtividade:** já corrigido na sessão anterior (fim do `catch {}` silencioso + `retry.ts` + banner de erro) (§4.4).
- [~] **Regra Cohort×Produtividade:** **não alterada** — decisão do dono de manter as funções como estão (§4.3).
- [~] **Painel de faturamento total:** **não criado** — decisão do dono; o filtro Recuperação (3 estados) já exibe faturamento de Recuperação quando ativado (§5.2).
- [x] **Paginação `.range()`** nas 3 queries de receita (`usePreVendas` ×2, `useProducao`) (§4.6).
- [x] **Multi-tenant (prep):** provider `omnx_desk` no CHECK + RPC `resolve_workspace_by_omnx_desk_secret_digest` (migration `20261003000000`) + roteamento por digest com isolamento cross-tenant (403) na edge function (§7).
- [x] **Confirmar lacuna pós-07/jul:** dono confirmou que não há vendas perdidas — só filtro (§6.3).
- [x] Atualizar `docs/ROADMAP.md`, `docs/MUDANCAS.md`, `docs/NIVEIS-DE-ACESSO.md`, `docs/UML.md`.

---

## 9. Filtro de Recuperação com 3 estados + persistência por conta (Vendas + Aquisição)

> **Pedido do dono:** não mudar os filtros das abas; **adicionar** em Vendas e Aquisição
> um controle claro e fácil para escolher como tratar os leads de Recuperação, salvável
> por conta.

### Comportamento (3 estados)
| Estado | O que mostra | pipeline filter |
|---|---|---|
| **Sem recuperação** (default = comportamento atual) | Tudo, exceto Recuperação | `.neq(pipeline_id, RECUP)` |
| **Com recuperação** | Tudo, incluindo Recuperação | (sem filtro de pipeline) |
| **Só recuperação** | Apenas leads de Recuperação | `.eq(pipeline_id, RECUP)` |

O **default é "Sem recuperação"** — ou seja, quem não mexer no controle vê exatamente o que
vê hoje. Nada muda para os outros filtros/abas.

### Base que já existe (reaproveitar)
`usePreVendas` já tem `pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'`
(`usePreVendas.ts:68,131-134,296,464`). Basta:
1. Adicionar o 3º valor `'include_recuperacao'` (não aplica filtro de pipeline).
2. Replicar o mesmo parâmetro em **Aquisição** (`useAquisicao.ts` **e** o loader de
   Produtividade em `AquisicaoPage.tsx:157-162` — hoje ambos hardcodam `.neq(RECUP)`).
3. Ligar na **página de Vendas** (que consome `usePreVendas`).

### UI (clara e fácil)
- Um seletor segmentado de 3 botões na barra de filtros de **Vendas** e **Aquisição**,
  rótulos amigáveis: **"Sem recuperação" · "Com recuperação" · "Só recuperação"**, com
  tooltip de 1 linha explicando cada um.
- Posição sugerida: ao lado do toggle Cohort/Produtividade (mesma faixa de controles).

### Persistência por conta (não só no navegador)
"Salvar para a conta dele" = seguir o usuário entre navegadores/dispositivos → precisa de
banco, não só `localStorage`.
- **Nova tabela** `user_dashboard_prefs (user_id uuid, workspace_id uuid, prefs jsonb, pk(user_id, workspace_id))`.
  - **RLS fail-closed:** cada usuário só lê/escreve a **própria** linha (`user_id = auth.uid()`), no seu workspace ativo.
  - `prefs` guarda `{ "recuperacao_mode": "exclude" | "include" | "only", ... }` (extensível a outros filtros persistentes no futuro).
- **UX otimista:** `localStorage` como cache imediato + gravação assíncrona na tabela; ao logar/trocar de workspace, carrega da tabela.
- Migration dedicada (regra 20). Atualizar **`docs/NIVEIS-DE-ACESSO.md`** (nova tabela + RLS por usuário) e **`docs/UML.md`** antes do PR (gates 1.6b/1.6c).

### Fora de escopo (confirmado com o dono)
- **Não** mexer no filtro de tráfego pago nem em nenhum filtro existente das abas.
- O controle é **aditivo**: default reproduz o comportamento atual.

---

## Referências cruzadas
- [`docs/CONFIG-OMNX-DESK-USUARIO.md`](CONFIG-OMNX-DESK-USUARIO.md) — passo a passo e formato de dados para o usuário
- [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md) — Cohort vs Produtividade
- [`docs/VENDAS-FECHAMENTO.md`](VENDAS-FECHAMENTO.md) — tabela e trigger de vendas
- [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md) — infra de credencial por workspace
