# Painel Tráfego Pago (eb-dash2)

> Hook principal: `eb-dash2/src/hooks/useTrafego.ts`
> Hook produtividade: `eb-dash2/src/hooks/useProducao.ts`

---

## Duas visões: Cohort e Produtividade

O painel tem um **toggle "Cohort / Produtividade"** acima da matriz, abaixo dos KPI cards.

| Visão | Filtro de data | Pergunta respondida |
|-------|---------------|---------------------|
| **Cohort** | `data_lead_recebido` | "O que aconteceu com os leads gerados neste período?" |
| **Produtividade** | data do evento (`data_conectado`, `data_agendamento_reuniao`, `data_realizacao_vendas`, `data_fechado`) | "O que foi produzido neste período?" |

**Lazy loading:** os dados de Produtividade só são carregados quando o usuário clica na aba correspondente.

---

## O que o painel exibe

- KPI Cards de destaque (ver ordem abaixo)
- Funil de conversão visual
- KPIs de Meta Ads (spend, impressions, clicks, CTR, leads via actions)
- Filtros: campanha Meta, conjunto, anúncio, canal, funil, campanha [cp], data, modo Todos/MQL
- Segmentação visual por funil, campanha CRM, canal e criativo
- Aba `Ranking de Criativos` com expansão de públicos em cada linha de criativo

## Leads não conectados (2026-04-13)

O módulo de **Tráfego** passou a expor o card **"Não conectados"** ao lado de **"Conectados"** na aba **Visão Geral**.

### Regra de contagem

- **Cohort:** oportunidades filtradas no recorte atual com `data_conectado IS NULL`
- **Produtividade:** leads gerados no recorte atual que continuam com `data_conectado IS NULL`

### Drilldown

- clique no card abre o mesmo `LeadListModal` usado por **Conectados**
- o clique na linha continua abrindo o `LeadCard`

## Filtro de Público no Ranking de Criativos (2026-04-08)

O recorte por público foi consolidado dentro da própria aba **Ranking de Criativos** para evitar duplicação de tabela e manter a leitura em um único lugar.

### Fonte de verdade da chave

- cruzamento principal: `utm_term` no CRM e `ad_name` no Meta
- extração do criativo: segmento `CR-xxx`
- extração do público: `public_code` embutido no código do anúncio
- rótulo exibido no dropdown: prioriza `utm_sources.nome`; fallback para o próprio `public_code`

### Comportamento da UI

- cada linha de criativo mantém o total consolidado do criativo
- uma setinha na própria linha expande todos os públicos daquele criativo
- ao expandir, surge uma linha por público logo abaixo do criativo
- drilldown de `MQL` e `Vendas` continua funcionando tanto no total do criativo quanto nas linhas dos públicos

### Métricas exibidas

- `Investimento`
- `MQL`
- `CPMQL`
- `Vendas`
- `CPV`
- `Faturamento`
- `Caixa`
- `CTR`
- `CPM`
- `Conv. Página`
- `Video Hook`

### Regra de atribuição

- mídia: o ranking usa apenas linhas de `meta_ads_insights` cujo `public_code` do anúncio bate com o filtro selecionado
- CRM: o ranking usa apenas oportunidades cujo `contatos.utm_term` contém o `public_code` selecionado
- faturamento/caixa: `vendas_fechamento` é filtrado pelo mesmo subconjunto de oportunidades

### Observação operacional

O join continua baseado em `public_code`, não em `adset_name`. Isso evita inconsistência quando o nome do conjunto Meta muda depois que o anúncio já gerou leads.

## Gráfico "Investimento × CPMQL" (2026-03-31)

Na seção final da aba **Tráfego**, o gráfico `Investimento × CPMQL` usa dois eixos Y com **a mesma escala numérica**.

- regra: os lados esquerdo e direito compartilham o mesmo `sharedMax`
- efeito: `R$ X` no eixo de investimento fica na mesma altura que `R$ X` no eixo de CPMQL
- objetivo: permitir comparação visual direta entre os valores absolutos das barras e da linha

Mesmo quando o `CPMQL` é muito menor que o investimento diário, a regra permanece a mesma: a prioridade desse gráfico é manter equivalência de altura entre os dois eixos, não maximizar o zoom da linha.

## Segmentação visual (2026-03-31)

Na aba **Visão Geral**, a seção **Segmentação** passou a mostrar 4 dimensões lado a lado para cada bloco:

- a leitura visual é feita por **3 colunas de métrica**
- **Coluna MQLs**: funil, campanha CRM, canal e criativo
- **Coluna Reuniões**: funil, campanha CRM, canal e criativo
- **Coluna Vendas**: funil, campanha CRM, canal e criativo

### Dimensão "Campanha CRM"

- fonte: `contatos.utm_campaign`
- cruzamento: `utm_campaigns.utm_campaign -> utm_campaigns.nome`
- fallback: leads sem mapeamento entram em **Sem campanha**

### Regras de valor

- `MQLs por campanha`: contagem de oportunidades com tag `mql`
- `Reuniões por campanha`: contagem de opps com `data_realizacao_vendas`
- `Vendas por campanha`: usa o mesmo toggle visual da seção de vendas
  - `Nº Vendas`
  - `Faturamento`
  - `Caixa`

### Drilldown

Clique em qualquer fatia abre o modal com os leads da campanha selecionada, igual ao comportamento já existente para funil, canal e criativo.

---

## KPI Cards — Ordem e Cálculos (2026-03-24)

| # | Card | Fonte | Cálculo |
|---|------|-------|---------|
| 1 | **Investimento** | `metaKpis.spend` | Soma gasto Meta Ads no período |
| 2 | **Faturamento bruto** | `activeRevenueKpis.valorFaturado` | Soma `valor_faturado` das vendas (cohort ou produtividade) |
| 3 | **Caixa recebido** | `activeRevenueKpis.valorEntrada` | Soma `valor_entrada` (pagamentos) |
| 4 | **MQL** | `mqlCount` (do funil) | Contagem de opps com tag "MQL" nos `filteredOpps` |
| 5 | **CPMQL** | `metaKpis.spend / mqlCount` | Custo por MQL |
| 6 | **Vendas** | `salesCount` | Opps com `data_pagamento_entrada` (cohort: no filteredOpps; produtividade: pagamento no período) |
| 7 | **CPV** | `metaKpis.spend / salesCount` | Custo por venda |
| 8 | **ROAS** | `valorFaturado / spend` | Retorno sobre investimento (bruto) |
| 9 | **ROAS Caixa** | `valorEntrada / spend` | Retorno sobre investimento (caixa) |
| 10 | **Ciclo de Compra** | `computeAvgCycle` | Dias entre `data_lead_recebido` e `data_pagamento_entrada` |
| 11 | **Meta CPMQL** | meta cadastrada | Usa dataset da meta (pode ter período diferente do filtro) |

**Regra crítica:** O card **MQL** sempre usa `mqlCount` do funil (`filteredOpps`), **nunca** `mqlCountForGoal` (dataset da meta). Isso garante consistência entre o card e o funil visual abaixo. O `mqlCountForGoal` é usado apenas nos cards de **Meta MQL** e **Meta CPMQL**.

---

## Status da auditoria (2026-03-23)

O painel **nao esta conceitualmente quebrado**. A logica central atual esta coerente com o modelo de **cohort por `data_lead_recebido`**.

Pontos validados na auditoria:

- filtra por `data_lead_recebido` com offset de Sao Paulo
- exclui `pipeline_id = Recuperacao`
- considera apenas trafego pago por `utm_source` cadastrado em `utm_sources`
- detecta MQL por **tag** em `contatos.tags`
- calcula faturamento em modelo cohort, sem upper bound de data final

**Hardening aplicado nesta branch em 2026-03-23 14:53 BRT:**

1. paginacao de `oportunidades` passou a usar `.order('data_lead_recebido')` + `.order('id')` antes de `.range()`
2. filtro `Campanha Meta` sem mapeamento em `utm_campaigns` agora zera o cohort por seguranca e exibe aviso explicito na UI

Documento detalhado da auditoria:

- `docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md`

---

## Filtro permanente: apenas tráfego pago

O painel exibe **somente** leads cujo `contatos.utm_source` está cadastrado em `utm_sources`.

```sql
-- Lista de utm_sources válidos (tráfego pago)
SELECT utm_source FROM utm_sources;

-- Leads de tráfego pago no período
SELECT o.*, c.*
FROM oportunidades o
JOIN contatos c ON c.id = o.contato_id
WHERE o.data_lead_recebido >= '2026-03-01T00:00:00-03:00'
  AND o.data_lead_recebido <= '2026-03-11T23:59:59-03:00'
  AND c.utm_source IN (SELECT utm_source FROM utm_sources);
```

> Failsafe: se `utm_sources` estiver vazia, exibe todos os leads (sem filtro de tráfego).

O filtro é aplicado **client-side** após a paginação: o hook busca todos os leads do período e em seguida mantém apenas os que têm `utm_source` na lista de `pagoSources` (buscada de `utm_sources` em paralelo). Qualquer novo `utm_source` adicionado à tabela `utm_sources` aparece automaticamente no painel sem alterar código.

`setExcludedCount(rows.length - paid.length)` registra quantos leads foram excluídos (orgânicos / sem UTM cadastrado). Esse número aparece como badge informativo no rodapé do painel (`TrafegoTab.tsx`).

---

## Critério de data: COHORT por data_lead_recebido

O painel filtra por **data de geração do lead** (`oportunidades.data_lead_recebido`).
Sempre converter para America/Sao_Paulo (UTC-3):

```sql
WHERE data_lead_recebido >= '{YYYY-MM-DD}T00:00:00-03:00'
  AND data_lead_recebido <= '{YYYY-MM-DD}T23:59:59-03:00'
```

## Metas com vigência própria

As metas do painel de tráfego agora têm **intervalo salvo na própria tabela `metas`**:

- `periodo_inicio`
- `periodo_fim`

Isso vale para:

- quantidade de MQLs
- custo por MQL

### Regra operacional

O filtro de data da página continua controlando:

- cohort
- matriz
- funil
- KPIs normais do painel

Mas os cards de meta usam **o período salvo na meta ativa**, não o período visível no filtro da tela.

Além disso, os cards de meta do painel são **somente leitura**:

- exibem valor, vigência, progresso e ideal/dia
- não permitem criar nem editar metas localmente
- cadastro e edição acontecem exclusivamente no módulo `/metas`

### Como o painel evita distorção

- a meta ativa é escolhida por `tipo + referencia`, priorizando a vigência que contém o dia atual em São Paulo
- quando a vigência da meta não bate com o filtro visível, o card mostra aviso explícito
- para calcular progresso da meta, o frontend faz uma segunda carga de dados com o mesmo contexto de filtros dimensionais, mas trocando apenas a janela de datas pela vigência da meta

### Ideal-dia de custo

O card **Custo por MQL** ganhou um indicador de **ideal-dia de custo**:

- calcula o teto total de gasto do período como `meta_custo_por_mql * meta_mql_do_mesmo_periodo`
- mostra o teto acumulado ideal até hoje
- mostra quanto ainda pode ser gasto por dia, daqui pra frente, para fechar dentro da meta

Se não existir meta de MQL com o **mesmo período** da meta de custo/MQL, o card exibe o custo/MQL atual normalmente, mas não calcula o ideal-dia de custo.

---

## Filtros opcionais

### Canal

Filtra **leads e investimento Meta Ads** pelo canal selecionado.

**Leads:**
```sql
AND c.utm_source = 'facebook-1'  -- valor exato de utm_sources.utm_source
```

**Investimento (Meta Ads):**
Cada canal em `utm_sources` tem um `public_code` (ex: `"P20"`).
O hook filtra `meta_ads_insights` mantendo apenas anúncios onde `ad_name` contém esse código:

```typescript
// Hook: sourcePublicCodeRef mapeia utm_source → public_code
finalMetaRows = metaRows.filter(r => r.ad_name?.includes(publicCode))
```

Fallback: canal sem `public_code` cadastrado → investimento não filtrado (mostra total do período).

### Funil (cross-ref `utm_campaigns.funnels` JSONB array)

```sql
-- Encontrar utm_campaign codes do funil desejado
SELECT utm_campaign FROM utm_campaigns
WHERE funnels::jsonb @> '["nome-do-funil"]';

-- Aplicar no filtro
AND c.utm_campaign IN (SELECT utm_campaign FROM utm_campaigns
                       WHERE funnels::jsonb @> '["nome-do-funil"]')
```

### Campanha [cp] (nome → código numérico)

```sql
AND c.utm_campaign IN (SELECT utm_campaign FROM utm_campaigns WHERE nome = 'Nome da Campanha')
```

### Campanha Meta

O filtro de **Campanha Meta** funciona em 2 lados:

- investimento: filtra `meta_ads_insights.campaign_name`
- cohort CRM: cruza o nome da campanha com `utm_campaigns.nome` e daí para `contatos.utm_campaign`

**Comportamento atual quando falta mapeamento no CRM:**

- o investimento continua filtrado
- o cohort e zerado por seguranca
- a UI mostra um aviso explicito informando que falta cadastro em `utm_campaigns`

### Modo Todos / MQL

O painel **nao usa mais pipeline para definir MQL**.

Regra atual:

- `Todos` = nao aplica filtro de qualificacao
- `MQL` = mantem apenas oportunidades cujo contato tem a tag `mql` em `contatos.tags`

```typescript
function isMqlByTag(contato: { tags?: string | null } | null | undefined): boolean {
  if (!contato?.tags) return false
  return contato.tags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .some((t) => t === 'mql')
}
```

> `pipeline_name = 'Pré-Vendas MQL'` **nao** e criterio confiavel para a contagem de MQL no painel.

---

## Meta Ads (correlação independente)

```sql
SELECT spend, impressions, clicks, ctr, actions,
       campaign_name, adset_name, ad_name
FROM meta_ads_insights
WHERE date >= 'YYYY-MM-DD'
  AND date <= 'YYYY-MM-DD';
-- leads via actions: actions @> '[{"action_type":"lead"}]'
-- valor do lead: (actions->0->>'value')::numeric
```

---

## Receita (modelo COHORT)

Busca faturamento a partir da data de início do período, filtrado pelos IDs do cohort:

```sql
SELECT vf.oportunidade_id, vf.valor_faturado, vf.valor_entrada
FROM vendas_fechamento vf
WHERE vf.data_pagamento_entrada >= '{startDate}T00:00:00-03:00'
  AND vf.oportunidade_id IN (/* IDs do cohort acima */);
```

---

## Funil de conversão (6 estágios)

```sql
SELECT
  COUNT(*)                                     AS leads,
  -- MQL no painel real e por tag no contato, nao por pipeline
  COUNT(data_conectado)                        AS conectados,
  COUNT(data_agendamento_reuniao)              AS agendados,
  COUNT(data_realizacao_vendas)                AS reunioes_feitas,
  COUNT(data_fechado)                          AS vendas_fechadas
FROM oportunidades o
JOIN contatos c ON c.id = o.contato_id
WHERE o.data_lead_recebido BETWEEN ... AND ...
  AND c.utm_source IN (SELECT utm_source FROM utm_sources);
```

---

## Painel Produtividade — lógica de dados

### Hook: `useProducao.ts`

```typescript
// Filtro de data: eventos (DATE fields, sem offset de timezone)
const dateFilter = [
  `and(data_conectado.gte.${startDate},data_conectado.lte.${endDate})`,
  `and(data_agendamento_reuniao.gte.${startDate},data_agendamento_reuniao.lte.${endDate})`,
  `and(data_realizacao_vendas.gte.${startDate},data_realizacao_vendas.lte.${endDate})`,
  `and(data_fechado.gte.${startDate},data_fechado.lte.${endDate})`,
].join(',')

// PostgREST: OR com grupos AND dentro de cada campo
supabase.from('oportunidades').select(...).or(dateFilter)
```

### computeProducao: tabela por mês de evento

Para cada mês `M` dentro de `[startDate, endDate]`:
- **Conectados** = opps onde `data_conectado` começa com `YYYY-MM`
- **Agendados** = opps onde `data_agendamento_reuniao` começa com `YYYY-MM`
- **Reuniões** = opps onde `data_realizacao_vendas` começa com `YYYY-MM`
- **Fechados** = opps onde `data_fechado` começa com `YYYY-MM`
- **Faturamento** = soma de `valor_faturado` para opps com `data_fechado` no mês

> ⚠️ Uma mesma oportunidade pode aparecer em várias colunas do mesmo mês (ex: conectou E agendou no mesmo mês). Isso é **correto** para produtividade — estamos contando eventos, não leads únicos.

### Percentuais na tabela de Produtividade

Os percentuais exibidos são calculados **dentro do mesmo mês** para dar contexto operacional:
- `% Agendados` = agendados_do_mês / conectados_do_mês
- `% Reuniões` = reunioes_do_mês / agendados_do_mês
- `% Fechados` = fechados_do_mês / reunioes_do_mês

Esses percentuais **não são taxas de conversão do mesmo grupo de leads** (como no Cohort). São apenas índices de atividade do mês para facilitar a leitura.

---

## Notas de implementação

- `utm_origins` + `utm_source_origin_assignments` são usados pela UI de configuração do módulo Traqueamento (aba Origem), **NÃO** pelo Painel Tráfego.
- `excludedCount` conta apenas leads com `utm_source IS NULL` (sem UTM capturado).
- Filtros de canal, funil e campanha são client-side no hook após carregar o cohort.

## Hardening técnico aplicado

### 1. Paginação de oportunidades

O hook pagina `oportunidades` com `.range()` por causa do limite de 1000 linhas do PostgREST.

Correção aplicada:

- ordenação principal por `data_lead_recebido`
- ordenação secundária por `id`
- objetivo: evitar empates silenciosos entre páginas

### 2. Filtro `Campanha Meta` sem mapeamento

Correção aplicada:

- filtro direto em `meta_ads_insights.campaign_name` para investimento
- cross-filter de leads via `utm_campaigns`
- se não houver mapeamento em `utm_campaigns`, o cohort vira `0` e a UI avisa o motivo

## Risco remanescente

Ainda faltam testes automatizados para `useTrafego.ts` e `useCohort.ts`.
