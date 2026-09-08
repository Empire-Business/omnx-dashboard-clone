# Aba Cami — Módulo Vendas

> Painel dedicado ao produto **Cami Start**, que é monitorado via tags nos contatos do GHL e não mistura com o funil de vendas principal.

---

## Localização

`/vendas?tab=cami` — aba `Cami` no módulo Vendas, sidebar: Vendas → Cami.

---

## Lógica de tags

| Tag | Significado | Campo |
|-----|-------------|-------|
| `[cp] cami start` | Lead se **inscreveu** no produto | `contatos.tags` |
| `cami start` | Lead **comprou** o produto | `contatos.tags` |

**Regra crítica:** inscritos e compradores são populações **independentes**. Um comprador não precisa ter a tag `[cp] cami start`. Ambos são filtrados diretamente do pool de oportunidades — nunca um como subconjunto do outro.

```typescript
// CORRETO — independentes
const inscritos   = allOpps.filter(o => isCamiInscrito(parseTags(o.contatos?.tags)))
const compradores = allOpps.filter(o => isCamiComprador(parseTags(o.contatos?.tags)))

// ERRADO — compradores invisíveis se não tiverem [cp] cami start
const compradores = inscritos.filter(o => isCamiComprador(...))
```

---

## Fonte de dados

**Hook:** `eb-dash2/src/hooks/useCamiVendas.ts`

**Query:** `oportunidades` com join `contatos(nome, email, telefone, tags, utm_source, owner_name)`, filtrada por `data_lead_recebido` no período selecionado.

**Sem dados financeiros:** a aba Cami não consulta `vendas_fechamento`. Não há informação de valor de venda para este produto no CRM.

**Paginação obrigatória:** loop `.range()` (padrão PostgREST max_rows=1000).

**Pipeline excluído:** `PIPELINE_RECUPERACAO_ID` — leads reativados não entram na contagem.

---

## Cohort vs Produtividade

Como não há uma "data de compra" distinta nos dados, ambos os modos usam `data_lead_recebido` como data de referência:

| Modo | Inscritos | Compradores |
|------|-----------|-------------|
| **Cohort** | Leads com tag `[cp] cami start` gerados no período | Leads com tag `cami start` gerados no período |
| **Produtividade** | Igual ao cohort (mesma lógica, data do lead) | Igual ao cohort |

Quando houver uma data de compra no CRM (ex: `data_pagamento_entrada` preenchida para Cami), atualizar o modo Produtividade para filtrar compradores por essa data.

---

## Componentes

### KPI Cards (3 cards)

| Card | Variante | Fonte |
|------|----------|-------|
| Inscritos | `info` | `inscritos.length` |
| Compradores | `success` | `compradores.length` |
| Conversão | `highlight` | `compradores / inscritos * 100` |

### Gráfico dia-a-dia (`CamiBarChart`)

- SVG puro, sem biblioteca externa
- Barras lado a lado: azul = inscritos, verde = compradores
- Eixo X com até 8 labels espaçadas uniformemente
- Tooltip ao hover com data + contagens
- Opacidade reduzida nas barras não hovereadas

### Tabela (`CamiTable`)

Colunas: **Nome · E-mail · Telefone · Status · Inscrição · Canal · SDR**

- Busca por nome/e-mail/telefone (lado cliente)
- Ordenação por qualquer coluna
- Hover dourado nas linhas (`rgba(201,162,64,0.06)`)
- **Clique em linha → abre `LeadCard`** (drawer lateral com todos os dados do lead)
- A tabela une inscritos + compradores sem duplicar (Set por `id`)

### LeadCard

```typescript
const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
// ...
<LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
```

Mesmo padrão usado em `ReunioesTab`, `LeadsParadosTab` e outros módulos.

---

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `eb-dash2/src/hooks/useCamiVendas.ts` | Hook de dados — query, filtros por tag, gráfico |
| `eb-dash2/src/pages/vendas/tabs/CamiTab.tsx` | Componente da aba — KPIs, gráfico, tabela, LeadCard |
| `eb-dash2/src/pages/vendas/VendasPage.tsx` | Registro da aba no array TABS + instância do hook |
| `eb-dash2/src/components/layout/Sidebar.tsx` | Link `Cami` no menu lateral (Vendas → Cami) |

---

## Evolução futura

Quando o CRM começar a registrar data de compra para Cami Start (ex: `data_pagamento_entrada` em `vendas_fechamento`):

1. Reativar fetch de `vendas_fechamento` no hook
2. Separar modo Produtividade: compradores por `data_pagamento_entrada` no período
3. Adicionar card de Faturamento com `valor_faturado`
4. Adicionar coluna "Data Compra" na tabela
