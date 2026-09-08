# Aba "Atividades" — Módulo Pré-Vendas

| Campo | Valor |
|-------|-------|
| **Módulo** | Pré-Vendas (`/pre-vendas?tab=atividades`) |
| **Chave** | `prevendas.atividades` |
| **Status** | ✅ V1 |
| **Criado em** | 2026-03-31 BRT |
| **Atualizado em** | 2026-03-31 17:33 BRT |

---

## Propósito

Tabela operacional para o SDR acompanhar **tudo que fez contato com cada lead** no dia/período — ligações, mensagens WhatsApp/SMS e emails. Voltada para **Produtividade**: mostra a atividade real do time no período selecionado.

---

## Regras de Negócio

### Modo de visualização
- **Funciona apenas em modo Produtividade.** O período é controlado pelos filtros globais de data da página (Hoje, 7d, 30d, etc.).
- Filtra `comunicacoes.data_comunicacao` entre `startDate` e `endDate` (TIMESTAMPTZ em São Paulo).
- **Guard:** quando `activePanel === 'cohort'`, exibe card explicativo no lugar da tabela — não renderiza dados, não faz query.

### Comunicações incluídas
Inclui **todos os tipos de comunicação** do SDR com o lead:

| Tipo | Filtro |
|------|--------|
| Outbound humano (SDR ligou/enviou) | `direction = 'outbound'` E `ghl_source = 'app'` |
| Inbound (lead respondeu) | `direction = 'inbound'` (qualquer canal) |
| Automação (workflow/IA) | Exibida como "Automação" — linha com texto indicativo |

### Dados exibidos
- Linha representa **uma comunicação individual** (não um lead consolidado)
- Vários eventos do mesmo lead = várias linhas
- Ordenação: `data_comunicacao DESC` (mais recente primeiro)

### SDR por comunicação
O `sdr_name` é pego de `oportunidades.sdr_name` via JOIN pelo `contato_id` da comunicação. Follows o padrão do CLAUDE.md: usa `sdr_name` como primário com fallback para `contatos.owner_name`.

### Pipelines excluídos da base
- `Recuperação` continua controlado por `pipelineMode`
  - Pré-Vendas: exclui Recuperação
  - Recuperação: mantém apenas Recuperação
- `Vendas SQL` é sempre excluído das telas/contagens de atividade SDR desse módulo
- A mesma regra é aplicada nos hooks compartilhados de atividade, para evitar divergência entre Pré-Vendas e Recuperação

### LeadCard
- Clique em qualquer linha abre o `LeadCard` do lead com todas as comunicações da conversa.

---

## Hook

**`useLeadAtividades`** (`eb-dash2/src/hooks/useLeadAtividades.ts`)

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `startDate` | `string` | YYYY-MM-DD |
| `endDate` | `string` | YYYY-MM-DD |
| `sdrFilter` | `string` | Filtro por nome do SDR (opcional) |
| `pipelineMode` | `'exclude_recuperacao' \| 'only_recuperacao'` | Controla qual pipeline |
| `enabled` | `boolean` | Ativa/desativa o hook |

**Retorno:**
```typescript
interface LeadAtividadesResult {
  rows: AtividadeRow[]
  total: number
  loading: boolean
  error: string | null
  loadPage: (page: number) => void
}
```

**`AtividadeRow`:**
```typescript
interface AtividadeRow {
  id: string                    // comunicacoes.id
  oppId: string                // oportunidades.id
  contatoId: string            // contatos.id
  leadNome: string | null
  leadTelefone: string | null
  leadEmail: string | null
  sdrName: string | null
  channel: string | null       // 'call' | 'whatsapp' | 'sms' | 'email' | ...
  direction: string | null    // 'inbound' | 'outbound'
  ghlSource: string | null    // 'app' | 'workflow' | 'api' | ...
  mensagemBody: string | null
  dataComunicacao: string | null  // TIMESTAMPTZ
  phoneCallDuration: number | null
  phoneCallStatus: string | null
  msgStatus: string | null
  isAutomatico: boolean        // true = automação
}
```

---

## Colunas

| Coluna | Fonte | Descrição |
|--------|-------|-----------|
| **Data** | `comunicacoes.data_comunicacao` | DD/MM em São Paulo |
| **Lead** | `contatos.nome` | Nome do lead + telefone abaixo |
| **SDR** | `oportunidades.sdr_name` | SDR responsável pela oportunidade |
| **Canal** | `comunicacoes.channel` | Ícone + nome amigável: WhatsApp, Ligação, Email, SMS |
| **Dir.** | `comunicacoes.direction` | IN (lead respondeu) / OUT (SDR enviou) |
| **Mensagem** | `comunicacoes.mensagem_body` | Truncado em 80 chars com "Ver mais". "Automação" se for mensagem de workflow/IA |
| **Horário** | `comunicacoes.data_comunicacao` | HH:MM em São Paulo |
| **Duração** | `comunicacoes.phone_call_duration` | Apenas para ligações: Xm Ys ou — |
| **Status** | `comunicacoes.msg_status` ou `phone_call_status` | Badge colorido (Entregue, Lido, Falhou, Sem resposta, etc.) |

### Badges de status

| Status | Estilo |
|--------|--------|
| `delivered` | Verde claro |
| `read` | Verde mais intenso |
| `sent` | Cinza |
| `failed` | Vermelho |
| `pending` | Amarelo |
| `completed` (ligação) | Verde |
| `no-answer` (ligação) | Vermelho |
| `busy` (ligação) | Vermelho |
| `canceled` (ligação) | Vermelho |

---

## Ícones de canal

| Canal | Ícone | Cor |
|-------|-------|-----|
| `call` | Phone | Cinza |
| `whatsapp` | MessageSquare | Verde (#25D366) |
| `sms` | MessageSquare | Verde |
| `email` | Mail | Vermelho (#EA4335) |
| demais | Smartphone | Cinza |

---

## Paginação

- **50 resultados por página**
- Contador: "X–Y de Z"
- Navegação: ‹ › + números de página
- Elipsis para listas longas (>7 páginas)

---

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `eb-dash2/src/hooks/useLeadAtividades.ts` | Hook com paginação, join SDR, agregação |
| `eb-dash2/src/pages/prevendas/tabs/AtividadesTab.tsx` | Componente da tab |
| `eb-dash2/src/components/leads/LeadCard.tsx` | Modal de detalhes do lead |
