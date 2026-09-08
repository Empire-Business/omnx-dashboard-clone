# Matriz de Eficiência — Funis e Campanhas

| Campo | Valor |
|-------|-------|
| **Item do backlog** | MT-P1.2 (`docs/ROADMAP-MULTI-TENANT.md` seção 3.1) |
| **Módulos** | Vendas, Aquisição, Tráfego — nova aba **Eficiência** em cada um |
| **Status** | Implementado, sem escrita em produção (só leitura) |

---

## O que é

Uma nova aba **"Eficiência"** em cada um dos três módulos principais (Vendas, Aquisição, Tráfego), com duas sub-abas:

- **Funis** — uma linha por funil (`utm_campaigns.funnels`), comparando a conversão de cada funil no período.
- **Campanhas** — uma linha por campanha (`utm_campaigns.nome`), mesma comparação.

Cada linha mostra: Leads, MQLs, Conectados, Agendados, Reuniões, Fechados e Faturamento, com a mesma coloração por desvio da média (verde/amarelo/vermelho) já usada na Matriz Cohort existente. Clicar numa célula abre a lista de leads daquele funil/campanha naquela etapa — mesmo padrão do `LeadListModal` já usado em todo o app.

**Regra "só dados != 0 no período":** as linhas nascem dos `opps` já filtrados pela página (que mudam dinamicamente com o filtro de data e com o toggle Cohort/Produtividade) — nunca de um catálogo fixo de funis/campanhas. Um funil sem lead no período simplesmente não gera linha, sem filtro extra.

## Arquitetura — por que ficou 100% em arquivos novos (+3 edições mínimas)

Havia ~15 PRs abertas no momento desta implementação, com risco de conflito concentrado na PR #55 (que já mexe em `AquisicaoPage.tsx`, `VendasPage.tsx`, `DashboardPage.tsx`, `useAquisicao.ts`, `useTrafego.ts`). Para minimizar esse risco:

1. **`eb-dash2/src/hooks/useMatrizEficiencia.ts`** (novo) — hook autocontido: busca `utm_campaigns` do workspace direto do Supabase (não depende do que cada página já expõe), reaproveita os helpers já existentes e testados em produção (`buildCampaignFunnelMap`, `buildCampaignNameMap`, `countUniqueMqls`, `buildPaymentDateMap` de `useTrafego.ts`) e a mesma fórmula de percentuais de `useCohort.ts`. Agrupa os `opps` recebidos por funil e por campanha.
2. **`eb-dash2/src/components/matriz-eficiencia/MatrizEficienciaTab.tsx`** (novo) — componente de UI compartilhado pelos três módulos. Reaproveita o componente já existente `CohortMatrix` (`components/dashboard/CohortMatrix.tsx`) sem alterá-lo — cada "linha de cohort" vira um funil ou uma campanha, não um mês. Sub-abas Funis/Campanhas seguem o mesmo padrão de `?sub=` já usado em `AnunciosTab.tsx`.
3. **Edição mínima em 3 arquivos de página já existentes** (inevitável para expor a aba na UI):
   - `eb-dash2/src/pages/aquisicao/AquisicaoPage.tsx`
   - `eb-dash2/src/pages/vendas/VendasPage.tsx`
   - `eb-dash2/src/pages/dashboard/DashboardPage.tsx` (rota `/trafego`)

   Cada edição é: 1 import novo, 1 entrada no array `TABS`, 1 bloco de renderização condicional (~3-6 linhas). Nenhuma lógica de filtro/dado existente foi tocada nesses arquivos.

**Risco de conflito para quem revisar o merge:** os três arquivos de página tocados aqui também estão na lista de arquivos da PR #55. Como as duas mudanças são aditivas em pontos diferentes do arquivo (array `TABS`, import, bloco de render), o conflito esperado — se surgir — é textual e trivial de resolver (linhas adjacentes, não sobreposição de lógica), não semântico. Nenhum hook (`useAquisicao.ts`, `useTrafego.ts`, `usePreVendas.ts`) foi editado.

## Limitações desta entrega

- Validação de números contra produção foi feita por **reaproveitamento de fórmulas já em produção** (mesmas funções que a Matriz Cohort já usa), não por uma nova consulta SQL ao vivo — a tentativa de rodar uma query de leitura via Management API nesta sessão sofreu timeout de rede. Recomenda-se um smoke-test visual rápido em produção antes do merge (mesma recomendação que a PR #55 já registrou para suas próprias telas).
- A aba "Eficiência" reflete o mesmo dataset (`opps`/`revenueRows`) que a aba "Matriz" da mesma página já usa, incluindo o toggle Cohort/Produtividade — não é um dataset novo.
