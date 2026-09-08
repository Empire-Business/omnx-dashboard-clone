# ROADMAP - Empire Business Dashboard

## Status Atual: Em Desenvolvimento

### Sprint Atual: Implementação Base do Dashboard

---

## 📌 FILA DE TRABALHO ATUAL — abrir primeiro

**[`docs/handoffs/FILA-TRABALHO-2026-08-05.md`](handoffs/FILA-TRABALHO-2026-08-05.md)** é o
ponto de partida ao retomar o projeto: o que foi para produção em 05/08, as armadilhas de
performance já mapeadas, a fila de tarefas em aberto e as pendências herdadas.

---

## ✅ CONCLUÍDO — App Criativos: reunião de 2026-08-28 (entregue em 2026-09-01)

Todo o backlog de código da reunião com o time de criativos foi fechado.
Ata: [`docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`](reunioes/REUNIAO-CRIATIVOS-2026-08-28.md).

**23 itens de código entregues:**

| Bloco | Itens |
|---|---|
| Bloqueadores | BUG-01 (fila de Testes), BUG-02 (o "1000"), UX-01 (funil que não fechava) |
| Efeito colateral | BUG-03 (nativos no Kanban) — caiu junto com o BUG-02, mesma raiz |
| Formulário | MEL-01 a MEL-08, MEL-14, MEL-19 |
| Biblioteca | BUG-04, MEL-15 a MEL-18, MEL-20, MEL-21 |
| Dashboard/Kanban | BUG-05, BUG-06 |

**Achado principal:** o "sync do Notion travado em 1.000 registros" não era o
Notion. A function pagina certo; o que truncava era a **leitura** no frontend
(teto `max_rows` do PostgREST), e o botão Sincronizar estava quebrado desde o
hardening multi-tenant por um motivo independente (401 + falta de `workspace_id`).

### 🔴 AÇÃO OBRIGATÓRIA DO DONO — sync do Notion morto desde 13/07

Medido em produção em 2026-09-01: **a última sincronização com o Notion rodou em
13/07/2026 21:00 UTC.** ~50 dias parada.

**Causa:** no cutover multi-tenant de 14–15/07, `notion-creatives-sync` passou a exigir
credencial Notion por workspace (fail-closed) e o cron passou a iterar sobre quem tem
`provider = 'notion'`. Essa credencial nunca foi cadastrada — o cron virou **no-op
silencioso**, sem erro e sem linha em `notion_sync_runs`.

**Efeito:** ~79 criativos pagos (`CR-1178` a `CR-1256`) e os orgânicos do período não
estão no banco. Banco tem 3.123 criativos; maior código é `CR-1177`.

**O que fazer:** cadastrar a credencial Notion do workspace `Default` (token da
integração + `notion_database_id_paid` / `notion_database_id_organic` no metadata),
seguindo [`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`](FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md).
Sem isso o cron segue morto e o botão "Sincronizar" não tem o que sincronizar.

### Migrations — status

| Migration | O que faz | Status |
|---|---|---|
| `20261023000000` | Coluna `ad_caption` ("Legenda do anúncio") | ✅ **aplicada em produção em 2026-09-01** (guard temporário do frontend removido) |
| `20261022000000` | RPC `enqueue_notion_creatives_sync` | ⏳ **pendente** — o botão "Sincronizar" continua dando erro até aplicar. A leitura correta já funciona sem ela. |

### Decisões de negócio ainda pendentes (não são código)

Q1 (manter o Notion para a Empire?), Q2 (mapa de status Notion → plataforma),
Q3 (como o time de tráfego entra no fluxo) e Q4 (adoção real). A Q2 tem proposta
escrita em [`docs/CRIATIVOS-STATUS-NOTION-MAPA.md`](CRIATIVOS-STATUS-NOTION-MAPA.md)
— **nada aplicado**, e ela depende da Q1.

---

## ✅ CONCLUÍDO — Backfill das conversas GHL (2026-08-04 → 2026-08-05 01:59 BRT)

**Terminou em 05/08 às 01:59** — 11.765/11.775 contatos, `backfill_conversas_controle.ativo = false`.
O cron temporário `backfill-conversas-temp` foi **desagendado em 05/08**; ele seguia disparando
576×/dia sobre trabalho já concluído. Registro histórico da execução abaixo.

### Histórico da execução (2026-08-04 ~20h BRT)

O sync de mensagens ficou **21 dias parado** (14/07 a 04/08) por 401 nas edge functions. Já corrigido e rodando; o backfill do buraco está **em execução automática** via cron temporário `backfill-conversas-temp`.

**Situação no fim da sessão de 04/08:** 28% (3.335/11.760 contatos), 0 falhas, mensagens no período recuperadas de 1.974 → 19.104. Conclusão estimada por volta de **01h30 BRT**.

**Nota sobre a capacidade real de cada lote** (medida, não estimada): o lote foi aumentado de 75 para 250 às 21:55 na hipótese de que as janelas de 90s estavam ociosas — os lotes de 75 sempre completavam. Errado: eles completavam porque 75 cabia, não porque sobrava muito. Com 250, os lotes passaram a ser **truncados pelo prazo em ~96–108 contatos**, que é a capacidade real de 90s (cada contato custa ~6–7 chamadas à API do GHL, a ~7,7 req/s).

Ou seja, o ganho foi de **+33%** (75 → ~100 por ciclo), não os 3x que eu havia projetado. Manter `batch_size = 250` é o certo mesmo assim: ele se autolimita e usa a janela inteira, e o truncamento é seguro — o `next_offset` reflete o que foi de fato processado (verificado: 3131 → 3227 → 3335).

Acelerar mais exigiria disparos paralelos, o que estouraria o teto de 100 req/10s **compartilhado** com o sync incremental e os demais — não vale rodar desassistido.

### ⚠️ Ação obrigatória quando terminar

```sql
SELECT offset_atual, total_contatos, ativo FROM backfill_conversas_controle;
-- quando ativo = false:
SELECT cron.unschedule('backfill-conversas-temp');
```

Sem isso o cron acorda 24x por hora chamando uma função que retorna no-op. Não causa dano, mas polui. Depois, opcionalmente, dropar `backfill_conversas_tick()`, `backfill_conversas_log` e `backfill_conversas_controle` (o log vale guardar alguns dias — é a única evidência de quais faixas foram visitadas).

**Freio de emergência:** `UPDATE backfill_conversas_controle SET ativo = false WHERE id = 'default-2026-08-04';`

**Verificação de conclusão** e critérios de parada: passos 6 e 7 de [`scripts/sql/backfill-conversas-2026-08-04.sql`](../scripts/sql/backfill-conversas-2026-08-04.sql). Referência de volume: o buraco deve sair de 1.974 para dezenas de milhares — se parar abaixo de ~5.000, investigar antes de encerrar.

---

## 🔴 PENDÊNCIAS ABERTAS (2026-08-04) — nenhuma bloqueia operação, todas valem investigar

1. **Algo está apagando `contatos.telefone` em produção**, alguns por minuto. Descoberto na verificação do discador: contatos com telefone vazio cujo `updated_at` é posterior ao recálculo da fila. A fila de discagem se protege (o ciclo seguinte os remove), mas a causa ficou em aberto. **Suspeita:** mesma classe do bug de UTM apagada por webhook vazio (2026-08-03) — webhook parcial sobrescrevendo campo que não carrega. A consulta de confirmação estourou o tempo limite; refazer com amostra menor.

2. **A chave do Vault (`get_secret('service_role_key')`) diverge da env `SUPABASE_SERVICE_ROLE_KEY`** do runtime das edge functions. Hoje não quebra nada porque o guard v1.2 valida pela claim `role` do JWT — mas **qualquer deploy que reintroduza o guard v1.0 derruba as functions em silêncio**, que foi exatamente o que causou os 21 dias de parada. Alinhar as duas, ou remover o fallback por env var do guard.

3. **Workspace `Burn-in Interno`** tem credencial `ghl` ativa apontando para uma location real (`NvZEu0cXxxDxFslZG71F`) com conversa viva, e **zero contatos locais**. Sincronizou 9 mensagens reais no primeiro ciclo. Decidir de quem é essa conta — se for engano, remover a credencial.

4. **Migration `vendas_fechamento_contrato_status` existe no banco mas não tem arquivo** em `supabase/migrations/`. Coluna em produção sem versionamento: um setup do zero não a reproduz. (Não é do trabalho de chat/discador — é da sessão paralela do card "Sem contrato assinado".)

---

## ✅ Tenant de demonstração com 100% de dados fictícios (2026-07-29)

Pedido do dono: um tenant do dashboard só para demonstrar o produto na prática. Entregue o workspace `Acme Educação (Demo)` dentro da instância de produção, com 12 meses de operação fictícia coerente ponta a ponta: 8.200 contatos, 8.767 oportunidades em 12 pipelines, 80 vendas (R$ 1,03 mi, ROAS ~2,1, CPMQL R$ 235,87), 46.877 comunicações, 683 reuniões, 24 criativos com ranking real, 7 disparos, metas e 102 snapshots semanais. Login `demo@omnx.app`.

Isolamento validado nos dois sentidos por simulação de JWT (o usuário de demo não vê nenhuma linha do cliente real) e **zero chamadas à API do GHL do cliente** geradas pelo seed — três triggers que dispariam job na fila compartilhada foram identificados e neutralizados. Seed versionado e idempotente em `scripts/sql/seed-demo/`, com teardown protegido por confirmação de nome.

**Pendente:** trocar a senha do usuário de demonstração antes de enviar o link para qualquer prospect (hoje ela está em texto puro no doc e no seed). Detalhe completo em [`docs/TENANT-DEMONSTRACAO.md`](TENANT-DEMONSTRACAO.md).

## ✅ Pré-Vendas — aba "Visão Geral" (resumo sem R$) + Instagram/conectado em produção (2026-07-24)

Pedido do dono (vídeo transcrito): resumo operacional em Pré-Vendas igual ao Funil de Conversão, porém **sem valores** (Leads, MQLs, Não-MQLs, Agendados, Não-agendados, Reuniões realizadas, No-shows, Conectados, Não-conectados) e, ao abrir o lead na lista, ver SDR + @ Instagram. Entregue: nova aba `VisaoGeralTab` (chave `pre_vendas.geral`) sem nada monetário, tudo clicável para o `LeadListModal` (colunas Pré-vendedor + Instagram). As 2 migrations da manhã foram **aplicadas em produção**: `marcar_conectado_ao_perder` (backfill de 1.556 perdidos) e `capturar_instagram_do_webhook` (backfill de 7.594/11.486 contatos com @). Validado ao vivo no navegador. Detalhe em [`docs/MUDANCAS.md`](MUDANCAS.md).

## 🔎 Filtro "só MQL" diagnosticado + Closer/Pré-vendedor em todas as abas (PR aberto, 2026-07-19)

Diagnóstico solicitado pelo dono sobre o filtro "só MQL" (lógica correta; 3 achados reais de UX/inconsistência corrigidos) + filtros de Closer e Pré-vendedor adicionados em Tráfego, Aquisição, Orgânico, Ranking de Criativos e Leads (já existiam em Pré-Vendas/Vendas/Recuperação), com opção "Sem atribuição" para as ~98,6% das oportunidades sem closer no GHL. Detalhe completo em [`docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md`](FILTROS-MQL-CLOSER-PREVENDEDOR.md). Branch `fix/dashboard-mql-filter-closer-presales-filters`, PR aberto — **sem merge**, pendente de revisão do dono e de smoke-test manual em Aquisição/Orgânico/Ranking de Criativos/Leads (só Tráfego foi clicado ao vivo contra produção nesta sessão).

## ✅ Contrato de Webhook CRM OMNX — mergeado e em produção (PR #52, 2026-07-19)

Tarefa 2 do backlog concluída: inversão do mapeamento de campos (reativo → contrato fixo).
Entregue em `docs/CONTRATO-WEBHOOK-CRM.md` (lista canônica de campos por tabela), campo de escape
automático `oportunidades.custom_extra` (migration `20261006000001`), validação de formato no
ingest + vigilância `webhook_contract_mismatches` (migration `20261006000002`), 16 testes unitários
+ 17 testes funcionais com escrita real em projeto Supabase efêmero (criado e deletado). **PR #52
mergeado em 2026-07-19** — achado da sessão de 2026-07-21: este documento ainda dizia "PR aberto",
mas o merge já tinha acontecido; corrigido. Desde 2026-07-21, a vigilância `webhook_contract_mismatches`
tem tela de fato (banner em Configuração → Integração CRM OMNX), fechando o gap que existia entre
"a tabela grava o desvio" e "alguém no time do cliente consegue ver o desvio sem abrir o banco".
Detalhe completo em [`docs/MUDANCAS.md`](MUDANCAS.md) e [`docs/CONTRATO-WEBHOOK-CRM.md`](CONTRATO-WEBHOOK-CRM.md).

---

## ✅ Hardening multi-tenant P0/round 2 — aplicado em PRODUÇÃO (2026-07-19)

As 2 migrations de correção de isolamento cross-tenant (`20261004000000_fix_cross_tenant_rls_p0_round2.sql`,
`20261004000002_fix_clara_dashboard_rpc_cross_tenant_p0.sql`), escritas e testadas na validação
adversarial de 2026-07-18/19, foram **aplicadas em produção** (`qzesffnkqgelmtfblzkr`) mediante
autorização explícita do dono. PITR reconfirmado ativo antes da escrita (ponto de recuperação:
`2026-07-19T03:36:19Z`). Fecham: 12 políticas RLS permissivas em 4 tabelas centrais + 2 tabelas
Meta Ads sem `workspace_id` + 2 tabelas sistêmicas com função `is_*_any()`; 6 RPCs `SECURITY DEFINER`
sem guard de posse (incluindo 1 DELETE cross-tenant confirmado ao vivo); 5 views sem
`security_invoker`. Verificado pós-aplicação por introspecção (sem ataque destrutivo real) e
ingestão do cliente real confirmada intacta (zero órfãos, webhooks processando). **Gate do 2º
tenant pago liberado** quanto a este hardening. Detalhe completo em
[`docs/VALIDACAO-MULTITENANT.md`](VALIDACAO-MULTITENANT.md) (seção "Aplicação em Produção
(2026-07-19)") e [`docs/MUDANCAS.md`](MUDANCAS.md).

**Risco residual aceito e documentado (não bloqueia o 2º tenant):** funções-oráculo
`get_contact_workspace_id`/`get_opportunity_workspace_id`/família `get_user_*_workspace_ids`
(vazamento de metadado, usadas em 30+ policies — correção requer desenho dedicado).

O item "hardening pendente de `REVOKE` na família `analisar_*`" citado aqui **foi auditado E corrigido**
— ver seção abaixo. **Gate do 2º tenant também liberado quanto a este item.**

---

## 🔎 Varredura sistemática cross-tenant — branch aberta, PR sem merge (2026-07-19)

Varredura exaustiva de **todas as 161 funções `SECURITY DEFINER` + 13 views** de produção (mesma
classe de bug que já apareceu 3x: RPCs CRM round2, RPCs Meta PR #51, funções de criativo PR #53).
**37 funções + 1 view eram vazamento real** — corrigidas numa única migration consolidada
(`20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql`), incluindo o **achado mais grave**:
o próprio fix do round2 (`20261004000002`) usou `auth.uid() IS NULL OR ...` para deixar `service_role`
passar, mas isso também deixava passar qualquer chamada com a **anon key pública sem login** — 6
funções afetadas (`get_lead_full`, `get_opp_id_by_email`, `buscar_lead_para_venda`,
`list_weekly_email_schedules`, `auditoria_sdr_ia`, `delete_weekly_email_schedule`), corrigido trocando
por `auth.role() = 'service_role'`. Também incorpora e estende o fix de `get_creative_metrics` da PR #53
para `get_campaign_creatives`/`get_campaign_summary`/`get_objectives` (mesmo bug de CTE sem filtro de
workspace). A família `get_user_*_workspace_ids`/`get_user_auth_events`, antes listada como "risco
residual aceito" (linha 24 acima), **foi fechada** (0 callers reais, `EXECUTE` revogado) —
`get_contact_workspace_id`/`get_opportunity_workspace_id` continuam como risco aceito (usadas em 30+
RLS policies, correção requer desenho dedicado). Validado com escrita real em projeto Supabase efêmero
(2 tenants sintéticos com colisão proposital de código de criativo `CR-1`). Detalhe completo em
[`docs/VARREDURA-CROSS-TENANT-COMPLETA.md`](VARREDURA-CROSS-TENANT-COMPLETA.md).

**Status:** branch `fix/cross-tenant-security-definer-sweep`, PR aberto **sem merge** — aguarda
autorização explícita do dono antes de `supabase db push` em produção (regra 20b: mudança em RPC
sensível de tabela com tráfego real).

---

## ✅ Validação e correção Meta Ads: P0 na família `analisar_*` — aplicado em PRODUÇÃO (2026-07-19)

Auditoria adversarial dedicada à integração Meta Ads (`docs/VALIDACAO-META-MULTITENANT.md`), via
introspecção read-only de produção. Tabelas `meta_ads_*` (RLS, triggers, sync, credenciais) já
estavam bem isoladas — mas **3 RPCs de análise nunca receberam filtro de workspace** ao serem
escritas antes da retrofit multi-tenant:

- **P0 confirmado ao vivo:** `analisar_meta_crm_cruzado` — `SECURITY DEFINER`, `EXECUTE` concedido a
  `anon` **e** `authenticated`. Vazava Meta Ads + CRM de todos os workspaces via REST sem login.
- **P1 (estava bloqueado só por gate de aplicação, não pelo banco):** `analisar_meta_ads_por_regiao`.
- **P2 (dormente):** `analisar_meta_ads` — mesmo padrão, sem caller ativo.

**Correção aplicada em produção em 2026-07-19** via deploy coordenado (PR
[#51](https://github.com/Empire-Business/GHL-SUPABASE/pull/51) → merge → deploy Vercel confirmado
ao vivo → migration `20261004000003` aplicada imediatamente depois, com PITR reconfirmado ativo
antes da escrita). As 3 RPCs agora exigem `p_workspace_id` + `is_workspace_member()` fail-closed;
`anon` recebe `permission denied` ao tentar chamar qualquer uma delas (confirmado ao vivo, não só
por leitura de policy). Teste funcional real (JWT simulado de um admin do workspace `Default`)
confirmou dado real retornado para o próprio workspace e 0 linhas para o outro workspace. Ingestão
Meta Ads e mapeamento conta↔workspace confirmados intactos pós-aplicação. Detalhe completo,
evidência e decisão de sequenciamento (por que não se usou overload retrocompatível) em
[`docs/VALIDACAO-META-MULTITENANT.md`](VALIDACAO-META-MULTITENANT.md) (seção "Aplicação em
Produção (2026-07-19)"). **Gate do 2º tenant pago liberado quanto a este hardening.**

---

## Filtro "Venda Direta" — pronto para revisão/merge (2026-07-18)

Branch `feat/filtro-venda-direta`: "Venda Direta" (`isVendaExterna`) agora é uma opção
no filtro de Origem/Canal (default = aparece, conta como lead e venda) em Aquisição,
Pré-Vendas e Vendas (cohort + produtividade). A reestruturação de Vendas→Produtividade
que faltava (3ª fonte de KPIs `useCloserProdutividade` + 5 hardcodes `!isVendaExterna`
na `GeralTab`) foi concluída e verificada manualmente (1 fechado/R$24k só-venda-direta +
5 fechados/R$172,5k excluindo = 6 fechados/R$196,5k sem filtro). Detalhe em
[`docs/MUDANCAS.md`](MUDANCAS.md) (2026-07-18, "Filtro Venda Direta completo"). Falta
apenas a decisão do dono de mergear a branch.

---

## 🏢 Multi-Tenant Agency + Sub-contas — status resumido

> Este é o **hub único** para o status do multi-tenant. O log de execução técnico completo (datas, commits, evidência de SQL, fase a fase) vive em [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — abra aquele arquivo só quando precisar do detalhe granular; este resumo aqui é o que basta no dia a dia.

**Status (2026-07-14 BRT):** infraestrutura 100% em produção — 34 migrations + 20 Edge Functions aplicadas. O dono já testou o passo 3 do burn-in de verdade (conectou uma chave GHL real via UI) e achou 2 problemas reais: "Descoberta parcial" (causa: 404 normal do GHL em 2 endpoints mal classificado como erro) e UX confusa no mapeamento. A descoberta parcial e o primeiro ajuste visual já foram publicados. O assistente IA também foi publicado: detecta os campos primeiro e classifica um campo por vez, após explicação do usuário; o backend rejeita sugestões fora do campo selecionado. A verificação pós-deploy confirmou a função ativa e protegida por JWT (HTTP 401 sem token). **Próximo passo:** retestar o fluxo com uma conta GHL real; depois seguir o checklist do runbook + observar 1 ciclo de cron antes de liberar o primeiro cliente pagante adicional. Ver [`docs/ROADMAP-MULTI-TENANT.md#7-handoff-completo`](ROADMAP-MULTI-TENANT.md) seção 7.7 para o passo a passo exato.

Plano-mãe: [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md).

---

### 2026-07-13 — Ensaio final de adoção multi-tenant no staging
- [x] A cópia isolada `2-staging` executou a adoção reversível com dados sintéticos: confirmação errada recusada, vínculo idempotente e detach sem apagar workspace ou membro.
- [x] O inventário de dados antes/depois permaneceu igual e uma credencial GHL sintética foi preservada; nada real nem segredo foi registrado.
- [x] Isolamento de credenciais e prevenção de escalada de privilégio também passaram: **47/47** testes críticos no staging.
- [ ] Produção continua sem alterações. Antes da janela de produção, ainda falta registrar o rollback operacional das migrations, revisar o aviso de collation do staging e obter autorização explícita do dono.

---

## ⚠️ Pendências Operacionais (bloqueadas no dono — não são bug de código)

### E-mail de relatório semanal — chave do Resend inválida em produção
**Status:** ✅ Resolvido (2026-07-15). Nova chave Resend configurada nos secrets do Supabase. Envio testado com sucesso.

### Fallback "workspace mais antigo" — deploy fail-closed concluído
**Status:** ✅ Resolvido (2026-07-16). Deploy do `webhook-ghl` fail-closed por
workspace realizado em produção (migrations + redeploy das edge functions).
Pós-verificação (~50 min de tráfego real): 12 webhooks processados, **0
rejeitados** em `webhook_unresolved`, 4 oportunidades novas, fila `ghl_api_jobs`
normal. Detalhes em "✅ Concluído → 2026-07-16" abaixo e em
[`docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`](SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md).

---

## 📋 Próximas features (planejadas)

### 🧾 Vendas omnx-desk (ex-EmpireDesk): visibilidade, robustez, multi-tenant e rename
**Status:** ✅ **Entregue em 2026-07-18** (branch `feat/omnx-desk-vendas`, gate segurança PASS `security-report/audit-2026-07-18-omnx.md`). Rename compatível (3 edge functions aceitam os 2 headers + `origem='omnx_desk'` + migration de dados), robustez da ponte (COALESCE server-side + 422), isolamento multi-tenant (provider `omnx_desk` + RPC de roteamento por digest + 403 cross-tenant + `workspace_id` explícito), paginação `.range()`. **Decisões do dono:** manter filtros/painéis como estão (o filtro Recuperação já cobre a visibilidade — sem painel de faturamento total, sem reescrever Cohort×Produtividade); sem lacuna de ingestão pós-07/jul. Bug "0 vendas" já corrigido na sessão anterior. Ver checklist §8 em `docs/INTEGRACAO-OMNX-DESK-VENDAS.md`.
**Docs:** [`docs/INTEGRACAO-OMNX-DESK-VENDAS.md`](INTEGRACAO-OMNX-DESK-VENDAS.md) (plano técnico) · [`docs/CONFIG-OMNX-DESK-USUARIO.md`](CONFIG-OMNX-DESK-USUARIO.md) (config + formato de dados p/ usuário)

**Contexto:** o produto que envia vendas mudou de nome **EmpireDesk → omnx-desk**. O dono
reportou "vendas do omnx-desk que não aparecem no dashboard". Diagnóstico via Management
API (SELECT-only) em produção esclareceu o quadro.

**Diagnóstico real (2026-07-18):**
- **16 vendas** `origem='empiredesk'`, **todas corretas** no banco (data de pagamento,
  workspace, pagamentos OK). **Nenhuma venda perdida** — o código de gravação funciona.
- **8 das 16 (~R$ 101k de entrada) ficam invisíveis nos painéis de Tráfego/Produção**: 7
  por lead orgânico/importado (`utm_source` não-pago), 2 por pipeline Recuperação. São
  vendas reais escondidas por filtros de marketing (por design, mas indevido p/ faturamento).
- **Bug confirmado:** Aquisição → Produtividade mostra **0 vendas em 30 dias**, quando há 3
  vendas válidas de tráfego pago no período (R$ 41k). Suspeito nº 1: `catch {}` silencioso
  em `AquisicaoPage.tsx:299` engolindo erro de carga. **Exige reprodução ao vivo.**
- **2 workspaces** existem; todas as vendas omnx-desk estão só no `Default`.
- **Nenhuma venda omnx-desk desde 2026-07-07** — confirmar com o dono se houve registro
  posterior que não chegou (seria incidente de ingestão, não de exibição).

**O que fazer (detalhe em `INTEGRACAO-OMNX-DESK-VENDAS.md`):**
- [ ] **Rename EmpireDesk → omnx-desk** (9 arquivos, 39 ocorrências) de forma compatível:
  aceitar os 2 secrets/headers, gravar `origem='omnx_desk'`, migrar as 16 linhas antigas,
  atualizar labels no frontend. **Nenhuma tabela/coluna renomeada.**
- [ ] **Robustez da ponte** `crm-registrar-venda`: COALESCE no upsert (não sobrescrever
  data boa com null) + rejeitar (422) payload sem entrada com `data`.
- [ ] **Corrigir bug Produtividade** (remover catch silencioso, reproduzir, corrigir causa).
- [ ] **Regra Cohort×Produtividade:** vendas por `data_pagamento_entrada`, não pela data do lead.
- [ ] **Painel de faturamento total** exibindo orgânicas + Recuperação (⬇ decisão do dono).
- [ ] **Paginação `.range()`** nas queries de receita faltantes (cap de 1000 latente).
- [ ] **Multi-tenant (preparação):** provider `omnx_desk` em `workspace_integration_credentials`
  (Vault), roteamento por secret (não por payload), `workspace_id` explícito, teste de
  isolamento cross-tenant. Urgência: preparação (hoje 1 conta; ativar no 2º tenant).
- [ ] **Correção retroativa:** só migration de `origem` + a visibilidade volta pela lógica
  (dados já estão corretos — não há backfill financeiro).

**⬇ Decisão do dono pendente — como exibir vendas orgânicas/Recuperação no faturamento:**
1. **(Recomendado)** Tráfego continua só tráfego pago (ROAS correto) + página de
   Vendas/Faturamento mostra **todas** as vendas confirmadas (orgânicas + Recuperação).
2. Faturamento total em todo lugar (Tráfego passa a misturar orgânico — ROAS menos preciso).
3. Manter como está (só corrigir multi-tenant + rename + bug de Produtividade).

### Isolamento de investimento Meta Ads por subconta
**Status:** ✅ **Concluído em produção em 2026-07-16.**

**Problema encontrado:** 94% das linhas de `meta_ads_insights` estavam com
`workspace_id IS NULL`, fazendo o spend Meta aparecer como zero nas semanas
anteriores. Isso distorcia CPMQL, ROAS e benchmarks da Clara (CPMQL médio
histórico havia caído para R$ 3,79; após correção voltou para R$ 82,39).

**Correções aplicadas (teste + produção):**
- Backfill emergencial via migration `20260716000002_backfill_meta_ads_workspace_id.sql`.
- Migrations arquiteturais:
  - `20260924000000_fix_meta_ads_tenant_isolation.sql`
  - `20260924000001_add_meta_ads_account_workspace_trigger.sql`
  - `20260924000002_fix_meta_ads_raw_trigger_account.sql`
  - `20260924000003_meta_ads_backfill_null_account_fallback.sql`
- Criação da tabela `workspace_meta_ad_accounts` com mapeamento formal
  conta ↔ workspace e seed da conta Default (`act_716772443330289`).
- Constraints `UNIQUE` com `workspace_id` em `meta_ads_insights`,
  `meta_ads_insights_breakdowns` e `meta_ads_campaigns`.
- `NOT NULL` em `workspace_id` em `meta_ads_insights`,
  `meta_ads_insights_breakdowns`, `meta_ads_raw_insights`,
  `meta_ads_account_daily` e `meta_ads_campaigns`.
- Policies RLS fail-closed (removido `OR workspace_id IS NULL`).
- Edge functions `sync-meta-ads` e `sync-meta-ads-backfill` validam a conta
  contra `workspace_meta_ad_accounts` antes de sincronizar (deploy v37/v31 em
  produção).
- Triggers `BEFORE INSERT OR UPDATE` reforçam o vínculo conta ↔ workspace no
  próprio banco.
- Teste A→B novo: `__tests__/integration/meta-ads-isolation.test.ts` (8 testes).
- Suite de integração completa: **536 passed**.
- Teste Playwright E2E novo: `eb-dash2/tests/meta-ads-isolamento.spec.ts`
  (usuário `teste.playwright.audit@aliancadealtovalor.com.br`) — valida que o
  dashboard `/trafego` exibe investimento Meta Ads > R$ 0 no período padrão 30d.

**Auditoria em produção (2026-07-16):**
- 0 linhas com `workspace_id IS NULL` em `meta_ads_raw_insights`,
  `meta_ads_insights_breakdowns`, `meta_ads_account_daily` e
  `meta_ads_campaigns`.
- 0 duplicatas que quebrariam as novas constraints `UNIQUE`.
- 0 `account_id` órfão em `meta_ads_insights`.
- Benchmark `get_clara_benchmarks` retornou `cpmql_avg: R$ 82,39` e
  `spend_avg: R$ 9.417,63`.
- Dashboard de tráfego: investimento de R$ 37.184,51 nos últimos 30 dias.
- Email de teste da Clara enviado com sucesso
  (`message_id: 6d7c9e01-bd7b-4575-ad8b-1a39f0f6af6b`) para
  `bruno@aliancadealtovalor.com.br` via `clara-research-report` — relatório
  autônomo com análise cruzada de investimento, MQLs, CPMQL, campanhas e
  criativos.

**Referências:**
- [`docs/META-ADS-ISOLAMENTO-AUDITORIA.md`](META-ADS-ISOLAMENTO-AUDITORIA.md)
- [`docs/META-ADS-ISOLAMENTO-PRODUCAO.md`](META-ADS-ISOLAMENTO-PRODUCAO.md) (runbook de aplicação)

### Aba Lista de Leads (`/leads?tab=lista`) — paridade com Inscrições
**Status:** ✅ **Concluído em 2026-07-17** (commit `ac1a64c`, ver entrada do dia em "✅ Concluído"). Todos os itens abaixo entregues:

- **Data Lead com hora** — hoje exibe só data (`fmtDate`), precisa exibir
  data+hora (o campo `data_lead_recebido` é TIMESTAMPTZ e já traz o horário;
  usar `fmtDateTime` em vez de `fmtDate`). Igual ao `created_at` de Inscrições.
- **Resolver UTM codes → nomes amigáveis** — hoje a coluna UTM Source mostra o
  código cru (ex: `facebook`); Inscrições resolve o nome via `resolveName()`
  cruzando `utm_sources`, `utm_sources_plain`, `utm_campaigns`, `utm_mediums`.
  Aplicar o mesmo padrão para UTM Source (Canal), UTM Campaign (Campanha) e
  UTM Medium (Mídia).
- **Coluna Campanha (UTM Campaign)** — hoje não existe; Inscrições tem. Adicionar
  com resolução de código → nome (ex: `123` → `Webinário Julho`).
- **Coluna Mídia (UTM Medium)** — hoje não existe; Inscrições tem. Adicionar
  com resolução de código → nome.
- **Coluna Termo (UTM Term)** — hoje não existe; Inscrições tem. Adicionar.
- **Filtros adicionais** — hoje só tem UTM Source; Inscrições tem Canal,
  Campanha, Mídia, Termo. Adicionar `MultiSelectFilter` para cada um, com opções
  carregadas das tabelas `utm_campaigns`, `utm_mediums` (+ nomes amigáveis nos
  labels dos filtros, igual Inscrições).
- **Link para GHL** — Inscrições tem um link externo para
  `app.gohighlevel.com/.../contacts/detail/{ghl_contact_id}`; Lista não tem.
  Adicionar coluna com link usando `contatos.ghl_id` + `ghl_location_id` do
  workspace (já buscado em outros hooks).
- **Colunas reordenáveis/ocultáveis** — já existe o padrão em `ReunioesTab`
  (persistência em localStorage); replicar para Lista.

**Referência de implementação:** `eb-dash2/src/pages/inscricoes/InscricoesPage.tsx`
(`resolveName`, `UtmMaps`, `FilterSelect`).
**Arquivos a alterar:** `eb-dash2/src/pages/leads/tabs/ListaTab.tsx` +
`eb-dash2/src/hooks/useLeads.ts` (adicionar UTMs no select e nas filterOptions).

### Relatórios por e-mail — conclusão perfeita
**Status:** ✅ Funcional (2026-07-16). Envio funcionando com Resend. Clara agente autônoma
gera análises inteligentes via function calling (compara períodos, cruza criativos, detecta
anomalias vs benchmarks). Template de email rico com KPIs, funil, Meta Ads.
UI em `/relatorios?tab=automacoes`.

- Adicionado `email_format = 'clara_only'` para enviar apenas a análise escrita pela Clara,
  sem template visual estático. Schedule diário "Análise diária completa de tráfego" para
  `bruno@aliancadealtovalor.com.br` já usa esse formato.
- Fail-closed implementado: `clara_only` não envia e-mail se a Clara falhar.
- Teste E2E Playwright passando (`eb-dash2/tests/clara-daily-traffic-report.spec.ts`: 2/2).

🔴 **Bloqueio operacional:** a credencial OpenRouter do workspace Default está retornando
**401 `User not found`**. Enquanto isso não for corrigido, e-mails `clara_only` não serão
enviados. E-mails no formato `full` continuam normais.

Ver [`docs/CLARA-AGENTE-RELATORIOS.md`](CLARA-AGENTE-RELATORIOS.md).

---

## ✅ Concluído

### 2026-07-17 — Clara/e-mail destravados, rotina de UTM form-fb restaurada, Lista de Leads e Fase 15 em produção
- [x] **Clara volta a responder por e-mail (bug `weekEnd is not defined`):** `callClaraSummary` (send-weekly-report-email) usava `${weekEnd}` sem definir — ReferenceError engolido pelo catch → 502 fail-closed em qualquer modelo/credencial (existia desde a v2, 15/07). Diagnóstico via replay local do agent loop + `deno run` da function contra produção. Fix de 4 linhas + deploy. **Prova: e-mail real enviado para bruno@ (message_id Resend `3dbb1da7-...`, log `sent`).** Teste E2E corrigido (assert `toContain('enviado')` dava falso-positivo com "não enviado").
- [x] **Cron de e-mails automáticos estava 100% quebrado:** `weekly_email_dispatcher_job` passava `body` TEXT ao `net.http_post` (espera jsonb) — migration `20260925000000` aplicada; verificado com disparo real via dispatcher (log `sent`, `next_run_at` recalculado).
- [x] **Rotina de UTM de leads form-fb restaurada (2 causas raiz):** (1) desde o deploy do `ghl-api-worker` multi-tenant (13/07), os jobs do `sync-contact-attribution` morriam com `missing_tenant` (sem `workspace_id`/`location_id` na coluna nem no context) — 44 contatos pendentes, `attribution_attempts=0`. Fix: jobs fetch/write carregam `workspace_id` do contato (fail-closed quando ausente). (2) `TRACKING_CODE_REGEX` exigia `CR-(\d+)` e os criativos atuais usam letras (`CR-269h1`, `CR-296v2`, `CR-444vd1`) — parse falhava e o lead ficava em retry eterno sem resolver UTM. Fix: regex aceita alfanumérico e preserva o case original do criativo. Deploys + provas: lead com `M1_O1_P29_CR-248_PG32` → `iads-28/32/1/CR-248`; lead com `M6_O1_P29_CR-269h1_PG32` → `iads-28/32/1/CR-269h1` (case preservado). Backlog 44 → 27 e caindo via cron; residuais são contatos apagados no GHL (404) ou sem attribution nenhuma (skip automático após 10 tentativas, por desenho).
- [x] **Aba Lista de Leads — paridade com Inscrições:** data+hora, colunas Canal/Campanha/Mídia/Termo com resolução código→nome, filtros MultiSelect dos 4 UTMs, link direto pro contato no GHL, colunas reordenáveis/ocultáveis (padrão ReunioesTab). 8 testes novos; 124/124, tsc e build verdes.
- [x] **Fase 15 — múltiplas contas Meta por workspace (COMPLETA, em produção):** design em `docs/FASE-15-MULTI-CONTA-META.md` + UML atualizado. Fatia 1: `save_workspace_credential` aceita `metadata.ad_account_ids` (normalização, compat singular, merge defensivo, sync transacional de `workspace_meta_ad_accounts`) — migration `20260926000000` aplicada; 7 testes novos (15/15, regressão 54/54). Fatia 2: `sync-meta-ads`/`sync-meta-ads-backfill` iteram contas ativas com isolamento de falha por conta; `test-workspace-credential` testa todas as contas em paralelo. Fatia 3: card Meta com chips de contas em Integrações + filtro "Conta Meta" no Tráfego (padrão somado). Gates: `verdict.json` PASS ×2 (audits `gate-deploy-swre` e `gate-deploy-fase15-attribution`). 4 functions deployadas. **Para usar: adicionar a 2ª conta em Integrações → Meta (requer reenviar o token); filtro por conta aparece no Tráfego quando houver 2+ contas ativas.** Fatias futuras (sem demanda ainda): filtro em Aquisição/Pré-Vendas; abordagem 2 (credencial por conta) via `credential_id` na tabela de vínculo.

### 2026-07-16 — Pós-verificação do deploy webhook-ghl + tranca das 36 funções SECURITY DEFINER + fix do cron sync-tags
- [x] **Re-medição pós-deploy do webhook-ghl (~50 min, janela final):** 12 webhooks reais processados (madrugada BRT, volume baixo esperado — subindo em relação aos 5 da primeira medição), **0 rejeitados de qualquer razão** em `webhook_unresolved` (inclui 0 por `no_match`/`missing_location`/`no_secret` — nenhum evento legítimo barrado), 4 oportunidades novas, fila `ghl_api_jobs` normal. **Deploy confirmado saudável — item fechado.**
- [x] **Migration `20260921000000_revoke_internal_security_definer.sql` aplicada em produção** (autorização do dono, "pergunta 1"): 36 funções SECURITY DEFINER trancadas (EXECUTE só postgres+service_role). Probes ao vivo: `weekly_reports_auth_header` como `anon` → **42501 permission denied** (era a função que devolvia a service_role key em texto puro); contagem de DEFINERs com EXECUTE a `anon` caiu de 118 para 78; helper de RLS `is_workspace_member` segue executável por `authenticated` (app intacto).
- [x] **Fix do cron `sync-tags-from-webhook`** (autorização do dono, "pergunta 2"): evidência do sintoma em prod — 50 execuções `failed` em 24h (17%) por statement timeout no scan de 90 dias. Migration `20260922000000_fix_sync_tags_cron_window_7d.sql` aplicada em prod após prova no teste: DEFAULT da função agora é **7 dias** e o cron chama explicitamente `sync_tags_from_latest_webhook(7)`; ACLs preservadas (probe: `anon` sem EXECUTE). Backfill maior segue possível com argumento explícito. **Prova de fogo pós-fix: execuções de 01:30 e 01:35 UTC `succeeded` em 5,2s e 1,2s (antes: timeouts intermitentes).**
- [x] **Fix `WeeklyReportTable.tsx`** (autorização do dono, "pergunta 4"): mesmo defeito das semanas duplicadas do TrendChart, corrigido com o helper compartilhado `dedupeWeeklyRows` extraído de `trendData.ts` (critério determinístico: maior `data_version` → `computed_at` mais recente → `week_start` mais antigo) + sort DESC explícito. 3 testes novos (fixture de produção), suite 116/116, build verde, E2E 1/1 (8 semanas únicas, 0 warnings de key), screenshots light+dark inspecionados. **Não commitado ainda.**
- [x] **Limpeza dos snapshots duplicados legados em `weekly_snapshots`** (autorização do dono, "pergunta 3"): migration `20260923000000_cleanup_weekly_snapshots_duplicados.sql` aplicada em prod. Medição e critério verificados pelo orquestrador antes do push: 86 linhas, 23 grupos duplicados `(year_week, report_type)`, 56 legadas NULL. **29 linhas removidas (33,7%), 86 → 57; 0 grupos duplicados restantes; 27 singletons legados preservados** (semanas que só existem como legado — sem eles sumiriam do painel). Travas fail-closed na migration: aborta se algum candidato tiver dado não coberto pelo keeper, aborta se deleções > 40%. Provada no banco de teste (guardas, happy path, cascade, idempotência). Efeito visível: 12 grupos cohort passam a exibir os números da janela correta seg→dom (exibiam a janela errada de terça); produtividade inalterada.

### 2026-07-16 — Deploy do `webhook-ghl` fail-closed por workspace (item 3 aprovado pelo dono)
- [x] **Pré-verificação ao vivo (os 3 testes que o dono pediu):** (1) 100% dos 109.017 webhooks dos últimos 30 dias têm `locationId` extraível (`locationId` → `location.id` → `location_id`) e casam com workspace ativo; (2) digest SHA-256 do `webhook_secret` do workspace **idêntico** ao env `WEBHOOK_SECRET` usado pela versão antiga — autenticação do GHL segue passando; (3) versão nova grava dead-letter em `webhook_unresolved` (nunca descarte) — provado por probe autenticado com secret errado → 401 `{"error":"Unauthorized"}` + linha com o marcador do probe.
- [x] **Descoberta (problema pré-existente, não regressão):** ~1.300 eventos/dia de **workflows do GHL configurados sem o header de secret** já eram rejeitados pela versão antiga — silenciosamente, sem rastro (1.502 `auth_failed` registrados entre 14–15/jul quando a versão nova esteve no ar brevemente). São webhooks de workflow (sem `type`, com `id` — gatilhos "Customer Replied"); o dado das conversas chega pelo cron `sync-ghl-conversations`, então nada se perde. Com a versão nova ficam visíveis e reprocessáveis. **Correção definitiva = configurar o header nos workflows do painel GHL (manual, decisão do dono).**
- [x] Deploy realizado via `supabase functions deploy webhook-ghl --project-ref qzesffnkqgelmtfblzkr`. Gateway segue exigindo JWT válido (anon key) no `Authorization` — comportamento inalterado para o tráfego real (GHL envia `Authorization: Bearer <anon_key>` + `x-webhook-secret: <secret>`).
- [x] Baseline pré-deploy: 1.176 webhooks/24h, 7.641/7d, `webhook_unresolved` 20.887 total, 46 contatos/24h, 109 oportunidades/24h, 11 `ghl_api_jobs` pendentes. **Re-medição do tráfego real agendada (~20 min pós-deploy).**
- [x] Descoberta lateral (pré-existente, fora do escopo do deploy): `ghl-api-worker` despeja ~800 jobs/hora em `webhook_unresolved` com reason `missing_tenant` (19.385 em 24h, location NULL) — relacionado aos ~42,7 mil `ghl_api_jobs` mortos. **Decisão de negócio pendente: reprocessar ou arquivar.**

### 2026-07-16 — Plano de rollback da adoção multi-tenant + revisão do aviso de collation (item 6 aprovado pelo dono)
- [x] `docs/ROLLBACK-MULTI-TENANT.md` criado (359 linhas): plano de contingência completo (rollback TOTAL e PARCIAIS, sempre via migration nova, nada executado), fotografia de produção medida em 2026-07-16 (31 crons ativos, 2 workspaces, 4 credenciais Vault — **cutover env→Vault do workspace principal já aconteceu em 2026-07-15**), tabela de reversibilidade, gatilhos de "quando NÃO fazer", ordem inversa das fases, riscos/mitigação. Registrado no índice do `CLAUDE.md`.
- [x] **Collation: produção ÍNTEGRA (medido)** — PostgreSQL 17.6, provider ICU, `datcollversion` igual à versão real nos 3 bancos → sem mismatch, nenhuma ação necessária em produção. Correção documentada para o staging (medir → `REINDEX` por objeto → `REFRESH COLLATION VERSION`, como migration nova, em janela).
- [ ] **Lacunas que dependem do dono** (registradas no doc §final): (1) reprocessar ou arquivar os ≈19,4 mil eventos `missing_tenant` + 42,7 mil jobs dead; (2) destino das features pós-MT num rollback total (alternativa B-0: expurgo do tenant sem migration); (3) fixes de grants do grupo C: recomendação é MANTER mesmo no rollback; (4) segredo GHL: recuperar via `get_decrypted_secret` vs reemitir no painel (doc recomenda reemitir).

### 2026-07-15 — Clara Agente Autônoma de Relatórios
- [x] 8 RPCs SQL de análise (`get_clara_kpis`, `get_clara_comparison`, `get_clara_funnel`, `get_clara_creatives`, `get_clara_campaigns`, `get_clara_channels`, `get_clara_trend`, `get_clara_benchmarks`)
- [x] Módulo `report-tools.ts` com interface OpenAI function calling para todas as ferramentas
- [x] Agent loop em `send-weekly-report-email` — Clara investiga, cruza dados e gera insights com autonomia (máx 10 iterações)
- [x] Suporte a `model_id` e `analysis_depth` das configurações da Clara (antes ignorados)
- [x] Credencial OpenRouter seedada no Vault do workspace Default
- [x] System prompt de autonomia: compara períodos, detecta anomalias vs benchmarks, cruza criativos com custo, recomenda ações concretas
- [x] Email de teste enviado com sucesso (78s de agent loop — múltiplas tool calls)
- [x] Documentação completa em [`docs/CLARA-AGENTE-RELATORIOS.md`](CLARA-AGENTE-RELATORIOS.md)
- [x] UI de configuração da Clara auditada e corrigida: 9/10 campos agora funcionais (`model_id`, `business_context`, `analysis_depth`, `allowed_modules`, `allowed_tools`, etc.)
- [x] `conversation_retention_days` removido da UI (campo morto — nenhuma edge function usava); removido de `useClaraSettings.ts`, `ConfigurarClaraTab.tsx`, `clara-settings/index.ts`, `bot-chat/index.ts`
- [x] UI de modelos OpenRouter confirmada funcional — catálogo carregado em tempo real
- [x] `allowed_modules` agora restringe a Clara aos módulos configurados no system prompt do `bot-chat`

### 2026-07-16 — Clara cruza Meta Ads × CRM e envia análise diária de tráfego
- [x] 2 novas RPCs SQL de cruzamento Meta × CRM:
  - `get_clara_campaigns_crm` — CPMQL, CPAgendamento, CPReunião, CPV, ROAS, ROAS Caixa por campanha
  - `get_clara_creatives_crm` — mesmas métricas por criativo (CR-xxx)
- [x] Tools `get_campaigns_crm` e `get_creatives_crm` adicionadas a `report-tools.ts`
- [x] System prompt de `send-weekly-report-email` atualizado para priorizar métricas de CRM ao analisar campanhas/criativos
- [x] Correção de bug: `creative_code`/`creative_name` em `get_clara_creatives_crm` passou a retornar corretamente
- [x] Correção de cruzamento de campanhas: primeira versão usava `campaign_name` do Meta vs `utm_campaign` do CRM (não bate); versão final usa `utm_campaigns.page_code` extraído do `ad_name` (ex: `PG53`), igual ao filtro "Campanha [cp]" do painel de Tráfego
- [x] Preset "Análise diária de tráfego" adicionado ao formulário de automações
- [x] Schedule diário criado em produção para `bruno@aliancadealtovalor.com.br` às 08:00 BRT, módulo `trafego`, com prompt obrigando análise autônoma cruzada
- [x] Email de teste enviado com sucesso (`status: sent`)
- [x] Teste E2E Playwright `eb-dash2/tests/clara-daily-traffic-report.spec.ts`: **2/2 passed**

### 2026-07-15 — Correção do pipeline de dados GHL (incidente webhooks parados)
- [x] `ghl-api-worker` redeployado com guard JWT-based (resolveu 401 que bloqueava 2.348 jobs)
- [x] `sync-opp-dates` corrigido para incluir `workspace_id` no contexto dos jobs
- [x] 150 oportunidades com `data_lead_recebido NULL` resolvidas (112 preenchidas, 10 not_found no GHL)
- [x] `send-weekly-report-email` redeployado com guard corrigido
- [x] `compute-weekly-reports` redeployado com guard corrigido
- [x] Pipeline de webhooks confirmado funcionando (7.682 eventos/dia, processamento em tempo real)

### 2026-07-15 — Email de relatórios restaurado
- [x] `RESEND_API_KEY` atualizada nos secrets do Supabase
- [x] Envio de email testado com sucesso (`message_id: 2b5f4b2d-...`)
- [x] Template de email refeito: KPIs em cards, funil com barras, Meta Ads detalhado, perdas
- [x] Credencial Meta Ads seedada no Vault (investimento de 14-15 Jul voltou a aparecer)
- [x] `sync-meta-ads` redeployado com guard JWT-based

### 2026-07-15 — Segurança: verificação de GRANTs em produção (SELECT-only) + 2 vulnerabilidades críticas encontradas
- [x] As 7 RPCs do item 2026-07-11 verificadas ao vivo em produção: **LIMPAS** (`{postgres, service_role}` apenas) — nunca receberam o GRANT explícito do baseline.
- [x] **🔴 CRÍTICO 1:** `get_secret(text)` executável por `PUBLIC`/`anon`/`authenticated` — lê a tabela `secrets`, que contém a **service_role_key real** do projeto. Qualquer chamador com a anon key (pública no frontend) podia recuperá-la via `POST /rest/v1/rpc/get_secret`. **A chave deve ser considerada COMPROMETIDA e ROTACIONADA.**
- [x] **🔴 CRÍTICO 2:** `seed_workspace_credential_service_role` executável por `anon` (migration usava o padrão bugado `REVOKE FROM PUBLIC`) — sobrescrita de credencial de workspace no Vault sem autenticação.
- [x] Escala mapeada: 118 funções SECURITY DEFINER distintas com EXECUTE explícito a `anon` em produção (134 a `authenticated`). **Triagem concluída (2026-07-15, agente):** 133 funções classificadas — 36 REVOKE-seguro (27 helpers de cron/jobs sem callers + 9 com intent service_role-only declarado), 59 MANTER (RLS helpers, triggers, RPCs do frontend), 38 revisão humana. Migration `20260921000000_revoke_internal_security_definer.sql` criada, idempotente, aplicada no banco de teste com suite verde (533 passed; estado de privilégios verificado: `anon_com_exec=0`). **Aplicação em produção pendente de autorização do dono.** Achado extra: `weekly_reports_auth_header()` retornava a service_role_key em texto puro — incluída no revoke; a rotação da chave cobre o vetor.
- [x] Migration `20260918000000_fix_reassert_grants_producao.sql` criada (revogação explícita de `PUBLIC`/`anon`/`authenticated` nas 4 funções da família credenciais/segredos, idempotente, provada no banco de teste). **✅ Aplicada em produção em 2026-07-15** (`db push --linked` autorizado pelo dono; probe como `anon` → HTTP 401; auditoria `pg_stat_statements` sem abuso — só chamadas de cron).
- [x] **Recomendações ao dono:** (1) ~~autorizar deploy da migration~~ **feito 2026-07-15**; (2) rotacionar a service_role key e atualizar `public.secrets.service_role_key` + consumidores — **pendente, ação do dono no dashboard** (runbook em `docs/`); (3) auditar logs do PostgREST por chamadas a `rpc/get_secret` — **feito, sem abuso**; (4) ~~decidir triagem das ~118 funções restantes~~ **triagem feita 2026-07-15 — aguarda autorização p/ aplicar `20260921000000` em produção.**

### 2026-07-15 — Fix crítico: `revoke_workspace_credential` quebrada em produção (vault 0.3.1)
- [x] Descoberto ao destravar testes: o vault 0.3.1 (versão em produção E no teste) **não tem** `vault.delete_secret(uuid)` — a RPC de revogação lançava 42883 em runtime. Único uso da função em todo o repo.
- [x] Migration `20260919000000_fix_revoke_workspace_credential_vault_delete.sql` (DELETE direto em `vault.secrets`, semanticamente idêntico), aplicada e provada no banco de teste pelo teste de revogação BYOK (verde). **✅ Aplicada em produção em 2026-07-15** (mesmo push autorizado).

### 2026-07-15 — Enforcement da política de modelos proibidos (anthropic/openai)
- [x] Teste A→B da Clara provou que `anthropic/*` e `openai/*` eram aceitos em todos os enforcement points (violação da regra inegociável de custo).
- [x] Edge function `clara-settings` agora rejeita os dois prefixos (trim+case-insensitive, HTTP 422, antes de qualquer escrita) + migration `20260920000000_clara_settings_block_forbidden_models.sql` com CHECK no banco (defesa em profundidade). Provado no banco de teste (23514 para ambos; Qwen aceito). **✅ Migration aplicada em produção em 2026-07-15** (mesmo push autorizado; deploy da edge function `clara-settings` junto).
- [x] Defesa residual implementada (2026-07-15): clamp defensivo nos consumidores `bot-chat`/`prevendas-ai` — `model_id` com prefixo proibido vindo de settings antigas é descartado no consumo e cai no Qwen padrão, com aviso no log, sem quebrar a request (`FORBIDDEN_MODEL_PREFIXES` + `hasForbiddenModelPrefix`, teste estrutural `ai-model-prefix-clamp-structural.test.ts`, 7 verde). **Pendente de commit + deploy das functions.**

### 2026-07-15 — Bateria de testes + infra de testes + E2E visual
- [x] `vitest.integration.config.ts` restaurado (commit `461ea33` havia revertido: sem `.env.test`, sem trava anti-produção `safe-guard.ts`, sem `fileParallelism:false`/timeouts — suite quebrada desde 2026-07-14).
- [x] Novos testes: `openrouter-byok-isolation.test.ts` (24), `clara-settings-roundtrip.test.ts` (14), `ghl-link-gravacao-call.test.ts` (4), `loadTrafegoDataset.test.ts` (8) + 2 fixes em `useTrafego-useCohort.test.ts`.
- [x] Banco de teste sincronizado: 20+ migrations pendentes aplicadas (incl. Clara isolation, BYOK openrouter, telemetria), GRANTs da fixture re-aplicados + replay de todos os REVOKEs declarados em migrations.
- [x] Fix de seeds: `fase8-workspace-purge.test.ts` passa a semear `ai_conversations.workspace_id` (CHECK `ai_conversations_workspace_required` da migration `20260829000000`).
- [x] Suite de integração completa: **527 passed | 0 failed** (49 arquivos + 1 skip intencional, 10 todo — run final 2026-07-15 20:31 BRT, 111s). Suite frontend: 104/104. `npm run build` verde (2 erros tsc pré-existentes em `InscricoesPage.tsx` corrigidos na mesma sessão).
- [x] E2E Playwright com usuário de teste (`admin_master`, somente-leitura, light+dark): todas as telas com gráficos alterados validadas visualmente (`playwright-screenshots/e2e-2026-07-15/`, 80+ screenshots olhados). Nenhuma regressão de cor. Achados pré-existentes: `bg-white` em `GoalPerformanceCard` (corrigido nesta sessão, re-validado em screenshot) e **semanas duplicadas/fora de ordem no eixo X da aba Tendências** (`/relatorios?tab=tendencias`, 224 warnings de key duplicada — pendente de correção).

## ✅ Concluído (anteriores)

### 2026-07-12 — Plano de arquitetura de informação do dashboard (documento, aguarda aprovação)
- [x] Inventário completo dos 13 módulos do dashboard (todo card/aba/métrica) via leitura direta de hooks/componentes/colunas Supabase, 5 varreduras paralelas.
- [x] Princípio do dono aplicado ("cada aba dona de uma etapa; fora dela só resultado, dentro dela mecânica") — classificação item a item.
- [x] Duplicações reais identificadas: `AppointmentOriginBreakdown`/`AppointmentBalance` em até 4 módulos, "Auditoria IA" duplicada Pré-Vendas×SDR IA, funil completo repetido em Tráfego/Aquisição/Orgânico/Vendas, 1 arquivo de código morto (`dashboard/tabs/CriativosTab.tsx`). **Correção 2026-07-16:** `prevendas/tabs/GeralTab.tsx` NÃO é morto — é importado e renderizado por `RecuperacaoPage.tsx:12,278` (o plano estava errado; confirmado por grep e screenshot).
- [x] Filtros cruzados verificados — Canal/Mídia/Funil/Campanha/SDR/Closer já existem em Pré-Vendas e Vendas; gaps reais listados (dimensão "SDR IA vs Humano" não unificada, sem filtro de "produto/oferta").
- [x] Exceções ao princípio sinalizadas sem forçar a regra (Relatórios/Metas transversais, aba Cami, 3 fontes de "quem agendou").
- [x] Plano de migração em 5 fases proposto, **sem nenhuma mudança de código** — ver [`docs/PLANO-ARQUITETURA-INFORMACAO.md`](PLANO-ARQUITETURA-INFORMACAO.md).
- [x] **Fase 1 (só remoção de duplicações) aprovada pelo dono em 2026-07-15 e EXECUTADA em 2026-07-16** — demais fases seguem pendentes de aprovação. Execução: removidos `AppointmentOriginBreakdown`/`AppointmentBalance` de Tráfego e Aquisição/Orgânico (Vendas mantém as variantes próprias, como manda o plano); aba "Auditoria IA" removida de Pré-Vendas (casa certa: SDR IA) + item de sidebar correspondente; deletado o arquivo morto `dashboard/tabs/CriativosTab.tsx` (−961 linhas, zero imports confirmado antes/depois). **Desvio do plano com evidência:** `prevendas/tabs/GeralTab.tsx` NÃO foi deletado (está vivo na Recuperação — ver nota acima). Verificação: suite frontend 113/113, `npm run build` verde, E2E `tests/e2e-fase1-arquitetura.spec.ts` 7/7 (somente-leitura, baseline de erros pré-existentes medido em HEAD — qualquer erro novo quebra o teste), 14 screenshots inspecionados em light+dark (`playwright-screenshots/fase1-arquitetura/`). Pendência consciente: feature toggle `auditoria-ia` do módulo `pre_vendas` em `features.ts` ficou órfão (removê-lo é mudança de autorização — gate `docs/NIVEIS-DE-ACESSO.md`, decisão separada). **Não commitado ainda.**

### 2026-07-12 — Fix crítico: leads conectados contabilizados como não conectados
- [x] Corrigida a normalização de espaço em `resolve_ghl_field_value` e a
      preservação de `data_conectado` por `COALESCE`.
- [x] Migration `20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql`
      validada no banco de teste com regressão dedicada.
- [x] **Aplicação em produção verificada em 2026-07-15:** a migration já estava live desde o rollout de 13/14-jul (a nota "pendente" estava desatualizada). Eficácia confirmada ao vivo: `resolve_ghl_field_value` com o fix de espaços e `extrair_dados_ghl_v2` com o `COALESCE` ativos (via `pg_get_functiondef`); 58 oportunidades com `data_conectado` preenchida desde 13-jul; caso documentado (robertdantasml@gmail.com) explicado — a opp "Pré-Vendas nMQL" segue NULL porque não recebe webhook desde 08-jul (antes do fix); os webhooks recentes do contato miram a opp "Vendas SQL", que está com a data correta.

### 2026-07-12 — Investigação: fallback de workspace por location_id em produção
- [x] Confirmado, por leitura direta em produção, que a função
      `get_workspace_id_by_ghl_location_id` ainda roda a versão antiga (fallback
      "workspace mais antigo") e que `webhook-ghl` em produção usa segredo global
      único (não a versão por-workspace já em `main`).
- [x] Confirmado que a correção (fail-closed + `webhook_unresolved`) já existe em
      `main` desde a Fase 2, testada, nunca deployada.
- [x] Medição em produção: 240.017/240.018 webhooks históricos (99,9996%) com
      `location_id` batendo com o cadastro ativo — deploy seguro para o cliente
      atual.
- [x] Documentado em [`docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`](SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md).
      Deploy em produção é decisão do dono, fora do escopo desta investigação (só
      leitura autorizada).

### 2026-07-11 — Caça a bugs classe "coluna/tabela inexistente" (item 1/4 da varredura pós-PR #35)
- [x] Schema real do banco de teste extraído (133 tabelas, `information_schema.columns`) e usado como fonte de verdade.
- [x] Varredura das 43 edge functions + funções/triggers PL/pgSQL "vivas" — achado real: `webhook-compras` fazia upsert em 14 colunas inexistentes de `maquina_de_conteudo` (100% das compras Hotmart falhando desde a introdução da function).
- [x] Corrigido via migration `20260815000000_fix_maquina_de_conteudo_colunas_faltantes.sql` (adiciona as colunas, preserva o dado de negócio já capturado pelo código).
- [x] Guarda estrutural nova no CI: `__tests__/integration/schema-write-columns-structural.test.ts` — compara todo `insert`/`update`/`upsert` do código contra o schema real ao vivo, trava regressão dessa classe permanentemente.
- [x] Detalhes completos, achados descartados e limitações conhecidas do scanner em [`docs/CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md`](CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md).

### 2026-07-11 — Fix crítico: flakiness da suite (item 3/4 da mesma varredura) — causa real não era rate-limit
- [x] Investigação revelou causa real: RPCs `SECURITY DEFINER` sensíveis (`get_decrypted_secret`, `purge_workspace_data`, `create_agency_for_owner_service_role`, `register_outbound_webhook`) com `EXECUTE` concedido a `anon`/`authenticated` no banco de teste.
- [x] Causa raiz do bug: `REVOKE ALL ... FROM PUBLIC` (padrão usado em todas as migrations de hardening anteriores) não revoga um `GRANT` explícito feito diretamente a `anon`/`authenticated` — só revoga o que foi concedido via pseudo-role `PUBLIC`. Bug provavelmente replicado em produção — **ação manual urgente pendente** (ver doc). **(2026-07-15: VERIFICADO em produção — as 7 RPCs deste item estão LIMPAS, nunca receberam o grant explícito. MAS a mesma classe de bug está ativa em outras funções — ver entrada "2026-07-15 — Segurança: verificação de GRANTs em produção" abaixo e migration `20260918000000` aguardando autorização para deploy.)**
- [x] Corrigido no banco de teste via migration `20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql` (revoga explicitamente de `anon`/`authenticated`, não só `PUBLIC`).
- [x] Também corrigidas 2 reaplicações de migrations que nunca tinham "pegado" no banco de teste (`get_workspace_id_by_ghl_location_id` com fallback antigo; policies de `weekly_email_schedules`/`weekly_email_logs`).
- [x] Defesa em profundidade na suite: `fileParallelism: false` (serializa arquivos) + retry com backoff em `createTestUser`.
- [x] Suite completa: de 8-18 testes falhando deterministicamente em toda run → **399/399 verde** (35/36 arquivos, 1 skip intencional), 4 runs consecutivos confirmando estabilidade.
- [x] Detalhes completos e query de verificação para produção em [`docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md`](FIX-FLAKINESS-SUITE-ISOLAMENTO.md).

### 2026-07-11 — Auditoria de RLS permissiva (item 2/4 da mesma varredura)
- [x] Classificadas as policies RLS não-service_role do banco de teste (598 policies, 133 tabelas) — maioria intencional-e-segura (scoped por `workspace_id`/membership, ou dado global/referência sem PII).
- [x] Achado real: `public.webhooks_ghl` tinha policy de INSERT para `anon` com `WITH CHECK (true)` — qualquer requisição não autenticada podia inserir direto via PostgREST, contornando a validação de `webhook_secret` da edge function `webhook-ghl` e disparando o trigger que processa webhooks legítimos (forjar contato/oportunidade sem segredo nenhum).
- [x] Corrigido via migration `20260817000000_fix_webhooks_ghl_remove_anon_insert.sql` — só `service_role` escreve na tabela.
- [x] Teste novo `__tests__/integration/permissive-grants-audit.test.ts` prova (não só grep) que `anon` é recusado nas 5 RPCs sensíveis do Item 3 + no insert direto de `webhooks_ghl`.

### 2026-07-11 — Mapa de dados pessoais para o DPA (item 4/4 da mesma varredura) — CONCLUI a iniciativa
- [x] Mapa completo (tabela → coluna → categoria de titular) para lead/contato do CRM, cliente pagante, usuário interno e destinatário de e-mail.
- [x] Retenção: confirmado que não há TTL/expurgo automático por idade para dado de lead — só o `grace_period_days` (30 dias) entre pedido e execução de exclusão de workspace. Decisão de prazo geral fica marcada como pendência jurídica/produto, não técnica.
- [x] Compartilhamento com terceiros mapeado (GHL, Meta Ads, Resend, OpenRouter/IA, Notion, Telegram, OpenClaw) — achado: `prevendas-ai` envia nome de lead ao provedor de IA terceiro sem anonimização documentada.
- [x] Expurgo: `purge_workspace_data` cobre o workspace inteiro; lacuna real confirmada — não existe RPC para excluir dados de um titular individual sem desligar o workspace todo.
- [x] Dados sensíveis (LGPD art. 5º, II): nenhum campo estruturado encontrado; ressalva sobre texto livre (transcrições, observações) e gravação de voz em `stevo_whatsapp_calls` sem triagem automática.
- [x] Documento completo em [`docs/MAPA-DADOS-PESSOAIS-DPA.md`](MAPA-DADOS-PESSOAIS-DPA.md) — 6 pendências listadas para o jurídico decidir/redigir.
- [x] **Frente "caça a bugs pós-PR #35" concluída** — 4/4 itens entregues (colunas inexistentes, RLS permissiva, flakiness da suite, mapa de dados pessoais).

### 2026-07-11 — Frontend: Design System "Nubank" v2.2 — camada tokens + primitivos
- [x] Tokens de cor/raio/tipografia/motion em `eb-dash2/src/index.css` (light + dark) reharmonizados para a paleta roxa `#820AD1` — fonte da verdade em [`docs/DESIGN-SYSTEM-NUBANK.md`](DESIGN-SYSTEM-NUBANK.md).
- [x] `tailwind.config.js` (radius scale 12/24/32/48px, fontFamily graphikMedium/graphikRegular, boxShadow glow reharmonizado).
- [x] Liquid glass preservado (requisito do dono) e estendido para light mode, mesma estrutura de blur/opacidade.
- [x] Primitivos `button`/`card`/`input`/`textarea`/`badge`/`select`/`dialog` alinhados às receitas do design system + acessibilidade AA (focus ring, alvo de toque, `prefers-reduced-motion`, corpo ≥16px).
- [x] Build (`tsc -b && vite build`) e preview visual (light/dark) validados.
- [x] ~~Pendente (PR de camada 3 — telas): varredura de hex hardcoded em componentes de gráfico (`OrganicoMqlGoalChart`, `TrendChart` etc.)~~ **Feito (2026-07-15):** todos os hex/rgb hardcoded dos 12 componentes de gráfico substituídos por tokens (`OrganicoMqlGoalChart`, `TrendChart`, `DisparoFunnel`, `DisparoBarChart`, `InvestimentoCpmqlChart`, `GoalPerformanceCard` etc.); corrigido bug em `lib/utils/colors.ts` (referenciava `--chart-9..24` inexistentes → fatias/labels pretos) e `bg-white` hardcoded que quebrava `GoalPerformanceCard` no dark. Validado por E2E Playwright em light+dark (screenshots em `playwright-screenshots/e2e-2026-07-15/`). **Resta apenas:** decisão do dono sobre trocar `defaultTheme` do app para `light`.

### 2026-07-10 — Multi-tenant Agency: Fase 4 (BYOK completa) + Fase 5 (MVP Agency UI)
- [x] Iniciativa maior à parte, com roadmap e log de execução dedicados em [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) e plano-mãe em [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md).
- [x] Fase 4 (BYOK self-service) completa no banco de teste: cliente cadastra a própria chave GHL/Meta pela UI + botão "Testar conexão".
- [x] Fase 5 (MVP): área `/agency/*` — dono de agência suspende/reativa sub-contas com confirmação humana.
- [x] Tudo validado só no banco de TESTE; nada em produção. Detalhes e changelog completo em [`docs/MUDANCAS.md`](MUDANCAS.md).
- [x] 4 PRs abertos e empilhados (#14→#17), nenhum mergeado em `main` ainda.

### 2026-07-07 — Fase 6: Replicação do Sistema Empire para Novos Clientes
- [x] Criar script de provisionamento `scripts/provision-new-client.ts` (dry-run por padrão, ações reais com flags).
- [x] Criar template de variáveis `.env.new-client-template` com placeholders.
- [x] Criar documentação de onboarding `docs/ONBOARDING-NOVO-CLIENTE.md`.
- [x] Criar documentação técnica `docs/REPLICACAO-TECNICA.md`.
- [x] Atualizar `CLAUDE.md`, `docs/MUDANCAS.md` e `docs/ROADMAP.md`.

### 2026-07-07 — Fase 5: Credenciais GHL por Workspace e Rastreamento de Webhooks por Location
- [x] Migration adicionando `location_id` em `webhooks_ghl` + índice `idx_webhooks_ghl_location_id`.
- [x] Atualizar edge function `webhook-ghl` para extrair `locationId` (`locationId`, `location.id`, `location_id`) e gravar em `webhooks_ghl.location_id`.
- [x] Criar edge function `setup-ghl-integration` com validação JWT interna, verificação de `owner`/`admin` e upsert em `ghl_integration_settings`.
- [x] Remover `ghl_api_key` de `ghl_integration_settings`; usar secret `GHL_API_KEY` nas edge functions.
- [x] Configurar `[functions.setup-ghl-integration]` no `supabase/config.toml` com `verify_jwt = false`.
- [x] Documentar em `docs/GHL-CREDENCIAIS.md` e atualizar `CLAUDE.md`, `docs/MUDANCAS.md`, `docs/ROADMAP.md`.

### 2026-07-08 — Fase 4: Refatoração da Extração GHL com Mapeamentos por Workspace
- [x] Criar helpers SQL: `resolve_ghl_field_value`, `apply_ghl_field_mappings`, `get_workspace_id_by_ghl_location_id`.
- [x] Criar `extrair_dados_ghl_v2()` com mesma assinatura de retorno da v1.
- [x] Atualizar template `Empire Default` para equivalência exata com a v1.
- [x] Fazer seed/backfill de `ghl_field_mappings` para workspaces existentes e automatizar para novos workspaces.
- [x] Criar teste comparativo (`test_extrair_dados_ghl_v2_equivalence`) e script SQL sintético.
- [x] Substituir `trigger_extrair_dados_ghl()` para chamar `extrair_dados_ghl_v2()`.
- [x] Documentar em `docs/GHL-MAPEAMENTO-REFATORACAO.md` e atualizar `CLAUDE.md`, `MUDANCAS.md`, `ROADMAP.md`.

### 2026-07-07 — Fase 3: Interface de Configuração GHL (UI)
- [x] Criar página `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx` com `PageShell`.
- [x] Criar hooks TanStack Query para `ghl_integration_settings`, `ghl_field_mappings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `discover-ghl-config` e templates.
- [x] Seção de configuração com inputs seguros para `ghl_api_key`, `ghl_location_id` e `webhook_secret`.
- [x] Card amigável com URL do webhook e botão copiar.
- [x] Botão "Descobrir campos do GHL" integrado à edge function.
- [x] Tabelas de mapeamento de campos, pipelines e stages.
- [x] Sugestões automáticas de match por similaridade de nome.
- [x] Botão "Salvar mapeamentos" persistindo nas três tabelas.
- [x] Estados de loading, erro e vazio.
- [x] Rota `/workspace/ghl-config` protegida por `AdminRoute`.
- [x] Itens de navegação no menu workspace e no dropdown admin.
- [x] Documentar em `docs/GHL-CONFIG-UI.md` e atualizar `CLAUDE.md`, `MUDANCAS.md`, `ROADMAP.md`.

### 2026-07-07 — Fase 2: Discovery GHL via Edge Function
- [x] Criar edge function `discover-ghl-config` (`supabase/functions/discover-ghl-config/index.ts`).
- [x] Configurar `verify_jwt = false` com validação JWT interna (igual `workspace-apps`).
- [x] Validar owner/admin do workspace antes de executar discovery.
- [x] Ler `ghl_api_key` e `ghl_location_id` de `ghl_integration_settings` via service role.
- [x] Consultar custom fields de contato e oportunidade na API GHL.
- [x] Consultar pipelines/stages com fallback de endpoint.
- [x] Aplicar rate limiting local básico e retry em 429.
- [x] Normalizar resposta em JSON tipado.
- [x] Registrar cada discovery em `ghl_discovery_runs`.
- [x] Tratar erros da API GHL com mensagens amigáveis.
- [x] Documentar em `docs/GHL-DISCOVERY.md` e atualizar `CLAUDE.md`, `MUDANCAS.md`, `ROADMAP.md`.

### 2026-07-07 — Fase 1: Fundação do Mapeamento GHL Multi-Conta
- [x] Criar migration com 6 tabelas de mapeamento GHL (`ghl_integration_settings`, `ghl_field_mappings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `ghl_field_mapping_templates`, `ghl_discovery_runs`).
- [x] Ativar RLS em todas as tabelas novas com políticas de leitura para membros ativos e escrita apenas para owner/admin.
- [x] Seed do template padrão `Empire Default` com campos lógicos do Empire.
- [x] Criar documentação em `docs/GHL-MAPEAMENTO-CAMPOS.md`.
- [x] Atualizar `docs/ARQUITETURA.md`, `docs/TABELAS-SISTEMA.md`, `CLAUDE.md`, `docs/MUDANCAS.md` e `docs/ROADMAP.md`.

### 2026-07-05 — Módulo de Disparos (Tag-Driven Campaign Analytics)
- [x] Criar migração SQL: tabelas `disparos`, `disparo_tags`, função `contato_tem_tag`, view `v_disparo_metricas`, RLS
- [x] Criar types TypeScript em `eb-dash2/src/types/disparos.ts`
- [x] Criar hook `useDisparos.ts` com queries, métricas, contatos e mutações
- [x] Criar componentes de UI: `DisparoMetricCards`, `DisparoBarChart`, `DisparoFunnel`, `DisparoMetricsTable`, `DisparoConfigForm`, `DisparoContactTable`
- [x] Criar página `DisparosPage.tsx` com abas Dashboard e Configuração
- [x] Registrar app `disparos` no catálogo (`types/apps.ts`), features (`lib/apps/features.ts`) e navegação (`lib/apps/navigation.ts`)
- [x] Adicionar rota `/disparos` em `App.tsx` com `PermissionRoute`
- [x] Validar build com `npx tsc --noEmit`
- [x] Documentar em `docs/PLANO-MODULO-DISPAROS.md` e atualizar `CLAUDE.md`

### 2026-06-26 — Sub-apps Modulares: Fase 4 (Admin UI de Apps e Permissões)
- [x] Criar página `AppsSettingsPage` (`/settings/apps`) para ativar/desativar apps do workspace
- [x] Criar página `AppPermissionsPage` (`/settings/apps/permissions`) para permissões por papel e por usuário
- [x] Criar hooks `useWorkspaceApps`, `useAppRolePermissions`, `useAppUserOverrides` e `useWorkspaceMembers` com TanStack Query
- [x] Criar componente `Switch` em `src/components/ui/switch.tsx`
- [x] Atualizar `App.tsx` com rotas protegidas por `PermissionRoute`
- [x] Atualizar `Sidebar.tsx` com itens "Apps" e "Permissões de Apps" no menu Configurações
- [x] Centralizar catálogo de apps em `src/types/apps.ts`
- [x] Documentar entregas em `docs/SUB-APPS-MODULARES.md` e `docs/MUDANCAS.md`
- [x] Validar build e testes do frontend

### 2026-06-26 — Sub-apps Modulares: Fase 3 (Reorganização de Funcionalidades)
- [x] Criar página `SdrIaPage` (`/sdr-ia`) renderizando a aba Auditoria IA como app independente
- [x] Extrair `AuditoriaIaPanel` para `src/pages/sdr-ia/components/AuditoriaIaPanel.tsx` e reutilizar em `PreVendasPage` (aba Auditoria IA mantida por compatibilidade)
- [x] Atualizar `App.tsx`: rota `/sdr-ia` renderiza `SdrIaPage` dentro de `PermissionRoute moduleKey="sdr-ia"`
- [x] Atualizar `Sidebar.tsx` com item SDR IA + submenu Auditoria IA
- [x] Adicionar campo opcional `app_slug` aos formulários de metas (dropdown com apps permitidos)
- [x] Adicionar filtro por app na listagem de metas (`GoalsPage`)
- [x] Exibir app vinculado nas tabelas Registry e History de metas
- [x] Criar migration `20260626180000_add_app_slug_to_goal_definitions.sql`
- [x] Validar build e testes do frontend

### 2026-06-26 — Sub-apps Modulares: Fase 2 (Integração Frontend)
- [x] Criar tipos `WorkspaceApp` em `eb-dash2/src/types/apps.ts`
- [x] Atualizar `PermissionsContext` para buscar apps via edge function `workspace-apps`
- [x] Reintroduzir `AppHubPage` com cards dos apps permitidos e redirecionamento automático quando há apenas um app
- [x] Adicionar seletor de apps no header do `DashboardLayout`
- [x] Ajustar `Sidebar` para manter todos os itens e linkar logo para `/`
- [x] Atualizar `App.tsx`: rota `/` renderiza `AppHubPage`, rota `*` redireciona para `/`, `/sdr-ia` como placeholder
- [x] Atualizar `PermissionRoute` para verificar se o app correspondente está ativo e permitido
- [x] Validar build e testes do frontend

### 2026-06-26 — Sub-apps Modulares: Fase 1 (Fundação de Backend)
- [x] Criar tabela `workspace_apps` com ativação e settings por workspace
- [x] Criar tabela `app_role_permissions` com permissões por role
- [x] Criar tabela `app_user_overrides` com overrides por usuário
- [x] Ativar RLS em todas as tabelas com políticas para membros e owner/admin
- [x] Seed para workspaces existentes ativarem todos os apps e liberarem owner/admin
- [x] Edge function `workspace-apps` (`POST /workspace-apps`) com validação interna de JWT
- [x] Configurar `[functions.workspace-apps]` no `supabase/config.toml`
- [x] Documentação: `docs/SUB-APPS-MODULARES.md`
- [x] Validar build do frontend

### 2026-04-13 — Score real do MQL na aba Leads
- [x] Definir metodologia única de score para MQL em lógica cohort + snapshot
- [x] Criar util compartilhado para calcular score, bucket e maturidade do lead
- [x] Incorporar resposta inbound das comunicações ao cálculo
- [x] Exibir score e termômetro por lead na `LeadsTable`
- [x] Exibir nota geral agregada por filtro (`Canal`, `Funil`, `Campanha`, `SDR`, `Estágio`)
- [x] Documentar a metodologia em `docs/LEAD-QUALITY-SCORE.md`

### 2026-04-10 — Gráfico de destaque por SDR na aba SDRs
- [x] Criar agregador dedicado para 4 métricas por SDR com drilldown por barra
- [x] Exibir o gráfico no topo da aba `SDRs` em `Cohort` e `Produtividade`
- [x] Implementar escalas independentes por métrica sem exibir eixo Y
- [x] Mostrar valor direto acima de cada barra e tooltip ao hover
- [x] Reaproveitar `LeadListModal` para abrir leads da métrica clicada
- [x] Garantir faturamento operacional por `data_pagamento_entrada`

### 2026-04-10 — Remoção da aba Estatísticas em Pré-Vendas
- [x] Remover a tab `estatisticas` do `TABS` de `PreVendasPage`
- [x] Remover a entrada correspondente da `Sidebar`
- [x] Excluir hook e componentes exclusivos da aba para não deixar código morto
- [x] Excluir `docs/ABA-ESTATISTICAS-PRE-VENDAS.md` e limpar o índice em `CLAUDE.md`
- [x] Atualizar documentação estrutural do módulo

### 2026-04-08 — Repair de attribution para leads Facebook Form
- [x] Criar tabela `ghl_custom_field_mappings` com os 10 custom fields alvo do GHL
- [x] Implementar edge function `sync-contact-attribution`
- [x] Traduzir tracking code Meta (`M*_O*_P*_CR-*_*`) para o padrão interno do projeto
- [x] Atualizar `contatos` local apenas nas lacunas
- [x] Preencher custom fields do GHL apenas quando estiverem vazios
- [x] Agendar cron a cada 5 minutos com offset próprio
- [x] Documentar operação em `docs/SYNC-CONTACT-ATTRIBUTION.md`

### 2026-04-03 — Meta Ads: métricas de funnel na tabela de criativos (eb-dash2)
- [x] Expandir interface `MetaRow` em `useTrafego.ts` com 5 novos campos
- [x] Atualizar query `meta_ads_insights` para buscar novos campos
- [x] Adicionar 4 colunas configuráveis ao `CriativosTab.tsx`: CTR, CPM, Conv. Página, Video Hook
- [x] Calcular métricas derivadas (média ponderada por criativo)
- [x] **BUG FIX:** Corrigir queries que não buscavam novos campos em `useTrafego.ts`, `useAquisicao.ts` e `usePreVendas.ts`

### 2026-04-02 — Meta Ads: colunas de action types para métricas de funnel
- [x] Criar migration `20260402000000_add_action_type_columns_meta_ads.sql` com novas colunas
- [x] Atualizar função `processar_meta_ads_raw` para extrair action types do JSONB
- [x] Deploy edge functions `sync-meta-ads` e `sync-meta-ads-backfill`
- [x] Atualizar documentação `MAPEAMENTO-CAMPOS.md` com novas colunas
- [x] Documentar em `MUDANCAS.md`
- [x] Backfill histórico pendente (executar via edge function com service role key)

### 2026-03-31 — Auditoria das datas de oportunidades do CSV `Leads mar:26`
- [x] Criar script reproduzível para ler o CSV bruto e cruzar com `contatos` e `oportunidades`
- [x] Normalizar a leitura do `Submission Date` em BRT para eliminar falsos positivos por timezone do lead
- [x] Gerar relatório com casos corretos, ambíguos e sem match confiável
- [x] Aplicar correção automática apenas nos casos seguros
- [x] Reverter automaticamente os falsos positivos identificados na validação pós-update
- [x] Entregar relatório final com pendências explícitas para revisão manual

### 2026-03-31 — Blindagem sistêmica do sync de tags de contatos
- [x] Criar repair em lote pequeno por webhook para `contatos.tags` sem scan global caro
- [x] Criar repair direcionado por `contact_id` / `ghl_id` para suporte operacional
- [x] Priorizar contatos com `tags IS NULL` no `sync-contact-tags`
- [x] Aumentar retries e frequência efetiva de reprocesso para contatos sem tags
- [x] Adicionar timeout explícito no `ghl-api-worker` para chamadas à API GHL
- [x] Documentar parâmetros operacionais de fallback e retry

### 2026-03-31 — Segmentação por campanha CRM nas visões gerais
- [x] Adicionar helper compartilhado `utm_campaign -> nome` para segmentação visual
- [x] Incluir `MQLs por campanha`, `Reuniões por campanha` e `Vendas por campanha` no módulo Tráfego
- [x] Incluir `MQLs por campanha`, `Reuniões por campanha` e `Vendas por campanha` no módulo Aquisição
- [x] Incluir análise e donuts por campanha no módulo Vendas
- [x] Incluir nova seção de campanhas em Pré-Vendas e Recuperação
- [x] Propagar `campaignNameMap` para módulos compartilhados (Aquisição/Orgânico)
- [x] Validar build do frontend após a mudança

### 2026-03-31 — Importação manual de vendas antigas
- [x] Criar carga idempotente para o CSV `vendas antigas/VENDAS-FALTANTES-UTM-COMPLETO - VENDAS-FALTANTES-UTM-COMPLETO.csv`
- [x] Popular `contatos`, `oportunidades` e `vendas_fechamento` com compatibilidade de painel
- [x] Aplicar `pipeline_id = ZWuCjEXM2VDyLCx8CtGU` e stage assinado compatível com a base viva
- [x] Implementar fallback de `data_lead_recebido` quando `DATA_OPORTUNIDADE_GHL` vier vazia
- [x] Blindar a carga histórica contra reenvio indevido do OpenClaw
- [x] Validar 40 oportunidades e 40 vendas importadas no banco
- [x] Documentar o procedimento em `docs/IMPORTACAO-VENDAS-ANTIGAS-2026-03-31.md`

### 2026-03-31 — Hardening extra do cron de appointments
- [x] Ampliar a detecção de cancelamento para múltiplos campos do payload da API GHL
- [x] Ampliar a detecção de deleção para `deleted` e `isDeleted`
- [x] Adicionar execução direcionada por `opp_id` / `contact_ghl_id` para debug operacional
- [x] Adicionar `include_debug` para inspecionar os appointments normalizados de um lead
- [x] Ampliar o escopo do cron para oportunidades elegíveis fora de Recuperação
- [x] Reduzir a janela de refresh e processar múltiplos sublotes por execução
- [x] Restringir o sync frequente ao recorte operacional recente (60 dias)
- [x] Atualizar documentação operacional do cron e arquitetura

### 2026-03-27 — Hardening do cron de appointments
- [x] Corrigir `sync-appointment-dates` para ignorar appointments cancelados do GHL
- [x] Limpar `data_reuniao_agendada` quando não existir nenhum appointment ativo
- [x] Atualizar documentação operacional do cron e da regra de negócio

### 2026-03-27 — Produtividade orientada por data de evento
- [x] Remover `data_lead_recebido` como limitador das métricas operacionais de produtividade
- [x] Corrigir hooks de produtividade de Vendas e Pré-Vendas para buscar o pipeline relevante e contar eventos pelo próprio campo de data
- [x] Corrigir datasets de produtividade de Tráfego/Aquisição/Orgânico para incluir opps com sinal operacional no período
- [x] Ajustar textos e tooltips do toggle Cohort/Produtividade para a nova regra
- [x] Reintroduzir `Leads` e `MQLs` como etapas independentes em produtividade, usando `data_lead_recebido`
- [x] Remover funis encadeados, taxas e percentuais de conversão do modo produtividade em Vendas e Pré-Vendas/Recuperação
- [x] Corrigir segmentações de produtividade para usar bases próprias: MQL por geração, vendas por pagamento
- [x] Expandir `computeProducao` e as matrizes compartilhadas para exibir `Leads`/`MQLs` independentes por mês
- [x] Validar build do frontend após a mudança

### 2026-03-27 — SDR por Oportunidade via API GHL Followers
- [x] Coluna `oportunidades.sdr_name` + índice parcial
- [x] Trigger de reset quando `contatos.owner_name` muda
- [x] Backfill inicial a partir de `contatos.owner_name`
- [x] PASSO 2.6 em `extrair_dados_ghl()` — enfileira followers por webhook
- [x] Edge function `sync-opp-sdr` (padrão 3 fases)
- [x] Cron `sync-opp-sdr-cron` no offset `:06`
- [x] Frontend: 21 arquivos migrados de `contatos.owner_name` para `sdr_name`
- [x] Documentação: `docs/SYNC-OPP-SDR.md`

### Fase 1: Setup Inicial
- [x] Criar projeto Next.js 16+ com App Router
- [x] Configurar TypeScript strict mode
- [x] Configurar Tailwind CSS 4
- [x] Instalar shadcn/ui components
- [x] Configurar Supabase Client (browser/server)
- [x] Configurar middleware de autenticação

### Fase 2: Autenticação
- [x] Página de login com design Empire Business
- [x] Login com Google OAuth
- [x] Login com email/senha
- [x] Callback de autenticação OAuth
- [x] Proteção de rotas (middleware)
- [x] OTP de 8 dígitos (email/SMS)
- [x] Recuperação de senha funcional
- [x] Rate limiting (brute force protection)
- [x] Audit logging de eventos de autenticação

### Fase 3: Design System
- [x] Implementar DESIGN_TOKENS.md no globals.css
- [x] Dark mode only (Empire Black & Gold)
- [x] Classes de glassmorfismo (.glass, .glass-elevated, .glass-sidebar)
- [x] Cores primárias (Gold #D4AF37)
- [x] Sombras premium e glow effects
- [x] Componente Badge

### Fase 4: Layout Dashboard Premium
- [x] Sidebar com glassmorfismo elevado e logo com glow-pulse
- [x] Header com glassmorfismo elevado (glass-elevated blur 32px)
- [x] Navegação hierárquica com staggered animations (50ms delay)
- [x] User menu dropdown com glass styling premium
- [x] Breadcrumbs com hover states refinados
- [x] Animated pulse dot em navegação ativa
- [x] Emerald status dot no logo (online indicator)

### Fase 5: Traqueamento Premium Page
- [x] Cards refactored: glass → premium variant
- [x] Inputs upgraded: variant="glowing" com glow dourado no focus
- [x] Form fields: staggered animations (50ms delays)
- [x] Paste sections: gradient backdrop + info boxes
- [x] Tables: glass-elevated container com rounded borders
- [x] Table headers: improved typography (text-xs, uppercase, tracking-wide)
- [x] Table rows: hover effects + animated entrance (staggered)
- [x] Table actions: reveal on hover (opacity-based)
- [x] Empty states: icons centered + mensagens contextualizadas
- [x] SlugUtmSubTab: completamente refatorado com premium design
- [x] UtmSourceAdsSubTab: completamente refatorado com premium design
- [x] All animations: CSS puro, 60fps garantido, zero JavaScript

### Fase 6.7: Aba Reuniões no Módulo Vendas (2026-03-25) ✅
- [x] Nova aba `vendas.reunioes` (`/vendas?tab=reunioes`) para monitorar reuniões de closers
- [x] Filtro principal por `data_reuniao_agendada` (data prevista no calendário)
- [x] Filtro secundário interno por `data_realizacao_vendas`
- [x] Colunas: Closer, Reunião Prevista, Realizada em, Status Reunião, Status Lead, Funil, Canal, Gravação
- [x] Status derivado por prioridade das datas de pipeline
- [x] Colunas reordenáveis/ocultáveis via localStorage
- [x] Sidebar atualizada com item "Reuniões" no grupo Vendas
- [x] Documentação: `docs/ABA-REUNIOES-VENDAS.md`
- [x] Link de gravação: chave GHL confirmada em payloads reais de produção (2026-07-15) — `customData['{{opportunity.link_da_gravao_da_call_de_vendas}}']`; extração já ativa via trigger `tr_extrair_vendas_fechamento` (aceita grafia com/sem espaços); auditoria mostrou zero perda (campo raramente preenchido no GHL); cobertura em `__tests__/integration/ghl-link-gravacao-call.test.ts`

### Fase 6.5: Módulo Recuperação (2026-03-23) ✅
- [x] Novo módulo `/recuperacao` — exibe somente leads do pipeline Recuperação
- [x] Pré-Vendas continua excluindo leads de Recuperação
- [x] Hook `usePreVendas` parametrizado com `pipelineMode`
- [x] `LeadsParadosTab` parametrizado com `pipelineMode`
- [x] `RecuperacaoPage.tsx` criado — gêmeo de PreVendasPage
- [x] Rota + sidebar + breadcrumbs

### Fase 6.6: Módulo Metas Unificado (2026-03-23) ✅
- [x] Novo módulo `/metas` com abas `overview`, `tracking`, `registry` e `history`
- [x] Criar catálogo de indicadores em `goal_metric_definitions`
- [x] Criar metas por identidade lógica em `goal_definitions`
- [x] Criar histórico de vigência em `goal_versions`
- [x] Criar snapshots em `goal_snapshots`
- [x] Backfill automático da tabela legada `metas`
- [x] Adaptar `useMetas` para ler/gravar no novo domínio
- [x] Entregar V1 com Tráfego, Pré-Vendas e Vendas no mesmo módulo
- [x] Remover edição inline dos painéis operacionais e deixar cadastro/edição só em `/metas`

### Fase 6: Gestão de Usuários
- [x] Tipos TypeScript para usuários e permissões
- [x] Server Actions para operações de usuário
- [x] Página de listagem de membros
- [x] Editor de permissões de módulo (árvore hierárquica)
- [x] Editor de filtro de leads (regras AND/OR)
- [x] Componente PermissionGate para controle de acesso
- [x] Contexto de permissões (usePermissions)
- [x] Convite de usuários por email
- [x] Gestão de roles (owner/admin/member)

---

## 🚧 Em Progresso

### Fase 7: Módulo PRÉ-VENDAS (Manutenção & Bugs)
- [x] Metas com vigência própria para Tráfego e SDRs (2026-03-23)
  - [x] Tabela `metas` passou a ter `periodo_inicio` e `periodo_fim`
  - [x] Meta de MQL e custo/MQL deixaram de seguir o filtro de data da página
  - [x] Agendamentos da pré-venda passaram a aceitar vigência própria por SDR e global
  - [x] Card de custo/MQL ganhou `ideal-dia de custo`
- [x] Corrigir `Leads Parados` para excluir `Recuperação`, leads bloqueados e opps encerradas (2026-03-23)
  - [x] Remover oportunidades do pipeline `Recuperação` da aba
  - [x] Ignorar contatos com tag `bloquear`
  - [x] Não listar opps com `data_perdido` ou `data_fechado`
- [x] Alinhar estética da Matriz Cohort de `Pré-Vendas` com a de `Tráfego` (2026-03-23)
  - [x] Copiar tipografia, espaçamento, hover e hierarquia visual da tabela
  - [x] Manter conteúdo, cliques, cálculos e estrutura funcional intactos
- [x] Melhorar `LeadCard` com tags no cabeçalho, SDR/Closer e bloco "Aplicação" (2026-03-23)
  - [x] Selecionar `contatos.closer_name` / `closer_email` no detalhe
  - [x] Exibir tags com `parseTags()` no cabeçalho
  - [x] Agrupar respostas da aplicação em perguntas explícitas
  - [x] Fazer fallback best-effort no `webhooks_ghl` para respostas não desnormalizadas
- [x] Corrigir 12 bugs críticos de data e filtros (2026-03-12)
  - [x] BUG-01/02: useSDRLeaderboard — campo `tipo` → `channel` + `created_at` → `data_comunicacao`
  - [x] BUG-03/04: LeadsParadosTab — data e filtro de automação
  - [x] BUG-05: PreVendasPage — revenue filtro MQL
  - [x] BUG-06/07: AlertasQuadrant — data recente + pipeline filter
  - [x] BUG-08: Múltiplas opps por contato
  - [x] BUG-09/10: Timezone inconsistência
  - [x] BUG-11/12: Cohort cálculos percentuais
- [x] Corrigir discrepância Funil (751) vs Cohort (748) (2026-03-12)
  - [x] Timezone em `startOfMonth()` — converter para SP antes de extrair mês
  - [x] Remover bucket "Sem data" desnecessário
  - [x] Reverter queries de leads sem `data_lead_recebido`
- [x] Padrão UX: Simplificar filtro MQL no painel Tráfego (2026-03-13)
  - [x] Remover opção nMQL — deixar apenas "Todos" ou "MQL"
  - [x] Integrar filtro na linha de filtros de dimensão (padrão Pré-Vendas)
  - [x] Simplificar tipo TrafegoFilters.mqlFilter

### Fase 7-A: Data Consistency & Webhook Rules (Crítica — 2026-03-13) ✅ CONCLUÍDO
- [x] **Bug Crítico:** 722+ opps com datas parseadas para meses futuros (MM/DD invertido)
  - [x] Migration 20260313100000: `parse_date_flexible` com validação de range
  - [x] Migration 20260313200000: Nova regra em `extrair_dados_ghl()` (webhook = fonte verdade)
  - [x] Migration 20260313300000: Backfill de 722+ opps com datas inválidas
- [x] **Recuperação:** danieltiago107@gmail.com invisível em fevereiro
  - [x] Migration 20260313400000: Diagnosticar + restaurar data_lead_recebido
  - [x] Migration 20260313900000: Extrair data_fechado do webhook
  - [x] Lead agora 100% completo ✅ (aparece em fevereiro)
- [x] **Documentação:**
  - [x] Atualizar `docs/MUDANCAS.md` com changelog completo
  - [x] Atualizar `docs/webhooks-ghl/REGRAS-EXTRACAO.md` com nova regra crítica

### Fase 7-C: 2ª Auditoria de Timezone (2026-03-15) ✅ CONCLUÍDO
- [x] **Auditoria completa:** 9 edge functions + 58 arquivos TS/TSX + 109 migrations — nenhum bug remanescente
- [x] **Refactor:** preset "Este mês" em `TrafegoTab.tsx` e `PreVendasPage.tsx` — substituir double `toLocaleDateString` por `spToday().slice(0,7)+'-01'`
- [x] **Documentação:** Nova seção em `PADRAO-TIMEZONE.md` — UTC correto para durações vs `toSPISOStart/End` para dias de calendário

### Fase 7-B: Simplificação Arquitetural de Datas (2026-03-15) ✅ CONCLUÍDO
- [x] **Banco:** 23 colunas de pipeline em `oportunidades` convertidas de `TIMESTAMPTZ` → `DATE`
  - [x] Migration 20260315100000: ALTER TABLE (removendo/recriando views dependentes)
  - [x] Migration 20260315200000: `parse_safe_date()` retorna `DATE` (era `TIMESTAMPTZ`)
  - [x] Migration 20260315300000: `parse_date_flexible()` retorna `DATE` (era `TIMESTAMPTZ`)
  - [x] Migration 20260315400000: `extrair_dados_ghl()` atualizada para assinaturas DATE
- [x] **Frontend:** Centralizar utilitários de data
  - [x] Criar `eb-dash2/src/lib/utils/dates.ts` — `fmtDate`, `fmtDateTime`, `fmtMsgDate`, `spToday`, `spDaysAgo`, `tsToSPDate`, `toSPISOStart`, `toSPISOEnd`
  - [x] Refatorar `useTrafego.ts`, `usePreVendas.ts`, `useCohort.ts` — importar de `dates.ts`
  - [x] Refatorar `TrafegoTab.tsx`, `LeadCard.tsx`, `LeadsPage.tsx`, `SDRsTab.tsx` — remover funções inline duplicadas
- [x] **Documentação:** Reescrever `docs/PADRAO-TIMEZONE.md` — modelo DATE vs TIMESTAMPTZ, lista de colunas, funções TS

### Fase 9: Sistema de Faturamento (2026-03-18) ✅ CONCLUÍDO
- [x] **Problema:** Tabela `vendas_fechamento` estava vazia — nenhum dado de faturamento era preenchido
- [x] **Causa:** Migration 20260317000000 removeu PASSO 3 de `extrair_dados_ghl()` sem criar trigger substituto
- [x] **Solução implementada (3 migrations):**
  - [x] Migration 20260318040000: Criou trigger `tr_extrair_vendas_fechamento` (tinha bugs)
  - [x] Migration 20260318050000: Backfill inicial de 4.864 registros (valores zeros)
  - [x] Migration 20260318060000: CORRIGIU nomes de campos GHL ({{ opportunity.valor_a_ser_pago_de_entrada }} estava errado)
- [x] **Resultado:** 45 registros com R$ 1.494.611,15 em faturamento real
- [x] **Funcionalidade:** Trigger auto-preenche `vendas_fechamento` em tempo real quando SDRs/closers preenchem dados no GHL
- [x] **Dashboard:** KPIs de faturamento bruto e caixa recebido exibem em tempo real
- [x] **Documentação:** Nova página `docs/VENDAS-FECHAMENTO.md` com arquitetura, schema, troubleshooting

### Fase 9-A: OpenClaw — Contrato Assinado (2026-03-24) ✅ CONCLUÍDO
- [x] Corrigir trigger quebrado em `webhooks_ghl` que reaproveitava função incompatível com `vendas_fechamento`
- [x] Restaurar disparo ao arrastar o card para `Assinada`
- [x] Cobrir as duas ordens reais do processo: `link → Assinada` e `Assinada → link`
- [x] Centralizar idempotência em `oportunidades.openclaw_notificado_em`
- [x] Backfill de `openclaw_notificado_em` para contratos históricos já assinados
- [x] Parar de marcar sucesso no momento da fila: `openclaw_notificado_em` agora so vale apos resposta `2xx`
- [x] Adicionar retry automático por cron SQL + estado operacional (`request_id`, status, erro, timestamps)
- [x] Corrigir timeout do `pg_net` para o OpenClaw de `5000 ms` para `30000 ms` apos falha real observada
- [x] Atualizar documentação técnica do fluxo OpenClaw e faturamento

### Fase 10: Auto-Fill de Comunicações (2026-03-19) ✅ CONCLUÍDO
- [x] **Problema:** Comunicações poderiam chegar com `contato_id=NULL` se contato chegasse após sync
- [x] **Solução implementada:**
  - [x] Trigger BEFORE INSERT `tr_fill_comunicacao_contato_id` com double fallback (email → telefone)
  - [x] Backfill de segurança por email (afetou 0 registros — já estava tudo preenchido)
  - [x] Backfill de segurança por telefone (zero registros afetados)
- [x] **Resultado:** 55.408 comunicações com contato_id preenchido (0% NULL)
- [x] **Teste:** Trigger testado com INSERT — auto-preenchimento funcionando 100%
- [x] **Documentação:** Atualizar `docs/COMUNICACOES-SCHEMA.md` com explicação do novo trigger

### Fase 10-A: Auditoria Webhook + Crons (2026-03-20) ✅ CONCLUÍDO
- [x] Remover fallback incorreto de `sync-opp-dates` que gravava timestamp fake quando a API GHL falhava
- [x] Padronizar edge functions críticas para aceitar `SUPABASE_*` e `SB_*`
- [x] Validar regra canônica: mesma `opportunity_id` = mesma oportunidade; `data_lead_recebido` continua API-only
- [x] Corrigir monitoramento operacional de conversas para usar `ghl_conversations_sync_log` em vez de `comunicacoes.created_at`
- [x] Adicionar script `scripts/audit-ghl-sync-health.js` para auditoria consolidada
- [x] Atualizar documentação operacional: `docs/SYNC-OPP-DATES.md`, `docs/COMUNICACOES-GHL-SYNC.md`, `docs/CRONS-STATUS.md`, `docs/ARQUITETURA.md`, `docs/MUDANCAS.md`

### Fase 10-B: Robustez de Oportunidades GHL (2026-03-20) ✅ CONCLUÍDO
- [x] Corrigir `sync-contact-opportunities` para usar claim atômico da fila via RPC
- [x] Recuperar itens presos em `processing` via `claimed_at` + stale reclaim
- [x] Corrigir retry real da fila usando `attempts` correto
- [x] Corrigir `upsert` de oportunidades para não falhar em `nome_contato` / `contato_id` nulos
- [x] Corrigir merge com dados existentes para não sobrescrever campos válidos com `null` da API GHL
- [x] Criar infraestrutura de runs para reconciliação/backfill: `ghl_opp_reconcile_runs` + `ghl_opp_reconcile_items`
- [x] Criar edge function `reconcile-contact-opportunities` com modos `audit` e `write`
- [x] Criar cron noturno 03:00 BRT para iniciar reconciliação completa
- [x] Criar processor `*/5` para consumir runs em lotes
- [x] Criar documentação dedicada `docs/SYNC-CONTACT-OPPORTUNITIES.md`

### Fase 10-C: Contadores de Defasagem por Contato (2026-03-20) ✅ CONCLUÍDO
- [x] Adicionar `total_oportunidades_ghl` na tabela `contatos`
- [x] Adicionar `total_oportunidades_db` na tabela `contatos`
- [x] Backfill inicial local de `total_oportunidades_db` via migration
- [x] Atualizar `reconcile-contact-opportunities` para persistir os dois contadores em cada contato no run noturno `mode=write`
- [x] Documentar query operacional para encontrar contatos com defasagem de contagem

### Fase 10-D: Ativação da Fila Central GHL (2026-03-20) ✅ CONCLUÍDO
- [x] Migrar `sync-opp-dates` para enfileirar em `ghl_api_jobs` e aplicar resultado assíncrono
- [x] Migrar `sync-opp-pipelines` para enfileirar em `ghl_api_jobs` e aplicar `pipeline_id` / `pipeline_name`
- [x] Migrar `sync-contact-tags` para enfileirar em `ghl_api_jobs`
- [x] Endurecer `ghl-api-worker` com reclaim de stale, `claimed_at`, `handled_at` e tratamento terminal de `not_found`
- [x] Alinhar `sync-ghl-conversations-incremental` ao schedule real `*/10` e validar por `ghl_conversations_sync_log`
- [x] Expandir `scripts/audit-ghl-sync-health.js` para incluir `ghl_api_jobs`
- [x] Validar em produção: `data_lead_recebido=NULL = 0`, `pipeline_id=NULL = 0`, `pipeline_name=NULL com pipeline preenchido = 0`, `contatos.tags IS NULL = 0`, `ghl_api_jobs pending/processing = 0`

### Fase 10-E: Vazão da Fila contact_opp_sync_queue (2026-03-20) ✅ CONCLUÍDO
- [x] Medir tempo real do `sync-contact-opportunities` em produção com `20` e `50` contatos
- [x] Confirmar que o backlog alto era gargalo de throughput, não erro de cron nem fila travada
- [x] Alterar `sync-contact-opportunities` para processar até `2` batches por execução com limite de tempo
- [x] Elevar o lote efetivo padrão para `50`, mantendo `exact_batch_size=true` para teste manual pequeno
- [x] Validar em produção com payload legado do cron: `{"batch_size":20}` → `processed=100`, `errored=0`
- [x] Reduzir ETA teórica de drenagem de ~`29,1h` para ~`5,82h` para o backlog observado de `6985` itens

### Fase 10-F: Fechar janela residual de reaplicação nas opps GHL (2026-03-20) ✅ CONCLUÍDO
- [x] Confirmar que a pendência residual de 1 oportunidade não era erro de cron nem do worker
- [x] Ajustar `sync-opp-dates` para drenar jobs concluídos também no fim da request
- [x] Ajustar `sync-opp-pipelines` para drenar jobs concluídos também no fim da request
- [x] Expandir `scripts/audit-ghl-sync-health.js` com `terminal_unhandled`
- [x] Validar em produção: `pipeline_id=NULL = 0`, `data_lead_recebido=NULL = 0`, `ghl_api_jobs pending/processing = 0`
- [x] Revalidar em produção às `23:07 BRT` após entrada de novas oportunidades em tempo real, confirmando que o fix continua zerando o backlog residual

### Fase 11: Bug Fix — Quadrant 2 "Aguardando Resposta do SDR" (2026-03-19) ✅ CONCLUÍDO
- [x] **Problema:** Aba LeadsParadosTab exibia leads que já haviam sido respondidos pelo SDR indevidamente
- [x] **Causa raiz:** Lógica com 2 queries separadas usando limites insuficientes (`.limit(500)` + `.limit(N*3)`)
- [x] **Solução implementada:**
  - [x] Refatorar para paginação unificada com `PAGE_SIZE=1000` (sem truncamento)
  - [x] Filtro único: `or('direction.eq.inbound,and(direction.eq.outbound,ghl_source.eq.app))'`
  - [x] Rastrear `latestPerContato` — apenas contatos com última comunicação = inbound
- [x] **Resultado:** Lista exibe **apenas leads que de verdade aguardam resposta do SDR**, sem falsos positivos
- [x] **Arquivo alterado:** `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` (linhas 505–603)
- [x] **Índices:** Cobertos por `idx_comunicacoes_direction_source` + `idx_comunicacoes_data_comunicacao`
- [x] **Commit:** `8dc4c87`
- [x] **Documentação:** `docs/MUDANCAS.md` atualizado com changelog detalhado

### Fase 11-B: Painel Produtividade no Tráfego (2026-03-23) ✅ CONCLUÍDO
- [x] Criar hook `useProducao.ts` que filtra oportunidades por data de EVENTO (não data de geração)
- [x] Query usa `.or(and(...),and(...))` do PostgREST para capturar qualquer evento no período
- [x] Criar `computeProducao` — função pura que agrupa eventos por mês de produção
- [x] Adicionar toggle "Cohort / Produtividade" no `TrafegoTab.tsx` (acima da matriz)
- [x] Implementar `Matriz Produtividade` com colunas por evento + custo por etapa
- [x] Lazy loading: dados de produtividade só carregam quando o usuário abre essa aba

### Fase 11-C: Tracking manual de teste em Produção (Notion) (2026-04-08) ✅ CONCLUÍDO
- [x] Adicionar colunas `creative_tested` e `test_started_at` em `notion_creatives`
- [x] Liberar `UPDATE` via RLS para membros autenticados do workspace em `notion_creatives`
- [x] Exibir checkbox `Testado` na sub-aba `traqueamento.anuncios.producao_notion`
- [x] Exibir campo `Início do Teste` por criativo na mesma tabela
- [x] Preservar esses campos como metadados manuais fora do sync do Notion
- [x] Atualizar documentação técnica e changelog do projeto
- [x] Documentar em `docs/PAINEL-TRAFEGO-PAGO.md` e `docs/DASHBOARD-MODULOS.md`

### Fase 11-A: Auditoria do Painel Cohort de Tráfego (2026-03-23) ✅ CONCLUÍDA
- [x] Auditar a lógica real do painel em `useTrafego.ts`, `useCohort.ts` e `TrafegoTab.tsx`
- [x] Confirmar as regras centrais: cohort por `data_lead_recebido`, exclusão de Recuperação, MQL por tag e faturamento cohort
- [x] Atualizar documentação dedicada do painel e registrar auditoria em `docs/`
- [x] Validar que o frontend continua compilando após a documentação (`npm run build`)
- [x] Corrigir a paginação de `oportunidades` para ficar deterministicamente ordenada por chave única
- [x] Definir comportamento explícito para filtro `Campanha Meta` quando faltar mapeamento em `utm_campaigns`
- [x] Criar testes automatizados mínimos para `useTrafego.ts` e `useCohort.ts` — **Feito (2026-07-15):** `eb-dash2/test/loadTrafegoDataset.test.ts` (8 testes: exclusão Recuperação, cohort por `data_lead_recebido`, escopo workspace, paginação determinística 1001 opps, faturamento por `data_pagamento_entrada`) + 2 testes quebrados corrigidos em `useTrafego-useCohort.test.ts`. Suite frontend: 104/104 verde.

### Fase 12: Melhorias de UX — Frontend (2026-03-20) ✅ CONCLUÍDO
**Sprint de polimento de interface:**
- [x] **LeadCard — rolagem do painel de contato:** drawer inteiro usa rolagem própria e `overscroll-contain`; cabeçalho, muitas tags, métricas e abas não podem mais ser cortados em telas baixas.
- [x] **Menu de apps/seletor no topo:** corrigido o posicionamento do dropdown para que nunca abra para fora da viewport. Quando não houver espaço abaixo, abre acima ou limita altura com rolagem interna; itens permanecem legíveis e clicáveis em desktop e mobile.
- [x] **LeadCard — Portal + Tela Cheia (commit `2740b9d`)**
  - [x] Usar `createPortal(..., document.body)` para escapar stacking contexts
  - [x] Fix: LeadCard não fica mais "travado" quando página scrollada
  - [x] Toggle fullscreen com ícones `Maximize2` / `Minimize2`
  - [x] Width dinâmica: `w-[520px]` (padrão) → `w-screen` (fullscreen)
  - [x] Transição suave via `transition-[transform,width]`
  - [x] Padrão documentado em `docs/FRONTEND-EB-DASH2.md`

- [x] **Gráficos "Evolução de Agendamentos" — Interatividade (commit `dca7248`)**
  - [x] Tooltip ao hover exibindo data + contagem
  - [x] Eixo X com datas espaçadas (DD/MM)
  - [x] Legenda integrada por card
  - [x] Cores melhoradas (+13% / +44% contraste)
  - [x] Linha de base sutil para dias sem agendamento
  - [x] Arquivo: `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`

- [x] **Acordeão em Leads Parados — UX Colapsável**
  - [x] Implementar seções recolhíveis (começa expandido)
  - [x] ChevronDown com rotação `-rotate-90`
  - [x] Hover feedback em cabeçalho
  - [x] Badges visíveis mesmo recolhido
  - [x] Padrão documentado em `docs/FRONTEND-EB-DASH2.md`

- [x] **Visão Geral filtra apenas SDRs oficiais (consistency)**
  - [x] Carregar `ghl_users` com papel `'sdr'`
  - [x] Filtrar leads apenas com `owner_name` em conjunto oficial
  - [x] Resultado: Visão Geral + SDRsTab mostram exatamente mesma contagem
  - [x] ⚠️ **REMOVIDA (2026-04-02):** aba Visão Geral do módulo Pré-Vendas foi removida. Análises now nas abas MQLs e SDRs.

- [x] **Modal clicável de No-shows Pendentes**
  - [x] Clique em "No-shows" abre modal com tabela
  - [x] Clique em linha → LeadCard
  - [x] Removido AlertasCard de `LeadsParadosTab` (não duplicar)

- [x] **Mover "No-shows pendentes" para Leads Parados (2026-03-23)**
  - [x] Extrair `NoShowsPendentesCard` como componente próprio
  - [x] `AlertasCard` mantém apenas reuniões 48h + leads >30d
  - [x] `LeadsParadosTab` passa a exibir o card no topo

- [x] **Tempo Médio de Resposta por SDR**
  - [x] RPC function `get_sdr_avg_response_time(p_start, p_end)`
  - [x] Hook `useSDRLeaderboard`: merge com dados de resposta
  - [x] Tab `SDRsTab`: coluna "Tempo Resp." com badge color-coded
  - [x] Helper `fmtResponseTime`: "< 1 min" / "15 min" / "2h 30min"

- [x] **Remover KPI Cards de receita da Visão Geral**
  - [x] Remover: Faturamento, Caixa, ROAS, ROAS Caixa
  - [x] Foco: Funil + métricas operacionais (não financeiras)
  - [x] ⚠️ **REMOVIDA (2026-04-02):** aba Visão Geral do módulo Pré-Vendas foi removida inteiramente.
  - [x] Coluna Faturamento permanece na Matriz Cohort (contexto)
  - [x] Commit: `3138470`

- [x] **Documentação:** `docs/MUDANCAS.md` + `docs/FRONTEND-EB-DASH2.md` atualizados

### Fase 8: Módulo TRAQUEAMENTO (Completo) ✅
- [x] Implementar UTM Source Orgânico — sub-aba `utm_source_organico` em `CodsUtmTab.tsx`
- [x] Implementar UTM Campaign — sub-aba `utm_campaign` em `CodsUtmTab.tsx`
- [x] Implementar UTM Medium — sub-aba `utm_medium` em `CodsUtmTab.tsx`
- [x] Implementar UTM Term — sub-aba `utm_term` em `CodsUtmTab.tsx`
- [x] Implementar Objetivo ADS — sub-aba `objetivo_ads` em `CodsUtmTab.tsx`

### Fase 13: Bug Fix Crítico — pipeline_id=NULL (4356 leads invisíveis) (2026-03-21→22) ✅ CONCLUÍDO
**Problema descoberto:** Lead `eduardosampaio.mb@gmail.com` invisível em cohort de vendas — raiz: 4356 oportunidades com `pipeline_id=NULL`

**Causa raiz:** Oportunidades que chegavam via webhook sem `pipeline_id` / `pipeline_name` ficavam invisíveis no dashboard porque PostgREST/PostgreSQL trata `NULL` como `UNKNOWN` → silenciosamente excluído de queries com `.neq('pipeline_id', null)`.

**Solução implementada:**
- [x] Edge function `sync-opp-pipelines` — busca `pipelineId` da API GHL para opps com `pipeline_id=NULL`
- [x] Cron job automático — executa a cada 10 minutos, batch de 100 opps (migration `20260321000000_cron_sync_opp_pipelines.sql`)
- [x] Rate limiting robusto — 130ms entre requests, exponential backoff para HTTP 429
- [x] Backfill acelerado manual — 9 iterações × 100 opps em ~10 minutos (script Node.js)
- [x] Documentação completa — `docs/SYNC-OPP-PIPELINES.md`, `docs/MUDANCAS.md`, `CLAUDE.md`

**Resultado final:**
- [x] **4356/4356 oportunidades sincronizadas (100%)**
- [x] Fase 1 (Cron automático): ~3500 opps em 7 horas (2026-03-21 21:30 → 2026-03-22 05:00)
- [x] Fase 2 (Backfill manual): 863 opps em 10 minutos (2026-03-22 ~15:00)
- [x] Verificação: `SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL;` = **0** ✅
- [x] Lead `eduardosampaio.mb@gmail.com` agora **visível em cohort de vendas**
- [x] Todos os 4356 leads aparecem corretamente em painéis de tráfego/pré-vendas

**Cron continua:**
- Roda automaticamente a cada 10 minutos
- Serve como fallback para novos webhooks incompletos
- Zero intervenção necessária

**Arquivos:**
- `supabase/functions/sync-opp-pipelines/index.ts` — edge function (Deno)
- `supabase/migrations/20260321000000_cron_sync_opp_pipelines.sql` — cron job
- `docs/SYNC-OPP-PIPELINES.md` — documentação técnica
- `/tmp/backfill-safe.js` — script de backfill acelerado

---

## 📋 Pendente

### Migração completa de marca: OMNX — obrigatória antes de nova divulgação

- [x] Substituir todo texto, nome visível, título, e-mail remetente, prompt e metadado público que mencione **Acelerador de Audiência**, **Empire** ou **Empire Business** por **OMNX**. Interface, prompts, títulos e remetentes públicos migrados. Documentação histórica e identificadores técnicos permanecem apenas para rastreabilidade e compatibilidade.
- [x] Substituir todas as logos do sistema pelos arquivos oficiais `images/logo omnx /fundo claro.png` e `images/logo omnx /fundo escuro.png`, selecionando a variante correta para cada fundo/tema no bundle frontend.
- [x] Tela de login: mostrar somente a nova logo OMNX (imagem), sem wordmark, nome da plataforma, subtítulo ou texto complementar de marca. Preservar apenas `alt` acessível para leitores de tela.
- [x] Atualizar favicon, manifest, título de abas e comunicações automáticas para OMNX, sem renomear tokens técnicos ou tabelas internas nesta fase.
- [x] Trocar referências e URLs públicas (`empire.business`, remetentes e títulos OpenRouter) por domínio/identidade OMNX validados; inventariar o que depende do domínio antigo antes da mudança. (2026-07-14: auditoria confirma — zero referências a `empire.business` no código-fonte ativo. Edge functions, frontend, configs e migrations 100% limpos. O único match é o teste `brand-identity.test.ts` que existe como guarda para evitar regressões.)
- [x] Revisar documentação e exemplos públicos; preservar somente referências históricas estritamente necessárias em changelogs/migrations. Guias operacionais de design, tags e Notion agora usam OMNX; exports, relatórios e handoffs históricos foram preservados para rastreabilidade.
- [x] Validar por busca automatizada que não restaram menções visíveis ao usuário das marcas antigas. O teste `eb-dash2/test/brand-identity.test.ts` bloqueia a reintrodução de nome, domínio e favicon legados no frontend distribuído; tokens técnicos internos `empire-*` permanecem fora do escopo desta migração.

**Guard:** esta é uma migração de marca, não uma renomeação cega do banco. Não alterar nomes de tabelas, migrations, variáveis de compatibilidade ou integrações externas sem plano específico e rollback.

### Credencial OpenRouter própria por subconta — antes de liberar IA para clientes

- [x] Criar cadastro BYOK de OpenRouter por `workspace_id`, armazenado no Vault, para que cada subconta use e pague pela própria chave de IA.
- [x] Remover o fallback para `OPENROUTER_API_KEY` global nos fluxos migrados (`ai-ghl-mapping`, `bot-chat`, `bot-chat-synthesis`, `prevendas-ai`). Sem chave ativa da subconta, a função falha fechada com orientação para configurá-la — nunca consome a chave da agência.
- [x] Expor para owner/admin uma tela segura para cadastrar, testar, substituir e revogar a chave; a chave nunca volta ao frontend, logs ou respostas de API.
- [x] Registrar consumo e falhas por workspace sem armazenar o segredo, para suporte e cobrança futura.
- [x] Validar isolamento com teste A→B: uma subconta não consegue usar, ler ou provocar consumo da credencial de outra — **Feito (2026-07-15):** `__tests__/integration/openrouter-byok-isolation.test.ts`, 24/24 verde contra o banco de teste — leitura/escrita/revogação cross-tenant bloqueadas, roundtrip save→vault→rotação, isolamento da telemetria de uso, fail-closed sem chave, zero fallback para `OPENROUTER_API_KEY` global nas 4 edge functions de IA.

**Decisão:** até esta entrega, IA em subconta é recurso de burn-in interno. Não liberar para clientes pagantes sem esta separação de credenciais.

### Clara por subconta — isolamento obrigatório antes de migrar o chat

- [x] Incluir `workspace_id` obrigatório e validado em toda chamada da Clara (`bot-chat`, `bot-chat-synthesis` e worker de dados); nunca inferir a subconta por usuário nem aceitar um ID sem membership ativo.
- [x] Versionar conversas e sessões da Clara com `workspace_id`, fazer backfill somente quando inequívoco e reforçar RLS/índices para impedir leitura ou reutilização entre subcontas. Legado ambíguo fica inacessível, não é atribuído por suposição.
- [x] Propagar o workspace nas chamadas internas e no fluxo de sugestões de agenda; worker interno não pode aceitar uma conversa/sessão de workspace diferente.
- [x] Provar estruturalmente com teste A→B que uma subconta não lê contexto, histórico, cache, dados ou credencial de IA da outra — mesmo para o mesmo usuário membro de duas contas. Teste de integração em banco com duas contas permanece recomendado antes do deploy.

**Guard:** a Clara não pode adotar OpenRouter BYOK por subconta antes desta migração; manter o chat atual fora da fase 1 evita uma falsa sensação de isolamento.

### Painel de configuração da Clara — dentro de Relatórios

- [x] Criar fundação isolada por `workspace_id`: preferências e auditoria sanitizada em tabelas com RLS, retenção de conversas, limites de resposta e modelo Qwen fixado pela política atual.
- [x] Aplicar as preferências da conta no `bot-chat`: desativação, instruções permanentes, regras, limite de resposta e allowlist de ferramentas são resolvidos por `workspace_id` antes da chamada de IA.
- [x] Aplicar contexto, regras e instruções globais da conta aos resumos dos relatórios automáticos, sempre filtrados pelo `workspace_id` do agendamento.
- [x] **Publicação remota obrigatória:** aplicar a migration `20260901000000_create_clara_workspace_settings.sql` em produção. (2026-07-14: aplicada via `supabase db push`)
- [x] **Publicação remota obrigatória:** publicar a Edge Function `clara-settings` em produção. (2026-07-14: publicada + 5 edge functions de IA redeployadas: `bot-chat`, `bot-chat-synthesis`, `prevendas-ai`, `telegram-bot`, `ai-ghl-mapping`)
- [x] Criar uma área **Configurar Clara** no app de Relatórios, restrita a owner/admin da conta. (implementada como `ConfigurarClaraTab.tsx`, acessível em `/relatorios?tab=clara`)
- [x] Permitir configurar instruções permanentes da Clara (tom de voz, objetivo de negócio, contexto da empresa, regras de resposta, módulos e fontes de dados permitidas), sempre escopadas por `workspace_id`.
- [x] Permitir ajustar limites operacionais seguros: habilitar/desabilitar Clara, ferramentas permitidas, profundidade de análise, tamanho máximo de resposta, retenção de conversas e instruções de relatórios automáticos. Ferramentas, profundidade, chat e relatórios automáticos respeitam as preferências já implementadas; retenção fica registrada para a rotina de expurgo dedicada.
- [x] Consultar server-side o catálogo oficial de modelos da OpenRouter (`/api/v1/models`), exibir nome, contexto, preço e disponibilidade sem expor a chave da conta.
- [x] Criar seleção de modelo por conta com allowlist, validação server-side, fallback explícito e registro de custo/uso. (2026-07-14: migration `20260902000000` removeu CHECK constraint fixa. Edge function `clara-settings` valida formato server-side. UI `ConfigurarClaraTab` permite selecionar qualquer modelo do catálogo OpenRouter. Qwen mantido como padrão.)
- [x] Adicionar confirmação de impacto/custo antes de alterar modelo e mecanismo para restaurar o modelo anterior. (2026-07-14: dialog de confirmação com comparativo de preços lado a lado — entrada/saída por 1M tokens — e aviso quando o modelo não é o padrão Qwen. O modelo anterior é sempre visível no cabeçalho da seção para referência.)
- [x] Criar testes de isolamento A→B: configuração, catálogo, modelo selecionado e uso da Clara de uma conta nunca podem afetar outra — **Feito (2026-07-15):** `__tests__/integration/clara-settings-roundtrip.test.ts`, 14/14 verde contra o banco de teste — roundtrip de settings pelo write path da UI, B não lê/escreve/audita A, modelo isolado por conta, disable isolado, CHECK de formato + blocklist no banco. **Achado e corrigido no mesmo dia:** `anthropic/*` e `openai/*` eram aceitos em todos os enforcement points — agora rejeitados na edge function `clara-settings` (HTTP 422) e no CHECK do banco (migration `20260920000000`).

**Guard de custo atual:** `qwen/qwen3.6-plus` é o modelo padrão para `bot-chat`/`prevendas-ai`. A seleção de outros modelos da OpenRouter é permitida via Configurar Clara, com validação de formato server-side. Modelos `anthropic/*` e `openai/*` continuam proibidos por custo.

### Fase 7: Módulo ORIGEM ✅ CONCLUÍDO
- [x] CRUD para origin_groups — aba `OrigemTab` em Traqueamento (tabelas `utm_origins` + `utm_source_origin_assignments`)
- [x] Interface de agrupamento de origens
- [x] Associação com utm_sources

### Fase 8: Módulo PROCESSO DE VENDAS 🔒 LEGADO
> **Decisão (2026-07-14):** removido do escopo ativo. As tabelas `sales_processes` e `sales_process_assignments` existem no banco (`20260225100300_create_tracking_module_tables.sql`) mas a aba de frontend foi descartada. Para retomar, usar `FunisTab.tsx` como referência de implementação — a mecânica é idêntica (CRUD + atribuição campanha→processo), a diferença é que `sales_process_assignments` tem `UNIQUE(workspace_id, utm_campaign_id)` (1-para-1) em vez da matriz de checkboxes do Funis.

### Fase 9: Módulo ANÚNCIOS ✅ CONCLUÍDO
- [x] CRUD para ad_campaigns — sub-aba `campanhas` em `AnunciosTab` (tabela `ads_campaigns`)
- [x] Catálogo de criativos — sub-aba `catalogo_criativos` em `AnunciosTab` (tabela `ads_catalog`)
- [x] Vinculação com Meta Ads — sub-aba `meta_ads` em `AnunciosTab` com métricas reais (RPC `get_meta_ads_campaign_metrics`, sync de campanhas em `sync-meta-ads`)

### Fase 10: Módulo ORGÂNICO ✅ CONCLUÍDO
- [x] CRUD para organic_content — sub-aba `catalogo` em `OrganicoTab` (tabela `organic_catalog`)
- [x] Categorização de conteúdo — sub-aba `producao` em `OrganicoTab` + `CreativeProductionPanel`
- [x] Métricas de engajamento — página `/organico` com 4 abas (Visão Geral, Matriz, Leads, Meta MQL)

### Fase 11: Módulo FUNIS ✅ CONCLUÍDO
- [x] CRUD para funnels — aba `FunisTab` em Traqueamento (tabela `funnels`)
- [x] Estágios do funil — hierarquia campanhas×funis com matriz de checkboxes + rename com cascade
- [x] Vinculação com campanhas — toggle funil por campanha + page_code editável

### Fase 12: Integrações ✅ CONCLUÍDO
- [x] Webhook GHL para sincronização — edge function `webhook-ghl` (webhook principal) + `extrair_dados_ghl()`
- [x] Sync Meta Ads para insights — edge functions `sync-meta-ads` + `sync-meta-ads-backfill` + `sync-ad-permalinks`
- [x] Automação de importação — fila centralizada `ghl_api_jobs` + worker `ghl-api-worker` + crons (tags, pipelines, dates, SDR, conversas, tasks)

### Fase 13: Relatórios ✅ CONCLUÍDO
- [x] Dashboard de performance — página `/relatorios` com 6 abas (Cohort, Produtividade, Comparativo, Tendências, Automações, Configurar Clara)
- [x] Relatórios de tracking — edge function `compute-weekly-reports` (9 módulos × 2 tipos) + backfill automático
- [x] Exportação de dados — snapshots semanais em `weekly_snapshots` + views `v_weekly_reports_latest`

### Fase 14: Módulo RELATÓRIOS — Painel Semanal Persistido (Cohort + Produtividade)
> **Plano completo:** [`docs/PLANO-RELATORIOS-SEMANAIS.md`](PLANO-RELATORIOS-SEMANAIS.md)

Criar schema de relatórios semanais com **tabelas tipadas por módulo** + tabela central `weekly_snapshots`, separando rigorosamente **Cohort** (retroativo, mutável) de **Produtividade** (imutável após fechamento).

#### Arquitetura
- **Tabela principal:** `weekly_reports` — uma linha por `(semana, tipo, módulo, dimensão, valor)`
- **Tabela auxiliar:** `weekly_reports_reprocess_queue` — fila para reprocessar semanas de cohort quando novos pagamentos ocorrem
- **View:** `v_weekly_reports_latest` — sempre retorna a versão mais recente de cada snapshot

#### Métricas cobertas (9 módulos)
| Módulo | Tipo Cohort | Tipo Produtividade |
|--------|------------|-------------------|
| Tráfego | Leads, MQLs, funil, faturamento, caixa, investimento Meta, ROAS, CPMQL | Eventos por mês, spend |
| Aquisição | Mesmo que Tráfego + orgânico | Eventos por mês |
| Orgânico | Mesmo que Aquisição sem investimento | Eventos por mês |
| Pré-Vendas | Leads, MQLs, conectados, agendados, reuniões por SDR | Ligações, mensagens, tempo resposta |
| Vendas | Leads, MQLs, reuniões, no-shows, negociação, fechados por Closer | Ligações, mensagens, pessoas contatadas |
| Recuperação | Espelho de Pré-Vendas (pipeline Recuperação) | Ligações, mensagens |
| SDR | Leads, conectados, agendados, taxas por SDR | Ligações, mensagens, tempo resposta |
| Closer | Reuniões, fechados, faturamento, caixa por Closer | Ligações, mensagens, tempo resposta |
| Metas | Meta MQL, CPMQL, Spend, Vendas | Realizado vs meta, % atingido, ideal-dia |

#### Regras críticas
1. **Cohort é mutável:** leads gerados na semana X podem vender meses depois. Toda vez que `vendas_fechamento.data_pagamento_entrada` é preenchido, a semana do `data_lead_recebido` é enfileirada para reprocessamento.
2. **Produtividade é imutável:** uma vez computada na segunda-feira seguinte, nunca muda. Erros exigem reprocessamento manual.
3. **Backfill retroativo:** desde janeiro/2026 (início dos dados) até a semana atual. Batches de 4 semanas por execução para evitar timeout.
4. **Granularidade:** semana comercial (segunda → domingo), identificada por `week_start` (DATE).

#### Cron jobs
- `weekly-reports-produtividade` — toda segunda 03:00 BRT
- `weekly-reports-cohort` — toda segunda 04:00 BRT
- `weekly-reports-cohort-reprocess` — a cada 30 minutos
- `weekly-reports-finalize` — terças 06:00 BRT (marca semanas antigas como `is_final = TRUE`)

#### Frontend
- Nova rota `/relatorios` com 4 tabs:
  - **Cohort:** tabela semanal com drilldown por dimensão
  - **Produtividade:** tabela semanal imutável
  - **Comparativo:** lado a lado de 2 semanas/períodos com delta %
  - **Tendências:** gráfico de linha temporal por métrica selecionada
- Hook `useWeeklyReports.ts` para leitura otimizada dos snapshots

#### Tasks de implementação
- [x] Task 1: Migration schema completo (`weekly_snapshots` + 9 tabelas tipadas + `weekly_cohort_audit` + `weekly_reprocess_queue` + views + índices + RLS)
- [x] Task 2: Edge function `compute-weekly-reports` (produtividade — todos os 9 módulos)
- [x] Task 3: Edge function `compute-weekly-reports` (cohort — todos os 9 módulos)
- [x] Task 4: Trigger em `vendas_fechamento` para enfileirar reprocessamento cohort
- [x] Task 5: Cron jobs de automação (produtividade + cohort + reprocess + finalize)
- [x] Task 6: Backfill retroativo (dez/2025 → hoje) — concluído para os 9 módulos (validação 2026-05-18: 18 snapshots/semana, 0 divergências em semanas finalizadas)
- [x] Task 7: Hook `useWeeklyReports.ts`
- [x] Task 8: Página `RelatoriosPage.tsx` + 4 tabs
- [x] Task 9: Componentes de tabela e gráfico
- [x] Task 10: Rota `/relatorios` + Sidebar
- [x] Task 11: Scripts de validação SQL automatizados (snapshot vs real)
- [x] Task 12: Documentação em `docs/PLANO-RELATORIOS-SEMANAIS.md` + `docs/AUDITORIA-RELATORIOS-2026-05-19.md`

### Fase 15: Múltiplas contas de anúncio Meta por workspace

**Status:** ✅ **IMPLEMENTADA E EM PRODUÇÃO (2026-07-17)** — ver entrada do dia em "✅ Concluído" e design em [`docs/FASE-15-MULTI-CONTA-META.md`](FASE-15-MULTI-CONTA-META.md). Restam apenas fatias futuras sem demanda: filtro por conta em Aquisição/Pré-Vendas e abordagem 2 (uma credencial por conta, para Business Managers diferentes).

**Problema hoje:** um workspace só pode conectar **uma** conta de anúncios Meta por vez. Cliente com múltiplas contas (ex: uma por marca, uma por região, agência gerenciando várias contas do mesmo dono) não tem como somar/comparar o investimento de todas dentro do mesmo painel — precisaria trocar a chave BYOK toda vez que quisesse ver outra conta.

**Causa raiz confirmada no código (2026-07-14):**
- `workspace_integration_credentials` tem `UNIQUE(workspace_id, provider)` (`supabase/migrations/20260723000000_fase2_workspace_integration_credentials.sql:33`) — só permite **uma** credencial `provider='meta'` por workspace, e essa credencial carrega um único `metadata.ad_account_id`.
- `supabase/functions/sync-meta-ads/index.ts:513-517` lê exatamente `cred.metadata.ad_account_id` como string única — o sync já foi escrito assumindo 1 conta.
- **Achado que baixa o custo da mudança:** as tabelas de dados (`meta_ads_account_daily`, `meta_ads_campaigns`, `meta_ads_insights`) **já têm `account_id` como coluna própria** e não são únicas por `workspace_id` sozinho (`meta_ads_account_daily` é `UNIQUE(account_id, date)`) — a camada de armazenamento já aguenta múltiplas contas por workspace sem migration de schema. O gargalo real está só na camada de **credencial** (BYOK) e no **loop do sync**, não no modelo de dados.

**Abordagens possíveis (nenhuma decidida ainda):**
1. **Um Private Integration Token da Meta, múltiplos `ad_account_id`** — se a Meta permitir 1 token de sistema acessando várias contas de anúncio da mesma Business Manager, bastaria trocar `metadata.ad_account_id: string` por `metadata.ad_account_ids: string[]` na credencial existente (sem quebrar a `UNIQUE(workspace_id, provider)`) e fazer `sync-meta-ads` iterar a lista. Mudança mais barata, mas depende de confirmar que o token cobre todas as contas desejadas.
2. **Uma credencial por conta de anúncio** — remover a constraint `UNIQUE(workspace_id, provider)` (trocar por `UNIQUE(workspace_id, provider, (metadata->>'ad_account_id'))` ou tabela de junção dedicada), permitindo tokens diferentes por conta. Mais flexível (cobre o caso de contas em Business Managers diferentes, sem token compartilhado), mas exige repensar a UI de "Chaves de API" (hoje assume 1 card por provider) e o `get_workspace_credential_status`/`save_workspace_credential` (hoje retornam/gravam 1 linha por provider).

**Decisões do dono (2026-07-15):**
- **Modelo de dados:** abordagem **1** (um Private Integration Token da Meta + `metadata.ad_account_ids: string[]`, contas sob a mesma Business Manager) — **MAS** o schema e o contrato de `save_workspace_credential`/`get_workspace_credential_status` devem ser **desenhados já prevendo a evolução para a abordagem 2** (uma credencial por conta), para o caso de contas que **não** estão na mesma Business Manager. Ou seja: implementar o caminho barato sem queimar a ponte do caminho flexível.
- **UI:** investimento **somado de todas as contas por padrão, com filtro por conta individual** (aprovado).
- **Prioridade:** **não é prioridade agora** — fica como última fase do roadmap, como débito conhecido documentado, até haver demanda real de cliente.

**Próximo passo, se aprovado:** desenhar a migration (RLS + constraint) e o novo contrato de `save_workspace_credential`/`get_workspace_credential_status` para múltiplas contas por provider — nesse momento, seguir o gate de UML (`docs/UML.md`) antes de qualquer migration, por ser mudança de relacionamento crítico (credencial ↔ conta de anúncio).

---

## 🎯 Próximas Prioridades

> Atualizado 2026-07-16.

1. **🔴 Segurança — produção:** migrations `20260918000000`, `20260919000000` e `20260920000000` aplicadas em produção em 2026-07-15 ✅; `20260921000000_revoke_internal_security_definer.sql` (36 funções) aplicada em 2026-07-16 ✅; **`20260927000000` (P0) + `20260928000000` (P2) de hardening multi-tenant aplicadas em 2026-07-17 ✅** (8 vazamentos cross-tenant fechados, 16 functions mortas deletadas, 4 functions redeployadas fail-closed — ver `docs/MUDANCAS.md`). Resta apenas: **rotacionar a service_role key** (ação do dono no dashboard, depois eu atualizo `public.secrets.service_role_key` + `.env.local` — runbook pronto).
2. **Multi-tenant — burn-in:** isolamento cross-tenant agora é **total** (auditoria 2026-07-17 fechou as 8 brechas restantes de RLS + `contatos` sem DEFAULT silencioso). Falta o **reteste interativo do dono** (login ferramentas@… → `/workspace/ghl-config` → Testar conexão + discovery — esperado: sem "Descoberta parcial") + checklist do runbook §5 + observar 1 ciclo de cron antes de liberar o primeiro cliente pagante adicional (`ROADMAP-MULTI-TENANT.md` §7.7).
3. **Meta Ads — isolamento multi-tenant:** ✅ **Concluído em produção em 2026-07-16** (auditoria 0 NULLs/0 órfãos, EFs `sync-meta-ads` v37 e `sync-meta-ads-backfill` v31 re-deployadas, E2E verde). Novas contas Meta já podem ser conectadas seguindo o fluxo com `workspace_meta_ad_accounts` — pré-condição da Fase 15 cumprida.
4. **Decisões do dono (2026-07-15/16):** Fase 1 do plano de arquitetura de informação **aprovada** (em execução); deploy do `webhook-ghl` fail-closed por workspace **aprovado e concluído em 2026-07-16**; Fase 15 (múltiplas contas Meta Ads) **decidida — fim do roadmap** (ver seção), com pré-condição (item 3) já cumprida em 2026-07-16; rollback operacional das migrations + aviso de collation **aprovado** (documentado em `docs/ROLLBACK-MULTI-TENANT.md`, produção íntegra quanto a collation); `defaultTheme` light **sem resposta — mantém dark**; fix do cron `sync-tags-from-webhook` (janela de 7 dias) **aprovado e aplicado em 2026-07-16**.
5. **Bugs conhecidos menores:** semanas duplicadas no eixo X da aba Tendências — **fix implementado 2026-07-15** (`trendData.ts`, 9 testes verde, E2E validado: 8 gráficos × 8 semanas únicas; **commitado em 2026-07-16**); clamp de modelo proibido — **commitado em 2026-07-16**; triagem das ~118 funções SECURITY DEFINER — **concluída 2026-07-15** (ver item 1).

---

## 📊 Métricas de Progresso

| Módulo | Status | Progresso |
|--------|--------|-----------|
| Setup | ✅ Concluído | 100% |
| Autenticação | ✅ Concluído | 100% |
| Design System | ✅ Concluído | 100% |
| Layout Dashboard | ✅ Concluído | 100% |
| Pré-Vendas | ✅ Concluído + Bugfixes 12x | 100% |
| Traqueamento | ✅ Concluído Premium | 100% |
| Origem | ✅ Concluído (OrigemTab) | 100% |
| Processo Vendas | 🔒 Legado (DB existe, sem UI) | 50% |
| Anúncios | ✅ Concluído (AnunciosTab + Meta Ads) | 100% |
| Orgânico | ✅ Concluído (OrganicoTab + /organico page) | 100% |
| Funis | ✅ Concluído (FunisTab) | 100% |
| Integrações | ✅ Concluído (GHL + Meta + fila) | 100% |
| Relatórios Semanais | ✅ Concluído | 100% |
| Clara Config | ✅ Concluído (deploy 2026-07-14) | 100% |
| Multi-Tenant Agency | ✅ Produção (34 migrations + 20 EFs) | 95% |
| Modelo IA Configurável | ✅ Concluído (4 EFs leem model_id) | 100% |
| Inscrições Formulário | ✅ Concluído (/leads?tab=inscricoes) | 100% |
| Email Automático | ✅ Concluído (Automações + Resend) | 100% |

---

## 📅 Última Atualização

2026-07-17 BRT — **Hardening multi-tenant P0+P2: 8 vazamentos cross-tenant fechados em produção.**
Auditoria ao vivo de `pg_policies` (pedido do dono: "o que falta pra terminar o
multi-tenant sem vazamento?") confirmou 8 tabelas vazando entre workspaces.
Branch `fix/multi-tenant-rls-hardening` (6 commits): migrations `20260927000000`
(P0) e `20260928000000` (P2) aplicadas em produção — `workspace_id NOT NULL` +
backfill + triggers + policies por linha em `ghl_tasks`, `maquina_de_conteudo`,
`webhooks_ghl`, `reunioes`, `bot_context`, `stevo_whatsapp_calls`, `audit_log`,
12× `weekly_*`, `ghl_users`, `ghl_calendars`, `meta_ads_sync_log`; `app_config`
com anon restrito a whitelist; `contatos` sem DEFAULT silencioso. Fallbacks de
env global removidos de `compute-weekly-reports`, `notion-creatives-sync` e
`external-form-submissions` (+ `bot-chat` filtrando `bot_context` — 4 functions
redeployadas). **16 functions mortas deletadas de produção** (incluindo
`audit-leads-fev`, endpoint público sem auth) — produção agora tem exatamente
as 44 functions do repo. Provas: suite **592/592** no banco de teste, gate de
segurança PASS, verificação pós-deploy (0 NULLs, tráfego novo entrando com
`workspace_id` via trigger). Detalhe: `docs/MUDANCAS.md`.

2026-07-16 BRT — **Isolamento multi-tenant do Meta Ads implementado e testado:**
criadas as migrations `20260924000000_fix_meta_ads_tenant_isolation.sql`,
`20260924000001_add_meta_ads_account_workspace_trigger.sql` e
`20260924000002_fix_meta_ads_raw_trigger_account.sql`; criada a tabela
`workspace_meta_ad_accounts` com seed do workspace Default → `act_716772443330289`;
constraints `UNIQUE` ajustadas para incluir `workspace_id`; `NOT NULL` aplicado em
`meta_ads_raw_insights`, `meta_ads_insights_breakdowns`, `meta_ads_campaigns` e
`meta_ads_account_daily`; policies RLS fail-closed; edge functions `sync-meta-ads`
e `sync-meta-ads-backfill` validam a conta contra `workspace_meta_ad_accounts`;
triggers no banco reforçam o vínculo conta ↔ workspace. Teste A→B novo
(`__tests__/integration/meta-ads-isolation.test.ts`, 8 testes) e suite completa de
integração: **536 passed**. Aplicação em produção depende de auditoria das queries
na seção 5 de [`docs/META-ADS-ISOLAMENTO-AUDITORIA.md`](META-ADS-ISOLAMENTO-AUDITORIA.md).

2026-07-15 BRT - **Bateria multi-agente de pendências do roadmap (8 frentes):** testes A→B de isolamento OpenRouter BYOK e Clara settings criados e verdes no banco de teste (24 + 14 testes); testes unitários de `useTrafego`/`useCohort` (104/104 frontend); link de gravação da aba Reuniões confirmado já extraído corretamente (campo GHL quase nunca preenchido — subutilização, não bug); varredura camada 3 do design system concluída (hex→tokens em todos os gráficos + fix `colors.ts` + fix `GoalPerformanceCard` dark); GRANTs de produção verificados — 2 vulnerabilidades críticas (`get_secret` expondo service_role key a anon; `seed_workspace_credential_service_role` gravável por anon) com migration `20260918000000` pronta; `revoke_workspace_credential` quebrada em produção (vault 0.3.1 sem `delete_secret`) com migration `20260919000000` pronta; enforcement anthropic/openai na Clara (edge function + migration `20260920000000`); `vitest.integration.config.ts` restaurado (regressão de 2026-07-14); E2E Playwright com usuário de teste validou todas as telas alteradas em light+dark. **3 migrations aguardam autorização para deploy em produção + rotação da service_role key.**

2026-07-14 BRT - **Sistema de Email Automático auditado e documentado:** Infra completa em produção — `weekly_email_schedules` (agendamentos), `weekly_email_logs` (histórico), edge function `send-weekly-report-email` (581 linhas — Resend API, Clara summary, templates), RPCs CRUD, cron dispatcher (`0 * * * *`), UI `AutomacoesTab` + `AutomationForm` com sugestão por IA. Suporta frequências diária/semanal/quinzenal/mensal, 9 módulos, 3 templates, resumo da Clara, destinatários por sub-conta. `pg_net` + `RESEND_API_KEY` + `SUPABASE_URL` configurados. Acessível em `/relatorios?tab=automacoes`.

2026-07-14 BRT - **Avanço do ROADMAP:** 5 UTM sub-tabs marcados como concluídos (já implementados em CodsUtmTab.tsx). Módulos Origem, Anúncios, Orgânico e Funis atualizados para "Concluído" (já existiam como abas no Traqueamento + /organico standalone). Processo de Vendas movido para legado (tabelas DB existem, aba de frontend descartada). Progresso real documentado.

2026-07-07 BRT - **Fase 3 do mapeamento GHL multi-conta concluída:** Interface frontend `WorkspaceGhlConfigPage` criada em `/workspace/ghl-config`, com configuração segura de credenciais, URL de webhook copiável, discovery de campos/pipelines/stages e mapeamento visual com sugestões automáticas. Hooks TanStack Query, tipagens e documentação em `docs/GHL-CONFIG-UI.md`.

2026-07-07 BRT - **Fase 2 do mapeamento GHL multi-conta concluída:** Edge function `discover-ghl-config` criada e configurada para descobrir custom fields e pipelines de contas GHL, validar JWT internamente, verificar owner/admin, aplicar rate limiting, registrar auditoria em `ghl_discovery_runs` e retornar JSON normalizado. Documentação em `docs/GHL-DISCOVERY.md`.

2026-07-07 18:47 BRT - **Fase 1 do mapeamento GHL multi-conta concluída:** Migration `20260707000000_create_ghl_mapping_foundation.sql` com 6 tabelas (`ghl_integration_settings`, `ghl_field_mappings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `ghl_field_mapping_templates`, `ghl_discovery_runs`), RLS ativado, seed do template `Empire Default` e documentação em `docs/GHL-MAPEAMENTO-CAMPOS.md`.

2026-05-18 20:45 BRT - **Schema de Relatórios Semanais criado:** Migration `20260518200000_weekly_reports_schema.sql` com tabela central `weekly_snapshots`, 9 tabelas tipadas por módulo, audit, reprocess queue, views e RLS. Documentação em `docs/PLANO-RELATORIOS-SEMANAIS.md`.

2026-05-18 ~21:30 BRT - **Validação end-to-end completa + correções críticas:**
- ✅ Configurado `app_config` + `weekly_reports_auth_header()` para cron jobs autenticarem na edge function (migração `20260518203000_fix_cron_auth_tokens.sql` atualizada — tabela `app_config` substitui `ALTER DATABASE SET` que não era permitido no Supabase)
- ✅ Edge function reimplantada com correção do módulo `metas` (usa tabela `metas` no formato long/pivotado em vez de `metas_ads` inexistente)
- ✅ Backfill de metas corrigido: targets preenchidos para semanas de março/2026 (`mql_count_trafego=200`, `custo_mql_trafego=200`, `agendamentos_sdr=70`)
- ✅ Validação SQL para 9 módulos × 2 tipos = 18 snapshots por semana
  - Semanas finalizadas (2026-01-13, 2026-02-03, 2026-03-10): **0 divergências** em todos os módulos
  - Semana recente 2026-05-05: 1 divergência esperada em `trafego.cohort.perdidos_count` (snapshot=6, real=9) — leads marcados como perdido após o snapshot; será corrigida pelo cron de reprocess (a cada 30min)
- ✅ Scripts de validação (`validar-snapshots.sql`, `validar-cron.js`) atualizados para refletir schema real do banco

2026-03-23 - **Limpeza de schema em contatos:** coluna `hashtags` removida de `contatos` após verificação de que não era mais populada pelo backend, não participava de regra de negócio e tinha `0` linhas úteis no banco acessado pelo app. Migration: `20260324032000`. Ver `docs/MUDANCAS.md`.

2026-03-23 - **Bug fix na busca da aba Leads:** `useLeads.ts` parou de filtrar `search` e `utmSource` só na página atual. Agora os filtros de `contatos` rodam no Supabase antes da paginação, então um lead da página 5 aparece na busca mesmo quando o usuário está na página 1. Ver `docs/MUDANCAS.md`.

2026-03-23 - **Novo campo op_vencimentos_e_parcelas:** coluna TEXT em `oportunidades` para cronograma de parcelas de boleto enviado pelo GHL. Migrations: `20260323020000` (ALTER TABLE) + `20260323020001` (extrair_dados_ghl atualizada). Ver `docs/MUDANCAS.md` seção 2026-03-23.

2026-03-20 - **Contadores de oportunidades por contato:** novas colunas `total_oportunidades_ghl` e `total_oportunidades_db` em `contatos`, atualizadas pela reconciliação noturna `mode=write` para detectar defasagem entre GHL e banco por contato. Ver `docs/SYNC-CONTACT-OPPORTUNITIES.md`.

2026-03-19 - **Tags de Contato GHL:** coluna `tags` em `contatos`, edge function `sync-contact-tags` (cron 15min), `extract_ghl_tags()` para array JSON→CSV, `isMqlByTag()` substituindo detecção por pipeline, badges coloridos no LeadCard. Ver `docs/webhooks-ghl/DECISOES/20260319-tags-contato-ghl.md`.

2026-03-15 - **2ª Auditoria de Timezone:** sistema limpo, nenhum bug remanescente. Refactor menor em `TrafegoTab.tsx` e `PreVendasPage.tsx` (preset "Este mês"). Nova seção em `PADRAO-TIMEZONE.md` documentando UTC vs `toSPISOStart/End`. Ver [`docs/MUDANCAS.md`](MUDANCAS.md) seção 2026-03-15.
