# HANDOFF COMPLETO — Dashboard Empire (GHL-SUPABASE)

**Data deste documento:** 2026-07-20 BRT
**Para:** o dono do projeto (não-desenvolvedor) ou qualquer IA nova que assuma a sessão
**Objetivo:** este documento é AUTOSSUFICIENTE. Quem ler só ele deve entender o projeto inteiro — o que ele faz, como está construído, o que já foi corrigido, o que ainda falta, e como retomar o trabalho com segurança.

> Convenção de leitura: toda afirmação abaixo foi conferida em um documento existente no repositório (citado entre parênteses). Onde não foi possível confirmar algo com certeza, isso está dito explicitamente — este documento não inventa fatos.

---

## 1. O que é o projeto

O **Dashboard Empire** é o sistema de dados e BI da Empire Business (marca comercial em transição para **OMNX**). Ele conecta o CRM da empresa — hoje GoHighLevel (GHL), com um novo contrato de webhook próprio já em produção (seção 4) — a um banco Supabase, e exibe tudo em um dashboard React para a equipe de marketing, pré-vendas e vendas acompanhar o funil de ponta a ponta.

**Para quem é:** uso interno da Empire Business/OMNX. O sistema é **single-tenant na experiência do usuário** — cada instância (banco Supabase + deploy Vercel) atende uma única empresa — mas a estrutura de banco por baixo já é multi-tenant (workspaces, RLS), preparada para replicar o produto para outros clientes no futuro (`CLAUDE.md`, seção "Single-Tenant Lock"; `docs/SINGLE-TENANT-LOCK.md`).

**Módulos/abas principais do dashboard (`eb-dash2/`, ver seção 2):**
- **Tráfego** — funil de captação, ranking de criativos, canais pagos/orgânicos.
- **Aquisição** — visão consolidada de aquisição de leads.
- **Pré-Vendas** — leaderboard de SDR, leads parados, atividades/comunicações, auditoria da IA (Clara).
- **Vendas** — funil de fechamento, reuniões, produtividade de closers, aba Cami.
- **Orgânico** — canais orgânicos e investimento em equipe orgânica.
- **Criativos** (sub-app) — ranking, biblioteca, kanban, testes e dashboard de criativos.
- **Disparos** (sub-app) — campanhas de disparo por tags de WhatsApp.
- **Leads** — busca e detalhe de qualquer lead individual.
- **Relatórios / Metas** — indicadores e metas versionadas por período.
- **Configuração GHL** — mapeamento de campos, pipelines e stages do GHL, com assistente de IA.
- **Administração** — usuários, permissões, credenciais por workspace.

Conceitos de negócio centrais (ver `docs/CONCEITOS-NEGOCIO.md`): **MQL** = lead marcado com a tag `"mql"` no GHL (classificação por tag, não por pipeline); **Lead = Oportunidade** (um contato pode ter várias); **COHORT** filtra por data de entrada do lead e olha tudo que aconteceu depois, sem filtro de data nos eventos; **PRODUTIVIDADE** conta o que aconteceu dentro do período filtrado, usando a data de cada evento.

---

## 2. Arquitetura e infraestrutura

**Stack** (`docs/ARQUITETURA.md`, `CLAUDE.md`):
- Frontend ativo: `eb-dash2/` — Vite + React 18 + TypeScript estrito, React Router v7, TanStack Query v5, Tailwind v3, componentes shadcn-compatíveis feitos à mão (sem radix-ui), Sonner para toasts. Roda na porta 3222 em dev (`npm run dev`).
- `eb-dash/` (Next.js v14) é **legado**, não está em produção.
- Backend: Supabase (Postgres + Auth + Edge Functions em Deno + Storage).
- Integrações externas: GHL (CRM), Meta Ads, Notion (biblioteca de criativos), OpenRouter (modelos de IA), Resend (e-mail), Telegram, OpenClaw (webhook de contrato assinado).

**Projeto Supabase de produção:** `qzesffnkqgelmtfblzkr`, região **sa-east-1**, com **PITR (Point-in-Time Recovery) ativo** — é a rede de segurança antes de qualquer alteração destrutiva de banco.

**Não existe banco de teste nem de staging.** Foram deletados em 2026-07-18 por decisão explícita do dono, documentada em `docs/DECISAO-SO-PRODUCAO-2026-07-18.md`. A partir dessa data o projeto opera em **modo só-produção**, com regras obrigatórias:
- Toda migration deve ser **idempotente**.
- **Backup/snapshot antes de qualquer DDL destrutivo.**
- Preferir sempre **mudanças aditivas** a destrutivas.
- Qualquer janela destrutiva precisa de aval explícito do dono.
- Não há CI de migrations (GitHub Actions de auto-migration foi removido) — a IA aplica migrations **diretamente** em produção via `node scripts/apply-migration.mjs <arquivo.sql>` (exige a flag `--allow-destructive` para DDL destrutivo, com backup automático) ou `apply-pending-migrations.mjs`. O token `SUPABASE_ACCESS_TOKEN` vive só em `eb-dash2/.env.local`, nunca no git.

**Deploy:**
- `main` → **Vercel automático, só do frontend** (`eb-dash2/`). Domínios: `ceo.omnx.pro`, `dash.omnx.pro`, `ceo.empirebusiness.com.br`.
- **Migrations e Edge Functions NÃO sobem automaticamente** com o merge em `main` — exigem ação manual: `supabase db push` (ou os scripts de migration citados acima) e `supabase functions deploy <nome>` respectivamente. Isso é regra de trabalho consolidada em `CLAUDE.md` ("Deploy Rules").

**Segurança e controle de acesso:**
- `docs/UML.md` (+ `docs/UML.html`, versão visual) modela as entidades centrais (usuário, workspace, membership) e os fluxos críticos em Mermaid — inclui a seção de hardening P0/P2 de 2026-07-17.
- `docs/NIVEIS-DE-ACESSO.md` documenta a matriz de papéis: `owner`/`admin`/`member` de workspace e `owner`/`admin`/`staff` de agência, as funções RLS auxiliares (`is_workspace_owner/admin/member`, `is_agency_member/admin`, `can_access_workspace_via_agency`) e uma tabela de 9 ações de alto risco com quem pode autorizar cada uma (ex.: `purge_workspace_data` só é executável por `service_role`, nunca por usuário autenticado comum).

---

## 3. Estado atual

- **`main` == produção**, sem drift conhecido de banco, **nenhuma PR aberta** neste momento (confirmado pelo histórico de merges recente e pelo commit mais recente `b820706` — "docs: registra faxina de migrations e aplicação do contrato de webhook em produção").
- **Multi-tenant:** o código de isolamento por workspace está completo e as correções de segurança conhecidas (ver seção 4) já foram aplicadas e verificadas em produção. Isso é o que libera o **gate técnico** para o 2º cliente pagante — mas não é a única barreira: burn-in interno e DPA/LGPD continuam pendentes (seção 7).
- Working tree limpa no início desta sessão (`git status` sem pendências).

---

## 4. Histórico de correções de segurança aplicadas em produção

Esta é a linha do tempo dos achados de segurança mais sérios do projeto — todos envolvendo vazamento de dados entre workspaces/tenants ("cross-tenant"). **Todos os itens abaixo foram confirmados como aplicados em produção**, com verificação real (não só leitura estática de código).

1. **RLS cross-tenant (round 2, P0/P2, aplicado em 2026-07-19).** Correção de brechas de isolamento por linha nas policies. Referenciado por `docs/STATUS-MULTITENANT-2026-07-19.md`, `docs/UML.md` e `docs/MUDANCAS.md` como "hardening P0/round2 aplicado em produção em 2026-07-19" (12 policies permissivas + 6 RPCs + 5 views, migrations `20261004000000`/`20261004000002`).
   > **Nota de rastreabilidade:** o documento `docs/VALIDACAO-MULTITENANT.md`, citado pelo índice do `CLAUDE.md` e por outros docs como fonte detalhada deste round, **não existe no repositório atual** — foi criado apenas dentro de um *stash* local de uma sessão anterior (commit `95ea5ab`, não é ancestral de `main`), nunca chegou a ser commitado de fato. É uma referência quebrada no índice do `CLAUDE.md`. A evidência do que foi corrigido e aplicado sobrevive em `docs/VARREDURA-CROSS-TENANT-COMPLETA.md` e `docs/STATUS-MULTITENANT-2026-07-19.md` (itens 2 e 3 abaixo). Se alguém precisar dos detalhes originais do round 2, vale recuperar esse stash antes que se perca.

2. **Webhook fail-closed — `get_workspace_id_by_ghl_location_id` (deploy em produção em 2026-07-16).** Achado (`docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`): a função tinha um fallback de "pegar o workspace mais antigo" quando não conseguia casar o `location_id` do webhook — e esse fallback estava **ativo em produção** (a edge function `webhook-ghl` rodava uma versão antiga, sem extração de `location_id`, com um `WEBHOOK_SECRET` global único, sem tabela `webhook_unresolved`). A correção fail-closed já existia em `main` havia dias, mas nunca tinha sido deployada. Medição feita antes do deploy: 240.017 de 240.018 webhooks (99,9996%) já batiam corretamente por `location_id`. Achado colateral: ~1.300 eventos/dia vindos de workflows do GHL sem header de secret configurado já eram rejeitados silenciosamente — hoje ficam visíveis em `webhook_unresolved` (correção definitiva depende do dono configurar o header nesses workflows do GHL).

3. **Brecha anônima na Meta Ads — `analisar_meta_crm_cruzado` (aplicado em produção em 2026-07-19, PR #51).** Achado (`docs/VALIDACAO-META-MULTITENANT.md`): a RPC era `SECURITY DEFINER`, sem filtro de `workspace_id`, com `EXECUTE` concedido tanto a `anon` quanto a `authenticated` — **qualquer request com a chave pública `anon`, sem login nenhum**, conseguia agregar dados de Meta Ads cruzados com CRM de **todos** os workspaces. Um P1 irmão (`analisar_meta_ads_por_regiao`) tinha o mesmo padrão, sem filtro, só contido por um `if` no código da aplicação (não no banco). Migration `20261004000003`, aplicada via commit `5ae2414`. Verificação pós-deploy: `anon` passou a receber `permission denied`; teste com JWT simulado de um admin real retornou dado correto só do próprio workspace.

4. **Varredura completa das 161 funções `SECURITY DEFINER` + 13 views (achado registrado; correção em PR aberto, aguardando merge/autorização — ver seção 7).** `docs/VARREDURA-CROSS-TENANT-COMPLETA.md` documenta uma varredura sistemática de **todas** as funções `SECURITY DEFINER` e views de produção, motivada pelo fato de essa classe de bug já ter aparecido 3 vezes (RPCs do CRM no round 2, RPCs da Meta no PR #51, funções de criativo no PR #53). Resultado: **37 funções + 1 view eram vazamento real**. O achado mais importante desta varredura: **o próprio fix do round 2 tinha uma brecha residual** — a correção usava a condição `auth.uid() IS NULL OR is_workspace_member(...)`, mas `auth.uid()` também retorna `NULL` para uma chamada `anon` sem login, então 6 funções continuavam abertas para `anon` mesmo depois do "fix" (entre elas `list_weekly_email_schedules`, que listava agendamentos de e-mail de todos os workspaces sem exigir login — o achado mais grave desta rodada). Migration `20261006000000`, branch `fix/cross-tenant-security-definer-sweep`. **Este item está com PR aberto e sem merge** — a validação foi feita com escrita real num projeto Supabase efêmero (`DELETAR-validacao-cross-tenant-sweep`, ainda pendente de exclusão manual pelo dono), mas a correção em si aguarda autorização para ir a produção.

5. **Contrato de webhook do CRM OMNX (aplicado em produção em 2026-07-19).** `docs/CONTRATO-WEBHOOK-CRM.md` documenta a inversão do modelo antigo (mapeamento reativo, "adivinhado" a partir do que chegava) para um **contrato fixo**: lista exata de campos obrigatórios/opcionais por tabela (contato, oportunidade, venda), com um campo de escape automático `oportunidades.custom_extra` (jsonb, zero-config) para qualquer dado fora do vocabulário fixo — sem exigir mapeamento manual por workspace. Inclui avisos de formato no próprio ingest (`webhook-ghl`) e uma tabela de vigilância (`webhook_contract_mismatches`) para detectar quando o CRM começa a mandar algo fora do contrato. Aplicado via migrations `20261006000001`/`20261006000002` e deploy da edge function `webhook-ghl` (v59 → v60), confirmado em `docs/MUDANCAS.md` na entrada "faxina de migrations" de 2026-07-19.

**Lição registrada:** o padrão recorrente é uma política ou função que verifica "este usuário está logado / é dono desta linha?" mas **não verifica corretamente se é `anon`, nem filtra por workspace**. Já apareceu de três formas diferentes (RLS do CRM, RPCs da Meta, funções de criativo) e uma quarta vez dentro do próprio conserto do primeiro caso. Ver seção 9 para o padrão generalizado.

---

## 5. Bugs de produto encontrados e corrigidos

- **Leads conectados zerados sistemicamente** (`docs/BUG-FIX-LEADS-CONECTADOS.md`): 321 de 2.251 oportunidades abertas (~14%) com `data_conectado` indevidamente `NULL`, medido em 2026-07-12. Causa dupla: (1) a função `resolve_ghl_field_value` só normalizava espaço em um sentido — a variação do campo estava cadastrada sem espaço, mas o payload real do GHL chegava com espaço interno (`{{ opportunity.mqlconectado }}`); (2) a função `extrair_dados_ghl_v2` sobrescrevia `data_conectado` sem `COALESCE` no passo 2b, então um webhook de atualização sem esse campo zerava um valor que já existia. Corrigido pela migration `20260821000000`, **aplicada em produção em 2026-07-14**.

- **`sync-ad-permalinks` gravando em coluna inexistente** (`docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md`): a edge function tentava gravar `workspace_id` em todo upsert de `meta_ads_permalinks`, mas essa coluna nunca existiu na tabela — **100% dos upserts falhavam** desde a introdução da lógica. Corrigido pela migration `20260813000000`.

- **`vault.delete_secret` inexistente** (`docs/ROADMAP.md`): a versão do Supabase Vault em uso (0.3.1) não tem a função `vault.delete_secret(uuid)` — a RPC de revogação de credencial lançava erro `42883` (função inexistente) em runtime. Corrigido substituindo a chamada por `DELETE FROM vault.secrets WHERE id = ...` direto, via migration `20260919000000`.

- **Métricas de criativo cross-tenant** (`docs/AUDITORIA-CRIATIVOS.md`): a função `get_creative_metrics` (nas suas duas assinaturas) e a view `v_creative_metrics` agregavam dados de **todos os workspaces** — o filtro de workspace só existia no JOIN final com `notion_creatives`, não nas CTEs internas (`meta_agg`, `crm_agg`). A view ainda tinha `GRANT SELECT` liberado para `anon` e roda como `owner=postgres`, o que ignora RLS. Corrigido pela migration `20261005000000` — depois consolidada dentro do fix maior `20261006000000` (item 4 da seção 4); a migration solta original foi marcada como `applied` sem rodar, por redundância.

---

## 6. Descobertas de processo (não são bugs de código)

- **Closer preenchido em só 1,4% dos registros.** `docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md`: o campo `vendedor_closer` está preenchido em apenas 161 de 11.246 oportunidades (1,4%) — mesmo dentro do pipeline Vendas SQL, só 9,7% (83/854) têm closer atribuído. Em contraste, o campo de pré-vendedor (`sdr_name`) está preenchido em 99,4% dos registros. Isso não é um bug do dashboard — é um vazio de preenchimento no próprio GHL/processo comercial. Todos os filtros de Closer agora têm a opção sintética `SEM_ATRIBUICAO` para tornar esse vazio visível em vez de escondido.

- **A ponte criativo→UTM existe tecnicamente, mas é usada por praticamente ninguém — e há duas telas com nome parecido, a mais intuitiva sendo a errada.** `docs/AUDITORIA-CRIATIVOS.md`: o sub-app Criativos tem um cadastro nativo com prefixo `AN-` (ex: `AN-0004`), pensado para ligar criativo → UTM → métrica de forma automática. Na prática, **zero** leads reais e **zero** nomes de anúncio no Meta batem com o padrão `AN-\d+`. 100% da atribuição real de leads (5.044 ocorrências) ainda usa o fluxo antigo, com prefixo `CR-`, alimentado manualmente via Notion. A tabela do cadastro nativo (`ads_catalog`) tem uma única linha real desde março/2026 — os itens `AN-0004` a `AN-0016` que aparecem cadastrados em julho são dados de teste/E2E ("teste", "Aprovação E2E..."), não uso real. Ou seja: existem duas telas/fluxos com propósito parecido, e a que parece mais nova e "certa" (`AN-`) é a que ninguém usa de verdade.

- **Três fontes divergentes de "quem agendou a reunião" — decisão do dono pendente de execução completa.** `docs/PLANO-ARQUITETURA-INFORMACAO.md` (seção 6.4) documenta que hoje existem três formas diferentes de tentar responder "quem agendou este lead: IA ou humano?": (1) a coluna `oportunidades.agendamento_origem`, (2) a tag de contato `[cp] sdr ia`, e (3) a tag `auto agendou` combinada com a data `data_auto_agendamento`. Essas três fontes **não necessariamente concordam entre si**. O dono decidiu que a fonte da verdade oficial deve ser **apenas `oportunidades.agendamento_origem`** — mas essa migração ainda não foi feita em todo lugar: **confirmado no código** (`eb-dash2/src/hooks/useSDRLeaderboard.ts`, linhas 47-49) que o leaderboard de SDR ainda identifica agendamento por IA usando a tag de contato `[cp] sdr ia`, não a coluna `agendamento_origem`. Essa migração de fonte de dado no leaderboard **ainda precisa ser feita**.

---

## 7. O que falta

**Bloqueadores reais para o 2º cliente pagante (não são código):**
- **Burn-in interno** — rodar o sistema multi-tenant com uma conta GHL real por um período antes de assumir o 2º tenant pago. Não executado ainda.
- **DPA/LGPD** — o jurídico ainda não redigiu o contrato de proteção de dados. O insumo técnico (mapa de dados pessoais) já existe em `docs/MAPA-DADOS-PESSOAIS-DPA.md`.

**Riscos residuais aceitos (conscientemente, não bloqueiam nada hoje):**
- **Funções-oráculo** (`get_contact_workspace_id`, `get_opportunity_workspace_id`, família `get_user_*_workspace_ids`) — usadas em mais de 30 policies RLS. Revogar acesso amplo delas quebraria leitura/escrita legítima; ficam como está por ora.
- **Família `analisar_*` (15 funções) sem `REVOKE` explícito** — hoje seguras porque são `SECURITY INVOKER` (dependem 100% do RLS nunca falhar), mas não têm uma camada extra de proteção.

**Backlog de produto (registrado, sem execução):**
- Reorganização de abas conforme `docs/PLANO-ARQUITETURA-INFORMACAO.md` (proposta aguardando aprovação do dono, sem código alterado) — inclui eliminar duplicações reais (`AppointmentOriginBreakdown` repetido em 4 telas, `AppointmentBalance` em 4 lugares/2 variantes, Auditoria IA duplicada entre Pré-Vendas e SDR IA) e remover 2 arquivos de código morto já identificados (`eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`, 681 linhas, e `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`, 961 linhas — nenhum dos dois é importado em nenhuma rota).
- Unificação da atribuição de agendamento (seção 6, item 3).
- Migração completa de marca e logos para OMNX (citada em `docs/ROADMAP.md`).
- Hub multi-fonte (item futuro, seção 17.8 de `docs/PLANO-MULTI-TENANT-AGENCY.md`).
- Auditoria de usabilidade dos 2 P0 de UX identificados em `docs/AUDITORIA-CRIATIVOS.md`: Kanban de Criativos inutilizável em touch (usa a API HTML5 Drag-and-Drop nativa, sem suporte a touch) e feedback de sucesso falso quando o RLS bloqueia um update silenciosamente (o Supabase JS não retorna erro quando um `UPDATE` casa 0 linhas).
- Hardening geral de injeção/rate-limit (mencionado como pendência em `docs/ROADMAP.md`, sem detalhamento adicional confirmado neste levantamento).

**Bug conhecido e NÃO corrigido:**
- **`buscar_reengajamento` referencia `comunicacoes.body`, mas a coluna correta é `mensagem_body`.** Confirmado em `docs/STATUS-MULTITENANT-2026-07-19.md`: achado colateral da varredura de segurança do round 3 (2026-07-19), status "sinalizado, não corrigido". Isso quebra a feature de reengajamento do discador de pré-vendas — quebrada há aproximadamente 2 semanas a partir da data deste levantamento (desde ~2026-07-05/06). **Não é um problema de segurança**, é um erro funcional de nome de coluna errado em runtime. Vale abrir uma migration simples corrigindo a referência.

---

## 8. Regras de trabalho

- **Uma sessão de IA por repositório de cada vez.** Evita duas IAs colidindo em migration ou em branch.
- **Merge em `main` publica.** O deploy do frontend no Vercel é automático a partir de `main` — qualquer merge ali já é visível em produção para o dashboard. Migrations e Edge Functions continuam exigindo passo manual (seção 2).
- **PITR (snapshot) antes de qualquer escrita destrutiva em produção.** Como não há banco de teste, todo `DROP`/`ALTER` de coluna com dado real, mudança de tipo, ou migration com backfill deve ser precedida de confirmação de que o PITR está ativo e, quando possível, de um backup explícito.
- **Nunca deletar um projeto Supabase.** Se for necessário criar um projeto efêmero de validação (para testar RLS/migration com escrita real), ele nunca é apagado automaticamente — é renomeado com o prefixo `DELETAR-` e o `project-ref` exato é reportado ao dono, que decide se e quando excluir manualmente pelo painel do Supabase.
- **A IA não deve usar `AskUserQuestion`** neste projeto — decisões ambíguas são resolvidas com o melhor julgamento disponível e documentadas, não perguntadas em pop-up.
- **Segredo nunca aparece no chat.** Chaves de API, tokens e senhas nunca são digitados ou colados na conversa — vivem em `.env.local` (fora do git) ou no Supabase Vault.

---

## 9. O padrão de bug recorrente — sempre auditar com essa lente

O mesmo tipo de falha de segurança apareceu **três vezes de forma independente** neste projeto (RLS do CRM no round 2, RPCs de Meta Ads no PR #51, funções de criativo no PR #53) e uma **quarta vez dentro do próprio conserto** do primeiro caso (seção 4, item 4). O padrão em comum:

> **A política ou função checa "este usuário é dono desta linha?" (ou "está logado?"), mas não checa corretamente "ele pode ver/alterar ISTO especificamente?" — falta filtro por workspace, ou a condição usada para "está logado" (`auth.uid() IS NULL`) também é verdadeira para uma chamada anônima sem login nenhum.**

Sinais concretos que apareceram repetidas vezes:
- Função `SECURITY DEFINER` sem filtro de `workspace_id`/`tenant_id` explícito em alguma CTE ou subquery interna (o filtro só aparece no JOIN final, tarde demais).
- `GRANT EXECUTE`/`GRANT SELECT` concedido a `anon` (ou não revogado dele) numa função/view que deveria exigir login.
- Uma condição do tipo `auth.uid() IS NULL OR <condição de posse>` usada como "atalho para service_role/sistema", esquecendo que **isso também é verdade para uma chamada anônima**.
- Views com `owner=postgres` (ou qualquer role que ignore RLS), que reintroduzem o vazamento mesmo com a RLS da tabela base correta.

**Sempre que revisar qualquer função nova (`SECURITY DEFINER` especialmente) ou view, ou qualquer policy RLS**, pergunte explicitamente: "isso funciona corretamente para uma chamada `anon`, sem login, vinda só com a chave pública?" — e "isso filtra por workspace, não só por 'sou dono desta linha'?". Essas duas perguntas sozinhas capturaram os quatro achados P0 documentados neste handoff.

---

## 10. Índice dos documentos-chave

| Documento | O que é |
|---|---|
| `CLAUDE.md` (raiz) | Índice mestre de toda a documentação do projeto — sempre o primeiro arquivo a abrir |
| `docs/ROADMAP.md` | Hub único de roadmap — progresso geral, sempre atualizado |
| `docs/MUDANCAS.md` | Changelog cronológico de mudanças relevantes |
| `docs/ARQUITETURA.md` | Stack completa, infraestrutura, filas e crons |
| `docs/UML.md` + `docs/UML.html` | Modelo de entidades e fluxos críticos multi-tenant, em Mermaid (gate obrigatório antes de código de domínio) |
| `docs/NIVEIS-DE-ACESSO.md` | Matriz de papéis × permissões — gate obrigatório antes de código de auth/permissão |
| `docs/DECISAO-SO-PRODUCAO-2026-07-18.md` | Decisão de operar só com produção (sem teste/staging) e as regras que isso implica |
| `docs/CONTRATO-WEBHOOK-CRM.md` | Contrato fixo do webhook do CRM OMNX (campos obrigatórios, `custom_extra`, vigilância) |
| `docs/STATUS-MULTITENANT-2026-07-19.md` | Status honesto do que falta no multi-tenant — bloqueadores reais e riscos aceitos |
| `docs/VARREDURA-CROSS-TENANT-COMPLETA.md` | Varredura das 161 funções `SECURITY DEFINER` + 13 views — achado do anon-bypass residual |
| `docs/VALIDACAO-META-MULTITENANT.md` | P0/P1 de isolamento na integração Meta Ads, aplicado em produção |
| `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md` | Achado e correção do fallback inseguro de roteamento de webhook por `location_id` |
| `docs/BUG-FIX-LEADS-CONECTADOS.md` | Bug sistêmico de `data_conectado` zerado — causa raiz e correção |
| `docs/AUDITORIA-CRIATIVOS.md` | Auditoria do sub-app Criativos — achado P0 de cross-tenant, 2 P0 de UX, ponte AN-/CR- morta na prática |
| `docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md` | Diagnóstico do filtro "só MQL" e adição de filtros Closer/Pré-vendedor |
| `docs/PLANO-ARQUITETURA-INFORMACAO.md` | Proposta (aguardando aprovação) de reorganização de abas e eliminação de duplicações |
| `docs/CONCEITOS-NEGOCIO.md` | Definições de MQL, Lead=Oportunidade, Cohort vs Produtividade |
| `docs/SINGLE-TENANT-LOCK.md` | Explica o modo single-tenant visível ao usuário sobre a estrutura multi-tenant por baixo |
| `docs/SEGURANCA-CRON-CALLER-GUARD.md` | Guard de chamador autorizado nas edge functions de cron |
| `docs/SEGURANCA-CLASSE-B-FUNCTIONS-GUARD.md` | Guard fail-closed nas edge functions administrativas/manuais |
| `docs/MAPA-DADOS-PESSOAIS-DPA.md` | Insumo técnico para o jurídico redigir o DPA/LGPD |
| `docs/handoffs/latest.md` | Estado mais recente de trabalho em progresso (curto, denso, atualizado a cada sessão) |

---

## 11. Como retomar — texto pronto para colar numa IA nova

```
Estou retomando o projeto Dashboard Empire (GHL-SUPABASE). Leia primeiro
docs/handoffs/HANDOFF-COMPLETO.md (visão completa do projeto) e depois
docs/handoffs/latest.md (estado mais recente de trabalho em progresso).
Não invente nada que não esteja documentado — confirme no CLAUDE.md e nos
docs/ referenciados antes de agir. Regras: uma sessão de IA por repo, PITR
antes de qualquer escrita destrutiva em produção (não há banco de teste),
nunca deletar projeto Supabase (renomear DELETAR- e reportar ao dono),
nunca usar AskUserQuestion, segredo nunca no chat. Ao revisar qualquer
função SECURITY DEFINER ou policy RLS nova, sempre pergunte: "isso
funciona corretamente para uma chamada anon sem login?" e "isso filtra
por workspace, não só por posse da linha?" (ver seção 9 do handoff —
esse padrão de bug já apareceu 4 vezes). Me diga o estado atual e o que
você recomenda como próximo passo antes de fazer qualquer alteração.
```

---

*Este documento foi gerado em 2026-07-20 a partir da leitura direta dos arquivos citados. Se qualquer fato aqui divergir do estado real do repositório na hora da leitura, o repositório (via `git log`, `git status` e os próprios docs) é sempre a fonte de verdade — não este handoff.*
