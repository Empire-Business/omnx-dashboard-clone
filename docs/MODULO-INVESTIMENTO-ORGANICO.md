# Módulo: Investimento Orgânico (Custos de Equipe)

> Atualizado em: 2026-04-25 BRT

Gerenciamento de custos da equipe orgânica (designers, social media, copywriters, etc.) com rastreamento mensal por canal. Os valores são usados para calcular o ROI dos canais orgânicos no painel Orgânico.

---

## Onde acessar

**Dashboard → Orgânico → Visão Geral → botão "Gerenciar Investimentos"** (canto superior direito, dourado).

---

## Tabelas

### `organic_investment_items`

Define cada linha de custo — quem/o quê é cobrado.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | — |
| `workspace_id` | UUID FK → workspaces | — |
| `name` | TEXT | Nome do custo (ex: "Designer - Ana") |
| `category` | TEXT | `social_media` \| `design` \| `video` \| `copywriter` \| `other` |
| `utm_source` | TEXT \| NULL | Canal orgânico específico; NULL = geral (todos os canais) |
| `recurrence` | TEXT | `monthly` \| `once` |
| `is_active` | BOOLEAN | Soft delete — itens excluídos recebem `is_active = false` |
| `sort_order` | INTEGER | Ordem de exibição na tabela |

**RLS:** workspace_members com `is_active = true` podem SELECT/INSERT/UPDATE/DELETE.

### `organic_investments`

Entradas mensais de valor por item.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | — |
| `workspace_id` | UUID FK → workspaces | — |
| `item_id` | UUID FK → organic_investment_items | NULL = entrada geral sem item |
| `period_start` | DATE | Sempre o dia 1 do mês (ex: `2026-04-01`) |
| `period_end` | DATE | Último dia do mês (ex: `2026-04-30`) |
| `year_month` | TEXT GENERATED | Gerado automaticamente de `period_start` (ex: `"2026-04"`) |
| `utm_source` | TEXT \| NULL | Herdado do item; pode ser sobrescrito |
| `amount` | DECIMAL(12,2) | Valor em BRL; CHECK amount > 0 |
| `description` | TEXT \| NULL | — |

**Unique index:** `(item_id, year_month) WHERE item_id IS NOT NULL` — um registro por item por mês.

**RLS:** mesmas políticas de `organic_investment_items`.

**Migration:** `supabase/migrations/20260424100000_create_organic_investments.sql`

---

## Hooks

### `useOrganicInvestments` — `eb-dash2/src/hooks/useOrganicInvestments.ts`

Carrega todos os investimentos do workspace e constrói o `gridMap`.

```typescript
const { investments, gridMap, loading, refetch } = useOrganicInvestments()
```

- `investments`: array bruto de `OrganicInvestment[]`
- `gridMap`: `Map<item_id, Map<year_month, OrganicInvestment>>` — acesso O(1) para a célula da planilha
- `refetch()`: re-dispara o fetch incrementando um `tick` interno

### `useOrganicInvestmentItems` — `eb-dash2/src/hooks/useOrganicInvestmentItems.ts`

Carrega os itens ativos do workspace (apenas `is_active = true`).

```typescript
const { items, loading, workspaceId, refetch } = useOrganicInvestmentItems()
```

- `workspaceId`: exposto para uso direto no modal de inserção

---

## Função `computeOrganicInvestment`

Soma os investimentos que se sobrepõem ao período do filtro ativo.

```typescript
import { computeOrganicInvestment } from '@/hooks/useOrganicInvestments'

const total = computeOrganicInvestment(
  investments,
  filters.startDate,   // "YYYY-MM-DD"
  filters.endDate,     // "YYYY-MM-DD"
  activeChannels       // null = sem filtro; string[] = canais selecionados
)
```

**Regras de inclusão:**
- Investimento com `utm_source = null` (geral): **sempre incluído**, independente do filtro de canal
- Investimento com `utm_source` específico e `activeChannels = null`: incluído (sem filtro)
- Investimento com `utm_source` específico e `activeChannels = [...]`: incluído somente se o canal estiver na lista

---

## Componente `CustosEquipeModal`

**Arquivo:** `eb-dash2/src/components/organico/CustosEquipeModal.tsx`

Planilha interativa em modal (portal para `document.body`).

### Props

```typescript
interface CustosEquipeModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  organicSources: { utm_source: string; nome: string }[]  // canais orgânicos disponíveis
  items: OrganicInvestmentItem[]
  gridMap: InvestmentGridMap
  onRefetch: () => void
}
```

### Funcionalidades

| Feature | Descrição |
|---------|-----------|
| Navegação de meses | Exibe 6 meses centrados no `centerYM` (padrão: mês atual); setas ◀ ▶ para navegar |
| Edição inline | Clique em qualquer célula → input numérico + botão ✓ |
| Replicar → | Copia o valor para todos os meses seguintes na janela visível (só para itens `recurrence = monthly`) |
| Apagar | Valor vazio ou 0 → deleta o registro do banco |
| Adicionar custo | Formulário inline no topo da tabela (nome, categoria, canal, recorrência) |
| Editar nome | Hover na linha → ícone lápis → edição inline do nome |
| Excluir item | Hover na linha → ícone lixeira → soft delete (`is_active = false`) + apaga investimentos filhos |
| Totais | Linha "Total Mensal" no rodapé + coluna "Total" por linha |

### Navegação de meses

A janela exibe sempre 6 colunas: os 3 meses anteriores ao centro + o centro + 2 meses seguintes.

```typescript
// getMonthCols("2026-04") → ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"]
```

---

## Integração em OrganicoPage

**Arquivo:** `eb-dash2/src/pages/organico/OrganicoPage.tsx`

```typescript
const { investments, gridMap, refetch: refetchInvestments } = useOrganicInvestments()
const { items: investmentItems, workspaceId, refetch: refetchItems } = useOrganicInvestmentItems()
const [investModalOpen, setInvestModalOpen] = useState(false)

const handleRefetchAll = () => { refetchInvestments(); refetchItems() }

// Calcula o total de investimento para o período+canal ativos:
const organicInvestment = useMemo(
  () => computeOrganicInvestment(investments, filters.startDate, filters.endDate, activeChannelIncludes),
  [investments, filters.startDate, filters.endDate, filters.channel.include]
)
```

O botão "Gerenciar Investimentos" fica na aba `visao-geral`, acima do `<AquisicaoTab>`.

---

## Padrão de categorias

| Chave | Label | Cor |
|-------|-------|-----|
| `social_media` | Social Media | índigo `#6366f1` |
| `design` | Design | rosa `#ec4899` |
| `video` | Vídeo | âmbar `#f59e0b` |
| `copywriter` | Copywriter | teal `#14b8a6` |
| `other` | Outro | cinza `#6b7280` |

Constantes em `CATEGORY_LABELS` e `CATEGORY_COLORS` exportadas de `useOrganicInvestmentItems.ts`.

---

## Queries úteis

```sql
-- Verificar dados cadastrados
SELECT i.name, i.category, i.utm_source, i.recurrence,
       v.year_month, v.amount
FROM organic_investment_items i
LEFT JOIN organic_investments v ON v.item_id = i.id
WHERE i.is_active = true
ORDER BY i.sort_order, v.year_month;

-- Total por mês
SELECT year_month, SUM(amount) AS total
FROM organic_investments
GROUP BY year_month
ORDER BY year_month;
```
