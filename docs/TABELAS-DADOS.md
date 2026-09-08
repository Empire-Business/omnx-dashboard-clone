# Documentação Técnica: Tabelas de Dados Profissionais

> **Versão:** 1.0
> **Última Atualização:** Fevereiro 2026
> **Público:** Desenvolvedores do Sistema Empire

---

## Introdução

Este documento estabelece o padrão técnico para criação de tabelas de dados no sistema Empire Dashboard. Uma tabela de dados profissional combina estrutura visual limpa com interatividade completa.

**Características obrigatórias de uma tabela profissional:**

1. **Estrutura visual** - Colunas e linhas organizadas
2. **Ordenação** - Classificar por qualquer coluna
3. **Navegação** - Paginação para muitos dados
4. **Visualização** - Tela cheia para análise detalhada
5. **Personalização** - Escolher quais colunas mostrar
6. **Totalização** - Somatórios e métricas agregadas
7. **Interatividade** - Detalhes clicáveis nas células

---

## Parte 1: Estrutura de Dados

### 1.1 Definição de Colunas

Cada tabela deve ter sua estrutura definida em um array de objetos:

```typescript
interface Column {
  key: string;
  label: string;
  format?: 'currency' | 'number' | 'percent' | 'multiplier' | 'date';
  pinned?: boolean;      // Primeira coluna fixa
  sortable?: boolean;
  clickable?: boolean;   // Abre modal com detalhes
  width?: number;
  visible?: boolean;     // Para controle de visibilidade
}
```

### 1.2 Exemplo de Definição

```typescript
const COLUMNS = [
  { key: 'name', label: 'Anúncio', pinned: true, width: 240 },
  { key: 'spend', label: 'Investimento', format: 'currency', sortable: true },
  { key: 'revenue', label: 'Faturamento', format: 'currency', sortable: true },
  { key: 'roas', label: 'ROAS', format: 'multiplier', sortable: true },
  { key: 'leads', label: 'Leads', format: 'number', clickable: true, sortable: true },
  { key: 'sales', label: 'Vendas', format: 'number', clickable: true, sortable: true },
];
```

---

## Parte 2: Estrutura HTML/CSS

### 2.1 HTML Semântico

```tsx
<div className="tabela-container">
  <table>
    <thead>
      <tr>
        {columns.map(col => (
          <th key={col.key}>{col.label}</th>
        ))}
      </tr>
    </thead>

    <tbody>
      {data.map(row => (
        <tr key={row.id}>
          {columns.map(col => (
            <td key={col.key}>{formatCell(row[col.key], col.format)}</td>
          ))}
        </tr>
      ))}
    </tbody>

    <tfoot>
      <tr>
        <td><strong>TOTAL</strong></td>
        <td><strong>{formatCurrency(totals.spend)}</strong></td>
        <td><strong>{formatCurrency(totals.revenue)}</strong></td>
        <td><strong>{formatMultiplier(derived.roas)}</strong></td>
      </tr>
    </tfoot>
  </table>
</div>
```

### 2.2 CSS Essentials

```css
/* Container com scroll horizontal */
.tabela-container {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

/* Tabela ocupa largura mínima */
table {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
}

/* Cabeçalho fixo ao rolar */
thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
}

/* Primeira coluna fixa (sticky) */
th:first-child,
td:first-child {
  position: sticky;
  left: 0;
  z-index: 20;
  background: white;
  box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
}

/* Cabeçalho da primeira coluna com z-index maior */
thead th:first-child {
  z-index: 30;
}

/* Estilo das células */
th, td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

/* Cabeçalho mais forte */
th {
  background: #f8fafc;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #64748b;
}

/* Linhas com hover */
tbody tr:hover {
  background: #f1f5f9;
}

/* Números alinhados à direita */
td:nth-child(2),
td:nth-child(3),
td:nth-child(4) {
  text-align: right;
}

/* Rodapé com totais */
tfoot tr {
  background: #f1f5f9;
  font-weight: bold;
  border-top: 2px solid #cbd5e1;
}
```

---

## Parte 3: Estado do Componente

### 3.1 Estados Necessários

```typescript
function DataTable({ data }: { data: Row[] }) {
  // Ordenação
  const [sortBy, setSortBy] = useState<string>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Personalização
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
}
```

---

## Parte 4: Ordenação (Sort)

### 4.1 Função de Ordenação

```typescript
function sortData(data: Row[], sortBy: string, sortDir: 'asc' | 'desc'): Row[] {
  return [...data].sort((a, b) => {
    const va = a[sortBy as keyof Row];
    const vb = b[sortBy as keyof Row];

    if (typeof va === 'string') {
      const comp = va.localeCompare(vb as string, 'pt-BR');
      return sortDir === 'asc' ? comp : -comp;
    }

    // Para números
    const comp = (va as number || 0) - (vb as number || 0);
    return sortDir === 'asc' ? comp : -comp;
  });
}
```

### 4.2 Alternar Direção

```typescript
function cycleSort(column: string) {
  if (sortBy !== column) {
    setSortBy(column);
    setSortDir('desc'); // Começa do maior para menor
  } else {
    setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
  }
}
```

### 4.3 Ícones de Ordenação

| Estado | Ícone | Significado |
|--------|-------|-------------|
| Crescente | ↑ | Smaller to larger |
| Decrescente | ↓ | Larger to smaller |
| Não ordenado | ↕ | Click to sort |

---

## Parte 5: Paginação

### 5.1 Cálculos

```typescript
const totalItems = data.length;
const totalPages = Math.ceil(totalItems / pageSize);
const startIndex = (page - 1) * pageSize;
const endIndex = Math.min(startIndex + pageSize, totalItems);

// Dados da página atual
const paginatedData = sortedData.slice(startIndex, endIndex);
```

### 5.2 Controles

```typescript
// Navegação
function goToPage(p: number) {
  if (p >= 1 && p <= totalPages) setPage(p);
}

function nextPage() {
  goToPage(page + 1);
}

function prevPage() {
  goToPage(page - 1);
}

// Tamanho da página
function handlePageSizeChange(newSize: number | 'all') {
  if (newSize === 'all') {
    setPageSize(totalItems);
  } else {
    setPageSize(newSize);
  }
  setPage(1);
}
```

### 5.3 Selector de Itens por Página

```tsx
<Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
  <SelectTrigger>{pageSize}</SelectTrigger>
  <SelectContent>
    <SelectItem value="10">10</SelectItem>
    <SelectItem value="25">25</SelectItem>
    <SelectItem value="50">50</SelectItem>
    <SelectItem value="100">100</SelectItem>
    <SelectItem value="all">Todos</SelectItem>
  </SelectContent>
</Select>
```

---

## Parte 6: Tela Cheia (Fullscreen)

### 6.1 Implementação

```typescript
const [isFullscreen, setIsFullscreen] = useState(false);

function toggleFullscreen() {
  if (!isFullscreen) {
    containerRef.current?.requestFullscreen();
    setIsFullscreen(true);
  } else {
    document.exitFullscreen();
    setIsFullscreen(false);
  }
}

// Listener para sair com ESC
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setIsFullscreen(false);
  }
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 6.2 CSS Condicional

```tsx
<div className={isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : 'w-full'}>
  {/* Toolbar */}
  <Button onClick={toggleFullscreen}>
    {isFullscreen ? <Minimize2 /> : <Maximize2 />}
    {isFullscreen ? 'Sair' : 'Tela cheia'}
  </Button>

  {/* Tabela */}
  <div className="overflow-auto" style={{ maxHeight: isFullscreen ? 'calc(100vh - 100px)' : '500px' }}>
    <Table />
  </div>
</div>
```

---

## Parte 7: Personalização de Colunas

### 7.1 Visibilidade

```typescript
// Estado inicial - todas visíveis
const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
  const saved = localStorage.getItem('tableColumns');
  return saved ? JSON.parse(saved) : {};
});

// Toggle visibilidade
function toggleColumn(key: string) {
  setVisibleCols(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem('tableColumns', JSON.stringify(next));
    return next;
  });
}

// Renderizar apenas colunas visíveis
{columns
  .filter(col => visibleCols[col.key] !== false)
  .map(col => (
    <th key={col.key}>{col.label}</th>
  ))}
```

### 7.2 Menu de Colunas

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      <Settings /> Colunas
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    {columns.map(col => (
      <label key={col.key} className="flex items-center gap-2">
        <Checkbox
          checked={visibleCols[col.key] !== false}
          onCheckedChange={() => toggleColumn(col.key)}
        />
        {col.label}
      </label>
    ))}
  </PopoverContent>
</Popover>
```

---

## Parte 8: Formatação de Dados

### 8.1 Funções de Formatação

```typescript
// Moeda (Real Brasileiro)
function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

// Número inteiro
function formatNumber(value: number | null | undefined): string {
  if (!value && value !== 0) return '0';
  return new Intl.NumberFormat('pt-BR').format(value);
}

// Porcentagem
function formatPercent(value: number | null | undefined): string {
  if (!value && value !== 0) return '0.00%';
  return `${value.toFixed(2)}%`;
}

// Múltiplo (como ROAS)
function formatMultiplier(value: number | null | undefined): string {
  if (!value && value !== 0) return '0.00x';
  return `${value.toFixed(2)}x`;
}

// Data
function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}
```

### 8.2 Tipos de Dados Suportados

| Tipo | Exemplo | Como Exibir |
|------|---------|-------------|
| Texto | Nome do anúncio | Texto simples |
| Número | Investimento (R$) | `formatCurrency()` |
| Número | Leads | `formatNumber()` |
| Porcentagem | CTR | `formatPercent()` |
| Múltiplo | ROAS | `formatMultiplier()` |
| Data | Data de criação | `formatDate()` |
| Imagem | Thumbnail | Miniatura clicável |

---

## Parte 9: Totalização e Métricas

### 9.1 Cálculo de Totais

```typescript
const totals = useMemo(() => {
  const sum = {
    spend: 0,
    grossRevenue: 0,
    leadsCount: 0,
  };

  // Soma TODOS os registros (não apenas página atual)
  for (const row of sortedData) {
    sum.spend += row.spend || 0;
    sum.grossRevenue += row.grossRevenue || 0;
    sum.leadsCount += row.leadsCount || 0;
  }

  return sum;
}, [sortedData]);
```

### 9.2 Métricas Derivadas

```typescript
const derivedMetrics = useMemo(() => {
  return {
    // ROAS = Faturamento / Investimento
    roas: totals.spend > 0
      ? totals.grossRevenue / totals.spend
      : 0,

    // CPL = Investimento / Leads
    cpl: totals.leadsCount > 0
      ? totals.spend / totals.leadsCount
      : 0,

    // CTR = Cliques / Impressões * 100
    ctr: totals.impressions > 0
      ? (totals.clicks / totals.impressions) * 100
      : 0,
  };
}, [totals]);
```

### 9.3 Renderização no Rodapé

```tsx
<tfoot>
  <tr>
    <td><strong>TOTAL</strong></td>
    <td><strong>{formatCurrency(totals.spend)}</strong></td>
    <td><strong>{formatCurrency(totals.grossRevenue)}</strong></td>
    <td><strong>{formatMultiplier(derivedMetrics.roas)}</strong></td>
    <td><strong>{formatNumber(totals.leadsCount)}</strong></td>
  </tr>
</tfoot>
```

---

## Parte 10: Células Clicáveis

### 10.1 Implementação

```typescript
const [modalOpen, setModalOpen] = useState(false);
const [modalData, setModalData] = useState<any[]>([]);
const [modalTitle, setModalTitle] = useState('');

function handleCellClick(row: Row, column: string) {
  // Mapear coluna para dados do modal
  const leadsMap: Record<string, any[]> = {
    all: row.allLeads,
    mql: row.mqlLeads,
    sql: row.sqlLeads,
    venda: row.vendasLeads,
  };

  const data = leadsMap[column] || [];
  setModalData(data);
  setModalTitle(`${column.toUpperCase()} - ${row.name}`);
  setModalOpen(true);
}
```

### 10.2 Renderização da Célula

```tsx
<td>
  {column.clickable ? (
    <button
      className="underline text-primary hover:text-primary/80"
      onClick={() => handleCellClick(row, column.key)}
    >
      {formatCell(row[column.key], column.format)}
    </button>
  ) : (
    formatCell(row[column.key], column.format)
  )}
</td>
```

### 10.3 Modal de Detalhes

```tsx
<Dialog open={modalOpen} onOpenChange={setModalOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{modalTitle}</DialogTitle>
    </DialogHeader>

    <div className="max-h-[400px] overflow-auto">
      {modalData.length === 0 ? (
        <p className="text-muted">Nenhum registro encontrado</p>
      ) : (
        <ul className="divide-y">
          {modalData.map((item, i) => (
            <li key={i} className="p-2">
              {item.name} - {item.email}
            </li>
          ))}
        </ul>
      )}
    </div>
  </DialogContent>
</Dialog>
```

---

## Parte 11: Componente Completo

### 11.1 Estrutura Final

```tsx
interface DataTableProps {
  data: Row[];
  columns: Column[];
}

export function DataTable({ data, columns }: DataTableProps) {
  // Estado
  const [sortBy, setSortBy] = useState('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dados ordenados
  const sortedData = useMemo(() => {
    return sortData(data, sortBy, sortDir);
  }, [data, sortBy, sortDir]);

  // Dados paginados
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  // Totais
  const totals = useMemo(() => {
    const sum = { spend: 0, revenue: 0, leads: 0 };
    for (const row of sortedData) {
      sum.spend += row.spend || 0;
      sum.revenue += row.revenue || 0;
      sum.leads += row.leads || 0;
    }
    return sum;
  }, [sortedData]);

  return (
    <div ref={containerRef} className={isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : ''}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={toggleFullscreen}>
            <Maximize2 /> {isFullscreen ? 'Sair' : 'Tela cheia'}
          </Button>
          <ColumnSettings columns={columns} />
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
        </div>
        <div className="text-sm text-muted">
          Mostrando {startIndex + 1}–{endIndex} de {totalItems}
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-auto" style={{ maxHeight: isFullscreen ? 'calc(100vh - 150px)' : '500px' }}>
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && cycleSort(col.key)}
                  className={col.sortable ? 'cursor-pointer' : ''}
                >
                  {col.label} {sortIcon(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map(row => (
              <tr key={row.id}>
                {columns.map(col => (
                  <td key={col.key} onClick={() => col.clickable && handleClick(row, col.key)}>
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTAL</strong></td>
              <td><strong>{formatCurrency(totals.spend)}</strong></td>
              <td><strong>{formatCurrency(totals.revenue)}</strong></td>
              <td><strong>{formatMultiplier(totals.revenue / totals.spend)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Paginação */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
```

---

## Parte 12: Estados de Interface

### 12.1 Loading (Skeleton)

```tsx
{isLoading && (
  <div className="space-y-2">
    {[...Array(5)].map((_, i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
)}
```

### 12.2 Vazio

```tsx
{data.length === 0 && (
  <div className="text-center py-8 text-muted">
    <p>Nenhum registro encontrado</p>
  </div>
)}
```

### 12.3 Erro

```tsx
{error && (
  <div className="text-center py-8 text-error">
    <p>Erro ao carregar dados</p>
    <Button variant="outline" onClick={refetch}>
      Tentar novamente
    </Button>
  </div>
)}
```

---

## Parte 13: Checklist de Implementação

### Essenciais
- [ ] Estrutura HTML semântica (`table`, `thead`, `tbody`, `tfoot`)
- [ ] Cabeçalho visível ao rolar verticalmente
- [ ] Primeira coluna fixa ao rolar horizontalmente
- [ ] Ordenação por clique no cabeçalho Formatação correta de cada tipo de dado

### Interatividade
- [ ]
- [ ] Paginação com controles Anterior/Próximo
- [ ] Selector de itens por página
- [ ] Números de página com ellipsis quando necessário

### Personalização
- [ ] Botão para tela cheia
- [ ] Menu para mostrar/ocultar colunas
- [ ] Preferências salvas no LocalStorage

### Totais
- [ ] Linha de totais no rodapé
- [ ] Totais calculados sobre todos os dados
- [ ] Métricas derivadas (ROAS, CPL, etc.)

### UI/UX
- [ ] Feedback visual de hover nas linhas
- [ ] Células clicáveis com indicação visual
- [ ] Loading state (skeleton) enquanto carrega
- [ ] Mensagem quando não há dados

---

## Referências

- [REGRA: Padrão de Tabelas de Dados](vibe-coding/PROTOCOLOS/26-TABELAS-DADOS.md)
- [Protocolo de Design System](vibe-coding/PROTOCOLOS/09-DESIGN.md)

---

## Histórico

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | Fevereiro 2026 | Versão inicial com guia completo |
