# Plano de Ação — Portal de Admin User-First

**Projeto:** Empire Dashboard (eb-dash2) — React 18 + TypeScript + Supabase
**Decisão de referência:** [decisao-steve-jobs.md](decisao-steve-jobs.md)
**Métrica de aceite global:** cliques-até-poder < 3 para conceder acesso total a um usuário

---

## FASE 0 — Fundação (1 dia)

> Objetivo: provar o eixo user-first no banco e no esqueleto antes de qualquer execução em massa. Nada de UI em massa aqui.

- [ ] **Modelo de permissão por usuário no banco.** Decidir e congelar o contrato de dados que responde "o que esta pessoa pode fazer em todos os apps?" numa única leitura.
  - Tabela de vínculo: `workspace_user_app_roles` (`workspace_id`, `user_id`, `app_id`, `role`, `enabled`, `granted_by`, `granted_at`).
  - Garantir RLS por `workspace_id` (apenas admin do workspace lê/escreve).
  - Criar índice composto (`workspace_id`, `user_id`) para a query user-first ser uma leitura só.
  - **Responsável:** Dev backend/Supabase.
- [ ] **Desenhar a tela "Pessoas" como hub central de `/workspace`.** Wireframe de baixa fidelidade: lista de pessoas → clique → matriz user-first (linhas = apps, colunas = funções, toggles inline).
  - Definir o caminho de cliques-até-poder e medir no wireframe (baseline esperado).
  - **Responsável:** Dev frontend + Produto.

**Saída da Fase 0:** contrato de dados aprovado + esqueleto navegável de Pessoas. Sem isso, a Fase 1 não começa.

---

## FASE 1 — Admin Portal (1 sprint)

> Objetivo: o portal separado existe, é user-first, e o admin some das sidebars dos apps.

- [ ] **Criar `WorkspaceLayout`** — layout próprio, sem sidebar de app. Topo com identidade do workspace + navegação mínima (Pessoas | Apps).
  - Arquivo: `eb-dash2/src/components/layout/WorkspaceLayout.tsx`.
- [ ] **Rota `/workspace`** → redirect para `/workspace/users`.
- [ ] **Rota `/workspace/users`** → lista de pessoas, cada linha mostrando um resumo dos apps/permissões ativos.
- [ ] **Rota `/workspace/users/:id`** → perfil da pessoa com a **matriz user-first** (todos os apps + funções num só lugar, toggles inline). Este é o coração da decisão.
- [ ] **Rota `/workspace/apps`** → toggle de apps on/off no workspace (sub-apps ativáveis).
- [ ] **Mover `AdminAppsPage` e `AdminPermissionsPage`** para dentro de `WorkspaceLayout` (ou reescrevê-las dentro do novo eixo). Remover o eixo app-first das permissões.
- [ ] **Remover links de "Admin"** da sidebar de cada app específico (`Sidebar.tsx`). Admin não vive dentro de app nenhum.
  - Atenção à regra do projeto: sidebar sempre em sincronia com as abas reais — sem entradas mortas.

**Saída da Fase 1:** admin acessível só por `/workspace/*`, user-first, zero presença nas sidebars de app.

---

## FASE 2 — Polimento guiado por métrica

> Objetivo: provar com número que ficou mais simples. A régua é cliques-até-poder.

- [ ] **Medir cliques-até-poder (baseline)** — fluxo antigo app-first: de "quero dar acesso" até "acesso concedido".
- [ ] **Medir cliques-até-poder (after)** — fluxo novo user-first.
- [ ] **Iterar até < 3 cliques** para conceder acesso total a um usuário. Cada clique a mais precisa justificar sua existência — senão, corta.

**Saída da Fase 2:** evidência numérica de que o eixo user-first reduziu a fricção abaixo do alvo.

---

## Ordem de execução

`FASE 0 (1 dia)` → `FASE 1 (1 sprint)` → `FASE 2 (contínuo até < 3 cliques)`.

A Fase 1 não inicia sem o contrato de dados da Fase 0 aprovado. A Fase 2 não fecha enquanto cliques-até-poder ≥ 3.
