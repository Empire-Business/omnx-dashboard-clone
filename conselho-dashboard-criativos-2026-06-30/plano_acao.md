# Plano de Ação — Dashboard de Criativos

## Decisão do Presidente

Dashboard será a **primeira aba** do sub-app Criativos e funcionará como um **painel de guerra minimalista**:

1. **Métrica-âncora**: criativos validados por semana (aprovados/escalar/testado com decisão).
2. **Funil único**: ideia → produção → aprovação → testagem → escalar/pausar, com tempo em cada estágio.
3. **Lead time e cycle time** como métricas centrais.
4. **Gráficos diário e semanal** de throughput (criativos que saíram da linha).
5. **Alertas vermelhos** quando fila de testes ou produção travam.
6. Tudo o mais fica em segundo nível. Sem planilha bonita, sem dado morto.

## Tarefas

- [ ] Expandir `useCreativeDashboard.ts` com:
  - throughput diário/semanal (últimos 30 dias / 12 semanas);
  - lead time e cycle time por estágio via `creative_test_history`;
  - meta semanal de validados (soma dos `weekly_goal_*` em `creative_test_criteria`);
  - progresso da meta na semana corrente;
  - alertas de gargalo (fila grande, tempo alto por estágio).
- [ ] Reescrever `DashboardTab.tsx`:
  - cabeçalho com meta semanal e progresso;
  - cards de KPI: validados na semana, meta, lead time, cycle time, WIP, yield rate;
  - funil de produção/testes com tempo médio por estágio;
  - gráfico diário de throughput (últimos 15 dias);
  - gráfico semanal de throughput (últimas 8 semanas) com linha de meta;
  - seção de alertas acionáveis no topo.
- [ ] Mudar aba padrão em `CriativosPage.tsx` de `'ranking'` para `'dashboard'`.
- [ ] Criar teste Playwright `criativos-dashboard.spec.ts` validando:
  - Dashboard é a aba ativa ao entrar no app;
  - meta semanal e gráficos estão visíveis;
  - alertas ou estado vazio são renderizados.
- [ ] Rodar `tsc`, `lint` e `npx playwright test`.

## Observações técnicas

- Sem novas dependências de gráfico: usar barras CSS puras.
- Manter RLS: todos os dados continuam filtrados por `workspace_id`.
- Timezone: tratar datas em BRT (`-03:00`) na agregação quando possível; para dados existentes sem timezone, assumir UTC e converter.
