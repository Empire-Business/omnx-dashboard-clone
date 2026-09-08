# KPI: Tempo Médio de Resposta por SDR

## O que é?

O **Tempo Médio de Resposta** mede quanto tempo cada SDR leva, em média, para responder a um lead que enviou uma mensagem.

**Em outras palavras:** Quando um lead envia uma mensagem para o SDR (inbound), quanto tempo passa até o SDR enviar uma mensagem de volta (outbound)?

---

## Definição Técnica

**Resposta** = mensagem outbound (enviada pelo SDR) que vem **imediatamente após** uma mensagem inbound (recebida do lead), no mesmo `ghl_conversation_id`.

**Condições obrigatórias:**
- `direction = 'outbound'` — mensagem enviada pelo SDR
- `ghl_source = 'app'` — mensagem enviada **manualmente pelo SDR** (não via IA/workflow)
- `channel IN ('call', 'whatsapp', 'sms')` — apenas ligações, WhatsApp ou SMS
- `gap` (intervalo de tempo) entre 1 segundo e 86.400 segundos (24 horas)

**Por que `ghl_source = 'app'`?**

Mensagens enviadas por IA (workflow ou API) têm `ghl_source = 'workflow'` ou `ghl_source = 'api'`. Essas respostas são automáticas e não refletem a velocidade de resposta **humana** do SDR. O KPI mede performance humana, então excluímos respostas automáticas.

---

## Cálculo

### Passo 1: Agrupar mensagens por conversa

Para cada `ghl_conversation_id`, ordenar todas as mensagens por `data_comunicacao`.

### Passo 2: Encontrar pares inbound → outbound

Procurar por padrões:
- Mensagem `N` = inbound (lead envia)
- Mensagem `N+1` = outbound (SDR responde)

Se encontrar esse padrão, calcular o intervalo em segundos:
```
gap = (data_outbound - data_inbound) em segundos
```

### Passo 3: Validar intervalo

Descartar gaps que caem fora do intervalo 1–86.400 segundos:
- **< 1 segundo:** provavelmente erro de timestamp ou teste
- **> 86.400 segundos (24 horas):** conversas mortas ou não-respostas que duraram dias

Gaps válidos contribuem ao cálculo da média.

### Passo 4: Agrupar por SDR

Para cada SDR, calcular:
- **`avg_response_seconds`** = média aritmética de todos os gaps válidos
- **`response_count`** = quantidade de pares inbound→outbound medidos

**Nota:** Se um SDR não tem nenhum par inbound→outbound válido no período, `avg_response_seconds = 0` (interpretado como "sem dados").

---

## Interpretação no Dashboard

A coluna **"Tempo Resp."** no leaderboard de SDRs exibe:

| Badge | Cor | Significado |
|-------|-----|-----------|
| **< 1 min** | Verde | Excelente — responde em menos de 1 minuto |
| **15 min** | Verde | Bom — responde em até 15 minutos |
| **15-60 min** | Âmbar | Aceitável — responde em até 1 hora |
| **> 60 min** | Vermelho | Lento — demora mais de 1 hora para responder |
| **—** | Cinza | Sem dados — nenhuma resposta medida no período |

---

## Exemplo

**Conversa 1 (2026-03-15):**
- 10:00 — Lead envia mensagem (inbound)
- 10:05 — SDR responde (outbound) → **gap = 5 min = 300 seg** ✅

**Conversa 2 (2026-03-15):**
- 14:30 — Lead envia mensagem (inbound)
- 14:45 — SDR responde (outbound) → **gap = 15 min = 900 seg** ✅

**Conversa 3 (2026-03-15):**
- 16:00 — Lead envia mensagem (inbound)
- 17:00 — Mensagem automática da IA (outbound, `ghl_source='workflow'`) → **descartada** ❌

**Conversa 4 (2026-03-15):**
- 09:00 — Lead envia mensagem (inbound)
- 10:00 (próximo dia) — SDR responde (outbound) → **gap = 25 horas = 90.000 seg > 86.400** → **descartada** ❌

**Resultado para esse SDR nessas 4 conversas:**
- Respostas medidas: 2 (conversas 1 e 2)
- Tempo médio: (300 + 900) / 2 = **600 segundos = 10 minutos**
- Badge: **Verde** (< 15 min)

---

## Implementação

### Banco de Dados

A query é implementada em uma **RPC (Remote Procedure Call)** SQL:

```sql
-- supabase/migrations/20260320000000_add_rpc_sdr_avg_response_time.sql
CREATE FUNCTION get_sdr_avg_response_time(
  p_start timestamptz,
  p_end timestamptz
) RETURNS TABLE(
  sdr_name TEXT,
  avg_response_seconds INTEGER,
  response_count INTEGER
)
```

**Lógica:**
1. Selecionar todas as comunicações no período entre `p_start` e `p_end`
2. Filtrar por `direction='outbound'` + `ghl_source='app'` + `channel IN (call, whatsapp, sms)`
3. Agrupar por `ghl_conversation_id`
4. Ordenar mensagens dentro de cada conversa
5. Procurar por pares inbound→outbound consecutivos
6. Calcular gap, descartar se gap < 1s ou > 86.400s
7. Agrupar por `sdr_name` (extraído via relação `contatos`)
8. Calcular `avg_response_seconds` e `response_count`

### Frontend

**Hook:** `eb-dash2/src/hooks/useSDRLeaderboard.ts`

```typescript
// Step 1.5: chamar RPC com startDate/endDate convertidos para SP (TIMESTAMPTZ)
const startISO = toSPISOStart(startDate)
const endISO = toSPISOEnd(endDate)

supabase.rpc('get_sdr_avg_response_time', {
  p_start: startISO,
  p_end: endISO,
})
.then(({ data }) => {
  const map = new Map<string, { avg_response_seconds: number; response_count: number }>()
  for (const row of data ?? []) {
    map.set(row.sdr_name, {
      avg_response_seconds: row.avg_response_seconds,
      response_count: row.response_count,
    })
  }
  setResponseMap(map)
})
```

**Tab:** `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`

```typescript
// Helper para exibir tempo em formato legível
function fmtResponseTime(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return '< 1 min'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// Helper para cor do badge
function responseTimeBadgeClass(seconds: number): string {
  if (seconds <= 0) return 'text-[var(--steel)]'
  if (seconds <= 900) return 'bg-[rgba(45,125,74,0.1)] text-[#2D7D4A]'   // ≤ 15 min → verde
  if (seconds <= 3600) return 'bg-[rgba(245,158,11,0.1)] text-[#B45309]'  // 15-60 min → âmbar
  return 'bg-[rgba(139,46,46,0.1)] text-[var(--danger)]'                   // > 60 min → vermelho
}
```

Coluna no leaderboard:
```tsx
<th className="...">Tempo Resp.</th>
// ...
<td className="px-4 py-3 text-right">
  <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded',
    responseTimeBadgeClass(row.avg_response_seconds))}>
    {fmtResponseTime(row.avg_response_seconds)}
  </span>
</td>
```

---

## Limitações e Considerações

### 1. Apenas pares consecutivos são medidos

Se a sequência for inbound → mensagem do sistema → outbound, o par não será detectado.

**Exemplo:** Lead envia → sistema confirma recebimento → SDR responde
- **Resultado:** Gap não medido (conversa quebrada em 3 partes)

**Solução futura:** Detectar primeiro outbound após inbound, ignorando intermediários.

### 2. Apenas conversas ativas

Se um lead envia e o SDR **nunca** responde, esse lead não contribui a nenhuma métrica.

**Nota:** Leads sem resposta são medidos em **% Sem Resposta** (KPI complementar).

### 3. Timezone: sempre São Paulo

A RPC recebe `p_start` e `p_end` em `TIMESTAMPTZ`. O frontend converte as datas do usuário para São Paulo via `toSPISOStart()` e `toSPISOEnd()`.

---

## Referências

- **Arquivo de migration:** `supabase/migrations/20260320000000_add_rpc_sdr_avg_response_time.sql`
- **Hook:** `eb-dash2/src/hooks/useSDRLeaderboard.ts` (Step 1.5)
- **Tab:** `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` (coluna "Tempo Resp.")
- **KPI complementar:** [`docs/KPI-SDR-SEM-RESPOSTA.md`](KPI-SDR-SEM-RESPOSTA.md) — % de leads que nunca receberam resposta
