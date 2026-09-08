# Relatório de Auditoria — Módulo Relatórios Semanais

> **Branch:** `feat/relatorios-semanais-schema`  
> **Data da Auditoria:** 2026-05-19  
> **Auditor:** Sistema OMNX Code (Auditor de Qualidade)  
> **Escopo:** Schema, Edge Function, Frontend, Scripts, Documentação

---

## 1. Resumo Executivo

**Nota Geral: C (Requer Ações Imediatas)**

O módulo de Relatórios Semanais foi implementado com arquitetura sólida (tabelas tipadas por módulo + central `weekly_snapshots`, views unificadas, RLS, audit trail e fila de reprocessamento). No entanto, **foram encontrados 2 problemas CRÍTICOS de segurança** que bloqueiam qualquer merge para produção, além de 3 problemas ALTOS de consistência entre schema e frontend que tornariam a tela inoperante.

### Principais Achados

| Severidade | Quantidade | Destaque |
|------------|-----------|----------|
| 🔴 **CRÍTICO** | 2 | Service role key e anon key expostos em código commitado |
| 🟠 **ALTO** | 4 | Mismatch de colunas, mismatch de module name, dimension filter incorreto, side-effect em Date |
| 🟡 **MÉDIO** | 5 | Documentação desatualizada, stubs não implementados, trigger sem INSERT RLS, limit/range redundante |
| 🟢 **BAIXO** | 3 | Índice redundante, console.log em produção aceitável, TODOs não criticados |

---

## 2. Achados por Categoria

### 🔒 Segurança

#### [CRÍTICO] Service Role Key exposta em 3 migrations de cron
- **Arquivos:**
  - `supabase/migrations/20260519215445_cron_weekly_reports_produtividade.sql` (linha 29)
  - `supabase/migrations/20260519215446_cron_weekly_reports_cohort.sql` (linha 28)
  - `supabase/migrations/20260519215447_cron_weekly_reports_cohort_reprocess.sql` (linha 36)
- **Problema:** O token JWT completo do `service_role` está hardcoded no header `Authorization` das chamadas `net.http_post`. Isso viola a regra absoluta do projeto: *"NUNCA exponha chaves de API, tokens ou secrets em código commitado"*.
- **Impacto:** Qualquer pessoa com acesso ao repositório obtém poder de superusuário no Supabase.
- **Correção:** Usar `current_setting('app.settings.supabase_service_role_key', true)` ou variável de ambiente do Supabase. Nunca commitar o token.

#### [CRÍTICO] Anon Key exposta no script de backfill
- **Arquivo:** `scripts/backfill-weekly-reports.js` (linha 7)
- **Problema:** A `SUPABASE_ANON_KEY` está hardcoded como fallback (`|| 'eyJhbGciOiJIUzI1Ni...'`).
- **Impacto:** A chave anônima exposta permite abuso de rate-limit e invocação não autorizada da edge function.
- **Correção:** Remover o fallback hardcoded. Exigir `process.env.SUPABASE_ANON_KEY` e falhar explicitamente se ausente.

#### [BAIXO] Trigger `tr_weekly_reprocess_on_payment` sem INSERT policy na fila
- **Arquivo:** `supabase/migrations/20260518200000_weekly_reports_schema.sql`
- **Problema:** `weekly_reprocess_queue` tem RLS com policy apenas `SELECT`. O trigger tenta `INSERT` nesta tabela. Se o trigger for disparado por uma operação de usuário autenticado (não service_role), o INSERT falhará silenciosamente.
- **Mitigação:** Na prática, `vendas_fechamento` só é atualizado por edge functions (service_role), mas a defesa em profundidade exige uma policy `INSERT` para `authenticated` ou garantir que o trigger rode como `SECURITY DEFINER`.

#### ✅ RLS habilitado em todas as 12 tabelas
- Todas as tabelas do módulo (`weekly_snapshots`, `weekly_trafego`, `weekly_aquisicao`, `weekly_organico`, `weekly_prevendas`, `weekly_vendas`, `weekly_recuperacao`, `weekly_sdr`, `weekly_closer`, `weekly_metas`, `weekly_cohort_audit`, `weekly_reprocess_queue`) têm `ENABLE ROW LEVEL SECURITY` e política `SELECT` para `authenticated`.

#### ✅ Nenhuma service_role_key no frontend
- O frontend usa o Supabase client padrão (anon key), sem exposição de service role.

#### ✅ Sem SQL injection
- Todos os queries usam Supabase client (parameterized queries) ou `jsonb_build_object` nas migrations.

---

### 💻 Qualidade de Código

#### [ALTO] Mismatch de nomes de colunas: `faturamento_bruto` vs `faturamento`
- **Arquivos:**
  - `eb-dash2/src/hooks/useWeeklyReports.ts` (interface `WeeklyReportRow`)
  - `eb-dash2/src/components/relatorios/WeeklyReportTable.tsx`
  - `eb-dash2/src/components/relatorios/WeeklyComparativeTable.tsx`
  - `eb-dash2/src/components/relatorios/TrendChart.tsx`
- **Problema:** A view `v_weekly_dashboard` expõe `faturamento_bruto` e `caixa_recebido`. O hook e todos os componentes esperam `faturamento` e `caixa`. O Supabase client mapeia por nome exato — esses campos virão `undefined`.
- **Impacto:** Todas as telas de relatórios exibirão `R$ 0` para faturamento e caixa, independentemente dos dados reais.
- **Correção:** Alinhar a interface `WeeklyReportRow` com os nomes reais da view, ou criar aliases na view.

#### [ALTO] Mismatch de module name: `pre_vendas` vs `prevendas`
- **Arquivo:** `eb-dash2/src/pages/relatorios/RelatoriosPage.tsx` (linha 27)
- **Problema:** O seletor de módulo envia `module = 'pre_vendas'`, mas a view `v_weekly_dashboard` usa `module = 'prevendas'` (sem underscore). A query `.eq('module', 'pre_vendas')` nunca retornará linhas.
- **Impacto:** A aba "Pré-Vendas" ficará permanentemente vazia.
- **Correção:** Alterar o `value` no array `MODULES` para `'prevendas'`.

#### [ALTO] Filtro de dimensão incorreto no hook
- **Arquivo:** `eb-dash2/src/hooks/useWeeklyReports.ts` (linha 76)
- **Problema:** `query = query.eq(filters.dimension, filters.dimensionValue)` traduz para `WHERE canal = 'facebook'` em vez de `WHERE dimension = 'canal' AND dimension_value = 'facebook'`.
- **Impacto:** Filtros dimensionais nunca funcionarão. Sempre retornarão 0 resultados.
- **Correção:** `query = query.eq('dimension', filters.dimension).eq('dimension_value', filters.dimensionValue)`.

#### [ALTO] Side-effect mutante em `getWeekNumber`
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts` (linha 135–141)
- **Problema:** A função `getWeekNumber(d: Date)` chama `d.setHours(0,0,0,0)` e `d.setDate(...)` diretamente no objeto recebido, mutando-o.
- **Impacto:** Se a mesma instância de `Date` for reutilizada, o cálculo de `weekEnd` ou `year_week` pode ficar incorreto.
- **Correção:** Clonar a data antes de mutar: `const d = new Date(date.getTime());`.

#### [MÉDIO] Stubs de módulos não implementados
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts`
- **Problema:** Apenas `trafego` (produtividade + cohort) e `organico` (produtividade stub) têm implementação. Todos os demais módulos retornam `errors: ['xxx: not yet implemented']`.
- **Impacto:** Os crons automáticos gerarão snapshots `failed` ou parcialmente vazios para a maioria dos módulos.
- **Mitigação:** Documentado no PLANO como MVP. Não bloqueia o merge, mas requer priorização.

#### [MÉDIO] Redundância `limit()` + loop paginado
- **Arquivo:** `eb-dash2/src/hooks/useWeeklyReports.ts` (linhas 73, 82–89)
- **Problema:** A query base chama `.limit(weeksCount)` (ex: 12) e depois entra em um `while` loop com `PAGE_SIZE = 1000`. Como o servidor já limita a 12 registros, o loop nunca pagina.
- **Impacto:** Código morto / confusão de manutenção.
- **Correção:** Remover o loop paginado ou usar `limit(PAGE_SIZE)` no loop. Como `weeksCount` máximo provavelmente será < 1000, remover o loop é aceitável.

#### [BAIXO] `console.log` / `console.error` na edge function
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts`
- **Problema:** Presença de `console.error` e `console.warn` em erros de snapshot e deleção.
- **Avaliação:** Em edge functions do Supabase, logs vão para o painel de logs. Isso é aceitável para observabilidade, mas idealmente usar um formato estruturado.
- **Status:** Justificado para debug operacional.

#### [BAIXO] `ciclo_compra_dias` nunca calculado
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts`
- **Problema:** A coluna `ciclo_compra_dias` existe no schema mas nunca é preenchida na função de cálculo de tráfego.
- **Impacto:** Sempre `NULL` para tráfego.

---

### 🔗 Consistência

#### ✅ View `v_weekly_dashboard` é usada corretamente
- O hook `useWeeklyReports.ts` lê de `v_weekly_dashboard` com filtros por `module` e `report_type`. A view existe e faz UNION ALL de todos os módulos.

#### ❌ Hook não lê dados que a edge function produz (parcialmente)
- A edge function produz `faturamento_bruto` / `caixa_recebido`, mas o hook espera `faturamento` / `caixa`. Ver achado [ALTO] acima.
- A edge function produz `module = 'prevendas'`, mas o frontend envia `module = 'pre_vendas'`. Ver achado [ALTO] acima.

#### [MÉDIO] PLANO desatualizado vs schema real
- **Arquivo:** `docs/PLANO-RELATORIOS-SEMANAIS.md`
- **Problema:** O item 5.4 e a tabela de cron jobs mencionam `is_final = TRUE`, mas o schema real usa `status = 'finalized'` + `finalized_at`. Não existe coluna `is_final`.

#### [MÉDIO] ROADMAP desatualizado
- **Arquivo:** `docs/ROADMAP.md`
- **Problema:** A seção Fase 14 ainda descreve o design antigo EAV (`weekly_reports`, `weekly_reports_reprocess_queue`, `v_weekly_reports_latest`) em vez do schema tipado implementado.

#### [MÉDIO] ARQUITETURA.md sem módulo Relatórios
- **Arquivo:** `docs/ARQUITETURA.md`
- **Problema:** A seção "Módulos do Dashboard" não lista `/relatorios` na tabela de rotas.

#### [MÉDIO] MUDANCAS.md sem changelog das migrations de cron/trigger
- **Arquivo:** `docs/MUDANCAS.md`
- **Problema:** O changelog de 2026-05-18 cita apenas a migration do schema. Não há menção às migrations de 2026-05-19 (trigger + 4 crons).

---

### ⚡ Performance

#### [MÉDIO] Edge function faz ~13 queries sequenciais por módulo
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts`
- **Problema:** `computeTrafegoProdutividade` dispara queries sequenciais para leads, mqls, conectados, agendados, reuniões, fechados, no-shows, negociação, perdidos, faturamento, caixa, meta ads. Cada uma é uma round-trip de rede.
- **Impacto:** Para uma semana normal, isso pode levar 3–8 segundos só para tráfego. Com 9 módulos, o timeout de 50s pode ser estourado.
- **Recomendação:** Consolidar em uma RPC SQL que retorna todas as métricas de uma vez por módulo, ou usar `Promise.all` para queries independentes.

#### [MÉDIO] Cohort `computeTrafegoCohort` traz base completa para JS
- **Arquivo:** `supabase/functions/compute-weekly-reports/index.ts`
- **Problema:** A função faz `select('*')` de todas as oportunidades da semana e depois usa `.filter()` em JavaScript para contar eventos.
- **Impacto:** Semanas com milhares de leads carregam payloads enormes na edge function.
- **Recomendação:** Usar COUNT com filtros SQL, não carregar todas as linhas.

#### ✅ Índices cobrem queries principais
- `idx_weekly_snapshots_week_type` cobre `week_start + report_type`.
- `idx_weekly_trafego_snapshot` cobre `snapshot_id`.
- Índice parcial `idx_weekly_reprocess_pending` cobre fila pendentes.

#### ✅ Frontend não necessita paginação real
- O hook limita a 12 semanas (default). Isso está abaixo do limite PostgREST de 1000.

---

### ✅ Testes

#### ❌ Sem testes automatizados
- Não há testes para a edge function `compute-weekly-reports`.
- Não há testes para os componentes de frontend (`WeeklyReportTable`, `TrendChart`, etc.).
- Não há testes de integração para o fluxo completo (cron → edge function → banco → frontend).

#### ✅ Dry run funciona
- A edge function aceita `dry_run: true` e retorna os dados calculados sem persistir. Os logs incluem `[DRY RUN]`.

#### ✅ Cohort vs Produtividade produzem lógicas diferentes
- A implementação de tráfego separa corretamente: produtividade filtra por data do evento; cohort filtra por `data_lead_recebido` e conta eventos cumulativos.

#### ✅ Trigger dispara corretamente
- O trigger `tr_weekly_reprocess_on_payment` dispara em `AFTER INSERT OR UPDATE OF data_pagamento_entrada` e enfileira a semana correta.

#### ✅ Crons estão agendados
- As 4 migrations de cron contêm `cron.schedule` com nomes únicos e frequências documentadas.

---

### 📚 Documentação

| Documento | Status | Observação |
|-----------|--------|------------|
| `docs/PLANO-RELATORIOS-SEMANAIS.md` | 🟡 Parcial | Schema batido, mas `is_final` desatualizado |
| `docs/ARQUITETURA.md` | 🟡 Parcial | Falta módulo `/relatorios` na lista de módulos |
| `docs/MUDANCAS.md` | 🟡 Parcial | Falta changelog das migrations de 2026-05-19 |
| `docs/ROADMAP.md` | 🔴 Desatualizado | Ainda menciona design EAV antigo |
| `CLAUDE.md` | ✅ Atualizado | Índice aponta para PLANO corretamente |

---

## 3. Recomendações (Ações Corretivas)

### 🔴 Prioridade CRÍTICA — Resolver antes de qualquer merge

| # | Ação | Arquivo(s) | Responsável |
|---|------|-----------|-------------|
| 1 | **Remover service role key hardcoded das 3 migrations de cron.** Substituir por `current_setting(...)` ou variável de ambiente do Supabase. | `20260519215445_*`, `20260519215446_*`, `20260519215447_*` | Backend |
| 2 | **Rotacionar imediatamente a service role key no Supabase** após remover do código, pois o token já foi commitado no histórico git. | Supabase Dashboard | DevOps |
| 3 | **Remover anon key hardcoded do script backfill.** Exigir variável de ambiente. | `scripts/backfill-weekly-reports.js` | Backend |
| 4 | **Rotacionar a anon key** se houver risco de abuso. | Supabase Dashboard | DevOps |

### 🟠 Prioridade ALTA — Resolver antes de ir para produção

| # | Ação | Arquivo(s) | Responsável |
|---|------|-----------|-------------|
| 5 | **Corrigir interface `WeeklyReportRow`** para usar `faturamento_bruto` / `caixa_recebido` (ou adicionar aliases na view). | `useWeeklyReports.ts`, `WeeklyReportTable.tsx`, `WeeklyComparativeTable.tsx`, `TrendChart.tsx` | Frontend |
| 6 | **Corrigir module name** de `'pre_vendas'` para `'prevendas'` no seletor de módulos. | `RelatoriosPage.tsx` | Frontend |
| 7 | **Corrigir filtro de dimensão** para usar `.eq('dimension', ...).eq('dimension_value', ...)`. | `useWeeklyReports.ts` | Frontend |
| 8 | **Corrigir mutação de Date** em `getWeekNumber` — clonar antes de modificar. | `compute-weekly-reports/index.ts` | Backend |

### 🟡 Prioridade MÉDIA — Resolver na próxima sprint

| # | Ação | Arquivo(s) | Responsável |
|---|------|-----------|-------------|
| 9 | **Atualizar `docs/ROADMAP.md`** — remover referências ao design EAV e refletir o schema tipado real. | `docs/ROADMAP.md` | Docs |
| 10 | **Atualizar `docs/PLANO-RELATORIOS-SEMANAIS.md`** — substituir `is_final` por `status = 'finalized'`. | `docs/PLANO-RELATORIOS-SEMANAIS.md` | Docs |
| 11 | **Adicionar módulo `/relatorios`** na tabela de módulos do `ARQUITETURA.md`. | `docs/ARQUITETURA.md` | Docs |
| 12 | **Adicionar changelog** das migrations de trigger e crons no `MUDANCAS.md`. | `docs/MUDANCAS.md` | Docs |
| 13 | **Adicionar INSERT policy** em `weekly_reprocess_queue` ou garantir que o trigger rode como `SECURITY DEFINER`. | `20260518200000_weekly_reports_schema.sql` | Backend |
| 14 | **Simplificar/remover loop paginado** no hook `useWeeklyReports` ou usar `limit(PAGE_SIZE)` corretamente. | `useWeeklyReports.ts` | Frontend |
| 15 | **Implementar stubs restantes** dos módulos (aquisição, prevendas, vendas, recuperação, sdr, closer, metas). | `compute-weekly-reports/index.ts` | Backend |
| 16 | **Adicionar validação de `modules`** no payload da edge function para rejeitar módulos inválidos. | `compute-weekly-reports/index.ts` | Backend |

### 🟢 Prioridade BAIXO — Melhorias técnicas

| # | Ação | Arquivo(s) | Responsável |
|---|------|-----------|-------------|
| 17 | **Implementar `ciclo_compra_dias`** no cálculo de tráfego. | `compute-weekly-reports/index.ts` | Backend |
| 18 | **Consolidar queries da edge function** em RPCs SQL ou `Promise.all` para reduzir round-trips. | `compute-weekly-reports/index.ts` | Backend |
| 19 | **Criar testes automatizados** mínimos para a edge function (dry_run + assertions). | `__tests__/integration/` | QA |
| 20 | **Adicionar testes de integração** para o frontend (renderização de tabs com dados mock). | `eb-dash2/tests/` | QA |

---

## 4. Lista de Verificação (Checklist)

### Segurança 🔒

- [ ] **RLS está habilitado em todas as tabelas?** ✅ Sim, 12 tabelas com `ENABLE ROW LEVEL SECURITY`.
- [ ] **Service role key NUNCA é exposta no frontend?** ✅ Frontend está limpo.
- [ ] **Service role key NUNCA é exposta em código commitado?** ❌ **CRÍTICO:** Exposta em 3 migrations de cron.
- [ ] **Anon key NUNCA é exposta em código commitado?** ❌ **CRÍTICO:** Exposta em `scripts/backfill-weekly-reports.js`.
- [ ] **Não há SQL injection nas queries?** ✅ Client Supabase em todo lugar.
- [ ] **O cron não expõe segredos?** ❌ **CRÍTICO:** Bearer token hardcoded nos crons.

### Qualidade de Código 💻

- [ ] **TypeScript strict (sem `any` indevido)?** ✅ Edge function usa tipos definidos; frontend usa `unknown` com casts seguros.
- [ ] **Tratamento de erros adequado?** 🟡 Parcial. A edge function captura erros por módulo, mas falhas de `ensureSnapshot` são fatais.
- [ ] **Sem código morto?** ❌ Loop paginado redundante no hook; stubs de módulos não implementados.
- [ ] **Sem console.log em produção (ou justificados)?** ✅ Justificados para observabilidade em edge function.

### Consistência 🔗

- [ ] **Os nomes de colunas no frontend batem com o schema?** ❌ **ALTO:** `faturamento` vs `faturamento_bruto`; `caixa` vs `caixa_recebido`.
- [ ] **A view `v_weekly_dashboard` é usada corretamente?** ✅ Sim, pelo hook.
- [ ] **O hook lê os dados que a edge function produz?** ❌ Parcialmente — mismatch de nomes de colunas e de module name.
- [ ] **O módulo `pre_vendas` / `prevendas` está alinhado?** ❌ **ALTO:** Frontend usa `pre_vendas`, view usa `prevendas`.

### Performance ⚡

- [ ] **A edge function não faz N+1 queries?** ❌ Faz ~13 queries sequenciais por módulo.
- [ ] **O frontend tem paginação se necessário?** 🟡 Não necessário para 12 semanas, mas código de paginação está presente e redundante.
- [ ] **Índices cobrem as queries principais?** ✅ Sim, cobertos por `snapshot_id`, `week_start+report_type`, e índice parcial na fila.

### Testes ✅

- [ ] **A edge function funciona com dry_run?** ✅ Sim, aceita `dry_run: true` e loga sem persistir.
- [ ] **O cohort produz resultados diferentes da produtividade?** ✅ Sim, lógicas distintas implementadas para tráfego.
- [ ] **O trigger dispara corretamente?** ✅ Sim, em `AFTER INSERT OR UPDATE OF data_pagamento_entrada`.
- [ ] **Os crons estão agendados no pg_cron?** ✅ Sim, 4 jobs agendados nas migrations.
- [ ] **Há testes automatizados?** ❌ Nenhum teste encontrado.

### Documentação 📚

- [ ] **O PLANO está atualizado com o schema real?** 🟡 Parcial. `is_final` está desatualizado.
- [ ] **O ARQUITETURA.md menciona o módulo?** ❌ Não lista `/relatorios` na tabela de módulos.
- [ ] **O MUDANCAS.md tem changelog?** 🟡 Tem changelog do schema (18/05), mas não das migrations de cron/trigger (19/05).
- [ ] **O ROADMAP.md reflete o design implementado?** ❌ Ainda menciona design EAV antigo.

---

> **Pare imediatamente se encontrar problemas CRÍTICOS.**  
> 🔴 **2 problemas CRÍTICOS foram encontrados e devem ser corrigidos antes do merge.**

---

*Relatório gerado automaticamente pelo Auditor de Qualidade OMNX Code.*
