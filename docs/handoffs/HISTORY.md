# Histórico de Handoffs — GHL-SUPABASE

> Acrescente entradas ao final. Nunca apague.

## 2026-07-17 ~14:55 BRT

### Feito
- Diagnóstico completo do erro 400/"Edge Function returned a non-2xx" ao salvar chave OpenRouter na tela de Integrações.
- Causa raiz: chave colada não era OpenRouter (formato errado + `\n` no meio); o save funcionava — só o teste falhava, e com mensagem genérica.
- Fix em `eb-dash2/src/hooks/useWorkspaceCredentials.ts` (mensagem real do erro + sanitização de whitespace no segredo). Typecheck OK.

### Decisões
- Nenhuma mudança de banco necessária (diagnóstico só com SELECT; simulação do RPC com rollback).

### Próximo passo deixado
- Usuário cola a chave OpenRouter real (`sk-or-v1-...`) e testa; depois commitar o fix.

## 2026-07-17 ~23:30 BRT

### Feito
- Auditoria MT completa (pedido do dono): 8 vazamentos cross-tenant confirmados ao vivo em pg_policies; 16 functions mortas deployadas; 3 fallbacks anti-MT.
- Branch `fix/multi-tenant-rls-hardening` (6 commits): migrations P0 (`20260927000000`) + P2 (`20260928000000`) fechando as 8 brechas + brecha `IS NULL OR` de weekly_*/ghl_users/ghl_calendars/meta_ads_sync_log + contatos sem DEFAULT; 4 functions fail-closed redeployadas; 16 functions mortas deletadas de produção (diff repo=prod=44).
- Provas: fixture RLS re-gerada (99/28), 30 testes novos, suite 592/592, gate segurança PASS, verificação pós-deploy (0 NULLs, tráfego ao vivo OK).
- Docs: UML.md (seção hardening), NIVEIS-DE-ACESSO.md, ROADMAP.md, ROADMAP-MULTI-TENANT.md, MUDANCAS.md.

### Decisões
- Backfills com fallback "workspace mais antigo" APENAS onde não há mapeamento relacional (seguro: 1 workspace real com dados; documentado nas migrations).
- notion-creatives-sync fail-closed liberado: zero credenciais notion em produção (feature dormente).
- Deleção de audit-leads-fev (endpoint público sem auth) junto com as 15 órfãs.

### Próximo passo deixado
- Dono: reteste burn-in MT-P3.7 + rotação service_role key + decisão de push/merge da branch.

## 2026-07-18 ~00:45 BRT

### Feito
- Investigação "vendas de julho não aparecem": provado NÃO ser bug — GHL não enviou webhooks com data_pagamento_entrada nova desde 07/07; Hotmart mudo desde 08/07. Dono orientado a checar lado de lá.
- Enchente missing_tenant (126.587 jobs mortos/3 dias): fix migration 20260929000000 (RPC promove context→colunas; PASSO 2.6 com tenant) + 3 functions (sync-opp-sdr, sync-contact-tags, sync-opp-pipelines) com workspace_id no context. Deploy → 0 mortos pós-fix.
- Limpeza: 127.946 jobs dead + ~128k webhook_unresolved removidos em lotes de 20k.
- Descoberta: GET /opportunities/{id}/followers nunca existiu (4.642.230 jobs, 100% 404). Fix migration 20260930000000 + function: URL vira GET /opportunities/{id} (followers real no objeto); drain com fallback permanente a owner_name.
- Backfill SDR: 7.424 → 86 (98,8% via owner_name; 86 sem owner no contato).

### Decisões
- Limpeza dos registros mortos via delete em lotes (eram ruído de fila, não dados — o backfill refaz o trabalho).
- sdr_name de opps sem followers resolvível fica com owner_name (regra de negócio já documentada).
- Vendas: não há o que backfillar — o dado não chegou; depende de ação do dono no GHL/Hotmart.

### Próximo passo deixado
- Dono: reteste burn-in MT-P3.7; rotação service_role key; verificar preenchimento de data_pagamento_entrada no GHL e vendas no Hotmart; decidir push/merge da branch (10 commits locais).

## 2026-07-18 BRT

### Feito
- Diagnóstico em prod: vendas omnx-desk estão corretas no banco; "sumiço" = filtro tráfego pago + Recuperação; "0 vendas" em Produtividade é intermitente (fetch falho engolido por catch silencioso).
- Entregue na main (FF, 28 commits): filtro de Recuperação 3 estados (Sem/Com/Só) salvável por conta em Vendas+Aquisição (tabela `user_dashboard_prefs` + RLS por usuário, hook `useDashboardPrefs`, helper `applyRecuperacaoFilter`), + fix confiabilidade (retryAsync + fim do catch silencioso + banner de erro).
- Security audit PASS (0 P0/P1/P2). Build verde. Smoke Playwright OK. 56 branches mergeadas deletadas.
- Decisão do dono registrada: deletar teste+staging, operar só produção. CI de auto-migration escrito.

### Decisões
- Só produção (sem rede pré-prod) → migrations idempotentes + backup antes de DDL destrutivo; CI aplica no push, destrutiva gated por marcador.
- Default do filtro Recuperação = comportamento atual (nada muda p/ quem não mexer).

### Próximo passo deixado
- Dono vai retomar com Claude Code LIBERADO (guardrail bloqueou escrita em prod / CI / permissões — corretamente). Ao retomar: ver `docs/handoffs/latest.md` PASSOS PENDENTES (commit dos arquivos de CI, aplicar migration `20261001000000` em prod, regen types, secret `SUPABASE_ACCESS_TOKEN` no GitHub, `worktree prune`+delete das 4 branches pr, limpar refs órfãs de teste/staging, gerar UML.html).

## 2026-07-18 BRT (retomada liberada)

### Feito
- Gate 1.6: `/security-auditor` v1.11 no diff de CI/auto-migration → PASS (0 P0/P1, 3 P2 hardening). `security-report/audit-2026-07-18-ci9x.md` + `verdict.json` (alvo `5872c23`).
- Migration `20261001000000_user_dashboard_prefs` aplicada em prod (única pendente das 461) e VERIFICADA: tabela + RLS + 5 policies.
- Push main: `c48f486` (CI auto-migration `apply-migrations.yml` + scripts + docs + state) e `5872c23` (isolamento → `workflow_dispatch`-only + fail-soft, banco de teste já deletado).
- Limpeza git: `worktree prune` + delete de `fix/pr41-migration-version`, `rebase/pr43/44/45`.

### Decisões
- Types Supabase: projeto não usa tipos gerados (`createClient` sem `<Database>`) → passo "regen types" era N/A.
- CI de isolamento: fail-soft + manual em vez de deletar o arquivo (preserva histórico/reativação). `.env.test`/`.env.staging.local` locais intocados (a pedido do dono).

### Próximo passo deixado
- DONO no GitHub: cadastrar secret `SUPABASE_ACCESS_TOKEN` (senão 1º run do `apply-migrations.yml` falha); opcional remover secrets `TEST_*`.
- Validar filtro Recuperação salvando por conta no dashboard (Vendas/Aquisição) com `user_dashboard_prefs` viva em prod.
- Regenerar `docs/UML.html` (dívida 1.6c pré-existente).

## 2026-07-18 BRT (retomada liberada — parte 2: sem CI + feature omnx-desk)

### Feito
- Dono decidiu não usar GitHub Actions → removido `apply-migrations.yml`; modelo passa a "a IA aplica migrations direto" via script local (`.env.local`). Isolamento CI → `workflow_dispatch`.
- **Feature omnx-desk vendas (roadmap 🔴 → ✅) entregue em produção:** migrations `20261002000000` (origem) e `20261003000000` (provider `omnx_desk` + RPC de roteamento) aplicadas e verificadas (RPC service_role-only; 16 vendas → omnx_desk). 3 edge functions `crm-*` deployadas (2 headers, roteamento por digest, isolamento cross-tenant 403, COALESCE, 422). Paginação `.range()` ×3. Gate segurança PASS.
- Probes ao vivo: sem/errado secret → 401.

### Decisões
- Faturamento: manter filtros/painéis como estão (filtro Recuperação cobre visibilidade); sem painel de faturamento total; sem reescrever Cohort×Produtividade.
- Multi-tenant omnx-desk: fazer agora (isolamento por secret per-tenant; global vira fallback legado a aposentar).
- Sem lacuna de ingestão pós-07/jul (dono confirmou).

### Próximo passo deixado
- Itens bloqueados no dono (rotação service_role, OpenRouter 401, header GHL, missing_tenant, fases IA-arquitetura). Regenerar `UML.html`. Aposentar secret global omnx-desk após seed per-tenant.

## 2026-07-18 BRT (parte 4: Clara testada, varredura de consistência, filtro Venda Direta)

### Feito
- Clara testada e FUNCIONANDO (chave OpenRouter Default válida; e-mail real enviado, agent loop 92s).
- Bug Vendas→Produtividade "5 fechados / Faturamento R$0" corrigido + verificado Playwright (cards gateados no loading dos 2 hooks + "—" em erro). Fechados respeita filtros. useLeads truncamento paginado.
- Robustez: paginação latente (3 hooks), chunking (3 .in), estados de erro (useProdutividadeMatrix/useMQLCohortComms).
- Auditoria multi-agente: só Vendas divergia (corrigido); demais painéis consistentes.
- Filtro "Venda Direta" INICIADO na branch feat/filtro-venda-direta: Aquisição (cohort+produtividade) OK + isVendaExterna case-insensitive + Vendas parcial. Teste revelou que Vendas Produtividade precisa reestruturação (useCloserProdutividade + hardcodes !isVendaExterna na GeralTab).

### Decisões
- Venda direta = opção no filtro de Origem/Canal, default aparece (lead+venda), só Aquisição/Vendas.
- NÃO mergear feat/filtro-venda-direta até os 4 caminhos + teste (Vendas Produtividade ainda quebra).

### Próximo passo deixado
- Reestruturação de venda externa em Vendas (§4 do latest.md): useCloserProdutividade + remover hardcodes !isVendaExterna na GeralTab + reteste Playwright → mergear a branch. Fazer com contexto limpo.

## 2026-07-19 BRT (parte 5: filtro Venda Direta concluído + merge de todas as PRs abertas)

### Feito
- Reestruturação de Vendas→Produtividade concluída: `isVendaExterna` generalizada (aceita
  `{contatos:{contact_source,tags}}`, não só `OppRow`), `useCloserProdutividade` passa a
  reconhecer `VENDA_DIRETA_CANAL`, 5 hardcodes `!isVendaExterna` removidos da `GeralTab`
  (Fechados aparece por default, filtro de Canal decide). Verificado manualmente no dev
  server: sem filtro 6 fechados/R$196.500; só Venda Direta 1/R$24.000; excluindo 5/R$172.500
  (consistente). tsc/eslint/vitest(126/126)/build verdes.
- `gh pr list` mostrou que só a PR #48 (filtro Venda Direta) seguia aberta — #41 a #47,
  citadas como pendentes no pedido do dono, já tinham sido mergeadas numa sessão anterior.
- PR #48 revisada (sem migrations/edge functions/RLS — só hooks de frontend + docs; grep de
  secrets limpo) e mergeada com `gh pr merge --merge --delete-branch` (fast-forward, sem
  conflito). `main` local sincronizado (`git pull --ff-only`).
- Validação completa em `main` pós-merge: `tsc --noEmit` limpo, `vitest run` 126/126, `vite
  build` ok. `eslint` acusa 1 erro pré-existente em `useMQLCohortComms.ts` (`react-hooks/
  set-state-in-effect`, de `f5a3e26`, anterior à branch) — confirmado que já existia antes do
  merge, não é regressão desta sessão; não corrigido (fora de escopo).

### Decisões
- Não rodei `supabase db push` nem toquei em produção do banco — fora do escopo autorizado
  desta sessão (decisão do dono).
- Não corrigi o lint pré-existente de `useMQLCohortComms.ts` por não ser regressão desta
  sessão nem bloquear build/testes; deixado registrado para quem pegar o próximo item de
  qualidade de código.

### Próximo passo deixado
- Deploy Vercel de produção já foi disparado automaticamente pelo merge do PR #48 em `main`
  (frontend). Nenhuma migration nova ficou pendente por essa PR.
- Itens operacionais do dono continuam abertos (ver `latest.md` §"Bloqueado no dono"):
  burn-in multi-tenant, rotação de `service_role key`, header de secret nos workflows GHL,
  eventos `missing_tenant`, aposentar secret global omnx-desk, regenerar `UML.html`.
- Débito técnico opcional: lint `react-hooks/set-state-in-effect` em `useMQLCohortComms.ts:88`.

## 2026-07-19 BRT (parte 6: merge da PR de handoff + validação final, SEM deploy de produção)

### Feito
- PR #49 (handoff pós-merge da parte 5) revisada (docs-only) e mergeada com `gh pr merge
  --merge --delete-branch`. `gh pr list --state open` → vazio. `git checkout main && git pull
  --ff-only` → `origin/main = c1880b7`, local sincronizado.
- Validação completa em `main`: `tsc --noEmit` limpo, `vitest run` 126/126, `vite build` ok.
  `eslint` com o mesmo 1 erro pré-existente já documentado (`useMQLCohortComms.ts:88`).
- **Achado importante:** `supabase migration list` (read-only, projeto de produção
  `qzesffnkqgelmtfblzkr`) mostrou **as 463 migrations locais válidas todas com Local=Remote**
  — nenhuma pendente, incluindo o cutover da chave GHL para o Vault (`20260809000000`) e a
  linha de migrations do webhook fail-closed (`20260710000000`→`20260725000000`). Isso
  contradiz a premissa de "30 migrations atrasada" passada no início da sessão. Registrado
  como discrepância a confirmar (não como fato assumido) em `latest.md` §3, com checklist
  para a próxima sessão validar antes de agir (PITR + reconferir `migration list` + spot-check
  de schema real).

### Decisões
- Não toquei em produção (nem `db push`, nem confirmação de PITR) — decisão explícita do dono
  de reservar o deploy de produção para uma sessão nova e dedicada.
- Reportei o achado do `migration list` honestamente em vez de aceitar a premissa "30
  atrasada" sem checar — a tabela de tracking não é 100% prova de schema real consistente
  (ver `docs/BASELINE-REPRODUCIBILIDADE.md`), então deixei isso explícito como algo a
  reconfirmar, não como conclusão fechada.

### Próximo passo deixado
- Sessão nova e dedicada ao deploy de produção: confirmar PITR no dashboard, reconferir
  `supabase migration list`, spot-check de schema real antes de assumir "tudo aplicado",
  depois seguir o plano de aplicação faseada descrito em `latest.md` §5.

## 2026-07-19 BRT (sessão intermediária — PR #50, superada pela sessão Meta Ads)

### Feito
- Confirmou `main` em `c1880b7` (PR #48/#49 mergeadas, nenhuma PR aberta no momento) e rodou validação completa: `tsc --noEmit` limpo, `vitest run` 126/126, `vite build` ok.
- Investigou discrepância entre a premissa "produção 30 migrations atrasada" e o resultado real de `supabase migration list` (read-only): todas as 463 migrations locais válidas apareceram com Local=Remote, nenhuma pendente — tratado como achado a reconfirmar, não como fato definitivo.
- Deixou checklist explícito para a próxima sessão (confirmar PITR visualmente, re-rodar `migration list`, checar schema real antes de confiar cegamente na tabela de tracking) antes de qualquer `db push`.

### Decisões
- Nenhuma ação em produção nesta sessão (nem `db push`, nem confirmação de PITR) — reservado propositalmente para sessão dedicada.
- Merge é decisão do dono — PR aberta como `docs/handoff-2026-07-19-parte6` (#50), sem merge imediato.

### Próximo passo deixado
- Ver checklist de produção (§ acima). Nota: esta sessão ficou **superada** pela sessão seguinte (Meta Ads, PR #51, já mergeada em `main` antes desta PR #50 ser processada) — o handoff "latest" válido é o da sessão Meta Ads, não este.

## 2026-07-20 BRT (Investimento Meta Ads por campanha — correção ponta a ponta)

### Feito
- **Frontend:** `useAquisicao` passou a filtrar o spend do Meta por campanha (campanhas normais por `campaign_name`; `[cp]` por `page_code` no `ad_name`, novo `campaignPageCodeMap`). Antes o filtro só afetava leads e o investimento somava todas as campanhas do período.
- **Dados:** curada corrupção de 30/06–06/07 em `meta_ads_insights` — 7 raws do cron 7-dias (sem `time_increment=1`, bug de código já resolvido em 65def51) gravaram somas de 7 dias em um dia só; backfill anterior não sobrescreveu (ad_ids disjuntos). Migration `20261007000000`: DELETE das 472 linhas envenenadas + quarentena dos 7 raws. Validado ads == `meta_ads_account_daily` em todos os dias 28/06→20/07.
- **Blindagem:** mesma migration recria `processar_meta_ads_raw` e `processar_meta_ads_raw_region_breakdown` com guarda `date_stop == date_start` (pula + conta + `RAISE WARNING` linhas agregadas) — vale para qualquer tenant.
- **Paginação:** desempate único `.order('ad_id')` adicionado em todas as queries paginadas de `meta_ads_insights` (useAquisicao, useTrafego ×2, usePreVendas ×2, useCreativeRankingData) e ordenação estável nas queries de opções (useTrafego, useCriativosFilters, que não tinham order by) — elimina perda/dup de linhas no corte de página (causava desvio de R$13,35 no caso reportado).
- **Relatórios semanais:** migration `20261007000001` enfileirou reprocessamento (cohort + produtividade) das semanas 29/06 e 06/07 na `weekly_reprocess_queue`.
- **Aplicação:** as 2 migrations foram aplicadas em produção via `supabase db push` (projeto linkado ao CLI nesta sessão). Verificado na UI (Playwright): filtro `[cp] maquina-conteudo-online-07-26` → Investimento **R$ 8.912,54 = Gerenciador Meta**. `tsc --noEmit` limpo.

### Decisões
- Nada commitado em git (aguardando validação do dono) — arquivos listados em `latest.md` §2.
- Debug temporário no hook foi removido; scripts de diagnóstico deletados.

### Próximo passo deixado
- Dono validar painel e autorizar commit (sugestão de mensagem em `latest.md` §2).
- Confirmar consumo da `weekly_reprocess_queue` (4 itens) e relatórios semanais corrigidos.
- Trocar senha da conta de testes (commitada em `eb-dash2/tests/*.spec.ts`) e mover para env.

## 2026-07-20 BRT (Vazamento de Investimento entre workspaces — fix frontend)

### Feito
- **Diagnóstico:** Investimento do workspace Default (R$ 38.490,93) aparecia no Painel Cohort com o workspace "Burn-in Interno" selecionado. Causa raiz: queries de `meta_ads_insights`/`meta_ads_account_daily` no frontend nunca filtravam `workspace_id` — dependiam só do RLS por membership (dono é membro dos 2 workspaces). Dados e sync confirmados corretos (Burn-in = 0 linhas de spend; 0 linhas legadas com workspace_id NULL).
- **Fix:** `.eq('workspace_id', wid)` adicionado em 13 queries nos hooks `useTrafego` (×5), `usePreVendas` (×4), `useAquisicao` (×2), `useCreativeRankingData` (×1), `useCriativosFilters` (×1).
- **Validação:** `tsc --noEmit` limpo; Playwright verde (Default segue mostrando R$ 38.517,65/30d; guarda de tenancy rejeita override sem membership). Prova UI do lado Burn-in pendente — conta de teste só é membro do Default.
- **Artefatos novos (não commitados):** `scripts/check-meta-ads-workspace-spend.mjs` (diagnóstico read-only via Management API), `eb-dash2/tests/fix-workspace-investimento.spec.ts`.

### Decisões
- Nada commitado (aguardando validação do dono); fix desta sessão + mudanças da sessão anterior tocam os mesmos 5 hooks → sugerido commit único (ver `latest.md` §2).

### Próximo passo deixado
- Dono (logado como ferramentas@, membro dos 2 workspaces) abrir o Burn-in e confirmar Investimento = R$ 0,00/"—"; depois autorizar commit único.
- Avaliar se `meta_ads_sync_log` (`useTrafego.ts:830`) também deve filtrar por workspace.

## 2026-07-21 BRT (Tela de vigilância do contrato de webhook + docs desatualizados)

### Feito
- Pergunta do dono: "a documentação/regra de webhook foi feita? Tem regra pra como os dados devem chegar? Isso está claro pro usuário?". Confirmado que a regra em si (`docs/CONTRATO-WEBHOOK-CRM.md`, `docs/CONFIG-OMNX-DESK-USUARIO.md`) já está completa e didática (nomes exatos de campo, exemplos válidos/inválidos, checklist, receita de onboarding no Anexo B).
- **Gap real corrigido:** `webhook_contract_mismatches` (tabela + RPC `count_contract_mismatches_pending`, migration `20261006000002`) gravava desvios de formato em produção desde 2026-07-19, mas nenhuma tela lia essa tabela. Criado `eb-dash2/src/hooks/useWebhookContractMismatches.ts` + banner `WebhookContractMismatchesBanner` em `WorkspaceGhlConfigPage.tsx` (Configuração → Integração CRM OMNX), com "reconhecer" por item e em lote. Mesmo padrão de `useGhlMappingAlerts.ts`.
- **Achado real #1:** `docs/GHL-MAPEAMENTO-VIGILANCIA.md` dizia "não aplicado em produção", mas verificação direta via API de Management (Supabase) mostrou que a migration `20260819000000` está aplicada, os crons `ghl-mapping-discovery-watch` (jobid 90) e `ghl-mapping-detect-changes` (jobid 91) rodam com sucesso todo dia desde pelo menos 2026-07-17, e o hook/banner do frontend (`useGhlMappingAlerts.ts`) já existiam e já estavam wireados — só a documentação estava errada. Corrigido (§6 novo no doc).
- **Achado real #2:** `docs/ROADMAP.md` dizia "PR aberto, aguardando merge" para o contrato de webhook — o PR #52 já tinha sido mergeado em 2026-07-19 (`gh pr list` confirmou `MERGED`). Corrigido.
- `docs/CONTRATO-WEBHOOK-CRM.md`, `CLAUDE.md` (índice) e `docs/MUDANCAS.md` atualizados.
- `npx tsc --noEmit` limpo. Sem browser disponível na sessão — a tela nova NÃO foi testada visualmente, só por leitura de código + typecheck.
- Branch `feat/webhook-contract-vigilancia-ui` criado a partir de `origin/main` (não misturado com o branch pendente `fix/clara-email-report-truncation`, tema diferente). PR [#58](https://github.com/Empire-Business/GHL-SUPABASE/pull/58) aberto, **sem merge**.
- **Follow-up do dono na mesma sessão:** "onde eu vejo, na tela, a documentação do webhook que falamos?". Resposta: em lugar nenhum ainda — construído `eb-dash2/src/lib/docs-markdown.ts` (renderizador de markdown próprio) + `eb-dash2/src/components/ghl-mapping/WebhookContractDocsTab.tsx` (importa `CONTRATO-WEBHOOK-CRM.md` e `CONFIG-OMNX-DESK-USUARIO.md` via `?raw` do Vite) + nova aba "Documentação" em Configuração → Integração CRM OMNX. **Testado ao vivo**: subi `npm run dev` local, autentiquei no workspace Default real via browser tool, naveguei até a tela, cliquei nas 2 sub-abas e conferi título/blockquote/tabela/código JSON/`<details>` renderizando corretamente. 3 commits ao todo nesta sessão.

### Decisões
- Não subiu a documentação junto no branch da Clara (PR #57) para não misturar temas — MUDANCAS.md tem uma nota explicando a separação.
- Não mexeu no diff residual de `.empire/state.json` (herdado, não relacionado).
- Links markdown internos (`[texto](outro-arquivo.md)`) dentro dos docs renderizados viram texto simples (não link clicável) — a tela só embute os 2 docs de webhook, um link pra outro `.md` do repo ficaria quebrado.

### Próximo passo deixado
- Dono decidir sobre o merge do PR #58 (código já não afeta produção sozinho — é só frontend + docs, precisa de deploy Vercel após merge na `main`, diferente do padrão "aplica direto" usado para banco/edge functions).
- Testar visualmente o **banner de mismatches** em produção (não testado — 0 linhas hoje, então nada aparece); a aba **Documentação** já foi validada ao vivo nesta sessão, não precisa reteste funcional, só conferir em produção após o merge.
- PR #57 (e-mail da Clara) segue aberto e sem relação com este trabalho — ver seção própria em `latest.md`.

## 2026-07-21 ~19:30 BRT

### Feito
- **UML 100% atualizado** (9 migrations de 17–20/07 que faltavam + novo fluxo de ingestão GHL) e regra "UML sempre atualizado" fixada em CLAUDE.md, AGENTS.md e skill omnx-code (gate 1.6c + templates).
- **Portal admin unificado:** `/admin/*` → `/workspace/*` (redirects), home nova com todos os atalhos, rotas `/workspace/access` e `/workspace/permissions`, menu Admin completo (7 itens), bug de highlight da sidebar corrigido, `/inscricoes` redireciona.
- **Assistente IA:** outcome estruturado (mapped/not_in_vocabulary/unclear) na edge + estado de escape na UI (campo fora do vocabulário → custom_extra/extra.*); fim das mensagens contraditórias; deploy da `ai-ghl-mapping`.
- **omnx-desk multi-tenant self-service:** migration `20261008000000` aplicada (save/revoke aceitam `omnx_desk` + digest SHA-256 no save); card em Integrações com "Gerar secret forte"; spec para o programador (`docs/OMNX-DESK-INTEGRACAO-SPEC-DEV.md`) também renderizada no dashboard.
- **Ingestão de webhooks restaurada:** causa raiz era `verify_jwt=true` default no gateway (função sem seção no config.toml) — não a extração. Seções `verify_jwt` documentadas para 6 funções + redeploy de `webhook-ghl`, `external-form-submissions`, `telegram-bot`.
- **Regressão da `extrair_dados_ghl_v2` revertida:** migration `20261009000000` (corpo 20260930 + custom_extra), diff revisado linha a linha, introspecção confirmando.
- **Auditoria de segurança (gate) com 2 P0 + 1 P1 corrigidos:** `webhook-compras` aberta em produção (deploy antigo sem auth — probe criou linha); `external-form-submissions` quase deixada pública por config errada (revertida) + IDOR pré-existente fechado com guarda de membership. `verdict.json` gate PASS.
- **Fix pré-existente:** `wid` indefinido em `usePreVendas.ts` quebrava o build.
- **PR #58 mergeado em `main`** às 19:16 UTC (`ae366ef`) com 6 commits novos organizados por frente.

### Decisões
- `external-form-submissions` fica com `verify_jwt=true` DE PROPÓSITO (API do frontend autenticado, não webhook de terceiro) — documentado no config.toml.
- `.empire/state.json` fora dos commits (mudança de ambiente, não de código).
- Linha vazia do probe em `maquina_de_conteudo` deixada para remoção via migration de limpeza (inócua).

### Próximo passo deixado
- Monitorar se o GHL reativa os webhooks sozinho em ~24h; se não, re-disparar os workflows no GHL (e o webhook do Telegram).
- Dono passa-a-vista no portal admin novo (`/workspace`) após o deploy Vercel.
- Cadastrar o 1º secret omnx-desk por conta em Integrações e enviar a spec ao programador do omnx-desk.
- Migration de limpeza da linha vazia do probe (`maquina_de_conteudo`, id 1f82f235-7fa7-4613-b994-d34737ef81af).
- PR #57 (e-mail da Clara) segue aberto, sem relação com este trabalho.

## 2026-07-21 ~22:30 BRT

### Feito
- **Reforma completa do fluxo de mapeamento GHL** (dono reportou "extremamente confuso, não consegui usar"). Auditoria via Playwright real (usuário `teste.playwright.audit@`, workspace Burn-in Interno) confirmou: **save de campos falhava 100%** — `GhlMappingWizard.handleSave` gerava 1 row por campo GHL com `logical_name` duplicado, e o upsert `onConflict: 'workspace_id, logical_name'` era rejeitado pelo Postgres; erro real engolido porque PostgrestError não é `instanceof Error`.
- Fix: agrupamento por logical_name (1 row, `variations` = todos os builtKeys) em `groupFieldMappingsByLogicalName` (`src/lib/ghl-mapping.ts`), aplicado no wizard E dentro de `saveFieldMappings` (defesa em profundidade); `extractErrorMessage` (`src/lib/errors.ts`) mostra erro real.
- UX: tela de conclusão persistente pós-save; campos obrigatórios explicados com orientação; matches de baixa confiança viram "Revisar sugestão" âmbar opt-in (não pré-preenchem); busca + filtro + "Aceitar sugestões exibidas (N)" no step 2; "Classificar todos os stages como…" por pipeline + busca no step 3; IDs técnicos atrás de "Ver código técnico"; categoria "Excluir" → "Ignorar (não importar dados)" (só rótulo, enum intacto); abas viram "Mapeamento guiado" (default) / "Campo a campo (IA)" / "Documentação"; botão de descoberta unificado; sidebar "Buscar campos novos no GHL" abre o wizard direto; banner de webhook mismatches colapsado (1 linha); toast de descoberta parcial sem tecnicismo; contadores com rótulos distintos ("campos do GHL ligados" vs "campos do sistema mapeados"); bug extra corrigido: botão "Usar sugestão" estava invisível por condição logicamente impossível.
- Reteste real em 2 rodadas: save com prova de persistência (63→65 campos), aceite em massa 177→0, classificação em massa de 10 stages, todos os 4 pontos da 2ª rodada PASS.
- Validação: `tsc -b` limpo, build limpo, **137/137 vitest** (novos: `groupFieldMappingsByLogicalName`, `extractErrorMessage`, `PipelineStageStep.test.tsx`).

### Decisões
- Match de média/baixa confiança NÃO pré-preenche (vai para revisão) — antes entrava como "Mapeado ✓" verde com matches absurdos.
- Aceite em massa respeita busca/filtro ativos (só linhas exibidas).
- `publicErrorMessage` (opaco de propósito) não alterado; `extractErrorMessage` criado à parte para fluxos admin.
- Workspace Burn-in Interno ficou com 177 sugestões automáticas salvas + stages de "[FN] EVENTO" como "Novo" (efeito do teste em massa; avaliar reset se precisar de dados limpos).

### Próximo passo deixado
- Gate de segurança + PR/merge para produção (branch `fix/ghl-mapping-ux-save`, commit local, sem push).
- Bug separado encontrado: `listUserWorkspaces` falha no console ("Failed to fetch") e o seletor de workspace não aparece para o usuário de teste — investigar.
- Considerar legenda/tooltip explicando diferença entre "campos do GHL ligados" (save da sessão vs. total acumulado).
- Spec Playwright `tests/ghl-mapping-wizard.spec.ts` referencia textos antigos das abas — atualizar na próxima rodada E2E.

## 2026-07-21 ~22:50 BRT

### Feito
- **Link "Abrir no GHL" do card do lead estava invisível (bug).** Dono reportou "clico nos cards e não aparece link". Causa raiz: o link existia no `LeadCard.tsx`, mas o helper `ghlContactUrl` dependia da env `VITE_GHL_LOCATION_ID` (build time), que não está configurada — o link era omitido em silêncio. `DiscagemTab` tinha o mesmo bug.
- Fix: `ghlContactUrlForLocation(locationId, ghlId)` (`src/lib/ghl.ts`) + hook `useGhlLocationId` (lê `ghl_integration_settings` do workspace). LeadCard ganhou botão com texto "Abrir no GHL".
- **Achado colateral:** coluna GHL da Lista de leads ficava ~30s com "—" porque o `ghlLocationId` do `useLeads` é refém de ~70 queries paginadas de filtro (Promise.all). ListaTab agora usa o hook rápido (~2s). Os scans full-table dos filtros são candidatos a otimização futura (view/RPC com DISTINCT).
- Unificado o formato da URL (`/v2/location/`) — ListaTab e InscricoesPage montavam inline com `/v2/location-menu/` divergente.
- Verificado no browser (3 rodadas Playwright): botão no card com href real, 342 links na Discagem, coluna da lista em ~2s. 139/139 vitest, tsc/build limpos. Commit `36a937d` na branch `fix/ghl-mapping-ux-save`.

### Próximo passo deixado
- Gate de segurança + PR/merge da branch (agora com 2 commits) para produção.
- Otimização dos filtros do useLeads (scans de ~12k oportunidades + ~10k contatos a cada visita) — latência de ~30s nos dropdowns de filtro persiste.

## 2026-07-21 ~23:00 BRT

### Feito
- **Link do contato migrado para o white label:** dono corrigiu — o link é "Abrir no CRM" e o domínio é `crm.omnx.pro`, nunca `app.gohighlevel.com`. Domínio base configurável via `VITE_CRM_APP_BASE_URL` (default `https://crm.omnx.pro`) em `src/lib/ghl.ts`; helper legado `ghlContactUrl` (env-based) removido; rótulos "Abrir no GHL"→"Abrir no CRM" e coluna da lista "GHL"→"CRM"; teste trava regressão (nunca conter gohighlevel.com). Verificado no browser: 50/50 links na lista com crm.omnx.pro, 0 gohighlevel; card com botão "Abrir no CRM". 140/140 vitest. Commit `7da22dc`.

## 2026-07-21 ~23:15 BRT

### Feito
- **MERGE EM MAIN + DEPLOY EM PRODUÇÃO.** Gate de segurança (delta da branch, formato dos gates anteriores): `security-report/audit-2026-07-21-ghl-mapping-ux-gate.md` + `verdict.json` com **gate PASS** (0 P0/P1/P2 abertos, 0 não verificados; diff 100% frontend, sem nova superfície de dados — a query do `useGhlLocationId` é idêntica à já existente em `useLeads.ts:623`; sem segredos, XSS ou injeção no diff). Merge fast-forward `8239136..34b24b7` + `git push origin main`. **Vercel confirmado `Ready`** (`ghl-supabase-nxajeuprr`, servindo ceo.omnx.pro).
- Em produção agora: reforma do mapeamento GHL (save corrigido + UX nova), link "Abrir no CRM" no card do lead / Discagem / coluna CRM da lista, domínio white label `crm.omnx.pro` em todos os links de contato.

### Próximo passo deixado
- Dono passa-a-vista em produção: mapeamento guiado (Configuração → Integração CRM OMNX) e "Abrir no CRM" no card de um lead.
- Pendências já registradas: bug `listUserWorkspaces` (seletor de workspace invisível), otimização dos scans de filtro do useLeads (~30s), spec Playwright das abas antigas, reset opcional dos mapeamentos de teste no Burn-in Interno.

## 2026-07-23 — Hardening do gate de push

- Auditoria pré-push identificou que a nova função `weekly_reports_current_week_cohort_job()` era `SECURITY DEFINER` sem revogação explícita de `PUBLIC`; criada e aplicada a migration corretiva `20261009000004` para restringi-la a `service_role` e fixar o `search_path`. Re-teste remoto: `anon=false`, `authenticated=false`, `service_role=true`, `search_path=pg_catalog`.
- `npm audit` identificou `brace-expansion@1.1.13` vulnerável, transitiva de `eslint → minimatch`; o projeto passa a travar a versão corrigida `1.1.16` por override, com lockfile e testes a serem revalidados antes do push.
