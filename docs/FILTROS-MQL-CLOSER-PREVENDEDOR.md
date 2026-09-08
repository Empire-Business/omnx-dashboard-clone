# Filtro "só MQL" + Filtros de Closer/Pré-vendedor em todas as abas

> Trabalho de 2026-07-19: (1) diagnóstico e correção de clareza do filtro "Apenas MQL" do dashboard; (2) adição dos filtros Closer e Pré-vendedor em todas as abas de filtro do dashboard que ainda não os tinham.

---

## Parte 1 — Diagnóstico do filtro "só MQL"

### Pergunta do dono
O filtro "só MQL" funciona corretamente? O dono suspeitava que pudesse estar quebrado ou pouco claro.

### Diagnóstico

**A lógica central está correta.** `isMqlByTag()` (`eb-dash2/src/hooks/useTrafego.ts`) verifica a tag exata `"mql"` (case-insensitive, após split/trim) em `contatos.tags` — exatamente a regra descrita em `docs/MQL-TAG-CLASSIFICATION.md` e no `CLAUDE.md`. Essa função é reutilizada (não duplicada) em ~15 hooks/páginas do dashboard.

**Validação contra produção (leitura, sem escrita):**
- 11.198 contatos no total; 2.216 têm a tag exata `"mql"` (contagem replicando a lógica real de split+trim+lowercase+match exato — não substring).
- Uma contagem ingênua por `ILIKE '%mql%'` retornaria 5.878 (falso positivo por capturar tags como `"nmql"`, `"sql"`, etc.) — **o código do app não comete esse erro**, usa match exato.
- Zero joins quebrados entre `oportunidades` e `contatos` (11.246 oportunidades, todas com `contato_id` válido).

**3 problemas reais encontrados (agora corrigidos):**

1. **Ranking de Criativos tinha semântica diferente do resto do app.** Em todas as outras abas (Tráfego, Aquisição, Orgânico, Pré-Vendas, Vendas), "Apenas MQL" restringe os leads-base a MQLs — todos os KPIs são recalculados sobre esse subconjunto. No Ranking de Criativos, o mesmo botão/rótulo apenas escondia linhas de criativo com `mql === 0`, sem mudar nenhum número das linhas que continuavam visíveis — e essa era exatamente a mesma função já coberta por um controle separado e já existente, "Ocultar sem MQL" (`hideSemMql`). Ou seja: o usuário via um controle chamado "Apenas MQL" que, ali, não filtrava MQL nenhum — só duplicava outro filtro com nome diferente. **Corrigido:** agora `filters.mqlFilter` filtra os `opps` de entrada antes da agregação por criativo (`RankingTab.tsx`), igual às demais abas. `hideSemMql` continua existindo como o controle de "esconder linha com 0 MQL" — os dois deixam de ser confundíveis.
2. **Badge de contagem de filtros ativos não contava o MQL.** Em `FilterBar.tsx` (Tráfego) e nas 3 páginas irmãs (Aquisição, Orgânico, Criativos), o contador "N filtros ativos" ignorava `mqlFilter`, embora o botão "Limpar" já considerasse corretamente. Efeito: o badge undercount por 1 quando "Apenas MQL" estava ativo. Corrigido nos 4 arquivos.
3. **Causa provável da desconfiança do dono:** o rótulo era `"Modo: [Apenas MQL / Todos]"`, posicionado logo abaixo do toggle Cohort/Produtividade — que **também** se chama "Modo" na interface (`CohortProdToggle`). Dois controles completamente diferentes com o mesmo nome, um em cima do outro. Renomeado para `"Classificação: [Somente MQL / Todos os leads]"` em todos os 6 lugares onde o toggle existe (Tráfego, Aquisição, Orgânico, Criativos, Pré-Vendas, Vendas), com `title` explicando exatamente o que o filtro faz (tag "mql", não altera investimento/spend exibido).

### Conclusão
O filtro **funcionava corretamente na maioria das abas**. O problema real era (a) uma inconsistência de comportamento isolada no Ranking de Criativos — agora alinhada — e (b) um problema de nomenclatura que tornava o controle indistinguível do toggle Cohort/Produtividade. Nenhuma correção de lógica de detecção de MQL foi necessária — `isMqlByTag()` já estava certa.

---

## Parte 2 — Filtros de Closer e Pré-vendedor em todas as abas

### Onde já existiam
Pré-Vendas, Vendas e Recuperação já tinham os dois filtros (compartilham `usePreVendas`/`PreVendasFilters`).

### Onde foram adicionados
Tráfego (Visão Geral + Matriz), Aquisição (+ Matriz), Orgânico, Criativos → Ranking (único sub-app de Criativos com filtro de leads), e Leads (Closer já existia lá; Pré-vendedor era o único que faltava).

### Origem e sincronização dos dados (investigação ANTES de construir UI)

- **Pré-vendedor** = `oportunidades.sdr_name`, com fallback obrigatório para `contatos.owner_name` (regra "SDR Name Mandatory Fallback" do `CLAUDE.md`). Cobertura em produção: **99,4%** (11.180/11.246 oportunidades com `sdr_name` preenchido) — bem sincronizado via `sync-opp-sdr`.
- **Closer** = `oportunidades.vendedor_closer`. Cobertura em produção: **1,4%** (161/11.246) — mesmo dentro do pipeline "Vendas SQL" (a etapa onde o closer atua), só 9,7% (83/854) têm o campo preenchido. **Achado real desta tarefa:** o dado existe e está corretamente mapeado (sincronizado via `extrair_dados_ghl`/webhook, mesmo pipeline do `sdr_name`), mas a maioria das oportunidades nunca teve um closer atribuído no GHL — não é um bug de sync, é reflexo de que a maior parte dos leads não avança até a etapa de fechamento com um closer definido no CRM.

### Comportamento para "sem atribuição" (decisão desta tarefa)

Antes desta mudança, oportunidades sem closer ficavam **invisíveis nos filtros** — não havia como selecioná-las ou excluí-las deliberadamente, e o campo aparecia como "—" na UI sem alternativa de filtro.

**Decisão:** todo dropdown de Closer/Pré-vendedor agora inclui a opção sintética **"Sem atribuição"** (constante `SEM_ATRIBUICAO` em `eb-dash2/src/types/filters.ts`), que casa com registros onde o campo é `NULL`/vazio. Isso deixa explícito — e filtrável — o fato de que ~98,6% das oportunidades não têm closer atribuído, em vez de escondê-las silenciosamente.

Implementação:
- `normalizeAttribution(value)`: `''`/whitespace → `SEM_ATRIBUICAO`; caso contrário, mantém o valor.
- `withSemAtribuicao(options)`: acrescenta a opção ao final da lista de opções do dropdown.
- `applyFilterValue(normalizeAttribution(valor), filtro)`: reaproveita o helper genérico de filtro já existente (`types/filters.ts`), sem duplicar lógica de include/exclude.
- No hook `useLeads.ts` (única página com paginação **server-side** via PostgREST, diferente do resto que filtra client-side), a mesma semântica foi implementada via `.or('coluna.in.(...),coluna.is.null')` — ver `buildAttributionOrClause()`.

### Onde os dados são carregados
Mesma fonte canônica já usada por Pré-Vendas/Vendas/Recuperação: tabela `ghl_users`, filtrando por `papeis` contendo `'sdr'` ou `'closer'` (não pelos valores distintos em `oportunidades`, para que SDRs/closers cadastrados sem lead ativo no período ainda apareçam no filtro). Exceção: `useLeads.ts` (Leads), que já usava valores distintos direto da tabela `oportunidades` — mantido assim para não mudar esse comportamento pré-existente, apenas acrescentando "Sem atribuição".

### Arquivos alterados (resumo)
- `eb-dash2/src/types/filters.ts` — `SEM_ATRIBUICAO`, `normalizeAttribution`, `withSemAtribuicao`.
- `eb-dash2/src/hooks/useTrafego.ts` — `resolveSdrName`, `resolveCloserName`, `applyAttributionFilters`, campos `sdrs`/`closers` em `TrafegoFilters`/`FilterOptions`.
- `eb-dash2/src/hooks/useAquisicao.ts`, `useOrganico.ts`, `useCriativosFilters.ts` — mesmo padrão.
- `eb-dash2/src/hooks/usePreVendas.ts` — adicionado suporte a "Sem atribuição" (antes só filtrava por nome exato).
- `eb-dash2/src/hooks/useLeads.ts` — novo filtro Pré-vendedor (`sdrName`) + suporte a "Sem atribuição" no filtro de Closer já existente (implementação PostgREST server-side).
- `eb-dash2/src/components/dashboard/FilterBar.tsx`, `eb-dash2/src/pages/{aquisicao,organico,criativos,prevendas,vendas,recuperacao,leads}/**` — UI (`MultiSelectFilter`) + rótulo "Classificação" do filtro MQL.
- `eb-dash2/src/pages/{dashboard,aquisicao}/tabs/{TrafegoTab,MatrizTab,AquisicaoTab}.tsx` — painel Produtividade passou a respeitar os 2 novos filtros via `applyAttributionFilters`.
- `eb-dash2/src/lib/goals/service.ts` — ajuste de tipo (campos obrigatórios novos em `TrafegoFilters`).

---

## Pendências de validação (limite de projeto efêmero)

A conta Supabase está no limite de 2 projetos free — não foi possível criar um projeto efêmero para testar com **escrita** simulada (ex.: inserir uma oportunidade sintética sem closer e confirmar que ela aparece só quando "Sem atribuição" está marcado). A validação foi feita por:

1. Leitura direta de produção (contagens acima).
2. `tsc --noEmit` limpo, `npm run build` limpo, suite `vitest` 126/126 verde, `eslint` limpo nos arquivos alterados.
3. Verificação end-to-end no navegador contra o banco de produção real (leitura): aba Tráfego, filtro Closer → "Sem atribuição" selecionado → contagem de MQLs mudou de 133 para 111, confirmando que o filtro realmente restringe os dados (não é só UI).

**Não testado ao vivo (só por leitura de código + inferência dos mesmos helpers já validados):** Aquisição, Orgânico, Ranking de Criativos, Leads, e o painel Produtividade — todos reutilizam exatamente `applyFilterValue`/`normalizeAttribution`/`applyAttributionFilters`/`MultiSelectFilter`, já comprovados no teste ao vivo do Tráfego, mas não foram clicados individualmente por limitação de tempo de sessão. Recomenda-se um clique manual de smoke-test nessas abas antes do merge, especialmente Ranking de Criativos (única mudança de *comportamento*, não só UI nova).
