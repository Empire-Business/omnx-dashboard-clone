# Auditoria — Sub-app Criativos (Tarefa 21 do backlog)

> **Data:** 2026-07-19 BRT
> **Escopo:** funcional/bugs silenciosos, UX de cadastro e controle, qualidade das métricas, ponte ID de criativo → Traqueamento → UTM.
> **Método:** leitura completa do código-fonte (frontend + edge functions + migrations) e queries `SELECT` reais contra a produção (`qzesffnkqgelmtfblzkr`, via `scripts/query-prod-readonly.mjs`, read-only). Nada foi aceito só porque a documentação (`docs/SUB-APP-CRIATIVOS.md`) diz "Funcional? ✅ Sim" — cada afirmação foi checada contra código e/ou dado real.
> **Branch desta auditoria:** `docs/auditoria-criativos` (worktree isolado, sem tocar a branch `feat/contrato-webhook-crm` em andamento). PR aberto **sem merge**.

---

## Veredito rápido

**O app de Criativos NÃO está 100% funcional.** Está em uso diário real e majoritariamente utilizável, mas tem **1 bug P0 de vazamento cross-tenant confirmado no backend** (corrigido nesta sessão, aguardando aplicação em produção) e **2 bugs P0 de UX** que travam o uso em tablet/celular e mentem sobre sucesso de ação. A ponte "criativo → UTM → métrica" **existe no código mas está morta na prática**: hoje 100% da atribuição real depende do fluxo antigo (`CR-` via Notion); nenhum criativo nativo (`AN-`) jamais apareceu em um lead real ou em um nome de anúncio do Meta em produção.

| Eixo | Veredito |
|---|---|
| 1. Funcional / bugs silenciosos | 🔴 **Quebrado (P0 confirmado)** — corrigido nesta sessão, não aplicado em produção |
| 2. UX de cadastro/controle | 🟡 **Fraco** — usável no desktop, mas 2 P0 e 4 P1 de fricção real |
| 3. Métricas de controle | 🔴 **Quebrado (mesmo P0 do eixo 1)** + 1 achado de consistência (MQL por `ILIKE`) |
| 4. Ponte criativo → Traqueamento → UTM | 🟡 **Existe mas está morta** — P1 hoje, vira P0 no dia em que `AN-` virar o fluxo principal |

---

## Eixo 1 — Funcional / bugs silenciosos

### 🔴 P0 — `get_creative_metrics` agrega dados de TODOS os workspaces (vazamento cross-tenant)

**Onde:** RPC `get_creative_metrics`, as duas assinaturas em produção (4 args e 10 args — esta última chamada pelo frontend em [`eb-dash2/src/hooks/useCriativos.ts:93`](eb-dash2/src/hooks/useCriativos.ts)). Definição mais recente antes do fix: `supabase/migrations/20261004000001... / 20261004000001` linhas equivalentes a `20261004000003` no histórico (última `CREATE OR REPLACE` viva confirmada via `pg_get_functiondef` direto no banco).

**O problema concreto:** a função é `SECURITY DEFINER` e chama `PERFORM raise_unless_workspace_member(p_workspace_id)` — isso só valida que **quem chamou** pertence ao workspace informado. As duas CTEs que fazem o trabalho pesado não filtram `workspace_id` em lugar nenhum:

```sql
-- meta_agg — soma TODO meta_ads_insights que bater no regex, de qualquer workspace
FROM meta_ads_insights mai
WHERE mai.date BETWEEN p_start_date AND p_end_date
  AND mai.ad_name ~ '(CR|AN)-\d+'
  -- SEM mai.workspace_id = p_workspace_id

-- crm_agg — soma TODA oportunidade/contato que bater no regex, de qualquer workspace
FROM oportunidades o JOIN contatos c ON c.id = o.contato_id
LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
WHERE c.utm_term ~ '(CR|AN)-\d+'
  -- SEM c.workspace_id = p_workspace_id
```

O filtro de workspace só aparece no `LEFT JOIN notion_creatives nc ON ... AND nc.workspace_id = p_workspace_id` **no final** — os totais de `spend`, `leads`, `mqls`, `vendas` e `faturamento` já vêm somados globalmente antes desse join. Confirmado com `pg_get_functiondef` nas duas assinaturas.

**Por que não é hipotético:** `generate-creative-code` (via RPC `get_max_creative_number`) numera sequencialmente **por workspace** — todo workspace novo recomeça em `CR-1`/`AN-1`. Colisão de código entre dois clientes é esperada, não rara.

**Estado hoje (verificado ao vivo):**
- Só o workspace `Default` (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`) tem dados pagos reais: 1.102 criativos, 9.593 linhas de `meta_ads_insights` batendo no padrão.
- O 2º workspace (`Burn-in Interno`, `15cacbe4-...`) existe mas está vazio — **o mecanismo do vazamento é real hoje; o dado para vazar ainda não existe.**
- `meta_ads_insights`, `oportunidades`, `contatos` e `vendas_fechamento` **todas têm coluna `workspace_id`** — a coluna existe, simplesmente não é usada no filtro.
- Grants: `EXECUTE` concedido a `anon` **e** `authenticated` nas duas assinaturas (endurecido no fix).

**Mesma classe do achado já fechado em Meta Ads** (`docs/VALIDACAO-META-MULTITENANT.md`, RPCs `analisar_meta_*`, migration `20261004000003`) — só que este RPC específico do sub-app Criativos **ficou de fora** daquele hardening e do gate do "2º tenant pago" que `docs/ROADMAP.md` (2026-07-19) já declara liberado.

**Severidade:** P0 — bloqueador para qualquer 2º tenant pago que use Meta Ads + criativos.

**Correção aplicada nesta sessão** (não em produção — ver seção "O que foi corrigido"): migration `20261005000000_fix_creative_metrics_cross_tenant_p0.sql`.

### 🟠 P1 — `v_creative_metrics` (view legada): mesmo bug + exposta a `anon`, bypassando RLS

**Onde:** view `v_creative_metrics` (`supabase/migrations/20260701200000_support_native_creative_prefix.sql`).

**Problema:** mesma falta de filtro de workspace nas CTEs internas (`meta_by_creative`, `crm_by_creative`). Além disso:
- `GRANT SELECT` concedido a `anon` (chave pública, sem login) e a `authenticated` — confirmado via `information_schema.role_table_grants`.
- A view é `owner=postgres`, que tem `rolbypassrls=true`. Como o Postgres avalia RLS pelo *dono* da view (não por quem consulta), isso **contorna toda a RLS** de `meta_ads_insights`/`oportunidades`/`contatos`/`vendas_fechamento`/`notion_creatives` quando acessado via a view.
- **Não encontrado nenhum caller** em `eb-dash2/src` nem `supabase/functions` — é código morto exposto sem necessidade.

**Impacto teórico:** qualquer requisição HTTP com a `anon key` pública contra `GET /rest/v1/v_creative_metrics` devolveria investimento/faturamento/vendas de todos os workspaces sem login. Não foi disparada a requisição HTTP real (fora do escopo de leitura autorizado desta sessão) — a prova é 100% via SQL de grants + RLS bypass, suficiente para caracterizar o risco estruturalmente.

**Severidade:** P1 (view sem caller ativo reduz a urgência, mas o grant a `anon` é inaceitável por padrão de segurança do projeto).

**Correção aplicada nesta sessão:** `REVOKE SELECT ... FROM anon, authenticated, PUBLIC` na mesma migration do fix P0.

### 🟡 P2 — MQL contado por `ILIKE '%mql%'`, não pelo match exato de tag do padrão do projeto

**Onde:** todas as versões de `get_creative_metrics`/`v_creative_metrics`: `COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%')`.

**Problema:** o padrão do projeto (`CLAUDE.md`, `docs/MQL-TAG-CLASSIFICATION.md`) é comparar a tag exata após split por vírgula (`t.toLowerCase() === 'mql'`), não substring livre. `ILIKE '%mql%'` casa com qualquer tag que contenha a substring em qualquer posição — risco de inconsistência entre o CPMQL mostrado no Ranking de Criativos e o CPMQL mostrado nos demais painéis (Tráfego, Pré-Vendas), que usam o helper de match exato.

**Não verificado com número real** (ficou como gap — não há hoje volume de tags "quase mql" para provar divergência concreta, mas o código diverge do padrão declarado do projeto).

**Severidade:** P2. **Recomendação:** trocar para `~* '(^|,)\s*mql\s*(,|$)'` ou o helper padrão de tags.

### ✅ Confirmado correto — sem bug

- **`sync-ad-permalinks/index.ts`**: colunas escritas em `meta_ads_permalinks` batem 100% com o schema real; `onConflict` bate com a PK real; isolamento por `workspace_id` fail-closed.
- **`notion-creatives-sync/index.ts`**: colunas do upsert batem com o schema; `onConflict` bate com a constraint real (`notion_creatives_workspace_id_notion_page_id_key`). Erro por linha é logado e contabilizado em `stats.skipped` (não trava o sync) — comportamento aceitável, não é bug crítico.
- **`sync-meta-ads/index.ts`** e **`sync-meta-ads-backfill/index.ts`**: colunas e `onConflict` batem com o schema real; isolamento por `workspace_meta_ad_accounts` fail-closed.
- **`generate-creative-code/index.ts`** + `get_max_creative_number`: filtra corretamente por `workspace_id`.
- **Duplicação de linhas em `meta_ads_insights` por `ad_id`+`date`** (suspeita de inflar CTR/CPM/ROAS): **descartada** — `SELECT ad_id, date, COUNT(*) ... HAVING COUNT(*) > 1` retornou **0 grupos duplicados** em produção.
- RLS habilitada (`relrowsecurity = true`) em `notion_creatives`, `creative_tests`, `creative_test_history`, `creative_test_criteria`, `creative_validations`, `creative_comments`, `creative_audit_log`, `ads_catalog` — confirmado ao vivo.

---

## Eixo 2 — UX de cadastro e controle diário

### 🔴 P0 — Kanban (coração operacional do fluxo) é inutilizável em tablet/celular

**Onde:** [`eb-dash2/src/pages/criativos/components/KanbanColumn.tsx:28-52`](eb-dash2/src/pages/criativos/components/KanbanColumn.tsx), [`KanbanCard.tsx:107-111`](eb-dash2/src/pages/criativos/components/KanbanCard.tsx).

**Problema:** usa exclusivamente a API HTML5 Drag-and-Drop nativa (`onDragStart`/`onDragOver`/`onDrop`, `dataTransfer`) — sem equivalente de toque em iOS Safari/Android Chrome, sem `onTouchStart`/lib de long-press. A aba inteira fica inutilizável fora do desktop.

**Recomendação:** trocar por lib com suporte a toque (`@dnd-kit/core`) ou adicionar fallback "mover via menu/select" em telas touch.

### 🔴 P0 — Feedback de sucesso mentiroso quando RLS bloqueia silenciosamente uma atualização

**Onde:** [`eb-dash2/src/hooks/useCriativos.ts:139-149, 211-221, 240-250, 274-285`](eb-dash2/src/hooks/useCriativos.ts), [`CreativeProductionPanel.tsx:95-108`](eb-dash2/src/pages/criativos/components/CreativeProductionPanel.tsx).

**Problema:** todas as mutações fazem `.update(...).eq(...)` sem checar quantas linhas foram afetadas. O Supabase JS **não retorna erro** quando um `UPDATE` casa 0 linhas por RLS — só erro de rede/sintaxe. `onSuccess` dispara e mostra `toast.success` mesmo sem nenhuma mudança real no banco. No Kanban: usuário arrasta o card, vê "sucesso", o `invalidateQueries` refaz o fetch e **o card volta pro lugar original sem explicação nenhuma**.

**Recomendação:** checar linhas afetadas (`.select('id')` + validar array não-vazio) e disparar `toast.error` quando 0 linhas mudarem.

### 🟠 P1 — Race condition real na geração de código `AN-XXXX`

**Onde:** [`supabase/functions/generate-creative-code/index.ts:101-119`](supabase/functions/generate-creative-code/index.ts) (calcula `MAX(numero)+1` sem lock/transação) + [`useCriativos.ts:168-190`](eb-dash2/src/hooks/useCriativos.ts) (chamada e INSERT em duas requisições HTTP separadas). **Não existe `UNIQUE`** em `notion_creatives(workspace_id, external_id)` — só índice não-único.

**Impacto:** dois usuários (ou duplo-clique) criando criativo "ao mesmo tempo" podem gravar o mesmo código `AN-0042` duas vezes, sem erro — corrompendo a rastreabilidade que o código deveria garantir (é a chave usada para casar métricas de Meta Ads).

### 🟠 P1 — Listagem de criativos não pagina (risco direto do limite de 1000 linhas do PostgREST)

**Onde:** [`useCriativos.ts:49-71`](eb-dash2/src/hooks/useCriativos.ts) (`select('*')` sem `.range()`), alimenta Biblioteca, Kanban e fila de Testes. Exatamente o antipadrão que o próprio `CLAUDE.md` do projeto marca como "LIMITE CRÍTICO". Workspace crescendo continuamente com uso diário vai passar de 1000 criativos e começar a esconder dados sem erro.

### 🟠 P1 — Não existe exclusão de criativo cadastrado por engano

Nenhum `delete` em `useCriativos.ts`/`BibliotecaTab.tsx`/`CreativeFormDialog.tsx`. Único destino possível é arquivar via Kanban — o criativo continua existindo para sempre, poluindo listas e contagens.

### 🟠 P1 — Sugestão automática de teste é caixa-preta sem justificativa inline

[`TestesTab.tsx:53-78`](eb-dash2/src/pages/criativos/tabs/TestesTab.tsx) calcula a sugestão comparando CPL/spend/budget contra critérios, mas a UI só mostra o badge final (exceto o caso `wait`) — usuário não sabe se foi reprovado por CPL alto ou por budget sem lead, indo contra a exigência de "decisão rápida sem abrir outra tela".

### 🟡 P2 — Formulário de cadastro sobrecarregado para uso diário rápido

18 campos (1 obrigatório + 17 opcionais) aparecem todos de uma vez no mesmo diálogo, sem separação "essencial vs. avançado". Rótulos confusos ("Objetivo / CTA" vs. "CTA text" são conceitos diferentes sem explicação). Status só é editável via Kanban, não no formulário de edição — obriga trocar de aba no meio do fluxo. Tabela da Biblioteca (11 colunas) sem adaptação nenhuma para tablet.

### 🟢 P3 — Polimento

Botões "Novo Criativo" e "Sincronizar" (Notion) lado a lado sem diferenciação de contexto; ausência de debounce visível contra duplo-clique no botão de criar (agrava a race condition acima).

**Resumo Eixo 2:** 2 P0, 4 P1, 4 P2, 2 P3.

---

## Eixo 3 — Métricas de controle/performance

O mesmo P0 do Eixo 1 (`get_creative_metrics`/`v_creative_metrics` sem filtro de workspace) é, por definição, também um bug de métrica: **todo CPL, CPMQL, ROAS, vendas e faturamento exibidos no Ranking/Dashboard de Criativos herdam o risco de contaminação cross-tenant** no dia em que existir um 2º workspace com dados pagos.

### ✅ Confirmado correto — "Venda Fechada" usa a regra certa

Em todas as versões da view/RPC, `total_vendas`/`sales` filtra por `vf.data_pagamento_entrada IS NOT NULL` — **não** usa `data_fechado`. Isso está certo conforme a regra crítica do `CLAUDE.md` ("Venda Fechada" = pagamento confirmado, não etapa do funil). Não há reincidência do bug histórico de `data_fechado` aqui.

### ✅ Confirmado correto — sem duplicação de linhas inflando métricas

`meta_ads_insights` não tem linhas duplicadas por `ad_id`+`date` no conjunto que bate o padrão de criativo — a soma de `spend`/`impressions`/`clicks` não está inflada por granularidade errada.

### 🟡 P2 — Match de MQL por `ILIKE`, não por tag exata (já descrito no Eixo 1)

Reforça o mesmo achado: risco de o CPMQL do Ranking de Criativos divergir do CPMQL mostrado no resto do dashboard, quebrando a promessa de "número único" do produto.

### ⚪ Gap explícito (não coberto nesta rodada, por corte de tempo)

Os itens abaixo do frontend de métricas **não foram verificados com dado real nesta sessão** — não são "confirmados OK", são **não auditados**:
- `RankingTab.tsx` — se o drill-down "clique no lead/MQL/venda" abre exatamente os mesmos registros que o card conta.
- `DashboardTab.tsx` — cálculo de "CPL médio por formato" e "taxa de aprovação".
- `creative_test_criteria` — se os thresholds fixos/configuráveis fazem sentido matematicamente comparados a critérios reais de 2-3 criativos em teste.

**Recomendação:** sessão de auditoria dedicada para fechar esse gap antes de declarar o Eixo 3 "fechado".

---

## Eixo 4 — Ponte ID de criativo → Traqueamento → UTM

### Veredito: a ponte existe no código, mas está efetivamente morta na prática

```
1. Cadastro no sub-app Criativos → external_id "AN-0016" (ou "CR-1154" via Notion)
   [existe: dropdown real via notion_creatives, sem digitação livre]
        │
2. Gerador de UTMs Pago (Traqueamento → Anúncios) → grava utm_content/utm_term
   [existe tecnicamente — MAS: tabela ads_catalog tem 1 (UMA) linha em
    produção desde março/2026. Ninguém usa esse gerador de fato.]
        │
3. URL final colada manualmente no Meta Ads Manager pelo mídia buyer
   [PONTO CEGO 100% MANUAL — nada impede digitar/errar a UTM ou o
    nome do anúncio à mão, sem passar pelo gerador]
        │
4. contatos.utm_term/utm_content via webhook GHL
   [existe e funciona: mapeamento "Empire Default" confirmado, 5.044
    leads reais com utm_term no padrão de criativo]
        │
5. get_creative_metrics — casa por REGEX em DOIS textos livres
   independentes (ad_name do Meta + utm_term do lead), SEM FK entre eles
   [existe e roda, mas depende de dois humanos digitarem exatamente
    igual em dois sistemas diferentes, sem validação nenhuma]
```

### Evidência real de que hoje só o fluxo antigo funciona

Query em `contatos` (11.197 registros):
- `utm_term` batendo `AN-\d+` (fluxo nativo do sub-app Criativos): **0**
- `utm_term` batendo `CR-\d+` (fluxo antigo/Notion): **5.044**

Query em `meta_ads_insights` (855 nomes de anúncio distintos): **0** nomes de anúncio com código `AN-\d+`.

`ads_catalog` (tabela que o Gerador de UTMs Pago grava): **1 única linha**, de março/2026, com `creative_id = "CR-105"`. Os 13 criativos nativos (`AN-0004` a `AN-0016`) cadastrados em julho são visivelmente dados de teste/E2E ("teste", "Aprovação E2E...", "Kanban E2E...").

### Achado extra: `utm_content` é gravado mas nunca é lido pela métrica

O Gerador de UTMs grava `utm_content = external_id` corretamente, mas `get_creative_metrics` **ignora `utm_content` totalmente** — usa só `utm_term`. Ou seja, mesmo quando o gerador é usado do jeito certo, essa informação não alimenta nenhuma métrica hoje.

### Severidade e cenário de erro concreto

**P1 hoje** (não há volume real de criativos `AN-` em campanha para o bug "morder" ninguém ainda) — **vira P0 automaticamente** no dia em que o cadastro nativo (`AN-`) se tornar o caminho principal de trabalho, porque a métrica ficará 100% cega para ele.

Cenário concreto de erro, já latente: usuário cadastra `AN-0021`, sobe o anúncio direto no Meta sem passar pelo gerador de UTM, digita `AN-021` (ou `AN0021`, ou esquece o código) no nome do anúncio ou na URL — sem erro, sem aviso, sem log, o criativo simplesmente não aparece no Ranking, ou pior, casa por acidente com outro criativo se o número coincidir.

### Elo por elo

| Elo | Status |
|---|---|
| Criativo cadastrado → dropdown do Gerador de UTMs | ✅ Existe (dropdown real) |
| Gerador de UTMs → uso real | 🔴 Quebrado na prática (1 linha desde março) |
| URL do anúncio → Meta Ads Manager | 🟡 100% manual, sem integração |
| Nome do anúncio no Meta → código do criativo | 🔴 100% manual, sem validação |
| Webhook GHL → `contatos.utm_term`/`utm_content` | ✅ Existe e funciona |
| `contatos.utm_term` → `get_creative_metrics` | 🟡 Existe, via regex frágil sem FK; ignora `utm_content` |
| `notion_creatives.external_id` → métrica final | 🟡 Só funciona pra prefixo `CR-`; `AN-` nunca apareceu em dado real |

---

## O que foi corrigido nesta sessão

**Branch:** `docs/auditoria-criativos` (worktree isolado) · **PR:** aberto, **sem merge** (aguardando revisão/autorização do dono, conforme regra do projeto para RLS/RPC sensível).

1. **Migration `supabase/migrations/20261005000000_fix_creative_metrics_cross_tenant_p0.sql`**
   - `get_creative_metrics` (4 args e 10 args): adiciona `mai.workspace_id = p_workspace_id` na CTE `meta_agg` e `c.workspace_id = p_workspace_id` na CTE `crm_agg`. Guard `raise_unless_workspace_member` preservado.
   - Endurece grants: revoga `EXECUTE` de `anon`/`PUBLIC` nas duas assinaturas (mantém `authenticated`), mesmo padrão do fix já aplicado em `analisar_meta_*`.
   - Revoga `SELECT` de `anon`/`authenticated`/`PUBLIC` em `v_creative_metrics` (código morto, sem caller ativo, expunha bypass de RLS).
   - **NÃO aplicada em produção** por esta sessão — segue a mesma regra já usada no fix anterior de Meta Ads (`20261004000003`): correção de RLS/RPC sensível exige autorização explícita do dono antes de `db push`.

2. **Teste de regressão estrutural** — `__tests__/integration/creative-metrics-workspace-isolation-structural.test.ts`
   - Não depende de banco (segue o mesmo padrão já usado em `clara-workspace-isolation-structural.test.ts` — o projeto não tem mais banco de teste desde a decisão "só produção" de 2026-07-18, `docs/DECISAO-SO-PRODUCAO-2026-07-18.md`).
   - Lê o SQL da migration de fix e prova por regex que as duas assinaturas de `get_creative_metrics` filtram `workspace_id` nas CTEs `meta_agg`/`crm_agg`, que o guard de membership foi preservado, e que os grants perigosos foram revogados.
   - **7/7 testes passando** localmente (`vitest run` com `vitest.integration.config.ts`, sem tocar rede).

### Fora do escopo desta correção (achados registrados, não corrigidos)

- Os 2 P0 e 4 P1 de UX (Eixo 2) — são mudanças de frontend não-triviais (troca de lib de drag-and-drop, checagem de linhas afetadas em toda mutação, exclusão de criativo, paginação da listagem). Ficam documentados aqui para priorização do dono.
- MQL por `ILIKE` (P2, Eixo 1/3) — mudança de baixo risco mas não crítica o suficiente para entrar no PR de segurança.
- Ponte UTM morta (Eixo 4) — não é bug de código a corrigir; é decisão de processo/adoção (o gerador de UTM existe e funciona, só não é usado).

---

## Resumo final por severidade

| Severidade | Qtd | Onde |
|---|---|---|
| 🔴 P0 | 3 | 1 backend (cross-tenant, corrigido nesta sessão) + 2 UX (Kanban touch, feedback falso) |
| 🟠 P1 | 6 | 1 backend (`v_creative_metrics` exposta) + 4 UX (race condition, paginação, exclusão, sugestão de teste) + 1 ponte UTM (morta na prática) |
| 🟡 P2 | 6 | MQL por ILIKE (2x, mesmo achado em 2 eixos) + 4 UX (formulário, rótulos, status fragmentado, tabela não responsiva) |
| 🟢 P3 | 2 | UX (botões ambíguos, sem debounce) |

**Resposta direta à pergunta do dono: o app de Criativos NÃO está 100% funcional.** Funciona para o fluxo que já existia (Notion → `CR-`), mas tem um vazamento cross-tenant real (ainda sem vítima só porque não há 2º tenant pago com dado ainda — isso muda a qualquer momento), UX com dois pontos que travam o uso diário fora do desktop ou mentem sobre sucesso, e o recurso mais anunciado do sub-app — cadastro nativo `AN-` conectado à métrica via UTM — nunca foi usado de verdade em produção.
