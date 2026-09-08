# Plano Clara 3.0 — Módulos Restantes

> **Branch:** `feat/meta-ads-region-breakdown`  
> **Projeto Supabase:** `qzesffnkqgelmtfblzkr`  
> **Modelo obrigatório:** `qwen/qwen3.7-plus` (nenhum Anthropic/OpenAI em `bot-chat` / `prevendas-ai`)  
> **Padrão:** toda agregação complexa vive em RPC SQL; Clara apenas consome via tools.

---

## Objetivo

Expandir a cobertura da Clara para todos os módulos restantes planejados, mantendo a arquitetura distribuída (`bot-chat`, `bot-chat-data`, `bot-chat-synthesis`) e a garantia de QA Playwright obrigatória antes de cada deploy.

---

## Módulos a implementar

1. **Recuperação** — métricas do pipeline de oportunidades perdidas.
2. **Investimento Orgânico** — custos de equipe orgânica cruzados com resultado.
3. **SDR IA** — performance dos bots de pré-vendas.
4. **Testes de Criativos** — comparação estatística simples entre criativos.
5. **Relatórios Semanais** — resumo executivo semanal (versão on-the-fly, sem persistência complexa).
6. **RAG de Documentação** — busca full-text nos docs internos para responder perguntas sobre regras e funcionalidades.
7. **Robustez do Orquestrador** — reduzir tool calls erradas, evitar respostas vazias, melhorar logs.

---

## Task 1 — Módulo Recuperação

### Entregáveis
- Migration SQL: `analisar_recuperacao(start_date, end_date, group_by, sdr_name, lost_reason)`
- Tool: `query_recuperacao`
- Executor em `_shared/clara/executors.ts`
- Teste Playwright: `tests/clara/recuperacao.spec.ts`
- Atualização de `docs/CLARA-MODULOS-FALTANTES.md`

### Métricas
- Leads em recuperação (cohort por `data_lead_recebido`)
- Leads perdidos / reativados / reuniões realizadas / vendas
- Motivos de perda (`lost_reason`, `motivo_perda`)
- Valor recuperado (faturamento/caixa de oportunidades que saíram de `lost` para venda)
- Taxa de reconquista

### Regras
- Incluir **apenas** `pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'`.
- Venda = `vendas_fechamento.data_pagamento_entrada IS NOT NULL`.
- Agrupamentos: `none`, `sdr`, `lost_reason`, `month`.

---

## Task 2 — Módulo Investimento Orgânico

### Entregáveis
- Migration SQL: `analisar_investimento_organico(start_date, end_date, group_by, category, utm_source)`
- Tool: `query_organic_investment`
- Executor em `_shared/clara/executors.ts`
- Teste Playwright: `tests/clara/investimento-organico.spec.ts`
- Atualização de `docs/CLARA-MODULOS-FALTANTES.md`

### Métricas
- Total investido em equipe orgânica no período
- Investimento por categoria (`social_media`, `design`, `video`, `copywriter`, `other`)
- Investimento por canal orgânico (`utm_source`)
- MQLs e vendas por canal orgânico (reusa `analisar_organico`)
- Custo por MQL orgânico, custo por venda orgânica, ROI orgânico

### Regras
- Fonte: `organic_investment_items` + `organic_investments`.
- Investimento com `utm_source = NULL` é rateado entre todos os canais orgânicos ativos ou considerado "geral".
- Período de investimento usa `period_start`/`period_end` (mês) e prorata pela sobreposição com o filtro.

---

## Task 3 — Módulo SDR IA

### Entregáveis
- Migration SQL: `analisar_sdr_ia(start_date, end_date, group_by, bot_id, channel)`
- Tool: `query_sdr_ia_performance`
- Executor em `_shared/clara/executors.ts`
- Teste Playwright: `tests/clara/sdr-ia.spec.ts`
- Atualização de `docs/CLARA-MODULOS-FALTANTES.md`

### Métricas
- Mensagens enviadas por bot / canal
- Taxa de resposta do lead (inbound após outbound de bot)
- Follow-ups enviados
- Conversas transferidas para humano
- Conversas encerradas / pausadas
- Latência média e custo estimado (de `sdr_ia_logs`)

### Regras
- Join com `comunicacoes` quando possível para inbound/outbound.
- Agrupamentos: `none`, `bot`, `channel`, `day`, `month`.
- Não expor textos completos de conversas (apenas contagens/aggregados).

---

## Task 4 — Módulo Testes de Criativos

### Entregáveis
- Migration SQL: `analisar_teste_criativos(start_date, end_date, creative_ids[])`
- Tool: `query_creative_test`
- Executor em `_shared/clara/executors.ts`
- Teste Playwright: `tests/clara/teste-criativos.spec.ts`
- Atualização de `docs/CLARA-MODULOS-FALTANTES.md`

### Métricas
- Comparativo de 2+ criativos (CR-xxx)
- Spend, impressions, CTR, leads, MQLs, vendas, ROAS, ROAS CAIXA
- Indicador de "winner" baseado em ROAS CAIXA + spend mínimo
- Alerta quando amostra é pequena

### Regras
- Reusa `analisar_criativos` internamente.
- Requer `spend >= min_spend` (default R$ 500,00) para considerar válido.
- Winner = maior ROAS CAIXA entre criativos com spend mínimo.

---

## Task 5 — Módulo Relatórios Semanais

### Entregáveis
- Migration SQL: `analisar_relatorio_semanal(week_start, week_end, modules[])`
- Tool: `query_weekly_report`
- Executor em `_shared/clara/executors.ts`
- Teste Playwright: `tests/clara/relatorios-semanais.spec.ts`
- Atualização de `docs/PLANO-RELATORIOS-SEMANAIS.md` e `docs/CLARA-MODULOS-FALTANTES.md`

### Métricas (on-the-fly, sem snapshots persistentes)
- Leads, MQLs, conectados, agendados, reuniões, vendas, faturamento, caixa
- Investimento Meta, CPMQL, ROAS
- Comparativo com a semana anterior
- Destaques: maior alta, maior queda

### Regras
- Semana = segunda a domingo.
- Se `week_start` não for segunda, ajustar para a segunda anterior.
- Comparativo = semana anterior imediata.
- Usar as RPCs já existentes (`analisar_funnel_cohort`, `analisar_revenue_produtividade`, etc.) para evitar duplicação de lógica.

---

## Task 6 — RAG de Documentação

### Entregáveis
- Migration SQL: recriar `ai_doc_chunks` + `ai_doc_index_status` com full-text search (`tsvector`), sem embeddings (evita dependência de modelo de embedding).
- Edge function/script: `scripts/index-clara-docs.ts` para indexar `CLAUDE.md`, `docs/**/*.md` e `plans/*.md`.
- RPC: `buscar_documentos_clara(query TEXT, limit INT)` usando `ts_rank_cd`.
- Tool: `query_docs`
- Executor em `_shared/clara/executors.ts`
- Modificar `bot-chat/index.ts` para injetar top-K chunks no system prompt quando a pergunta parecer sobre documentação/regras.
- Teste Playwright: `tests/clara/rag-docs.spec.ts`
- Atualização de `docs/CLARA-2.0-ARQUITETURA.md`

### Regras
- Chunking por headers Markdown (`##`, `###`).
- Índice `idx_ai_doc_chunks_fts` em `to_tsvector('portuguese', content)`.
- Recarregar docs apenas quando `file_hash` mudar.
- Citar fonte na resposta (ex: "segundo docs/VENDAS-FECHAMENTO.md").

---

## Task 7 — Robustez do Orquestrador

### Entregáveis
- Refinar `buildSystemPrompt()` em `bot-chat/index.ts` para:
  - Desincentivar `list_utm_sources` quando o usuário não pede um canal específico.
  - Reforçar que tools como `query_trafego` e `query_organico` já conhecem os canais; só listar quando for filtrar.
  - Incluir exemplos de respostas proibidas vazias.
- Adicionar retry simples: se `finalAnswer` estiver vazio ou contiver "não encontrei" sem tool ter retornado vazio, refazer a síntese uma vez.
- Adicionar logs estruturados no console do edge function (tool calls, finish_reason, tamanho do resultado truncado).
- Teste Playwright: expandir `tests/clara/clara-e2e.spec.ts` com 2 cenários de robustez.

---

## Ordem de execução recomendada

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
```

Motivo: os primeiros quatro são puramente dados e seguem o padrão já estabelecido. O Relatório Semanal depende deles. O RAG é paralelizável, mas deixamos depois para não misturar lógica de prompt. A robustez por último para aplicar sobre todos os novos módulos.

---

## QA obrigatória por task

1. Rodar `npx playwright test tests/clara/ --project=chromium --retries=1`.
2. Aprovar apenas se 100% dos testes passarem.
3. Deploy das functions `bot-chat`, `bot-chat-data`, `bot-chat-synthesis`.
4. Deploy da migration da task.

---

## Notas

- Nenhuma dependência nova fora da stack (React, TS, Supabase, Tailwind, shadcn/ui, TanStack Query) será introduzida sem aprovação explícita.
- O RAG usará full-text search nativo do Postgres para evitar modelo de embedding externo.
- O dev server local será mantido em `http://localhost:3222` via `nohup` durante o desenvolvimento.
