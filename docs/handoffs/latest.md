# Handoff Atual — GHL-SUPABASE (eb-dash2)

> 📖 **Visão completa do projeto:** ver [`docs/handoffs/HANDOFF-COMPLETO.md`](HANDOFF-COMPLETO.md). Histórico cronológico das sessões em [`HISTORY.md`](HISTORY.md).

**Sessão mais recente:** 2026-07-23 BRT (hardening pré-push da `main`)
**Responsável:** IA OMNX Code
**Estado:** Hardening concluído em produção em 2026-07-23: a migration `20261009000004` restringiu o job semanal privilegiado a `service_role` e o re-teste remoto confirmou `anon=false`, `authenticated=false`, `service_role=true` para `EXECUTE`, com `search_path=pg_catalog`. `brace-expansion` está travado em `1.1.16` na cadeia `minimatch@3`; `npm audit` ficou limpo.

## O que foi feito

Pedido do dono: renomear o app de disparos para "Campanhas WhatsApp" e dar ao dashboard "todo tipo de filtro possível" (data etc.).

1. **Rename (só labels visíveis):** sidebar (`lib/apps/navigation.ts`), catálogo (`types/apps.ts`, `types/users.ts`, `lib/apps/features.ts`), título da página e todos os textos user-facing do módulo (`pages/disparos/**`) passaram a dizer "Campanhas WhatsApp"/"campanha". Slug `disparos`, rota `/disparos`, tabelas e feature keys **inalterados** de propósito (mudar quebraria permissões salvas e bookmarks).
2. **Filtros no dashboard** (`pages/disparos/tabs/DashboardTab.tsx` + `components/DisparoFiltersBar.tsx` + `filters.ts`): presets de período (Todo o período, Hoje, 7/30 dias, Este mês, Mês passado) + range manual De/Até, Status (Todas/Ativas/Inativas), Tipo de mensagem (Todos/Marketing/Utility), busca por nome e filtro de Significado na tabela de contatos. Período filtra no BANCO (afeta as contagens); status/tipo/busca refinam client-side.
3. **Migration nova** `supabase/migrations/20261009000001_disparo_metricas_periodo_rpc.sql`: função `rpc_disparo_metricas(p_from, p_to)` = mesma agregação da `v_disparo_metricas` com filtro de período (from inclusivo, to exclusivo; NULLs = sem filtro). SECURITY INVOKER (isolamento via RLS das tabelas base), EXECUTE revogado de anon/PUBLIC. `useDisparoMetrics` agora chama a RPC em vez da view. Limitação herdada: "data do trigger" = `contatos.updated_at` (ver migration `20260705000018`).
4. **Validação:** `tsc -b` + build limpos, eslint limpo nos arquivos tocados, **140/140 vitest**. Spec e2e `tests/disparos.spec.ts` atualizado (textos novos + teste da barra de filtros) — **não rodado** (requer dev server + login). Migration validada **ao vivo em produção**: anon recebe `permission denied` (REVOKE ok); com usuário autenticado de teste, sem filtro retorna a campanha real (trigger=4237), janela de jan/2026 zera as contagens (filtro age na agregação) e janela de 30 dias retorna os mesmos totais da view.
5. **Docs:** `docs/UML.md` ganhou seção "RPC: métricas de Campanhas WhatsApp por período (2026-07-22)".
6. **Fix pós-sessão (mesmo dia):** o card da home ("Meus Apps") continuava "Disparos" porque o label vem da **edge function `workspace-apps`** (catálogo duplicado em `supabase/functions/workspace-apps/index.ts`), não do frontend. Label corrigido para "Campanhas WhatsApp" e **deploy da function feito em produção** — validado ao vivo: `disparos => Campanhas WhatsApp`. O hub já mostra o nome novo; a sidebar/títulos internos só mudam com o deploy do frontend.
7. **Fix UX dropdowns (mesmo dia, reportado pelo dono com print):** menus do header abriam **fora da tela**. Causa raiz em `components/ui/dropdown-menu.tsx`: a posição usava `transform: translate(...)` inline, e o `animate-scale-in` (fill-mode `forwards`, keyframe final `transform: scale(1)`) **sobrescrevia o translate** ~180ms após abrir — o menu "pulava" para `left=rect.right` sem o -100% e estourava a viewport em qualquer largura (reproduzido com medidas via Playwright: menu terminava em 1471px numa viewport de 1280). Além disso, **dois dropdowns ficavam abertos ao mesmo tempo** (clique no trigger de outro menu caía dentro de `[data-dropdown-root]` e o handler de "click fora" ignorava). Reescrita: posição 100% em pixels (`top`/`left` calculados, sem transform), medição real do conteúdo (renderiza oculto, mede, exibe), clamp horizontal, flip vertical, recálculo em resize/scroll, evento `omnx:dropdown-opened` garantindo **um menu aberto por vez** + fechar com Escape. `MultiSelectFilter` ganhou ancoragem à direita quando o trigger está na metade direita da viewport (antes estourava). Re-testado com medidas em 1280/740/480px: tudo dentro da viewport; "um por vez" OK. Build limpo, 140/140 vitest.
8. **Teste E2E completo com usuário Playwright (mesmo dia, a pedido do dono) — 25/25 PASS:** login, hub, rename em todos os pontos (inclusive breadcrumb — achado extra: faltava `ROUTE_LABELS['disparos']` no `DashboardLayout`, o fallback capitalizava a URL), filtros funcionando de verdade (jan/2026 zera contagens, 30 dias retorna 4.239 enviados), busca, status, seleção de campanha, dropdowns em 1280/480px, aba Configuração, zero erros JS. **Achado crítico do teste:** a RPC v1 estourava `statement timeout` (57014) sem filtro de data — corrigido ao vivo com 2 migrations (`20261009000002` COALESCE infinity, `20261009000003` agregação por unnest+hash join). Tempos em produção: cache frio ~8s (cairá para ~1-2s quente; view antiga era ~5s). Migrations aplicadas e validadas ao vivo.

## Pendente (próxima sessão)

1. **Commitar e fazer deploy do frontend** (o dono decide o fluxo; nada foi commitado nesta sessão). O commit deve incluir os 2 arquivos de migration trazidos da branch `fix/clara-email-report-truncation` (ver estado acima).
2. Passa-a-vista do dono: nome novo na sidebar/home e filtros do dashboard (principalmente o de período, que muda as contagens).
3. Rodar `tests/disparos.spec.ts` (Playwright) na próxima rodada E2E.

### Sessão 2026-07-21 ~23:15 BRT (reforma do mapeamento GHL + link "Abrir no CRM" white label — **MERGE EM MAIN + DEPLOY EM PRODUÇÃO ✅**)
**Estado:** ✅ **EM PRODUÇÃO.** Gate de segurança PASS (`security-report/verdict.json`, target `34b24b7`), merge fast-forward `8239136..34b24b7` + push, Vercel `Ready` (`ghl-supabase-nxajeuprr`, ceo.omnx.pro). A branch `fix/ghl-mapping-ux-save` foi mergeada com 5 commits (`64f94e0` reforma do mapeamento, `36a937d` fix link GHL, `ed9dd0d` docs, `7da22dc` white label, `34b24b7` docs).

## O que foi feito

Pedido do dono: "a parte de mapeamento de leads está extremamente confusa, não consegui usar na prática".

1. **Auditoria real via Playwright** (usuário `teste.playwright.audit@aliancadealtovalor.com.br`, workspace Burn-in Interno, dev server local): **o save de campos falhava em 100% das tentativas** — `GhlMappingWizard.handleSave` gerava 1 row por campo do GHL com `logical_name` repetido, e o upsert `onConflict: 'workspace_id, logical_name'` era rejeitado pelo Postgres; o toast genérico escondia o motivo (PostgrestError não é `instanceof Error`). Não era dificuldade do usuário — estava quebrado.
2. **Fix do save:** `groupFieldMappingsByLogicalName()` em `eb-dash2/src/lib/ghl-mapping.ts` (1 row por logical_name, `variations` = todos os campos GHL ligados), aplicado no wizard e dentro de `saveFieldMappings` (defesa em profundidade); `extractErrorMessage()` em `src/lib/errors.ts` exibe o erro real.
3. **Reforma de UX** (tudo verificado em 2 rodadas de reteste no browser): tela de conclusão pós-save com resumo; campos obrigatórios explicados + orientação quando ausentes; matches de baixa confiança viram "Revisar sugestão" âmbar opt-in (não pré-preenchem mais — antes match absurdo entrava como "Mapeado ✓" verde); busca/filtro + "Aceitar sugestões exibidas (N)"; "Classificar todos os stages como…" por pipeline; IDs técnicos atrás de "Ver código técnico"; "Excluir" → "Ignorar (não importar dados)" (só rótulo); abas "Mapeamento guiado" (default) / "Campo a campo (IA)" / "Documentação"; descoberta unificada ("Buscar campos no GHL"; sidebar abre o wizard direto); banner de webhook mismatches colapsado; contadores com rótulos distintos ("campos do GHL ligados" vs "campos do sistema mapeados"); bug extra corrigido (botão "Usar sugestão" invisível por condição impossível).
4. **Validação:** `tsc -b` e build limpos, **137/137 vitest**. Provas no browser: save persiste (63→65 campos), aceite em massa 177→0, classificação em massa de 10 stages, sidebar abre wizard.

Detalhes completos: [`HISTORY.md`](HISTORY.md) (entradas 2026-07-21 ~22:30 e ~22:50). Screenshots: `eb-dash2/playwright-screenshots/mapping-ux*/` e `ghl-link-card/`.

### Sessão ~22:50 — link "Abrir no GHL" no card do lead (commit `36a937d`)

Dono reportou "clico nos cards dos leads e não aparece link". Causa raiz: o link existia no `LeadCard`, mas dependia da env `VITE_GHL_LOCATION_ID` (build time, não configurada) — era omitido em silêncio. Fix: `ghlContactUrlForLocation` + hook `useGhlLocationId` (location do banco); botão com texto "Abrir no GHL" no cabeçalho do card. Mesmo bug corrigido na Discagem. Achado colateral: coluna GHL da Lista ficava ~30s vazia (location refém de ~70 queries de filtro) — agora resolve em ~2s. URLs unificadas no formato `/v2/location/`. Pendente futura: otimizar os scans full-table dos filtros do `useLeads` (~30s para popular dropdowns).

## Pendente (próxima sessão)

1. **Passa-a-vista do dono em produção**: mapeamento guiado (Configuração → Integração CRM OMNX) e botão "Abrir no CRM" no card de um lead (href `crm.omnx.pro`).
2. Bug separado: `listUserWorkspaces` falha no console ("Failed to fetch") e o seletor de workspace não aparece para o usuário de teste — investigar.
3. Workspace Burn-in Interno ficou com 177 sugestões automáticas salvas + stages de "[FN] EVENTO" como "Novo" (efeito do teste em massa) — avaliar reset se precisar de dados limpos.
4. Spec Playwright `tests/ghl-mapping-wizard.spec.ts` referencia textos antigos das abas ("Mapeamento avançado"/"Assistente IA") — atualizar na próxima rodada E2E.
5. Considerar tooltip explicando "campos do GHL ligados" (save da sessão vs. total acumulado na sidebar).

## Pendências herdadas (não mexidas nesta sessão)

- **PR [#57](https://github.com/Empire-Business/GHL-SUPABASE/pull/57)** (e-mail diário da Clara) — já em produção via deploy direto; PR só registra na `main`. Ver HISTORY.
- Monitorar se o GHL reativou os webhooks após os 2 dias de 401 (sessão anterior); se não, re-disparar workflows no GHL.
- Migration de limpeza da linha vazia do probe em `maquina_de_conteudo` (id `1f82f235-7fa7-4613-b994-d34737ef81af`).
- Prova visual do fix de Investimento no Burn-in Interno (logar como `ferramentas@`, Painel Cohort = R$ 0,00).
- `.empire/state.json` segue com diff não commitado (mudança de ambiente, não de código — fora dos commits por decisão anterior).

## Referências rápidas

- Trabalho desta sessão: mergeado em `main` (`34b24b7`) — branch `fix/ghl-mapping-ux-save` pode ser deletada
- Auditoria do gate: `security-report/audit-2026-07-21-ghl-mapping-ux-gate.md` (PASS)
- Doc do assistente de mapeamento IA: `docs/GHL-MAPPING-ASSISTENTE-IA.md`
- Changelog: `docs/MUDANCAS.md`
