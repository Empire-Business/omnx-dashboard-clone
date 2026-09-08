# 05 — Módulo: Oportunidades (Deals/Leads)

> **O que este documento cobre:** Gestão de oportunidades (deals/leads) — pipelines, stages, kanban, datas de pipeline, qualificação MQL, motivos de perda, e o funil de vendas completo.

---

## O que é uma Oportunidade?

Uma **oportunidade** representa uma intenção de compra em um momento específico. É o "lead" no sentido operacional.

**Analogia:** Pense em um funil de vendas como um cano d'água. A oportunidade é como uma gota d'água que entra no topo do funil e vai descendo até sair como "venda fechada" (ou evaporar como "perda"). Em cada etapa do cano, a gota tem um nome diferente: "Novo Lead", "Conectado", "Qualificado", "Agendado", "Reunião Realizada", "Fechado".

**Diferença do contato:** O contato é a PESSOA. A oportunidade é a JORNADA de compra. Um João Silva pode ter 3 oportunidades se tentou comprar 3 vezes.

---

## 1. Pipelines e Stages

### O que é um Pipeline?

Um pipeline é um **funil de vendas** com etapas. Você pode ter múltiplos pipelines para diferentes produtos ou processos.

**Pipelines típicos da Empire Business:**
```
Pipeline: Pré-Vendas MQL
Stages: Novo Lead → Em Tentativa → Conectado → Qualificado → Agendado Reunião → Perdido Pré-Vendas

Pipeline: Vendas SQL
Stages: Reunião Agendada → Reunião Realizada → Em Negociação → Pendências → Fechado → Perdido Vendas

Pipeline: Inbound WhatsApp
Stages: Novo → Respondido → Qualificado → Encaminhado Vendas

Pipeline: Recuperação
Stages: Inativo → Re-engajado → Qualificado Novamente → Agendado
```

### Requisitos Funcionais de Pipelines

**RF-OPP-001:** O usuário pode criar pipelines ilimitados no workspace.

**RF-OPP-002:** Cada pipeline pode ter quantas stages (etapas) quiser, na ordem que preferir.

**RF-OPP-003:** Stages podem ser reordenadas por drag-and-drop.

**RF-OPP-004:** Cada stage tem um **tipo** que ativa comportamentos automáticos:
- `tipo: "conectado"` → preenche `data_conectado` ao mover oportunidade para esta stage
- `tipo: "agendado"` → preenche `data_agendamento_reuniao`
- `tipo: "fechado"` → muda `status` da oportunidade para `"won"`
- `tipo: "perdido"` → muda `status` para `"lost"`, pede motivo de perda

**RF-OPP-005:** Pipelines do tipo `is_recuperacao: true` são excluídos de todas as contagens de leads (são leads reativados, não novos leads).

---

## 2. Visualizações do Funil

### 2.1 Kanban View

**RF-OPP-006:** A visão Kanban exibe colunas (uma por stage) com os cards das oportunidades.

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   Novo Lead     │   Conectado     │   Qualificado   │   Agendado      │
│   (47 leads)    │   (23 leads)    │   (15 leads)    │   (8 leads)     │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │ ┌─────────────┐ │
│ │ João Silva  │ │ │ Maria Costa │ │ │ Carlos Lima │ │ │ Ana Santos  │ │
│ │ Facebook    │ │ │ Google      │ │ │ Facebook    │ │ │ 15/04 10h  │ │
│ │ Hoje        │ │ │ 3 dias      │ │ │ MQL ✓       │ │ │ MQL ✓       │ │
│ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │ └─────────────┘ │
│ ┌─────────────┐ │                 │                 │                 │
│ │ Pedro Alves │ │                 │                 │                 │
│ │ Instagram   │ │                 │                 │                 │
│ │ 2h atrás    │ │                 │                 │                 │
│ └─────────────┘ │                 │                 │                 │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

**RF-OPP-007:** Cards no Kanban mostram:
- Nome do contato
- Canal de origem
- Tempo no stage atual
- Indicador MQL (se tiver tag "mql")
- Data da próxima reunião (se agendada)

**RF-OPP-008:** Arrastar um card entre colunas move o lead de stage.

### 2.2 List View

**RF-OPP-009:** A visão em lista exibe uma tabela com:
- Nome do contato
- Email
- Telefone
- Pipeline / Stage atual
- Data de criação
- Tempo no stage
- SDR responsável
- Tags (badges)
- Ações rápidas (mover stage, abrir perfil)

**RF-OPP-010:** A lista suporta filtros por:
- Pipeline
- Stage
- SDR
- Tags
- Data de criação
- Status (open/won/lost)
- Canal de origem

---

## 3. Datas de Pipeline

As datas de pipeline registram **quando** o lead passou por cada etapa. São essenciais para rastreamento operacional e histórico do lead.

### Datas de Pré-Vendas
| Campo | Quando é preenchido |
|-------|---------------------|
| `data_tentativa_1..8` | Quando o SDR registra uma tentativa de contato |
| `data_conectado` | Quando o SDR conseguiu falar com o lead |
| `data_no_show` | Quando reunião de pré-vendas não aconteceu |
| `data_qualificado` | Quando o lead foi marcado como qualificado |
| `data_perdido` | Quando o lead foi perdido em pré-vendas |
| `data_agendamento_reuniao` | Quando a reunião foi agendada |
| `data_reuniao_agendada` | A data marcada para a reunião |
| `data_auto_agendamento` | Quando o lead usou Calendly para se auto-agendar |

### Datas de Vendas (Closer)
| Campo | Quando é preenchido |
|-------|---------------------|
| `data_agendamento_vendas` | Quando closer agendou com o lead |
| `data_realizacao_vendas` | Quando a reunião de vendas aconteceu |
| `data_no_show_vendas` | Lead não apareceu na reunião de vendas |
| `data_negociacao` | Lead entrou em fase de negociação |
| `data_perdido_vendas` | Lead foi perdido em vendas |
| `data_pendencias` | Aguardando pendências antes de fechar |
| `data_fechado` | Lead foi marcado como fechado (move stage para "Fechado") |

**ATENÇÃO CRÍTICA:** `data_fechado` ≠ "venda concluída". Uma oportunidade só conta como **venda** quando `vendas_fechamento.data_pagamento_entrada` está preenchida. Ver tabela `vendas_fechamento` no modelo de dados.

---

## 4. Qualificação MQL

### O que é MQL?

MQL (Marketing Qualified Lead) é um lead que foi classificado pelo marketing como "tem potencial para comprar". No Empire CRM, a classificação é feita por TAG — o contato recebe a tag "mql".

### Como o MQL é identificado no sistema?

```typescript
// Função helper: verifica se um contato é MQL
function isMqlByTag(tags: string | null | undefined): boolean {
  if (!tags) return false
  const tagArray = tags.toLowerCase().split(',').map(t => t.trim())
  return tagArray.includes('mql')
}

// Uso:
const isMql = isMqlByTag(contato.tags)  // true/false
```

**RF-OPP-011:** Adicionar a tag "mql" a um contato:
1. Classifica TODAS as oportunidades abertas desse contato como MQL
2. Preenche automaticamente `data_qualificado` na oportunidade ativa

---

## 5. Registro de Tentativas de Contato

**RF-OPP-013:** O SDR pode registrar tentativas de contato com 1 clique na interface:

```
┌────────────────────────────────────────────────────┐
│  João Silva                              [MQL]      │
│  ─────────────────────────────────────────────     │
│  Tentativas:  ①  ②  ③  ④  ⑤  ⑥  ⑦  ⑧          │
│              ✓  ✓  □  □  □  □  □  □          │
│  (2 tentativas registradas)                         │
│                                                     │
│  [+ Registrar Tentativa 3]  [✓ Marcar Conectado]  │
└────────────────────────────────────────────────────┘
```

**RF-OPP-014:** Ao clicar "Registrar Tentativa":
- Preenche `data_tentativa_N` (próxima vazia) com a data atual
- Registra uma nota automática na timeline: "Tentativa 3 de contato — SDR Karina"
- Atualiza `data_ultima_atividade`

---

## 6. Motivos de Perda

**RF-OPP-015:** Ao marcar uma oportunidade como "Perdida", o sistema solicita:

```
┌──────────────────────────────────────────┐
│  Marcar como Perdido                     │
│  ──────────────────────────────────      │
│  Motivo de Perda *                       │
│  ○ Preço — achou caro                    │
│  ○ Timing — não é o momento              │
│  ○ Concorrência — foi para outro         │
│  ○ Não qualificado — perfil errado       │
│  ○ Sem resposta — ghosting               │
│  ○ Outro                                 │
│                                          │
│  Observação (opcional)                   │
│  [________________________________]      │
│                                          │
│  [Cancelar]            [Confirmar Perda] │
└──────────────────────────────────────────┘
```

**RF-OPP-016:** Os motivos de perda são configuráveis por workspace (o usuário pode adicionar/remover motivos).

**RF-OPP-017:** Os motivos de perda são registrados no banco para consulta futura.

---

## 7. Dados Financeiros (Fechamento)

**RF-OPP-018:** Quando uma oportunidade é movida para a stage do tipo "fechado", a interface exibe um formulário para preenchimento dos dados financeiros:

```
┌──────────────────────────────────────────────────────┐
│  Dados do Fechamento — João Silva                    │
│  ──────────────────────────────────────────────      │
│  Produto Vendido *        [Consultoria CDAV         ]│
│  Forma de Pagamento *     [PIX ▾                    ]│
│                                                      │
│  Valor de Entrada         R$ [___________]           │
│  Número de Parcelas           [___] x R$ [________]  │
│  Valor Total (calculado)      R$ 0,00                │
│                                                      │
│  Data de Pagamento *      [15/04/2026              ] │
│                                                      │
│  Link do Contrato         [https://...             ] │
│  Data de Assinatura       [14/04/2026              ] │
│                                                      │
│  ─── Dados do Contratante ───                        │
│  Nome Completo *          [João da Silva Santos     ]│
│  CPF / CNPJ               [000.000.000-00          ]│
│  Cidade / Estado          [São Paulo - SP          ]│
│                                                      │
│                           [Cancelar]  [Salvar]       │
└──────────────────────────────────────────────────────┘
```

**RF-OPP-019:** `valor_faturado` é calculado automaticamente:
```
valor_faturado = valor_entrada + (numero_parcelas × valor_parcela)
```

---

## 8. API de Oportunidades

```
GET /api/v1/opportunities
  ?pipeline_id=uuid
  ?stage_id=uuid
  ?status=open|won|lost
  ?tags=mql
  ?sdr_id=...
  ?created_after=2026-01-01
  Retorna: lista paginada de oportunidades

GET /api/v1/opportunities/:id
  Retorna: oportunidade completa + contato + vendas_fechamento

POST /api/v1/opportunities
  Body: {
    contato_id: "uuid",        // OU
    contato: { nome, email },  // Cria/encontra contato automaticamente
    pipeline_id: "uuid",
    stage_id: "uuid",
    valor: 5000,
    utm_source: "facebook",
    ...
  }
  Retorna: oportunidade criada

PUT /api/v1/opportunities/:id
  Body: { stage_id: "uuid", sdr_name: "Karina", ... }
  Retorna: oportunidade atualizada

POST /api/v1/opportunities/:id/stage
  Body: { stage_id: "uuid", motivo_perda: "Preço" }
  Dispara automações de mudança de stage
  Retorna: oportunidade atualizada
```

---

## 9. Critérios de Aceite

- [ ] Criar pipeline com stages customizadas em < 5 minutos
- [ ] Arrastar card no Kanban move o lead de stage e registra data automática
- [ ] Tag "mql" adicionada atualiza `data_qualificado` na oportunidade ativa imediatamente
- [ ] Tentativa de contato é registrada com 1 clique
- [ ] Formulário de fechamento valida campos obrigatórios
- [ ] `valor_faturado` é calculado corretamente em tempo real
- [ ] Oportunidade com `data_fechado` mas sem `data_pagamento_entrada` NÃO é contabilizada como venda fechada
- [ ] API de criação aceita contato embutido (cria ou encontra contato existente)
- [ ] Motivos de perda são configuráveis por workspace

---

*Próximo: [06 — Módulo Comunicações](./06-MODULO-COMUNICACOES.md)*
