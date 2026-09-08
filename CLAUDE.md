# AI Instructions - Sistema de Extração de Dados GHL

> **Fonte canônica:** [`docs/Document_GHL.md`](docs/Document_GHL.md)
> **Projeto Supabase:** qzesffnkqgelmtfblzkr

---

## 🎯 Linguagem e Comunicação

**IMPORTANTE:** Conversar com linguagem **didática e muito explicada**. Tratar como se fosse um leigo que não entende de programação. **Sempre usar português do Brasil.**

- Explicar cada conceito antes de usar
- Usar analogias do mundo real para simplificar ideias técnicas
- Evitar jargão — quando necessário usar, explicar em seguida
- Ser paciente e claro, assumindo zero conhecimento prévio
- Responder em Português do Brasil sempre

---

## ⛔ PROIBIÇÃO ABSOLUTA: Modelos Anthropic/Claude/OpenAI

**NUNCA usar `anthropic/*`, `openai/*` ou qualquer modelo Claude (Sonnet, Haiku, Opus) nas edge functions `bot-chat` ou `prevendas-ai`.**
Motivo: custo proibido. **O modelo padrão do `bot-chat` e do `prevendas-ai` é `qwen/qwen3.6-plus` via OpenRouter**, configurável pelo owner/admin via tela Configurar Clara (regra do [`AGENTS.md`](AGENTS.md); política revisada em 2026-07-14).
Se sugerido por qualquer motivo — recusar. Ver regras completas em [`docs/TROCA-DE-MODELO-AI.md`](docs/TROCA-DE-MODELO-AI.md) e arquitetura em [`docs/CLARA-2.0-ARQUITETURA.md`](docs/CLARA-2.0-ARQUITETURA.md).

---

## Regras Obrigatórias

- Sempre atualizar `docs/ARQUITETURA.md` ao alterar estrutura de tabelas, funções, triggers ou fluxo de dados
- Sempre atualizar `docs/ROADMAP.md` ao concluir etapas ou iniciar novas
- Sempre atualizar `docs/MUDANCAS.md` com changelog de cada mudança relevante
- Toda documentação nova deve ser criada dentro de `docs/` e referenciada no índice deste arquivo
- Toda linha do índice abaixo deve mostrar a **data e hora da última atualização** do arquivo em **BRT**
- Sempre que um arquivo listado no índice for alterado, atualizar imediatamente o campo `Atualizado em` correspondente
- Este arquivo (`CLAUDE.md`) deve permanecer enxuto: **nunca adicionar conteúdo longo aqui** — sempre criar um arquivo em `docs/` e referenciar
- **Sidebar sempre em sincronia:** ao adicionar, renomear ou remover uma aba de qualquer página (array `TABS` ou equivalente), atualizar `eb-dash2/src/components/layout/Sidebar.tsx` na mesma sessão. A sidebar deve refletir exatamente as abas implementadas — sem entradas mortas nem abas ocultas.
- **UML sempre atualizado (inegociável):** `docs/UML.md` é atualizado **na mesma sessão/commit** de qualquer migration que crie ou altere tabela, coluna, função/RPC, trigger, policy ou fluxo crítico — nunca depois. Antes de dar qualquer tarefa por concluída, verifique se o campo `Atualizado em` do UML cobre a migration mais recente de `supabase/migrations/`; se não cobrir, a tarefa NÃO está concluída. UML desatualizado é bug, não pendência.
- **SDR Name Mandatory Fallback:** Sempre que buscar ou exibir o SDR de uma oportunidade, usar obrigatoriamente `sdr_name` como fonte primária, mas incluir sempre `contatos.owner_name` como fallback. Isso evita exibir traços ("—") quando o sync de followers ainda não rodou. Em queries Supabase, sempre incluir `sdr_name` no select e `contatos(owner_name)` no join.
  - Exemplo UI: `const sdr = opp.sdr_name || opp.contatos?.owner_name || '—'`
  - Exemplo Select: `.select('..., sdr_name, contatos(..., owner_name)')`
- **Single-Tenant Lock:** cada instância Empire (Supabase + Vercel) atende **apenas uma empresa**. A estrutura multitenancy (`workspaces`, `workspace_id`, RLS) continua por baixo por segurança e para facilitar a replicação, mas o frontend em `SINGLE_WORKSPACE_MODE = true` não exibe seleção nem terminologia de workspaces para o usuário final. Nunca crie um segundo workspace na mesma instância sem decisão explícita. Ver [`docs/SINGLE-TENANT-LOCK.md`](docs/SINGLE-TENANT-LOCK.md).

---

## Documentação — Índice Completo

| Documento | Atualizado em | Prioridade | Descrição |
|-----------|---------------|------------|-----------|
| [`docs/handoffs/FILA-TRABALHO-2026-08-05.md`](docs/handoffs/FILA-TRABALHO-2026-08-05.md) | 2026-08-06 BRT | OBRIGATÓRIO | **Fila de trabalho aberta — primeiro arquivo a abrir ao retomar.** O que foi aplicado em produção em 05/08 (5 PRs: caixa pelo cronograma, paginação por cursor, cron `sync-tags`, filtro de workspace sem join), as 3 armadilhas de performance que custaram horas (OFFSET, join de workspace, erro do PostgREST não é `Error`), as 3 tarefas em aberto com diagnóstico pronto (painel de discagem: 169 telefones duplicados / 397 contatos; lead "não conectado" estando agendado: 2.648 contatos com múltiplas oportunidades, 1.609 divergentes; chat não sincroniza) e 8 pendências herdadas |
| [`docs/handoffs/HANDOFF-COMPLETO.md`](docs/handoffs/HANDOFF-COMPLETO.md) | 2026-07-20 BRT | OBRIGATÓRIO | Handoff completo e autossuficiente do projeto — o que o sistema é, arquitetura/infraestrutura, estado atual, histórico de correções de segurança cross-tenant aplicadas em produção, bugs de produto corrigidos, descobertas de processo (closer 1,4% preenchido, ponte AN-/CR-, três fontes de "quem agendou"), o que falta (burn-in, DPA, bug `buscar_reengajamento`), regras de trabalho e o padrão de bug recorrente (RLS/RPC sem checagem de `anon`+workspace) |
| [`docs/SYNC-APPOINTMENT-DATES.md`](docs/SYNC-APPOINTMENT-DATES.md) | 2026-07-09 BRT | OBRIGATÓRIO | Edge function sync-appointment-dates — datas + origem IA/humano + `appointment_status` (status real do GHL, 2026-07-09: fim da categoria "Sem status"; cancelados não somem mais) via API GHL /appointments, cron 5min, backfill |
| [`docs/HANDOFF-AGENDAMENTO-IA-VS-HUMANO.md`](docs/HANDOFF-AGENDAMENTO-IA-VS-HUMANO.md) | 2026-07-08 19:00 BRT | IMPORTANTE | Handoff de implementação: rastrear e exibir agendamentos feitos por IA (conversations_ai) vs humanos no banco e nos painéis |
| [`docs/SYNC-OPP-DATES.md`](docs/SYNC-OPP-DATES.md) | 2026-03-23 14:34 BRT | OBRIGATÓRIO | Edge function sync-opp-dates — data_lead_recebido via API GHL, cron, backfill |
| [`docs/SYNC-CONTACT-OPPORTUNITIES.md`](docs/SYNC-CONTACT-OPPORTUNITIES.md) | 2026-07-14 BRT | OBRIGATÓRIO | Fila de contato novo + reconciliação/backfill completo de oportunidades GHL |
| [`docs/SYNC-OPP-PIPELINES.md`](docs/SYNC-OPP-PIPELINES.md) | 2026-03-23 14:34 BRT | OBRIGATÓRIO | Edge function sync-opp-pipelines — pipeline_id/name NULL → API GHL, cron 10min, backfill |
| [`docs/SYNC-OPP-SDR.md`](docs/SYNC-OPP-SDR.md) | 2026-03-27 BRT | OBRIGATÓRIO | Edge function sync-opp-sdr — sdr_name por oportunidade via GHL Followers API, trigger reset, cron :06 |
| [`docs/SYNC-GHL-USERS.md`](docs/SYNC-GHL-USERS.md) | 2026-05-08 BRT | OBRIGATÓRIO | Edge function sync-ghl-users — sincroniza usuários do location GHL com a tabela ghl_users, cron a cada 6h |
| [`docs/GHL-API-QUEUE.md`](docs/GHL-API-QUEUE.md) | 2026-03-27 BRT | OBRIGATÓRIO | Fila centralizada `ghl_api_jobs` + worker `ghl-api-worker` — rate limit compartilhado, stagger de crons, jobs mortos |
| [`docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md`](docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md) | 2026-03-23 14:34 BRT | OBRIGATÓRIO | Trigger pg_net → OpenClaw quando contrato assinado — payload DD/MM/AAAA BRT, idempotência, troubleshooting |
| [`docs/VENDAS-FECHAMENTO.md`](docs/VENDAS-FECHAMENTO.md) | 2026-08-04 BRT | OBRIGATÓRIO | Sistema de faturamento — tabela vendas_fechamento, trigger auto, nomes certos de campos GHL, cálculos + regra "assinatura não entra no cálculo" e card "Sem contrato assinado" |
| [`docs/INTEGRACAO-OMNX-DESK-VENDAS.md`](docs/INTEGRACAO-OMNX-DESK-VENDAS.md) | 2026-07-18 BRT | CRÍTICO | Plano técnico da integração omnx-desk (ex-EmpireDesk) → vendas: diagnóstico de produção (16 vendas OK no banco, 8 ocultas por filtro de tráfego/Recuperação, bug de 0 vendas em Aquisição/Produtividade), correção retroativa (só rename de `origem`, dados já corretos), isolamento multi-tenant por conta (provider `omnx_desk` no Vault) e rename EmpireDesk→omnx-desk (9 arquivos/39 ocorrências) |
| [`docs/CONFIG-OMNX-DESK-USUARIO.md`](docs/CONFIG-OMNX-DESK-USUARIO.md) | 2026-07-21 BRT | OBRIGATÓRIO | Guia do usuário para conectar uma conta omnx-desk: URL, secret (header `x-omnx-desk-secret`), passo a passo, e o **formato exato do payload** (oportunidade_id + venda.pagamentos com `data`/`valor`/`sinal` + comprovantes) com exemplos válidos e inválidos. Passo 3 (secret próprio por conta, isolamento multi-tenant) é self-service desde 2026-07-21: Administração → Integrações → omnx-desk (migration `20261008000000`) |
| [`docs/OMNX-DESK-INTEGRACAO-SPEC-DEV.md`](docs/OMNX-DESK-INTEGRACAO-SPEC-DEV.md) | 2026-07-21 BRT | OBRIGATÓRIO | Spec para ENVIAR AO PROGRAMADOR DO OMNX-DESK: endpoints, autenticação multi-tenant por secret (digest SHA-256, fallback global), busca de lead (`crm-buscar-lead`), formato exato do payload de venda com regras campo a campo, idempotência (upsert + merge COALESCE), comprovantes (URL pública), tabela completa de erros (400/401/403/404/422/500) com política de retry, exemplo curl e checklist de implementação |
| [`docs/INTEGRACAO-EMPIREDESK-VENDAS.md`](docs/INTEGRACAO-EMPIREDESK-VENDAS.md) | 2026-05-27 BRT | SUPERADO | ⚠️ Superado por `docs/INTEGRACAO-OMNX-DESK-VENDAS.md` (terminologia antiga "EmpireDesk"). Plano original: formulário de vendas alimenta vendas_fechamento — match por telefone/e-mail, pagamentos ricos, comprovantes, faseamento |
| [`docs/IMPORTACAO-VENDAS-ANTIGAS-2026-03-31.md`](docs/IMPORTACAO-VENDAS-ANTIGAS-2026-03-31.md) | 2026-03-31 09:54 BRT | IMPORTANTE | Importação manual de 40 vendas históricas fora do CRM para `contatos`, `oportunidades` e `vendas_fechamento` |
| [`docs/BUG-FIX-PIPELINE-NULL.md`](docs/BUG-FIX-PIPELINE-NULL.md) | 2026-03-16 23:58 BRT | CRÍTICO | Bug fix: 745 opps com pipeline_id=NULL invisíveis — cause + solução + lessons learned |
| [`docs/BUG-FIX-SYNC-GHL-USERS-CROSS-WORKSPACE.md`](docs/BUG-FIX-SYNC-GHL-USERS-CROSS-WORKSPACE.md) | 2026-08-25 BRT | CRÍTICO | Bug fix: `sync-ghl-users` roda uma vez por workspace mas não filtrava por `workspace_id` ao ler/atualizar/soft-deletar — a última execução marcava `deleted = true` no time de todas as outras contas e transferia para si quem tinha acesso aos dois locations. Card "Ligações hoje" da Discagem exibia 0 com 102 ligações reais. Migration `20261019000000` (UNIQUE por conta) + deploy da function + restauração. ✅ Aplicado em produção em 2026-08-25 |
| [`docs/BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md`](docs/BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md) | 2026-08-03 BRT | CRÍTICO | Bug fix: webhook de atualização do GHL com `utm_*` vazias apagava a atribuição do lead (62 leads no Meta × 26 na dash na campanha Código da Audiência). Lead nunca sumia — só perdia a origem e desaparecia dos relatórios de tráfego. Guard `preservar_atribuicao_contato` (BEFORE UPDATE em `contatos`, migration `20261012000000`) + backfill via `webhooks_ghl`. ✅ Aplicado e validado em produção em 2026-08-03 |
| [`docs/BUG-FIX-TAGS-NULL.md`](docs/BUG-FIX-TAGS-NULL.md) | 2026-04-06 BRT | CRÍTICO | Bug fix: 92 contatos com tags=NULL, 78 MQLs invisíveis — overload ambíguo no cron, backfill 365 dias |
| [`docs/BUG-FIX-LEADS-CONECTADOS.md`](docs/BUG-FIX-LEADS-CONECTADOS.md) | 2026-07-14 BRT | CRÍTICO | Bug fix: `data_conectado` zerado por mismatch de espaço na chave `{{opportunity.mqlconectado}}` (mapeamento GHL Fase 4) + falta de COALESCE no UPDATE — 321/2.251 oportunidades abertas afetadas. ✅ Aplicado em produção em 2026-07-14 (migration `20260821000000` + backfill) |
| [`docs/INCIDENTE-WEBHOOKS-PARADOS-2026-07-14.md`](docs/INCIDENTE-WEBHOOKS-PARADOS-2026-07-14.md) | 2026-07-15 BRT | CRÍTICO | Incidente resolvido: pipeline GHL parado ~30h (leads não contabilizados) — 3 causas (webhook_secret sem paridade, credencial Vault não seedada, location aninhado não lido pela v2) + regressão de contatos sem nome. Migrations `20260906000000`/`20260907000000`, 1.502/1.502 eventos reprocessados |
| [`docs/DATA-MODEL-GUIA-IA.md`](docs/DATA-MODEL-GUIA-IA.md) | 2026-03-16 23:58 BRT | OBRIGATÓRIO | Fluxo de dados, relacionamentos, anti-patterns, troubleshooting |
| [`docs/TABELAS-SISTEMA.md`](docs/TABELAS-SISTEMA.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Documentação completa de todas as tabelas + status de preenchimento |
| [`docs/COMUNICACOES-GHL-SYNC.md`](docs/COMUNICACOES-GHL-SYNC.md) | 2026-03-23 14:34 BRT | OBRIGATÓRIO | Sistema de sync de mensagens e ligações GHL |
| [`docs/PADRAO-TIMEZONE.md`](docs/PADRAO-TIMEZONE.md) | 2026-03-16 23:58 BRT | OBRIGATÓRIO | Tipos de data: DATE (pipeline) vs TIMESTAMPTZ (data_lead_recebido) + funções TS centralizadas em `eb-dash2/src/lib/utils/dates.ts` |
| [`docs/Document_GHL.md`](docs/Document_GHL.md) | 2026-03-03 10:27 BRT | IMPORTANTE | Regras de negócio e campos do GHL |
| [`docs/PAINEL-TRAFEGO-PAGO.md`](docs/PAINEL-TRAFEGO-PAGO.md) | 2026-04-13 10:42 BRT | IMPORTANTE | Painel Tráfego — filtros, queries, funil de conversão, Cohort vs Produtividade, KPI cards e expansão de públicos por linha no Ranking de Criativos |
| [`docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md`](docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md) | 2026-03-23 14:53 BRT | IMPORTANTE | Auditoria estática da lógica cohort do painel de tráfego — pontos corretos, riscos identificados na auditoria e hardening aplicado na branch |
| [`docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md`](docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md) | 2026-03-20 15:35 BRT | IMPORTANTE | Auditoria março/2026: painel cohort vs CSV manual de formulários, causas da divergência e lista nominal de leads problemáticos |
| [`docs/COMUNICACOES-SCHEMA.md`](docs/COMUNICACOES-SCHEMA.md) | 2026-03-16 23:58 BRT | IMPORTANTE | Tabela comunicacoes — campos, view, armadilhas, 8 queries |
| [`docs/FRONTEND-EB-DASH2.md`](docs/FRONTEND-EB-DASH2.md) | 2026-03-16 23:58 BRT | IMPORTANTE | Stack, DS1 Silver Empire v2.0, padrões de código, controle de acesso |
| [`docs/DASHBOARD-CONTROLE-ACESSO.md`](docs/DASHBOARD-CONTROLE-ACESSO.md) | 2026-07-14 BRT | IMPORTANTE | Modelo unificado de acesso (workspace + permissões legadas + sub-apps), workspace isolation no frontend, seletor de workspace (agora visível para owner/admin de agência via resolveTenancyMode, mesmo com Single-Tenant Lock ligado), can_edit por feature (UI escreve can_edit desde 2026-07-09), usuário "sistema" para auditoria em operações CLI/service role, diferença entre permissões legadas e AppHub |
| [`docs/SEGURANCA-HARDENING.md`](docs/SEGURANCA-HARDENING.md) | 2026-07-08 15:14 BRT | CRÍTICO | Hardening de segurança — remoção de secrets, RLS em tabelas de dados e administrativas, proteção de RPCs e edge functions |
| [`docs/HANDOFF-2026-07-06.md`](docs/HANDOFF-2026-07-06.md) | 2026-07-08 15:14 BRT | CRÍTICO | Handoff — checklist de testes pendentes antes de mergear PR #3, riscos conhecidos, itens de segurança ainda abertos (verify_jwt, CORS, audit log) |
| [`docs/DASHBOARD-MODULOS.md`](docs/DASHBOARD-MODULOS.md) | 2026-04-14 BRT | IMPORTANTE | Padrão para adicionar tabs/sub-tabs no eb-dash2 |
| [`docs/ABA-REUNIOES-VENDAS.md`](docs/ABA-REUNIOES-VENDAS.md) | 2026-03-31 12:03 BRT | IMPORTANTE | Aba Reuniões do módulo Vendas — regras, colunas, filtros, derivação de status |
| [`docs/ABA-ATIVIDADES-PRE-VENDAS.md`](docs/ABA-ATIVIDADES-PRE-VENDAS.md) | 2026-03-31 17:33 BRT | IMPORTANTE | Aba Atividades do módulo Pré-Vendas — tabela de comunicações, colunas, status, paginação |
| [`docs/ABA-AUDITORIA-IA.md`](docs/ABA-AUDITORIA-IA.md) | 2026-08-07 BRT | IMPORTANTE | Aba Auditoria IA — **7 detectores** (sem follow-up, erro de entrega, spam, horário, conversa unilateral, conflito IA/humano e `reclamacao_lead`, este último lendo o texto da conversa com 5 guards anti-falso-positivo). Inclui a regressão de julho/2026 (§8.3: hardening reescreveu o corpo da RPC e o painel exibiu 0 problemas em silêncio por ~3 semanas), universo identificado pela mensagem (`autor = 'automacao'`), RPC `auditoria_sdr_ia()` e critérios configuráveis via aba Configuração |
| [`docs/PLANO-MULTI-TENANT-AGENCY.md`](docs/PLANO-MULTI-TENANT-AGENCY.md) | 2026-07-14 BRT | ESTUDO | v3 — Estudo de arquitetura multi-tenant Agency + Sub-contas espelhando o GHL, após 2 rodadas de revisão crítica adversarial (1ª: 26 incorporados/2 descartados; 2ª, mais profunda: 29 incorporados/0 descartados): RLS de agência corrigida (status suspenso + janela MVCC + índices/benchmark), unicidade e prova de posse de location_id, billing por sub-conta, LGPD/DPA, offboarding/exclusão de dados (workspace e pessoal de agência), kill switch + rollback por fase, disaster recovery/restore seletivo, resposta a incidente multi-tenant, critério de roteamento de tier, corte de MVP recomendado (BYOK primeiro, RLS aditiva e auto-descoberta adiadas), e referência cruzada ao item futuro "Inscrições no Formulário" (seção 17.8) |
| [`docs/ROADMAP-MULTI-TENANT.md`](docs/ROADMAP-MULTI-TENANT.md) | 2026-07-17 BRT | ACOMPANHAMENTO | Log de execução técnico detalhado do multi-tenant (datas, commits, evidência de SQL) — status resumido e sempre atual fica em `docs/ROADMAP.md` (hub único, ver linha abaixo); abrir este arquivo só para o detalhe granular fase a fase. 34 migrations e 19 Edge Functions já promovidas em produção; **hardening P0/P2 de 2026-07-17 fechou os 8 vazamentos cross-tenant restantes (isolamento total por linha) e removeu 16 functions mortas**; falta só o reteste do burn-in pelo dono (passo 3/§7.7) antes de cliente pago. Inclui estado remoto, evidências, pendências, proibições e retomada por outra IA. **Seção 8:** item PLANEJADO "Inscrições no Formulário" — leitura de Supabase externo por sub-conta, sem tornar `aplic-acelerador` multi-tenant |
| [`docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`](docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md) | 2026-07-13 BRT | CRÍTICO | Registro da liberação: baselines reconciliados sem SQL e 34 migrations promovidas por quatro bundles; `db push --include-all` continua proibido |
| [`docs/MANIFESTO-RELEASE-MULTI-TENANT.md`](docs/MANIFESTO-RELEASE-MULTI-TENANT.md) | 2026-07-13 BRT | CRÍTICO | Conjunto aplicado de 34 migrations multi-tenant, quatro exclusões e evidências de dry-run/aplicação por grupo; não autoriza `db push` integral |
| [`docs/DEPLOY-EDGE-FUNCTIONS-MULTI-TENANT.md`](docs/DEPLOY-EDGE-FUNCTIONS-MULTI-TENANT.md) | 2026-07-14 BRT | CRÍTICO | Registro do lote fechado de 19 Edge Functions multi-tenant, publicado e confirmado em produção; define o caminho até o burn-in e o gate exigido para futuras janelas |
| [`docs/ROLLBACK-MULTI-TENANT.md`](docs/ROLLBACK-MULTI-TENANT.md) | 2026-07-16 BRT | CONTINGÊNCIA | Plano de rollback da adoção multi-tenant (total e parciais) + seção sobre o aviso de collation do staging (§9). **Nada executado — é contingência; execução exige autorização explícita do dono e janela agendada.** Inclui fotografia de produção medida em 2026-07-16 (31 crons ativos, 2 workspaces, 4 credenciais Vault, filas vivas), o que é reversível e o que não é, gatilhos de "quando NÃO fazer", ordem inversa das fases sempre via migration nova, e produção verificada ÍNTEGRA quanto a collation (PostgreSQL 17.6/ICU, sem mismatch — ação só no staging) |
| [`docs/FASE-5-AGENCY-UI.md`](docs/FASE-5-AGENCY-UI.md) | 2026-07-10 21:30 BRT | OBRIGATÓRIO | Fase 5 (MVP área `/agency/*`): RPCs `suspend_agency_workspace`/`reactivate_agency_workspace` (reativação nunca automática — exige `p_confirmed=true`), `invite-user` com fallback de admin de agência, guard `AgencyRoute` via `useMyAgencies()`, página `AgencyWorkspacesPage` com confirmação por nome digitado para reativar, e o que fica de fora do MVP (custo, saúde de integração, aprovação de admin auto-descoberto) |
| [`docs/FASE-6-DENORMALIZACAO-CRM.md`](docs/FASE-6-DENORMALIZACAO-CRM.md) | 2026-07-11 BRT | OBRIGATÓRIO | Fase 6 (fatia 1): coluna `workspace_id` denormalizada em `oportunidades`/`comunicacoes`/`vendas_fechamento` — backfill histórico via join, guard fail-closed para órfãos (só auto-atribui com 1 workspace ativo), `NOT NULL` pelo padrão seguro (`NOT VALID`→`VALIDATE`→`SET NOT NULL`), trigger `BEFORE INSERT` para linhas novas. RLS continua no join (reescrita é otimização opcional, não aplicada) |
| [`docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md`](docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md) | 2026-07-11 BRT | OBRIGATÓRIO | Fase 6 (fatia 2): `workspace_id` em `meta_ads_campaigns`/`meta_ads_permalinks`/`weekly_email_logs`/`weekly_email_schedules` via join real (ad_id/created_by/schedule_id) + fallback fail-closed. **2 achados reais**: sync-ad-permalinks escrevia `workspace_id` numa coluna que não existia (upsert quebrado 100%); policies de SELECT dessas 4 tabelas não filtravam por linha (vazamento cross-tenant, corrigido na mesma migration). Fecha o gap do purge/manifesto LGPD |
| [`docs/FASE-3-POC-RESULTADOS.md`](docs/FASE-3-POC-RESULTADOS.md) | 2026-07-11 BRT | OBRIGATÓRIO | Fase 3: resultado real da POC + **decisão do dono** — token de agência fica só-leitura (recusado escopo "Editar usuários"); dado de cada sub-conta (incl. usuários/admins) sempre vem de BYOK por sub-conta (Fase 4). Fase 3 redefinida: descoberta de lista + convite para conectar a própria chave. Script `scripts/poc-fase3-ghl-agency-api.ts` |
| [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md) | 2026-07-10 BRT | CRÍTICO | Plano de execução da Fase 2 (fase mais crítica): tabela `workspace_integration_credentials` via Vault, helper `resolve-workspace-credentials`, fim do fallback "mais antigo", `ghl-api-worker` por job, 11 funções GHL + Meta/Notion/OpenRouter por workspace, `outbound_webhooks` com SSRF, suite consolidada + kill-switch (seção 10.2) |
| [`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`](docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md) | 2026-07-11 BRT | OBRIGATÓRIO | Runbook do operador: como cadastrar a credencial de cada workspace (Vault + `workspace_integration_credentials`) sem segredo no git. **Obrigatório antes do cutover em produção** — sem a linha, as funções por workspace falham fechado. RPC dedicada `seed_workspace_ghl_credential_service_role` para o cutover da chave GHL (env global → Vault) |
| [`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`](docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md) | 2026-07-10 BRT | CRÍTICO | Runbook de revogação (troca de chave + `rotation_version`, propaga em ≤10s), kill-switch por workspace+provider (`DELETE` → fail-closed) e o critério de abandono da Fase 2 (seção 10.2) |
| [`docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md`](docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md) | 2026-07-10 BRT | CRÍTICO | Plano da Fase 4 (BYOK): o **cliente** cadastra a própria chave via UI. Fatia 1 (porteiro `save_workspace_credential`, entregue), Fatia 2 (UI "Chaves de API" GHL+Meta, entregue), Fatia 4 (prova de posse/"Testar conexão" via edge function `test-workspace-credential`, entregue), Fatia 3 (link de intake para terceiro, seção 7.1, pendente) |
| [`docs/HANDOFF-FASE-4-BYOK.md`](docs/HANDOFF-FASE-4-BYOK.md) | 2026-07-10 BRT | HISTÓRICO | ⚠️ Superado — ver `docs/HANDOFF-MULTI-TENANT-2026-07-11.md` (handoff atual). Mantido por arquitetura/armadilhas (tabela/RPCs/helper/vault) ainda válidas |
| [`docs/HANDOFF-MULTI-TENANT-2026-07-11.md`](docs/HANDOFF-MULTI-TENANT-2026-07-11.md) | 2026-07-11 BRT | OPERACIONAL | Handoff completo pra continuar em outra sessão — Fases 1/2/4/5 mergeadas em `main`, Fase 6 (fatia 1) mergeada, Fase 3 (POC + decisão do dono: token de agência só-leitura) documentada, próximo passo exato (`discover-agency-locations` + `agency_ghl_credentials` via Vault, ainda não iniciado), comandos, armadilhas já depuradas |
| [`docs/BASELINE-REPRODUCIBILIDADE.md`](docs/BASELINE-REPRODUCIBILIDADE.md) | 2026-07-09 BRT | IMPORTANTE | Finding (corrigido): schema de produção não é reproduzível pelas migrations — causa real = DDL de `contatos`/`oportunidades` não versionado + teste montado via dump em vez de `db push` (GRANTs **existem** e estão versionados por migration). Contorno da Fase 0 (dump + seeds) e plano de correção (0.7) para setup-do-zero |
| [`docs/CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md`](docs/CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md) | 2026-07-11 21:10 BRT | OBRIGATÓRIO | Varredura sistemática (pós-PR #35) de escrita em coluna/tabela inexistente em todas as edge functions — achado real: `webhook-compras` (Hotmart) fazia upsert em 14 colunas inexistentes de `maquina_de_conteudo` (100% das compras falhavam desde a introdução da function), corrigido via migration. Guarda estrutural nova no CI (`schema-write-columns-structural.test.ts`) trava essa classe de bug permanentemente, comparando o código ao vivo contra o schema real do banco de teste |
| [`docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md`](docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md) | 2026-07-11 21:50 BRT | CRÍTICO | Fix da flakiness da suite — causa real NÃO era rate-limit: RPCs SECURITY DEFINER sensíveis (`get_decrypted_secret`, `purge_workspace_data`, `create_agency_for_owner_service_role`, `register_outbound_webhook`) tinham EXECUTE concedido a `anon`/`authenticated` porque `REVOKE ... FROM PUBLIC` nunca revoga grant explícito desses roles (bug replicável em produção — ação manual urgente pendente). Corrigido no banco de teste; suite 399/399 verde |
| [`docs/MAPA-DADOS-PESSOAIS-DPA.md`](docs/MAPA-DADOS-PESSOAIS-DPA.md) | 2026-07-11 22:20 BRT | OBRIGATÓRIO | Insumo técnico para o jurídico redigir o DPA — mapa completo de dados pessoais (tabela → coluna → categoria de titular), retenção (sem TTL automático documentado hoje), compartilhamento com terceiros (GHL, Meta, Resend, OpenRouter/IA, Notion, Telegram, OpenClaw) e expurgo (`purge_workspace_data` só por workspace inteiro — sem RPC de exclusão de titular individual, lacuna registrada) |
| [`docs/FASE-1-MODELO-AGENCY-RASCUNHO.md`](docs/FASE-1-MODELO-AGENCY-RASCUNHO.md) | 2026-07-09 BRT | ESTUDO | Rascunho da Fase 1 multi-tenant (modelo Agency: agencies/agency_members/agency_workspaces + RLS aditiva + resolveTenancyMode) consolidado para revisão — NÃO aplicar sem decisão e staging |
| [`docs/DECISAO-SO-PRODUCAO-2026-07-18.md`](docs/DECISAO-SO-PRODUCAO-2026-07-18.md) | 2026-07-18 BRT | CRÍTICO | Decisão do dono: deletar bancos de teste e staging; operar só com produção. Risco (sem rede pré-prod) + regras obrigatórias do novo modo (migration idempotente, backup antes de DDL destrutivo, mudanças aditivas) + limpeza de referências órfãs |
| [`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`](docs/PIPELINE-TESTE-STAGING-PRODUCAO.md) | 2026-07-18 BRT | HISTÓRICO | ⚠️ Substituído pelo modo "só produção" (2026-07-18). Processo original de migração segura Teste→Staging→Produção: cada fase validada no teste e no staging, produção só via migration versionada fase a fase |
| [`docs/ABA-CAMI.md`](docs/ABA-CAMI.md) | 2026-04-14 BRT | IMPORTANTE | Aba Cami no módulo Vendas — tags [cp] cami start / cami start, populações independentes, sem dados financeiros, LeadCard clicável |
| [`docs/MODULO-METAS.md`](docs/MODULO-METAS.md) | 2026-03-25 22:00 BRT | OBRIGATÓRIO | Módulo central de metas — catálogo de indicadores, metas versionadas, snapshots e compatibilidade com legado |
| [`docs/ABA-META-ORGANICO.md`](docs/ABA-META-ORGANICO.md) | 2026-04-10 BRT | IMPORTANTE | Metas por canal orgânico — métrica organico.mql_count, hooks useOrganicoMeta + useOrganicoMetaTab, aba dedicada MetaOrganicoTab com seletor de período independente do filtro global |
| [`docs/MODULO-INVESTIMENTO-ORGANICO.md`](docs/MODULO-INVESTIMENTO-ORGANICO.md) | 2026-04-25 BRT | IMPORTANTE | Custos de equipe orgânica — tabelas organic_investment_items + organic_investments, hooks, CustosEquipeModal, computeOrganicInvestment, acesso via Orgânico → Visão Geral → "Gerenciar Investimentos" |
| [`docs/design-system.md`](docs/design-system.md) | 2026-03-19 17:13 BRT | HISTÓRICO | DS1 Silver Empire v2.0 (superado pelo Nubank v2.2 em 2026-07-11) — tokens, tipografia, paleta, componentes |
| [`docs/DESIGN-SYSTEM-NUBANK.md`](docs/DESIGN-SYSTEM-NUBANK.md) | 2026-08-19 BRT | OBRIGATÓRIO | Design System "Nubank" v2.2 (fonte da verdade atual) — inclui o **DatePicker** (§6.1), único seletor de data da plataforma (`<input type="date">` proibido em código novo) — paleta roxa `#820AD1`, radius scale, tipografia graphikMedium/graphikRegular, liquid glass preservado e reharmonizado nos dois modos, receitas de componentes, acessibilidade AA, decisões de arquitetura |
| [`docs/DESIGN-DASHBOARD-COMPONENTS.md`](docs/DESIGN-DASHBOARD-COMPONENTS.md) | 2026-07-31 17:41 BRT | IMPORTANTE | Componentes dashboard reutilizaveis — KpiCard, DonutChart, FunnelViz, FilterBar, matrizes, CriativosTab, OriginTrendChart (linhas dia a dia), MediaBreakdownCard (utm_medium) |
| [`docs/webhooks-ghl/REGRAS-EXTRACAO.md`](docs/webhooks-ghl/REGRAS-EXTRACAO.md) | 2026-03-16 23:58 BRT | IMPORTANTE | Regras de extração + funções auxiliares + trigger + como implementar campo |
| [`docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md`](docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md) | 2026-03-26 BRT | REFERENCIA | Mapeamento técnico de campos |
| [`docs/webhooks-ghl/EVENTOS.md`](docs/webhooks-ghl/EVENTOS.md) | 2026-03-03 10:27 BRT | REFERENCIA | Eventos GHL e payloads |
| [`docs/webhooks-ghl/SOLUCAO-COLUNAS-NAO-POPULADAS.md`](docs/webhooks-ghl/SOLUCAO-COLUNAS-NAO-POPULADAS.md) | 2026-03-03 10:27 BRT | REFERENCIA | Troubleshooting de colunas não populadas |
| [`docs/CORRELACAO-META-CRM.md`](docs/CORRELACAO-META-CRM.md) | 2026-03-03 10:27 BRT | REFERENCIA | Sistema de classificação de tráfego |
| [`docs/CONCEITOS-NEGOCIO.md`](docs/CONCEITOS-NEGOCIO.md) | 2026-03-27 10:35 BRT | OBRIGATÓRIO | MQL, Lead=Oportunidade, COHORT vs PRODUTIVIDADE — definições e exemplos SQL |
| [`docs/MQL-TAG-CLASSIFICATION.md`](docs/MQL-TAG-CLASSIFICATION.md) | 2026-03-17 11:35 BRT | OBRIGATÓRIO | MQL detection via tags (não pipeline) — helper function, queries, testing |
| [`docs/SYNC-CONTACT-ATTRIBUTION.md`](docs/SYNC-CONTACT-ATTRIBUTION.md) | 2026-04-16 BRT | OBRIGATÓRIO | Repair de UTM/TT para leads `form-fb` via attributionSource do GHL + trigger imediato + attribution_skip |
| [`docs/KPI-SDR-LEADERBOARD.md`](docs/KPI-SDR-LEADERBOARD.md) | 2026-03-16 23:58 BRT | OBRIGATÓRIO | KPI "agendado em até 7 dias" — dois prazos, cálculo, limitações |
| [`docs/LEAD-QUALITY-SCORE.md`](docs/LEAD-QUALITY-SCORE.md) | 2026-04-13 10:10 BRT | OBRIGATÓRIO | Metodologia do score único de qualidade real do MQL — cohort + snapshot, blocos, buckets e agregação por filtro |
| [`docs/TROCA-DE-MODELO-AI.md`](docs/TROCA-DE-MODELO-AI.md) | 2026-06-18 15:00 BRT | IMPORTANTE | Guia completo para trocar modelo de IA — **deepseek/deepseek-v4-flash no bot-chat**, proibição absoluta de Anthropic/Claude, continuation mechanism, JWT ES256 |
| [`docs/CLARA-2.0-ARQUITETURA.md`](docs/CLARA-2.0-ARQUITETURA.md) | 2026-07-14 BRT | IMPORTANTE | Clara 2.0: arquitetura distribuída, isolada por conta, com telemetria sanitizada, configurações auditáveis e Qwen via OpenRouter BYOK |
| [`docs/CLARA-AGENTE-RELATORIOS.md`](docs/CLARA-AGENTE-RELATORIOS.md) | 2026-07-15 BRT | IMPORTANTE | Clara Agente Autônoma de Relatórios — agent loop com 8 tools de investigação (KPIs, comparação, funil, criativos, campanhas, canais, tendência, benchmarks), function calling via OpenRouter, email HTML rico |
| [`docs/INCIDENTE-WEBHOOKS-PARADOS-2026-07-14.md`](docs/INCIDENTE-WEBHOOKS-PARADOS-2026-07-14.md) | 2026-07-15 BRT | CRÍTICO | Post-mortem do incidente de 14-15/Jul — 3 causas combinadas pararam a ingestão GHL por ~30h; 1.502 eventos da quarentena reprocessados |
| [`docs/KPI-SDR-TEMPO-RESPOSTA.md`](docs/KPI-SDR-TEMPO-RESPOSTA.md) | 2026-03-16 23:58 BRT | OBRIGATÓRIO | Metodologia cálculo Tempo Médio de Resposta SDR — filtro anti-IA, anti-distorção, RPC SQL |
| [`docs/ANALISE-COHORT-VS-PRODUTIVIDADE.md`](docs/ANALISE-COHORT-VS-PRODUTIVIDADE.md) | 2026-03-03 10:27 BRT | REFERENCIA | Cohort vs Produtividade — explicação completa |
| [`docs/SUB-APPS-MODULARES.md`](docs/SUB-APPS-MODULARES.md) | 2026-07-08 17:35 BRT | OBRIGATÓRIO | Sub-apps ativáveis por workspace — tabelas, RLS, edge function, catálogo de apps, integração frontend, App Store Experience e regras de liberação de apps |
| [`docs/APP-STORE-EXPERIENCE.md`](docs/APP-STORE-EXPERIENCE.md) | 2026-07-08 15:30 BRT | OBRIGATÓRIO | Experiência de App Store — onboarding de primeiro acesso, instalação/remoção de apps e padrão para adicionar novos apps |
| [`docs/SUB-APP-CRIATIVOS.md`](docs/SUB-APP-CRIATIVOS.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Sub-app Criativos — 5 abas (Ranking, Biblioteca, Kanban, Testes, Dashboard), cadastro nativo AN-, decisão numérica e dashboard próprio |
| [`docs/guias/guia-dashboard-criativos.html`](docs/guias/guia-dashboard-criativos.html) | 2026-08-27 BRT | REFERENCIA | Guia do usuario final do sub-app Criativos (HTML + PDF `Guia-Dashboard-Criativos-OMNX.pdf` no mesmo diretorio) — para que serve, como o codigo CR-/AN- amarra Meta Ads e CRM, as 5 abas, dicionario de metricas com as formulas, Cohort x Produtividade, rotina semanal, FAQ e limitacoes conhecidas |
| [`docs/ROTEIRO-VIDEO-CRIATIVOS.md`](docs/ROTEIRO-VIDEO-CRIATIVOS.md) | 2026-08-27 BRT | REFERENCIA | Roteiro bloco a bloco para gravar o video de tour do dashboard de Criativos (12-16 min), com falas prontas, ordem de telas e os erros comuns a citar |
| [`docs/AUDITORIA-CRIATIVOS.md`](docs/AUDITORIA-CRIATIVOS.md) | 2026-07-19 BRT | CRÍTICO | Auditoria de falhas do sub-app Criativos (4 eixos: funcional, UX, métricas, ponte UTM) — achado P0 real de vazamento cross-tenant em `get_creative_metrics`/`v_creative_metrics`: **já corrigido em produção**, incorporado por `20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql` (confirmado por introspecção 2026-07-19 — `anon` sem EXECUTE/SELECT); a migration solta `20261005000002_fix_creative_metrics_cross_tenant_p0_redundante_ver_20261006000000.sql` ficou redundante e foi marcada `applied` sem rodar, 2 P0 de UX (Kanban inutilizável em touch, feedback de sucesso falso em RLS), e prova de que a ponte cadastro nativo `AN-` → UTM → métrica está morta na prática (100% da atribuição real ainda usa o fluxo antigo `CR-`/Notion) |
| [`docs/SINGLE-TENANT-LOCK.md`](docs/SINGLE-TENANT-LOCK.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Cada instância Empire atende apenas uma empresa — estrutura multitenancy preservada por baixo, mas invisível ao usuário |
| [`docs/TENANT-DEMONSTRACAO.md`](docs/TENANT-DEMONSTRACAO.md) | 2026-08-04 BRT | OBRIGATÓRIO | Tenant de demonstração "Acme Educação (Demo)" — workspace com 13 meses de operação 100% fictícia (8.336 contatos, 8.903 oportunidades, 136 vendas, ROAS 3,06x / ROI +206%) para demonstrar o dashboard sem expor cliente real. **Recalibrado em 2026-08-04** (§3.1): o seed original tinha ROAS Caixa abaixo de 1x e meses com ROI negativo — o demo demonstrava um negócio ruim. Credenciais, cobertura por aba, seed versionado e idempotente em `scripts/sql/seed-demo/`, teardown protegido, prova de isolamento por JWT e as **3 armadilhas de trigger** que fariam o seed disparar chamadas à API do GHL do cliente (neutralizadas: `attribution_skip`, `data_lead_recebido` sempre preenchida, inbound só para quem já tem a tag `conectado`) |
| [`docs/CONTRATO-WEBHOOK-CRM.md`](docs/CONTRATO-WEBHOOK-CRM.md) | 2026-07-21 BRT | CRÍTICO | Contrato canônico do webhook do CRM OMNX (inversão do mapeamento reativo → contrato fixo): lista exata de campos obrigatórios/opcionais por tabela (contato, oportunidade, venda), campo de escape automático `oportunidades.custom_extra` (zero-config, sem exigir mapeamento por workspace), avisos de formato no ingest (`webhook-ghl`) e vigilância (`webhook_contract_mismatches`) — **aplicado em produção em 2026-07-19** (migrations `20261006000001`/`20261006000002`, deploy `webhook-ghl` v60), **PR #52 mergeado**, receita de onboarding de cliente novo no Anexo B. Desde 2026-07-21, a vigilância aparece de fato na tela **Configuração → Integração CRM OMNX** (banner novo, ver `docs/GHL-MAPEAMENTO-VIGILANCIA.md`), e o **próprio documento agora é lido dentro do painel** (aba "Documentação" da mesma tela, conteúdo importado direto deste arquivo) |
| [`docs/GHL-MAPEAMENTO-CAMPOS.md`](docs/GHL-MAPEAMENTO-CAMPOS.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Tabelas de mapeamento GHL multi-conta: campos, pipelines, estágios, templates e discovery runs |
| [`docs/GHL-MAPEAMENTO-REFATORACAO.md`](docs/GHL-MAPEAMENTO-REFATORACAO.md) | 2026-07-08 BRT | OBRIGATÓRIO | Fase 4: refatoração de `extrair_dados_ghl` para usar mapeamentos configuráveis por workspace |
| [`docs/GHL-DISCOVERY.md`](docs/GHL-DISCOVERY.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Edge function `discover-ghl-config` — descoberta de custom fields e pipelines GHL por workspace |
| [`docs/GHL-CONFIG-UI.md`](docs/GHL-CONFIG-UI.md) | 2026-07-14 BRT | OBRIGATÓRIO | Interface frontend para configuração GHL: página única com Passo 1 (BYOK, chave+location_id sincronizados) + Passo 2 (assistente de mapeamento por IA + modo avançado); location_id nunca mais dessincroniza entre BYOK e roteamento de webhook |
| [`docs/GHL-CAMPOS-EXTRAS.md`](docs/GHL-CAMPOS-EXTRAS.md) | 2026-07-14 BRT | OBRIGATÓRIO | Campo GHL sem correspondência no vocabulário fixo do Empire: prefixo reservado `extra.*`, `contatos.custom_fields` (coluna já existente, agora ativada), exibição passiva no LeadCard, nunca métrica/funil. Depende da promoção conjunta com `20260821000000` (ver `BUG-FIX-LEADS-CONECTADOS.md`) |
| [`docs/GHL-MAPPING-ASSISTENTE-IA.md`](docs/GHL-MAPPING-ASSISTENTE-IA.md) | 2026-07-21 BRT | OBRIGATÓRIO | Assistente de mapeamento GHL por IA: detecta campos reais e classifica um campo por vez, com contenção server-side da proposta; outcome estruturado (mapped/not_in_vocabulary/unclear) e estado de escape na UI — campo fora do vocabulário cai no escape automático (custom_extra/extra.*), nunca vira logical_name inventado |
| [`docs/GHL-MAPPING-WIZARD.md`](docs/GHL-MAPPING-WIZARD.md) | 2026-07-14 15:22 BRT | OBRIGATÓRIO | Modo avançado de mapeamento GHL: rótulos compreensíveis, códigos técnicos recolhidos, menus sem corte e detecção de mudanças ao longo do tempo |
| [`docs/GHL-MAPEAMENTO-VIGILANCIA.md`](docs/GHL-MAPEAMENTO-VIGILANCIA.md) | 2026-07-21 BRT | OBRIGATÓRIO | Vigilância automática de mudanças de campos GHL — 2 crons diários (dispatch + detecção por contagem, jobid 90/91), tabela `ghl_mapping_change_alerts`, banner na UI, `discover-ghl-config` aceita chamador `service_role`. **✅ Confirmado ATIVO em produção desde antes de 2026-07-17** — o documento dizia "não aplicado", achado real da sessão de 2026-07-21: era a documentação que estava desatualizada, não o código |
| [`docs/GHL-MAPEAMENTO-CAMPOS-AUDITORIA.md`](docs/GHL-MAPEAMENTO-CAMPOS-AUDITORIA.md) | 2026-07-12 BRT | OBRIGATÓRIO | Auditoria honesta do sistema de mapeamento de campos GHL — veredito por peça, achados que motivaram correções (vigilância, robustez da IA, onboarding, reseed do template Empire Default), causa raiz do template vazio no banco de teste |
| [`docs/STATUS-MULTITENANT-2026-07-19.md`](docs/STATUS-MULTITENANT-2026-07-19.md) | 2026-07-19 BRT | CRÍTICO | Status honesto do que falta no multi-tenant pós-varredura P0 round 3: bloqueadores reais (burn-in, DPA), riscos residuais aceitos (funções-oráculo, `REVOKE` de `analisar_*`) e o que já está concluído em produção |
| [`docs/MATRIZ-EFICIENCIA-FUNIS-CAMPANHAS.md`](docs/MATRIZ-EFICIENCIA-FUNIS-CAMPANHAS.md) | 2026-07-19 BRT | OBRIGATÓRIO | Nova aba "Eficiência" (sub-abas Funis/Campanhas) em Vendas/Aquisição/Tráfego — só linhas com dado != 0 no período; arquitetura 100% em arquivos novos + 3 edições mínimas nas páginas |
| [`docs/PLANO-ARQUITETURA-INFORMACAO.md`](docs/PLANO-ARQUITETURA-INFORMACAO.md) | 2026-07-12 BRT | PROPOSTA | Plano (aguardando aprovação do dono, sem código): princípio "cada aba dona de uma etapa" aplicado a todo card/aba do dashboard — inventário dos 13 módulos, duplicações reais (`AppointmentOriginBreakdown`/`AppointmentBalance` em 4 módulos, Auditoria IA duplicada Pré-Vendas×SDR IA, funil completo repetido em Tráfego/Aquisição/Orgânico), 2 arquivos de código morto encontrados, filtros cruzados já existentes vs faltantes, e casos onde o princípio não fecha (Relatórios/Metas transversais, aba Cami, 3 fontes não-unificadas de "quem agendou") |
| [`docs/ADMIN-DASHBOARD.md`](docs/ADMIN-DASHBOARD.md) | 2026-06-30 14:00 BRT | OBRIGATÓRIO | Página inicial de administração redesenhada com GHL como protagonista e separação Negócio/Plataforma |
| [`docs/GHL-CREDENCIAIS.md`](docs/GHL-CREDENCIAIS.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Fase 5: credenciais GHL por workspace + rastreamento de webhooks por location_id |
| [`docs/REPLICACAO-TECNICA.md`](docs/REPLICACAO-TECNICA.md) | 2026-07-11 BRT | OBRIGATÓRIO | Arquitetura de replicação do Empire — modelo híbrido pós-Fase 7: `isolated-instance` (uma instância = uma empresa) vs `agency-subaccount` (workspace dentro da instância Agency existente), critério de quando usar cada modo |
| [`docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md`](docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md) | 2026-07-11 BRT | OBRIGATÓRIO | Fase 7: `provision-new-client.ts --mode=agency-subaccount` — provisiona sub-conta dentro da instância Agency existente sem criar projeto/deploy novo, análise de priorização, validação real no banco de teste |
| [`docs/FASE-7-P2-ATOMICIDADE.md`](docs/FASE-7-P2-ATOMICIDADE.md) | 2026-07-11 BRT | IMPORTANTE | Fase 7 (item P2): rollback compensatório automático quando o vínculo com a agência falha — reusa a RPC `purge_workspace_data` da Fase 8, validado com falha real induzida (colisão de location_id), zero órfãos |
| [`docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md`](docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md) | 2026-07-14 BRT | CRÍTICO | Runbook operacional para o dono provisionar o 1º tenant adicional em produção — bootstrap da agência (RPC nova `create_agency_for_owner_service_role`, achado: não existia caminho seguro para isso), `provision-new-client.ts --mode=agency-subaccount --execute`, BYOK do cliente, pontos de verificação e plano de rollback. Ensaiado ponta a ponta no banco de teste (seção 4 do doc) |
| [`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`](docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md) | 2026-07-11 BRT | CRÍTICO | Fase 8: runbook técnico de expurgo LGPD de workspace — RPC `purge_workspace_data` (atômica, dry-run transacional), export de portabilidade, achado real de FK quebrando o cascade (corrigido), gap de `stevo_whatsapp_calls` fechado, prova por teste de zero órfãos/zero vazamento cross-tenant |
| [`docs/NIVEIS-DE-ACESSO.md`](docs/NIVEIS-DE-ACESSO.md) | 2026-07-17 BRT | OBRIGATÓRIO | Matriz de papéis × permissões, incluindo configuração, credencial e telemetria isoladas da Clara — gate obrigatório antes de código de auth/permissão |
| [`docs/UML.md`](docs/UML.md) | 2026-09-01 BRT | OBRIGATÓRIO | Modelo de acesso e multi-tenant (entidades, RLS helpers, fluxos críticos em Mermaid) — gate antes de qualquer código de domínio; cobre o round 2 cross-tenant + sweep SECURITY DEFINER de 2026-07-19, a ingestão GHL (webhook→extração→fila de jobs, + triggers `marcar_conectado_ao_perder`/`capturar_instagram_do_webhook` de 2026-07-24), o contrato de webhook CRM (`custom_extra` + vigilância) a guard anti-agregação Meta Ads de 2026-07-20 e as regras de agendamento/unicidade por contato da fila de discagem (2026-08-26) e a fonte de verdade do financeiro da venda (desk x webhook GHL, 2026-08-31) |
| [`docs/ONBOARDING-NOVO-CLIENTE.md`](docs/ONBOARDING-NOVO-CLIENTE.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Fase 6: passo a passo de onboarding de novo cliente Empire |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | 2026-07-14 BRT | REFERENCIA | Stack completa (Vite+React, Supabase, edge functions, deploy) |
| [`docs/PLANO-RELATORIOS-SEMANAIS.md`](docs/PLANO-RELATORIOS-SEMANAIS.md) | 2026-05-18 20:45 BRT | OBRIGATÓRIO | Plano do Módulo Relatórios — schema tipado por módulo (weekly_snapshots + 9 tabelas + audit + fila), view unificada v_weekly_dashboard, Cohort vs Produtividade, backfill retroativo |
| [`docs/PLANO-MODULO-DISPAROS.md`](docs/PLANO-MODULO-DISPAROS.md) | 2026-07-05 23:00 BRT | IMPORTANTE | Módulo de Disparos — campanhas por tags configuráveis (trigger, respondeu, parou, erro, nao_respondeu, converteu), custo estimado por mensagem WhatsApp, campos manuais customizáveis |
| [`docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md`](docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md) | 2026-07-19 BRT | IMPORTANTE | Diagnóstico do filtro "só MQL" (lógica correta; achados reais: semântica divergente no Ranking de Criativos corrigida, badge de contagem corrigido, rótulo "Modo" duplicado renomeado para "Classificação") + filtros Closer/Pré-vendedor adicionados em Tráfego, Aquisição, Orgânico, Criativos e Leads, com sentinela "Sem atribuição" (`SEM_ATRIBUICAO`) para os ~98,6% de oportunidades sem closer no GHL |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 2026-09-01 BRT | REFERENCIA | **Hub único de roadmap** — sempre o primeiro arquivo a abrir. Tenant de demonstração entregue (2026-07-29), progresso geral, BYOK/isolamento da Clara, isolamento Meta Ads, hardening multi-tenant P0/round 2 **aplicado em produção em 2026-07-19** (gate do 2º tenant liberado), migração obrigatória de marca e logos para OMNX, filtro "Venda Direta" pronto para revisão/merge, e correção de status stale do contrato de webhook (PR #52 já estava mergeado) |
| [`docs/MUDANCAS.md`](docs/MUDANCAS.md) | 2026-09-03 BRT | REFERENCIA | Changelog de mudanças relevantes — incluindo o alinhamento do filtro de Recuperação entre Tráfego/Orgânico e Aquisição/Vendas (2026-09-03: Tráfego escondia 2 vendas de agosto), a conferência de agosto/2026 (R$ 108 mil exibidos contra R$ 266 mil reais: vendas no pipeline Recuperação + valor esmagado pelo webhook do GHL), o alinhamento Vendas × Aquisição (filtro de Recuperação valendo nos KPIs de Vendas e join de contato padronizado, 2026-08-31), a padronização de MQL único por contato nas listas/matrizes e os tooltips da Discagem (2026-08-25), a recalibragem do tenant de demonstração (2026-08-04), o fix da UTM apagada por webhook vazio (2026-08-03), a correção do build da Vercel (TS2589 em Inscrições, 2026-07-30), o tenant de demonstração (2026-07-29), isolamento, gestão de OpenRouter, correção emergencial de isolamento Meta Ads, hardening multi-tenant P0/round 2 aplicado em produção em 2026-07-19 (12 policies permissivas + 6 RPCs + 5 views), conclusão dos textos públicos OMNX, conclusão do filtro "Venda Direta" em Vendas→Produtividade, e tela de vigilância do contrato de webhook (2026-07-21) |
| [`docs/VALIDACAO-MULTITENANT.md`](docs/VALIDACAO-MULTITENANT.md) | 2026-07-19 BRT | CRÍTICO | Validação adversarial do isolamento multi-tenant (2026-07-18/19, 6 agentes) + registro completo da aplicação em produção das 2 migrations P0/round 2 (PITR confirmado, verificação antes/depois, prova de ingestão intacta) — gate do 2º tenant pago liberado quanto a este hardening |
| [`docs/VARREDURA-CROSS-TENANT-COMPLETA.md`](docs/VARREDURA-CROSS-TENANT-COMPLETA.md) | 2026-07-19 BRT | CRÍTICO | Varredura sistemática e exaustiva de TODAS as 161 funções `SECURITY DEFINER` + 13 views de produção (mesma classe de bug que já apareceu 3x: RPCs CRM round2, RPCs Meta PR #51, funções de criativo PR #53) — 37 funções + 1 view eram vazamento real (todas corrigidas, incluindo achado crítico: o próprio fix do round2 tinha um anon-bypass residual em 6 funções), inventário completo a/b/c/d, validação com escrita real em projeto efêmero (2 tenants sintéticos, colisão proposital de código de criativo). Migration `20261006000000` — branch/PR sem merge, aguarda autorização |
| [`docs/VALIDACAO-META-MULTITENANT.md`](docs/VALIDACAO-META-MULTITENANT.md) | 2026-07-19 BRT | CRÍTICO | Validação adversarial + correção do isolamento multi-tenant da integração Meta Ads — achado P0 (RPC `analisar_meta_crm_cruzado` executável por `anon` sem login) e P1 (`analisar_meta_ads_por_regiao`) na família `analisar_*`, sem filtro de workspace. Migration `20261004000003` **aplicada em produção em 2026-07-19** via deploy coordenado (PR #51), com verificação dinâmica pós-aplicação (grants + teste funcional real com JWT simulado + ingestão intacta) |
| [`docs/DISCADOR-PRE-VENDAS.md`](docs/DISCADOR-PRE-VENDAS.md) | 2026-08-26 BRT | OBRIGATÓRIO | Discador de pré-vendas e recuperação (mesma engine, campo escopo): score composto 0-1000, lead_novo ordenado só por chegada, task só conta com até 48h e só na oportunidade mais recente, isolamento de workspace, e (2026-08-26) contato com hora marcada fora da fila + uma posição por contato |
| [`docs/LEADS-MAR-2026-DATAS-OPORTUNIDADES.md`](docs/LEADS-MAR-2026-DATAS-OPORTUNIDADES.md) | 2026-03-31 16:04 BRT | IMPORTANTE | Auditoria do CSV `Leads mar:26`, 36 correções aplicadas, 27 casos ambíguos e 10 sem match |
| [`docs/CRONS-STATUS.md`](docs/CRONS-STATUS.md) | 2026-07-08 15:14 BRT | OBRIGATÓRIO | Status de todos os cron jobs — frequência, último teste, incidentes históricos |
| [`docs/TAGS-GHL.md`](docs/TAGS-GHL.md) | 2026-07-14 BRT | REFERENCIA | Tags GHL utilizadas |
| [`docs/troubleshooting_utm_source_null.md`](docs/troubleshooting_utm_source_null.md) | 2026-03-12 14:34 BRT | REFERENCIA | Troubleshooting utm_source NULL |
| [`docs/meta-ads/README.md`](docs/meta-ads/README.md) | 2026-07-08 15:14 BRT | REFERENCIA | Integração Meta Ads — inclui breakdown por região (estado) para CPV/ROAS real |
| [`docs/meta-ads/BACKFILL.md`](docs/meta-ads/BACKFILL.md) | 2026-03-03 10:27 BRT | REFERENCIA | Backfill de dados Meta Ads |
| [`docs/meta-ads/TROUBLESHOOTING-SYNC.md`](docs/meta-ads/TROUBLESHOOTING-SYNC.md) | 2026-03-03 10:27 BRT | REFERENCIA | Troubleshooting sync Meta Ads |
| [`docs/META-ADS-ISOLAMENTO-AUDITORIA.md`](docs/META-ADS-ISOLAMENTO-AUDITORIA.md) | 2026-07-16 BRT | CRÍTICO | Auditoria de isolamento multi-tenant do Meta Ads: backfill emergencial, correção do CPMQL histórico da Clara, implementação das correções arquiteturais e checklist para aplicação em produção |
| [`docs/META-ADS-ISOLAMENTO-PRODUCAO.md`](docs/META-ADS-ISOLAMENTO-PRODUCAO.md) | 2026-07-16 BRT | CRÍTICO | Runbook de aplicação em produção do isolamento Meta Ads: comandos, validações e resultados da aplicação em 2026-07-16 |
| [`docs/APIS-DOCS/meta-marketing-api.md`](docs/APIS-DOCS/meta-marketing-api.md) | 2026-03-03 10:27 BRT | REFERENCIA | API Meta Marketing detalhada |
| [`docs/APIS-DOCS/ghl-conversations-api.md`](docs/APIS-DOCS/ghl-conversations-api.md) | 2026-03-12 08:19 BRT | REFERENCIA | API GHL Conversations — rate limits, endpoints, bugs |
| [`docs/Integracoes/openrouter.md`](docs/Integracoes/openrouter.md) | 2026-03-12 07:56 BRT | REFERENCIA | Config LLM via OpenRouter (modelos, prevendas-ai) |
| [`docs/notion/CONFIGURACAO-NOTION.md`](docs/notion/CONFIGURACAO-NOTION.md) | 2026-07-14 BRT | REFERENCIA | Sincronização Notion → notion_creatives |
| [`docs/HANDOFF-OMNX-2026-07-05.md`](docs/HANDOFF-OMNX-2026-07-05.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Handoff anterior — decisões, riscos e estado do projeto antes do hardening de 2026-07-06 |
| [`docs/HANDOFF-AGENDAMENTO-IA-VS-HUMANO.md`](docs/HANDOFF-AGENDAMENTO-IA-VS-HUMANO.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Análise comparativa entre agendamentos feitos pela SDR IA e por humanos |
| [`docs/ARQUITETURA-SISTEMA-CRIATIVOS.md`](docs/ARQUITETURA-SISTEMA-CRIATIVOS.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Arquitetura técnica do sub-app Criativos — entidades, fluxos e decisões de design |
| [`docs/ARQUITETURA-NAVEGACAO-EMPIRE.md`](docs/ARQUITETURA-NAVEGACAO-EMPIRE.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Modelo de navegação do dashboard Empire — hub, apps, workspace admin e rotas legadas |
| [`docs/CLARA-MODULOS-FALTANTES.md`](docs/CLARA-MODULOS-FALTANTES.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Módulos e melhorias pendentes da Clara 2.0 e SDR IA |
| [`docs/ANALISE-CAMI-DISPARO-1000.md`](docs/ANALISE-CAMI-DISPARO-1000.md) | 2026-07-08 15:14 BRT | IMPORTANTE | Análise de 1000 disparos da Cami — padrões, aprendizados e recomendações |
| [`docs/SEGURANCA-CRON-CALLER-GUARD.md`](docs/SEGURANCA-CRON-CALLER-GUARD.md) | 2026-07-11 BRT | CRÍTICO | Guard de chamador autorizado (service_role) nas 20 edge functions de cron — achado da auditoria multi-tenant, fix dos 9 crons que enviavam anon_key, teste estrutural anti-regressão |
| [`docs/SEGURANCA-CLASSE-B-FUNCTIONS-GUARD.md`](docs/SEGURANCA-CLASSE-B-FUNCTIONS-GUARD.md) | 2026-07-11 BRT | CRÍTICO | Guard fail-closed nas 5 edge functions administrativas/manuais (recuperacao-corrigir, recuperacao-prefetch, sync-recuperacao-stages, reconcile-contact-opportunities, diag-ghl) |
| [`docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`](docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md) | 2026-07-12 BRT | RESOLVIDO 2026-07-16 | Achado: fallback "workspace mais antigo" de `get_workspace_id_by_ghl_location_id` estava ATIVO em produção (correção fail-closed + dead-letter existia em `main`, nunca deployada). **Deploy do `webhook-ghl` fail-closed realizado em 2026-07-16** após verificação ao vivo (100% dos 109.017 webhooks/30d com location casado; digest do `webhook_secret` do workspace idêntico ao env `WEBHOOK_SECRET`; probe com secret errado → 401 + dead-letter gravado). Descoberta extra: ~1.300 eventos/dia de workflows GHL sem header de secret já eram rejeitados silenciosamente — agora visíveis em `webhook_unresolved` (reprocessáveis; correção definitiva = configurar o header nos workflows do GHL, decisão do dono) |
| [`docs/CI-GATE-ISOLAMENTO-CROSS-TENANT.md`](docs/CI-GATE-ISOLAMENTO-CROSS-TENANT.md) | 2026-07-11 BRT | IMPORTANTE | Gate de CI da suite de isolamento cross-tenant — fix do path filter quebrado, limitação conhecida de branch protection em repo privado (plano GitHub) |
| [`docs/LIMPEZA-CRONS-ORFAOS-E-CODIGO-MORTO.md`](docs/LIMPEZA-CRONS-ORFAOS-E-CODIGO-MORTO.md) | 2026-07-11 BRT | IMPORTANTE | Remoção de `enviar-email-contrato-assinado` (órfã), 4 crons órfãos desagendados e botão manual "Sync" do Meta Ads removido (já quebrado, sem função real) |
| [`docs/CRIATIVOS-STATUS-NOTION-MAPA.md`](docs/CRIATIVOS-STATUS-NOTION-MAPA.md) | 2026-09-01 BRT | PROPOSTA | **Aguardando decisão do dono — nada aplicado.** Mapa proposto de status Notion → plataforma (questão Q2 da reunião de 28/08), com nível de confiança por status e a fala que embasa cada um; a contradição da própria reunião sobre o WIP (`Concluído` viraria `pronto` e entraria no WIP, saltando de ~976 para perto do total); duas opções de implementação (tradução na leitura via `creative_status_mappings`, ou na escrita no sync) e por que nenhuma se justifica antes de responder a Q1; e as 6 perguntas de negócio em aberto (Q1 manter o Notion, `Postado`, `Postado no Trial`, Q3 entrada do tráfego, Q4 adoção real) |
| [`docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`](docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md) | 2026-09-01 11:20 BRT | IMPORTANTE | Reunião de dúvidas e melhorias do **app Criativos** (47min, 28/08) com o time de criativos: transcrição de áudio + leitura das 5 abas (Dashboard, Ranking, Biblioteca, Kanban, Testes) e do modal "Novo Criativo". **6 bugs** (criativo aprovado não entra na aba Testes; sync do Notion trava em 1.000 registros com erro; 15 nativos ausentes do Kanban; Biblioteca sem scroll horizontal; cards do funil sem clique; drag-and-drop travado), **21 melhorias** (enxugar o formulário, renomear "Aprovação"→"Publicado", popular o seletor de Campanha, status inicial no cadastro, desacoplar "Início do teste" de "Testado", filtros/ordenação na Biblioteca) e **4 questões estratégicas** (manter o Notion?, mapa de status Notion→plataforma, como o tráfego entra no fluxo, adoção real). Definições confirmadas de lead time / cycle time / yield rate / WIP. Transcrição bruta em [`docs/reunioes/transcricao-criativos-2026-08-28.txt`](docs/reunioes/transcricao-criativos-2026-08-28.txt) |

---

## 🔄 Sync Automático: sync-opp-sdr ✅ OPERACIONAL

**O que faz:** popula `oportunidades.sdr_name` via `GET /opportunities/{id}/followers` da API GHL. Cada oportunidade tem seu próprio SDR (independente do contato).

**Trigger:** todo webhook de oportunidade enfileira um job de followers (PASSO 2.6 em `extrair_dados_ghl()`). O cron no offset `:06` busca opps com `sdr_name IS NULL` e enfileira via fila central.

**Fallback:** `followers` vazio → `contatos.owner_name` do último webhook.

**Reset automático:** quando `contatos.owner_name` muda → trigger reseta `sdr_name = NULL` nas opps do contato → cron re-enfileira.

**Documentação:** `docs/SYNC-OPP-SDR.md`

**Verificação:**
```sql
SELECT
  COUNT(*) FILTER (WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL) AS pendentes,
  COUNT(*) FILTER (WHERE sdr_name IS NOT NULL) AS preenchidos
FROM oportunidades;
-- Esperado: pendentes = 0
```

---

## 🔄 Sync Automático: sync-opp-pipelines ✅ OPERACIONAL

**Status:** ✅ `pipeline_id = NULL: 0` | `pipeline_name = NULL: 0` | Cron rodando a cada 10 min.

**Bugs corrigidos em 2026-03-20 (3 bugs encadeados):**
1. `pipeline_name` hardcoded como `null` na edge function → agora extrai `pipelineName` da API GHL
2. Migration `20260322000000` usava `NULLIF` em `pipeline_id` → webhook sem pipeline zerava o campo → corrigido com `COALESCE` em `20260320000003`
3. 63 opps com `pipeline_name = NULL` backfilladas via banco e mapeamento direto

**Regra crítica para novos webhooks:**
O campo `pipeline_id` em `extrair_dados_ghl` usa `COALESCE(NULLIF(...), o.pipeline_id)`. Isso é **intencional** — webhooks de atualização de data chegam SEM `pipeline_id`, e sem o COALESCE o lead desapareceria do painel.

**Documentação:** `docs/SYNC-OPP-PIPELINES.md` | **Testes:** `docs/CRONS-STATUS.md`

**Verificação:**
```sql
SELECT
  COUNT(*) FILTER (WHERE pipeline_id IS NULL)                            AS pipeline_id_null,
  COUNT(*) FILTER (WHERE pipeline_name IS NULL AND pipeline_id IS NOT NULL) AS pipeline_name_null
FROM oportunidades;
-- Esperado: 0, 0
```

---

## UI: Aba "Reuniões" no módulo Vendas (2026-03-25) ✅ IMPLEMENTADO

**Modo:** Cohort por `data_reuniao_agendada` — só funciona no modo **Cohort** (exibe aviso em Produtividade).

Ver: [`docs/ABA-REUNIOES-VENDAS.md`](docs/ABA-REUNIOES-VENDAS.md)

---

## UI: Módulo Disparos (2026-07-05) ✅ IMPLEMENTADO

Novo sub-app **Disparos** para acompanhar campanhas de disparo baseadas em tags dos contatos.

**Abas:**
- **Dashboard** — KPIs, gráficos de barras, funil e tabela de métricas por disparo.
- **Configuração** — CRUD de disparos e tags (owner/admin).

**Tags suportadas:** `trigger`, `respondeu`, `parou`, `erro`, `nao_respondeu`, `comprou`.

**Arquivos principais:**
- `eb-dash2/src/pages/disparos/DisparosPage.tsx`
- `eb-dash2/src/pages/disparos/tabs/DashboardTab.tsx`
- `eb-dash2/src/pages/disparos/tabs/ConfiguracaoTab.tsx`
- `eb-dash2/src/hooks/useDisparos.ts`
- `supabase/migrations/20260705000000_create_modulo_disparos.sql`

Ver: [`docs/PLANO-MODULO-DISPAROS.md`](docs/PLANO-MODULO-DISPAROS.md)

---

## UI: Seletor de Workspace (2026-07-05) ✅ IMPLEMENTADO

O header do dashboard agora exibe um seletor de workspace quando o usuário pertence a **2 ou mais workspaces**. Antes, o sistema silenciosamente pegava o primeiro workspace ativo do usuário.

**Comportamento:**
- A seleção fica salva em `localStorage` (`eb:selected_workspace_id`).
- `getWorkspaceId()` valida se o workspace selecionado ainda é válido para o usuário; se não for, limpa e usa o primeiro workspace ativo.
- Ao trocar de workspace, a aplicação recarrega para garantir consistência em todos os hooks e contextos.

**Arquivos:**
- `eb-dash2/src/lib/workspace.ts`
- `eb-dash2/src/components/layout/WorkspaceSelector.tsx`
- `eb-dash2/src/components/layout/DashboardLayout.tsx`

Ver: [`docs/DASHBOARD-CONTROLE-ACESSO.md`](docs/DASHBOARD-CONTROLE-ACESSO.md)

---

## UI: Configuração GHL Multi-Conta (2026-07-08) ✅

Nova página `/workspace/ghl-config` para owners/admins configurarem a integração GoHighLevel e mapearem campos, pipelines e stages. A página oferece duas abas:

**Aba "Assistente IA" (padrão):**
- Textarea amigável para o usuário descrever a estrutura do GHL em português.
- Discovery automático e análise via edge function `ai-ghl-mapping` (modelo `qwen/qwen3.6-plus`).
- Proposta visual em cards com indicadores de confiança.
- Salvamento direto nas tabelas de mapeamento.

**Aba "Mapeamento avançado":**
- Configuração de `ghl_location_id` e `webhook_secret`.
- A `ghl_api_key` é configurada como secret `GHL_API_KEY` nas edge functions do Supabase — nunca armazenada no banco nem coletada pelo frontend.
- Card com URL do webhook `https://<projeto>.supabase.co/functions/v1/webhook-ghl` e botão copiar.
- Botão "Descobrir campos do GHL" que chama a edge function `discover-ghl-config`.
- Wizard técnico com tabelas de mapeamento de campos, pipelines e stages e sugestões automáticas por similaridade de nome.
- Persistência em `ghl_field_mappings`, `ghl_pipeline_mappings` e `ghl_stage_mappings`.

**Arquivos:**
- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx`
- `eb-dash2/src/components/ghl-mapping/GhlMappingAssistant.tsx`
- `eb-dash2/src/components/ghl-mapping/GhlMappingChatInput.tsx`
- `eb-dash2/src/components/ghl-mapping/GhlMappingProposalReview.tsx`
- `eb-dash2/src/hooks/useAiGhlMapping.ts`
- `eb-dash2/src/hooks/useGhlIntegrationSettings.ts`
- `eb-dash2/src/hooks/useGhlFieldMappings.ts`
- `eb-dash2/src/hooks/useGhlPipelineMappings.ts`
- `eb-dash2/src/hooks/useGhlStageMappings.ts`
- `eb-dash2/src/hooks/useGhlDiscovery.ts`
- `eb-dash2/src/hooks/useGhlFieldMappingTemplates.ts`
- `eb-dash2/src/types/ghl-config.ts`
- `supabase/functions/ai-ghl-mapping/index.ts`

Ver: [`docs/GHL-CONFIG-UI.md`](docs/GHL-CONFIG-UI.md) | [`docs/GHL-MAPPING-ASSISTENTE-IA.md`](docs/GHL-MAPPING-ASSISTENTE-IA.md)

---

## Fase 6: Replicação do Sistema Empire para Novos Clientes (2026-07-07) ✅

Criado o processo/template de replicação do sistema para novos clientes, seguindo a arquitetura de **instância isolada por cliente** (Opção A aprovada).

**Entregáveis:**
- `scripts/provision-new-client.ts` — script TypeScript executável via `npx tsx scripts/provision-new-client.ts`.
  - Cria/links projeto Supabase (`--create-supabase`).
  - Aplica migrations (`supabase db push`).
  - Configura secrets das edge functions (`GHL_API_KEY`, `GHL_LOCATION_ID`, `WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  - Deploya edge functions (`supabase functions deploy`).
  - Cria workspace inicial via RPC `create_workspace_with_owner`.
  - Faz seed de apps/permissões via `setup_workspace_apps_and_permissions`.
  - Importa template `Empire Default` para o workspace.
  - Gera URL do webhook e instruções finais.
  - Deploya frontend no Vercel (`--deploy-vercel`) ou gera comando/variáveis.
  - Idempotente quando possível, com logs coloridos e validação de inputs.
- `.env.new-client-template` — template de variáveis de ambiente para Vercel (com placeholders `<preencher>`).
- `docs/ONBOARDING-NOVO-CLIENTE.md` — guia passo a passo de onboarding.
- `docs/REPLICACAO-TECNICA.md` — arquitetura de replicação e processo de atualização em lote.
- `CLAUDE.md`, `docs/MUDANCAS.md` e `docs/ROADMAP.md` atualizados.

**Segurança:**
- Secrets recebidos via prompt interativo ou argumentos/env vars, nunca commitados.
- `.env.new-client-template` é um template com placeholders e pode ser versionado.

**Como executar (dry-run por padrão):**
```bash
npx tsx scripts/provision-new-client.ts \
  --client-name "acme" \
  --workspace-name "Acme Empire" \
  --owner-email "admin@acme.com" \
  --owner-password "<senha-forte>" \
  --supabase-url "https://<ref>.supabase.co" \
  --supabase-anon-key "<anon>" \
  --supabase-service-role-key "<service-role>" \
  --ghl-api-key "<token>" \
  --ghl-location-id "<location>" \
  --webhook-secret "<segredo-forte>"
```

Ver: [`docs/ONBOARDING-NOVO-CLIENTE.md`](docs/ONBOARDING-NOVO-CLIENTE.md) | [`docs/REPLICACAO-TECNICA.md`](docs/REPLICACAO-TECNICA.md)

---

## UI: Alertas de Pré-Vendas divididos entre Visão Geral e Leads Parados (2026-03-23) ✅ IMPLEMENTADO

**O que mudou:** O card da **Visão Geral** continua em destaque, mas agora mostra apenas alertas operacionais de topo. O bloco **"No-shows pendentes"** virou um card próprio no topo da aba **Leads Parados**.

**Arquivos:**
- **Componentes:**
  - `eb-dash2/src/components/prevendas/AlertasCard.tsx` — mantém reuniões nas próximas 48h + leads >30d em pré-vendas
  - `eb-dash2/src/components/prevendas/NoShowsPendentesCard.tsx` — novo card com contador, lista resumida, modal e LeadCard
- **Tab modificada:**
  - `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` — adiciona `<NoShowsPendentesCard loading={isLoading} />` no topo

**Padrão atual:**
1. `AlertasCard`:
   - Reuniões agendadas (próximas 48h)
   - Leads >30d em pré-vendas (sem fechamento/perda)
2. `NoShowsPendentesCard`:
   - No-shows pendentes (não realizados, janela de 30 dias)
   - Modal clicável com todos os no-shows

**Interatividade:**
- Aba **Leads Parados** mostra o card **"No-shows pendentes"** logo no topo
- Clique no header **"No-shows pendentes"** → abre modal com tabela de todos os no-shows
- Clique em **qualquer linha** (na lista ou modal) → abre LeadCard com detalhes do lead
- Cada no-show mostra: nome + data agendada (vermelho)
- Modal tem fechar (X) no canto superior direito

**Propriedade:**
- `AlertasCard`:
  - `loading?: boolean` — spinner durante carregamento
  - `compact?: boolean` — (futuro) modo compacto com colapse auto
- `NoShowsPendentesCard`:
  - `loading?: boolean` — spinner durante carregamento

---

## ⚠️ CRÍTICO: "Venda Fechada" = `data_pagamento_entrada` (NÃO `data_fechado`)

Uma oportunidade só conta como **venda fechada** quando `vendas_fechamento.data_pagamento_entrada` está preenchida. O campo `oportunidades.data_fechado` indica apenas que o deal foi movido para a etapa "Fechado" no GHL — **não confirma pagamento**.

**Regra:** Sem `data_pagamento_entrada` → lead NÃO aparece como venda em nenhum painel.

**Implementação:**
- `RevenueRow` inclui `data_pagamento_entrada`
- `buildPaymentDateMap(revenueRows)` constrói `Map<oppId, data_pagamento_entrada>` (só opps com pagamento)
- Todas as contagens de "fechados" usam `paymentDateMap.has(oppId)` em vez de `!!opp.data_fechado`
- Produtividade agrupa "Fechados" pelo mês de `data_pagamento_entrada` (não `data_fechado`)
- Prazo médio de compra usa `data_pagamento_entrada` como data final

**Bug que motivou (2026-03-23):** Lead Jaques Grinberg tinha `data_fechado=2026-03-23` mas `data_pagamento_entrada=NULL` e `valor_faturado=0`. Aparecia como "venda" sem ter pago.

Ver: [`docs/CONCEITOS-NEGOCIO.md`](docs/CONCEITOS-NEGOCIO.md) | [`docs/VENDAS-FECHAMENTO.md`](docs/VENDAS-FECHAMENTO.md)

---

## LIMITE CRITICO: PostgREST max_rows = 1000

O Supabase tem **max_rows = 1000** no PostgREST. Qualquer `.limit(N)` com N > 1000 é **ignorado pelo servidor** — retorna sempre no máximo 1000 linhas **sem erro e sem aviso**.

**Bug real:** A tabela `oportunidades` tem >1000 registros por mês (fevereiro/2026 = 1163). Com `.limit(10000)`, o hook recebia só 1000 — leads invisíveis no dashboard.

**Padrão obrigatório para queries que podem retornar >1000 rows:**

```typescript
// ERRADO — servidor ignora, devolve 1000 silenciosamente
.from('oportunidades').select(...).limit(10000)

// CORRETO — loop paginado com .range()
const PAGE_SIZE = 1000
let all: Row[] = []
let page = 0
while (true) {
  const res = await supabase.from('oportunidades').select(...)
    .order('id')  // ordem deterministica obrigatoria
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  all = all.concat(res.data ?? [])
  if ((res.data?.length ?? 0) < PAGE_SIZE) break
  page++
}
```

**Tabelas que exigem paginacao:** `oportunidades` (~4770 total), `comunicacoes` (~78k).
**Diagnose:** se retornou exatamente 1000, suspeite de truncamento.

---

## Conceitos de Negócio

**MQL** = Lead que recebeu a TAG "MQL" no GHL (qualificação do marketing). MQL é uma **classificação por tag**, não por pipeline — um MQL pode estar em diferentes pipelines (Pré-Vendas MQL, Vendas SQL, etc.). Nunca confundir campos com prefixo `mql` (esses são apenas datas). **Lead = Oportunidade** — contato pode ter N oportunidades.

**COHORT** filtra leads por `data_lead_recebido` e conta todos os eventos que aconteceram com esses leads (sem filtro de data nos eventos). **PRODUTIVIDADE** conta o que **aconteceu no período** usando a data do próprio evento (`data_lead_recebido`, `data_conectado`, `data_agendamento_reuniao`, `data_realizacao_vendas`, `data_pagamento_entrada` etc.), respeitando apenas os filtros ativos. As etapas são independentes: `Leads`/`MQLs` usam data de geração e não podem limitar métricas operacionais. Ver: [`docs/CONCEITOS-NEGOCIO.md`](docs/CONCEITOS-NEGOCIO.md).

**Toggle Cohort/Produtividade:** SEMPRE posicionado como primeiro elemento interativo do painel, ACIMA dos filtros. Card destacado com explicação contextual. Padrão visual e textos definidos em [`docs/DASHBOARD-MODULOS.md`](docs/DASHBOARD-MODULOS.md) seção "Regras do Toggle Cohort / Produtividade".

---

## Tags GHL — Sistema de Classificação

**Tags** são rótulos atribuídos a contatos no GHL para classificar leads. Armazenadas em `contatos.tags` (TEXT, comma-separated).

**MQL Detection:** Para verificar se um lead é MQL, **verificar se a tag "MQL" está presente no campo `tags`**, não usar `pipeline_name`.

```typescript
// Helper function em useTrafego.ts
function isMqlByTag(contato: ContatoRow | null | undefined): boolean {
  if (!contato?.tags) return false
  const tags = parseTags(contato.tags)
  return tags.some((t) => t.toLowerCase() === 'mql')
}

// Uso em filters:
const mqls = opps.filter((o) => isMqlByTag(o.contatos))
```

**Sincronização — fonte de verdade: último webhook recebido.**

Tags são atualizadas por duas camadas:

1. **Cron SQL `sync-tags-from-webhook`** (a cada 5 min) — função `sync_tags_from_latest_webhook()` lê diretamente de `webhooks_ghl` e atualiza `contatos.tags` com as tags do webhook mais recente por `contact_id`. Sem chamar a API GHL. É a camada principal.
   - Migration: `20260326000001_sync_tags_from_latest_webhook.sql`
   - Índice: `idx_webhooks_ghl_contact_id_created`

2. **Edge function `sync-contact-tags`** (a cada 15 min via pg_cron) — chama API GHL como fallback para contatos sem webhook recente. Agora usa rotação diária de idempotência para re-sincronizar todos os contatos (não só `tags IS NULL`).

3. **Trigger `auto_extrair_dados_ghl`** — atualiza tags em tempo real quando um novo webhook chega, via `extract_ghl_tags(payload->'tags')`.

**Formato de tags:** Comma-separated string (e.g., `"mql,sql,[fn] webinar"`).

---

## Funis — Mapeamento via utm_campaign

**Tabela:** `funnels` — cadastra os funis do negócio. Cada funil tem um `nome` (TEXT, unique por workspace). Usada apenas para popular dropdowns de filtro.

**Tabela de vínculo:** `utm_campaigns` — campo `funnels` (JSONB array) vincula cada campanha a um ou mais funis. Ex: `["CDAV", "MQL"]`.

**Mapeamento lead → funil:** via `contatos.utm_campaign` → lookup em `utm_campaigns.funnels`. Usar o helper `buildCampaignFunnelMap` de `useTrafego.ts`.

```typescript
import { buildCampaignFunnelMap } from '@/hooks/useTrafego'

// Carregar mapa utm_campaign → funnels[]
const { data } = await supabase.from('utm_campaigns').select('utm_campaign, funnels')
const campaignFunnelMap = buildCampaignFunnelMap(data) // Map<string, string[]>

// Agrupar leads por funil
for (const opp of opps) {
  const utmCampaign = opp.contatos?.utm_campaign
  const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []
  if (funnels.length > 0) {
    for (const funnel of funnels) { /* agrupa neste funil */ }
  } else {
    /* agrupa em "Sem funil" */
  }
}
```

**Regra:** Nunca usar `contatos.tags` para agrupar por funil. Funis são mapeados via `utm_campaign → utm_campaigns.funnels`. Um lead pode aparecer em múltiplos funis se sua campanha estiver vinculada a mais de um funil.

**Filtro de funil nos hooks:** o filtro do dropdown usa `funnels` table (nomes) + `utm_campaigns.funnels` (JSONB) para filtrar opps por campanha. Já implementado em `usePreVendas` e `useTrafego`.

**Hooks que expõem `campaignFunnelMap`:** `useAquisicao`, `useOrganico` — passam via `AquisicaoSharedProps`.

**Componentes que agrupam por funil:** `AquisicaoTab`, `TrafegoTab`, `vendas/GeralTab` — todos usam `campaignFunnelMap`.

---

## Canais — Exibir Nome Amigável (não código)

**Duas tabelas de canais:**
- `utm_sources` — canais pagos (ex: "Facebook Ads", "Google Ads"). Tem `public_code` para Meta Ads.
- `utm_sources_plain` — canais orgânicos (ex: "Instagram Orgânico", "Indicação"). Sem `public_code`.

Ambas têm:
- `nome` (TEXT): Nome amigável para exibição
- `utm_source` (TEXT): Código técnico armazenado em `contatos.utm_source`

**Regra:** Ao exibir canais em charts, tabelas ou segmentos, **sempre mostrar o `nome`** (amigável), nunca o código `utm_source` direto. Carregar de **ambas** as tabelas.

```typescript
// Carregar mapa código → nome (pago + orgânico)
const [paidRes, organicRes] = await Promise.all([
  supabase.from('utm_sources').select('nome, utm_source'),
  supabase.from('utm_sources_plain').select('nome, utm_source'),
])
const channelNameMap = new Map<string, string>()
for (const r of [...(paidRes.data ?? []), ...(organicRes.data ?? [])]) {
  if (r.utm_source) channelNameMap.set(r.utm_source, r.nome || r.utm_source)
}

// Ao exibir:
const code = contato.utm_source  // "fb-1"
const displayName = channelNameMap.get(code) ?? code  // "Facebook Ads"
```

**Canais não cadastrados:** Se `contatos.utm_source` não existe em nenhuma das tabelas, exibir o código como fallback.

---

## Timezone e Tipos de Data

**Modelo de tipos:**
- Colunas de pipeline em `oportunidades` (data_conectado, data_fechado etc.) = **`DATE`** — sem hora, sem fuso. String `"2026-03-07"` direta.
- `data_lead_recebido`, `date_created`, timestamps de sistema = **`TIMESTAMPTZ`** — requerem conversão SP.

```sql
-- Filtrar por data_lead_recebido (TIMESTAMPTZ) — precisa offset SP
WHERE data_lead_recebido >= '2026-03-01T00:00:00-03:00'
  AND data_lead_recebido <= '2026-03-31T23:59:59-03:00'

-- Filtrar por coluna DATE (ex: data_conectado) — sem conversao
WHERE data_conectado >= '2026-03-01' AND data_conectado <= '2026-03-31'

-- Exibir em Sao Paulo (apenas TIMESTAMPTZ)
SELECT data_comunicacao AT TIME ZONE 'America/Sao_Paulo' FROM comunicacoes;
```

**Nunca use `created_at`** como data de evento. **Frontend:** usar sempre `eb-dash2/src/lib/utils/dates.ts`. Documento completo: [`docs/PADRAO-TIMEZONE.md`](docs/PADRAO-TIMEZONE.md).

---

## Regras de Webhook e Banco

**1. Nao confundir datas:** usar campos do GHL (`date_created`, `data_lead_recebido`), nunca `created_at` do Supabase.

**2. data_lead_recebido via API GHL (NAO via webhook):**

`data_lead_recebido` e preenchida exclusivamente pela edge function `sync-opp-dates` via `GET /opportunities/{id}` → campo `createdAt`. O webhook NAO toca esse campo. Motivo: fallbacks do webhook geravam datas erradas (inversao MM/DD, date_created incorreto). Ver [`docs/SYNC-OPP-DATES.md`](docs/SYNC-OPP-DATES.md).

**3. Imutabilidade:** `webhooks_ghl.payload` e IMUTAVEL. Nunca alterar ou deletar. Criar tabelas derivadas.

**4. UTM: valor novo sobrescreve, vazio NAO apaga (corrigido em 2026-08-03):**
```sql
-- CORRETO: valor novo tem prioridade, mas vazio preserva o que ja existe
utm_source = COALESCE(
    NULLIF(TRIM(w.payload->>'utm_source'), ''),
    NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmSource'), ''),
    c.utm_source   -- <- ULTIMO na lista: nao impede re-atribuicao, so evita apagar
)
-- ERRADO: COALESCE(c.utm_source, ...) PRIMEIRO impede re-atribuicao de leads
-- ERRADO: terminar no lastAttributionSource -> webhook parcial zera a origem
```

O GHL dispara webhooks de atualizacao com `utm_*` **vazias** minutos depois da
criacao do lead. Sem o `c.utm_source` no fim do COALESCE, esses webhooks
apagavam a atribuicao — o lead continuava no pipeline mas sumia dos relatorios
de trafego (62 leads no Meta x 26 na dash, campanha `Codigo da Audiencia`).

Hoje isso e garantido pelo trigger `preservar_atribuicao_contato` (BEFORE UPDATE
em `contatos`), que protege as 21 colunas de atribuicao em **qualquer** caminho
de escrita. As funcoes `extrair_dados_ghl`/`_v2` seguem com o COALESCE curto —
o guard e quem corrige. Ver [`docs/BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md`](docs/BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md).

**Regra geral:** webhook parcial nao pode apagar dado que ele nao carrega.
Ao adicionar campo novo alimentado por webhook, testar com payload vazio.

**5. ⚠️ CRÍTICO: pipeline_id NUNCA deve ser NULL — senão desaparece dos painéis:**

Toda oportunidade DEVE ter `pipeline_id` + `pipeline_name` preenchidos. Se NULL:
- PostgREST + PostgreSQL filtram silenciosamente em `.neq('pipeline_id', ...)` (NULL = UNKNOWN = exclusão automática)
- **Leads desaparecem sem erro ou log**
- Afetou 745 opps (feb-mar/2026) — invisíveis até investigação manual

**Validação obrigatória:**
- Edge functions: verificar que API retornou `pipeline` antes de inserir
- INSERT: considerar `NOT NULL` constraint futuro
- Webhook: sempre extrair `payload->>'pipeline_id'` com fallback

Ver: [`docs/BUG-FIX-PIPELINE-NULL.md`](docs/BUG-FIX-PIPELINE-NULL.md)

**6. ⚠️ Guard de trigger em `extrair_vendas_fechamento_do_webhook` — incluir TODOS os campos relevantes:**

O trigger ignora webhooks onde TODOS os campos monitorados são NULL. O webhook do OpenClaw (contrato assinado) chega **separado** dos dados financeiros, trazendo APENAS `op_link_do_contrato_assinado` e `data_da_assinatura_do_contrato`.

**Regra:** ao adicionar novo campo ao trigger, verificar se ele pode chegar isolado num webhook separado. Se sim, incluí-lo na condição de guarda:

```sql
-- CORRETO: guard inclui TODOS os campos relevantes
IF v_valor_entrada IS NULL
   AND v_numero_parcelas IS NULL
   AND v_valor_parcela IS NULL
   AND v_data_pagamento IS NULL
   AND v_link_contrato IS NULL      -- ← sem isso, webhook OpenClaw seria ignorado
   AND v_data_assinatura IS NULL    -- ← idem
THEN
    RETURN NEW;
END IF;
```

**7. OpenClaw — cobrir as duas ordens do processo (`link → Assinada` e `Assinada → link`):**

O disparo do OpenClaw **não pode depender de uma ordem única** dos webhooks. O fluxo real pode acontecer assim:

1. closer preenche o link e depois arrasta para `Assinada`
2. closer arrasta para `Assinada` e o link chega depois

**Regra atual:**
- Trigger em `webhooks_ghl` dispara na entrada em `Assinada` e busca o link no webhook atual ou no histórico
- Trigger em `vendas_fechamento` dispara quando o link entra **depois** que a oportunidade já está em `Assinada`
- Idempotência central em `oportunidades.openclaw_notificado_em`
- `openclaw_notificado_em` significa **resposta 2xx confirmada**, nao apenas request enfileirado
- O helper usa `timeout_milliseconds = 30000` no `net.http_post`
- Falhas/timeouts ficam registradas em `openclaw_ultimo_status_code` e `openclaw_ultimo_erro`
- O cron SQL `openclaw-contrato-assinado-retry` fecha o ciclo: sincroniza respostas e reenfileira falhas sem depender de novo webhook

Se mexer nesse fluxo, atualizar também:
- [`docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md`](docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md)
- [`docs/VENDAS-FECHAMENTO.md`](docs/VENDAS-FECHAMENTO.md)

---

## Padrão de Busca no Módulo Leads

**Problema:** Quando você busca por um nome/email, o filtro é aplicado **apenas na página atual**. Se o lead está em outra página, não aparece.

**Raiz:** A busca é feita no cliente (JavaScript) DEPOIS que a página é carregada do servidor. Então se você está vendo os leads 1-50 e o lead que procura está nos leads 51-100, ele não será encontrado.

**Solução obrigatória:**
- Usar filtro de busca **no servidor** via `.ilike()` (case-insensitive search em PostgreSQL)
- Busca em múltiplos campos: `nome`, `email`, `utm_source` (em `contatos`)
- Exemplo: `.or('contatos.nome.ilike.%termo%,contatos.email.ilike.%termo%')`
- A busca retorna TODOS os resultados que combinam (não paginado), ou implementar paginação com busca no servidor

**Data é opcional:**
- Por padrão, **não filtrar por data** (`startDate` e `endDate` vazios)
- Só aplicar filtro data se o usuário preencher explicitamente
- Permitir ver "todos os leads sem data" checando `if (filters.startDate)` ANTES de adicionar `.gte()`

---

## eb-dash2 Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Vite + React 18 + TypeScript (strict, verbatimModuleSyntax) |
| Roteamento | React Router v7 |
| Dados | TanStack Query v5 + Supabase JS client |
| Estilo | Tailwind v3 + DS1 Silver Empire v2.0 |
| Componentes | shadcn-compatible em `src/components/ui/` (sem radix-ui — custom) |
| Toasts | Sonner |
| Porta dev | 3222 (`npm run dev`) |

Detalhes completos: [`docs/FRONTEND-EB-DASH2.md`](docs/FRONTEND-EB-DASH2.md).

---

## 🧪 Validação — `tsc` e `build` SÓ NO FINAL (INEGOCIÁVEL)

**Nunca rode `npx tsc --noEmit` (nem o build completo) a cada edição durante a iteração.**

O type-check varre o projeto inteiro e leva minutos. Rodar a cada ajuste — sobretudo em mudança de CSS, onde não existe tipo para checar — trava a conversa sem entregar nada ao usuário, que fica esperando.

| Momento | O que rodar |
|---|---|
| Durante a iteração (CSS, texto, ajuste visual) | **Nada.** Entregue a alteração e siga — a validação real de UI é o navegador |
| Mexeu em estrutura (JSX, imports, tipos) e quer confirmar | `npx vite build` — mais rápido e pega os mesmos erros de compilação |
| Antes de `git commit`, `git push` ou merge | `npx tsc --noEmit` **uma vez só** |

Se precisar ver o resultado de uma mudança visual, o certo é **subir o dev server** (`npm run dev`) e deixar o usuário olhar — não usar o compilador como substituto de olho na tela.
