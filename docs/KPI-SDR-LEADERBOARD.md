# KPI SDR — Leaderboard e Metas

## Status
| Campo | Valor |
|-------|-------|
| **Documento** | KPI-SDR-LEADERBOARD.md |
| **Data** | 2026-04-14 |
| **Status** | ✅ Atualizado |
| **Implementação** | `eb-dash2/src/hooks/useSDRLeaderboard.ts` |

---

## Conceito: Meta de Agendamento em Até 7 Dias

A meta de "até 7 dias" é uma **métrica de performance do SDR** que avalia a velocidade de contato e agendamento.

### O que é?

**Regra de Negócio:**
- O SDR deve **falar com o lead E agendar uma reunião em até 7 dias** a partir de quando o lead entrou no sistema
- A reunião prevista (data_agendamento_reuniao) pode ser agendada para até **10 dias** (7 dias + 72h de tolerância)

### Dois Prazos Diferentes

| Prazo | Significado | Coluna | Exemplo |
|-------|-------------|--------|---------|
| **7 DIAS** | Prazo máximo para que o **SDR AGENDE** (crie o agendamento) | Não há — inferido da ação | Se lead entra em 01/03, SDR deve agendar até 08/03 |
| **10 DIAS** | Prazo máximo para quando a reunião **está PREVISTA** (data_agendamento_reuniao) | `data_agendamento_reuniao` | Se lead entra em 01/03, reunião pode ser até 11/03 |

---

## Cálculo da Métrica no Leaderboard

### Indicador: "Agendados no Prazo"

✅ **IMPLEMENTADO:** Valida ambos os prazos (7 dias para ação do SDR + 10 dias para data da reunião).

**Numerador:** Liderados onde:
- ✅ A reunião foi AGENDADA dentro de 7 dias (campo `data_agendamento_reuniao`)
- ✅ A data da reunião está dentro de 10 dias (campo `data_reuniao_agendada`)

**Denominador:** Total de liderados com `data_lead_recebido` preenchida

**Fórmula:**
```
Taxa % = (agendados_no_prazo / leads_com_data_lead) × 100
```

### Cálculo Passo a Passo

Para cada oportunidade no período selecionado:

1. **Verificar se tem dados obrigatórios:**
   - ✅ `data_lead_recebido` preenchida (quando lead entrou)
   - ✅ `data_agendamento_reuniao` preenchida (quando o agendamento foi CRIADO)
   - ✅ `data_reuniao_agendada` preenchida (quando a reunião vai ACONTECER)
   - Se algum faltar → não conta neste KPI

2. **Calcular duas diferenças em dias:**
   ```
   diff_agendamento = data_agendamento_reuniao - data_lead_recebido  (prazo de ação do SDR)
   diff_reuniao = data_reuniao_agendada - data_lead_recebido         (prazo da reunião)
   ```

3. **Validar AMBOS os prazos:**
   ```
   Se (diff_agendamento >= 0 AND diff_agendamento <= 7)
       AND (diff_reuniao >= 0 AND diff_reuniao <= 10)
   → Conta como "agendado no prazo"
   Senão → Não conta
   ```

### Código Atual (✅ Correto)

Arquivo: `eb-dash2/src/hooks/useSDRLeaderboard.ts`

```typescript
const PRAZO_AGENDAMENTO_DIAS = 7  // Prazo para SDR agendar
const PRAZO_REUNIAO_DIAS = 10     // Prazo para quando a reunião será realizada

function agendadoNoPrazo(opp: OppRow): boolean {
  if (!opp.data_agendamento_reuniao || !opp.data_reuniao_agendada || !opp.data_lead_recebido)
    return false

  const entrada = new Date(opp.data_lead_recebido.slice(0, 10) + 'T00:00:00')
  const agendamento = new Date(opp.data_agendamento_reuniao + 'T00:00:00')
  const reuniao = new Date(opp.data_reuniao_agendada + 'T00:00:00')

  const diffAgendamento = (agendamento.getTime() - entrada.getTime()) / 86_400_000
  const diffReuniao = (reuniao.getTime() - entrada.getTime()) / 86_400_000

  return (
    diffAgendamento >= 0 && diffAgendamento <= PRAZO_AGENDAMENTO_DIAS &&
    diffReuniao >= 0 && diffReuniao <= PRAZO_REUNIAO_DIAS
  )
}
```

---

## Colunas Envolvidas

| Coluna | Campo GHL | Significado | Tipo | Valores típicos |
|--------|-----------|-------------|------|-----------------|
| **`data_agendamento_reuniao`** | `{{ opportunity.mqlreunio_marcada }}` ou `{{ opportunity.sqlreunio_agendada }}` | **Quando o SDR AGENDOU** (criou o agendamento) | DATE | Entre 0 e 7 dias após entrada |
| **`data_reuniao_agendada`** | `{{ opportunity.data_da_reunio }}` | **Quando a reunião SERÁ REALIZADA** (data prevista) | DATE | Entre 0 e 10 dias após entrada |
| **`data_lead_recebido`** | (via API GHL) | Quando o lead entrou no sistema | TIMESTAMPTZ | Data de referência |

---

---

## Colunas Relacionadas

| Coluna | Tipo | Significado |
|--------|------|-------------|
| `data_lead_recebido` | TIMESTAMPTZ | Quando o lead entrou (via API GHL `createdAt`) |
| `data_agendamento_reuniao` | DATE | Data **prevista** para a reunião (quando a reunião vai acontecer) |
| `data_reuniao_realizada` | DATE | Data **real** quando a reunião aconteceu (preenchida após realização) |
| `contatos.owner_name` | text | Nome do SDR responsável pelo lead |

---

## Métricas Relacionadas no Leaderboard

| Métrica | Cálculo | O que mede |
|---------|---------|-----------|
| **Leads** | Total de opps no período | Volume de leads |
| **Taxa Conexão** | (conectados / total_leads) × 100 | % de leads com os quais o SDR falou |
| **Taxa Agendamento** | (agendados / mqls) × 100 | % de MQLs que viraram agendamentos |
| **Taxa Agendamento Prazo** | (agendados_no_prazo / leads_com_data_lead) × 100 | **⭐ Meta Principal — % de agendamentos dentro do prazo** |
| **Ligações** | Count(channel='call', direction='outbound') | Ligações manuais do SDR |
| **Mensagens** | Count(channel='sms'/'whatsapp', direction='outbound') | SMS + WhatsApp manuais |
| **Fechamentos** | Count(vendas_fechamento.data_pagamento_entrada IS NOT NULL) | Vendas com pagamento confirmado |

---

## Filtros e Período

O leaderboard respeita:
- **Período:** Data inicial e final (startDate / endDate)
- **Filtros:** Aplica mesmo período das opções selecionadas no dashboard
- **Paginação de Comunicações:** Até 100.000 registros de comunicações

---

## Referências

- **Hook:** `eb-dash2/src/hooks/useSDRLeaderboard.ts`
- **Componente:** `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`
- **Tabelas:** `oportunidades`, `comunicacoes`, `contatos`, `ghl_users`
- **Campos relacionados:** Ver [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md)
