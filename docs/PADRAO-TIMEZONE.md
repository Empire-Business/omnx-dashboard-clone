# Padrão de Timezone — Datas no Sistema Empire

> **Versão:** 2.0 (atualizado 2026-03-15)
> **Status:** Obrigatório

---

## Modelo de Tipos de Data

O sistema usa **dois tipos** distintos para colunas de data:

| Tipo | Onde | Comportamento |
|------|------|---------------|
| `DATE` | Colunas de pipeline (data_conectado, data_fechado etc.) | Apenas data: `2026-03-07` — sem hora, sem fuso |
| `TIMESTAMPTZ` | `data_lead_recebido`, `date_created`, timestamps de sistema | Data + hora em UTC: `2026-03-01T00:30:00Z` |

### Por que dois tipos?

- **Datas de pipeline** (`data_conectado`, `data_fechado` etc.) chegam dos webhooks GHL como strings sem significado de hora (ex: `"7/3/2026 08:40 PM"` = simplesmente 7 de março). Guardar como `TIMESTAMPTZ` adicionava complexidade desnecessária de timezone. Agora são `DATE` — o banco guarda `2026-03-07` e pronto.

- **`data_lead_recebido`** é preenchida pela edge function `sync-opp-dates` via API GHL (`GET /opportunities/{id}` → campo `createdAt`) que retorna ISO completo. Fica como `TIMESTAMPTZ` e requer conversão de timezone para queries de período.

---

## Colunas por Tipo

### Colunas `DATE` — tabela `oportunidades`

São exatamente **23 colunas** de pipeline. Não precisam de `AT TIME ZONE` em nenhuma query.

```
data_tentativa_1..8, data_conectado, data_no_show, data_qualificado,
data_perdido, data_agendamento_reuniao, data_pendencias_preenchimento,
data_reuniao_agendada, data_reuniao_realizada, data_negociacao,
data_no_show_vendas, data_perdido_vendas, data_agendamento_vendas,
data_realizacao_vendas, data_fechado, data_ultima_atividade
```

### Colunas `TIMESTAMPTZ` — requerem conversão de timezone para exibição

| Tabela | Coluna | Nota |
|--------|--------|------|
| `oportunidades` | `data_lead_recebido` | API GHL — ISO completo |
| `oportunidades` | `data_criacao_contato` | Campo de sistema |
| `oportunidades` | `created_at`, `updated_at` | Timestamps de sistema |
| `contatos` | `date_created` | Data de criação no GHL |
| `contatos` | `updated_at` | Timestamp de sistema |

---

## Funções TypeScript — `eb-dash2/src/lib/utils/dates.ts`

**Arquivo canônico** para todas as operações de data no frontend.

```typescript
// ─── Para colunas DATE (data_conectado, data_fechado etc.) ─────────────────

// "2026-02-21" → "21/02/2026"   (split-reverse, sem timezone)
// Se receber TIMESTAMPTZ (length > 10), converte com fuso SP automaticamente
fmtDate(d: string | null | undefined): string

// ─── Para colunas TIMESTAMPTZ (data_lead_recebido, date_created) ────────────

// "2026-02-21T00:04:11.514Z" → "20/02/2026 21:04"   (com hora, fuso SP)
fmtDateTime(iso: string | null | undefined): string

// "2026-02-21T00:04:11.514Z" → "20/02 21:04"   (sem ano — para listas de msgs)
fmtMsgDate(iso: string | null | undefined): string

// ─── Helpers de data no fuso São Paulo ─────────────────────────────────────

spToday(): string          // Hoje como YYYY-MM-DD no fuso SP
spDaysAgo(n: number): string  // N dias atrás como YYYY-MM-DD no fuso SP
tsToSPDate(iso: string): string  // TIMESTAMPTZ → "YYYY-MM-DD" em SP (para agrupamentos)

// ─── Para queries com data_lead_recebido (TIMESTAMPTZ) ──────────────────────

toSPISOStart(date: string): string  // "2026-03-01" → "2026-03-01T00:00:00-03:00"
toSPISOEnd(date: string): string    // "2026-03-31" → "2026-03-31T23:59:59-03:00"
```

### Regra de uso

| Campo | Função de exibição | Query Supabase |
|-------|-------------------|----------------|
| `data_conectado`, `data_fechado` etc. | `fmtDate(d)` | `.gte('data_conectado', '2026-02-01')` |
| `data_lead_recebido` | `fmtDate(d)` (auto-detect) | `.gte('data_lead_recebido', toSPISOStart(start))` |
| `date_created` | `fmtDateTime(iso)` | — |

---

## Queries SQL

### Colunas DATE — sem conversão necessária

```sql
-- Filtrar pipeline por período — YYYY-MM-DD direto
SELECT * FROM oportunidades
WHERE data_conectado >= '2026-02-01'
  AND data_conectado <= '2026-02-28';

-- Agrupar por mês — direto no DATE
SELECT DATE_TRUNC('month', data_fechado) as mes, COUNT(*) as vendas
FROM oportunidades
WHERE data_fechado IS NOT NULL
GROUP BY 1 ORDER BY 1 DESC;
```

### data_lead_recebido (TIMESTAMPTZ) — precisa de offset SP

```sql
-- Filtrar por data em São Paulo
SELECT * FROM oportunidades
WHERE data_lead_recebido >= '2026-02-01T00:00:00-03:00'
  AND data_lead_recebido <= '2026-02-28T23:59:59-03:00';

-- Exibir em São Paulo
SELECT id,
       data_lead_recebido AT TIME ZONE 'America/Sao_Paulo' as lead_recebido_sp
FROM oportunidades;

-- Cohort: agrupar por mês em SP
SELECT DATE_TRUNC('month', data_lead_recebido AT TIME ZONE 'America/Sao_Paulo') as mes,
       COUNT(*) as leads
FROM oportunidades
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Funções SQL — `parse_safe_date()` e `parse_date_flexible()`

Ambas retornam `DATE` (não `TIMESTAMPTZ`) desde a migration `20260315200000`.

```sql
-- parse_safe_date: TEXT → DATE
-- Formatos suportados: ISO8601 → D/M/YYYY H:MM AM/PM (GHL) → DD/MM/YYYY
SELECT parse_safe_date('7/3/2026 08:40 PM');  -- → 2026-03-07

-- parse_date_flexible: adiciona validação de range (2020 a hoje+30d)
SELECT parse_date_flexible('12/02/2026');  -- → 2026-02-12 (não dezembro!)
```

---

## Formatação do GHL

O GHL envia campos customizados de data no formato `D/M/YYYY H:MM AM/PM`:

| String do webhook | Resultado no banco |
|-------------------|--------------------|
| `"7/3/2026 08:40 PM"` | `DATE '2026-03-07'` |
| `"21/02/2026"` | `DATE '2026-02-21'` |
| `"2026-02-21T00:04:11.514Z"` | `TIMESTAMPTZ` (data_lead_recebido via API) |

---

## Armadilha Crítica: `new Date("YYYY-MM-DD")` em JavaScript

**Nunca** passe uma string de coluna `DATE` diretamente para `new Date()` sem tratamento:

```typescript
// ❌ ERRADO — JavaScript interpreta "2026-03-07" como UTC midnight
// Em SP (UTC-3) = 21:00 do dia 06/03 → exibe "06/03/2026" (1 dia a menos!)
new Date(item.available_date).toLocaleDateString('pt-BR')

// ✅ CORRETO — fmtDate detecta string de 10 chars e faz split simples
fmtDate(item.available_date)  // "2026-03-07" → "07/03/2026"
```

**Regra:** qualquer coluna `DATE` do banco deve passar por `fmtDate()`, nunca por `new Date()` diretamente.

## Armadilha: `toLocaleDateString` sem `timeZone`

```typescript
// ❌ ERRADO — usa o timezone do browser (pode ser qualquer fuso)
new Date(member.joined_at).toLocaleDateString('pt-BR')

// ✅ CORRETO
fmtDate(member.joined_at)  // detecta TIMESTAMPTZ e converte com SP
```

## Armadilha: Filtrar coluna DATE com `.toISOString()`

```typescript
// ❌ ERRADO — PostgreSQL faz cast do ISO para DATE em UTC, não em SP
.gte('data_agendamento_reuniao', new Date().toISOString())
// Pode incluir/excluir o dia errado na virada da meia-noite SP

// ✅ CORRETO — para coluna DATE, usar só "YYYY-MM-DD" em SP
.gte('data_agendamento_reuniao', spToday())
.lte('data_agendamento_reuniao', spDaysAgo(-2))   // 2 dias à frente
.gte('data_agendamento_reuniao', spDaysAgo(30))   // 30 dias atrás
```

## Armadilha: `toLocaleDateString('sv-SE')` sem timezone (uso interno)

Mesmo para gerar strings internas `YYYY-MM-DD` (não para exibição), é necessário especificar o timezone:

```typescript
// ❌ Frágil — depende do timezone do SO/browser do usuário
cur.toLocaleDateString('sv-SE')

// ✅ Correto e robusto
cur.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
```

---

## Armadilha: `+00:00` em queries TIMESTAMPTZ no frontend

Ao filtrar colunas `TIMESTAMPTZ` (como `data_comunicacao`, `data_lead_recebido`) no frontend, **nunca** construa o ISO manualmente com offset `+00:00` (UTC):

```typescript
// ERRADO — query busca horários em UTC, não em SP
// Usuário seleciona "01/03" → query começa em 28/02 21:00 SP
const startISO = `${startDate}T00:00:00+00:00`
const endISO   = `${endDate}T23:59:59+00:00`

// CORRETO — usar helpers de dates.ts que emitem -03:00
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
const startISO = toSPISOStart(startDate)  // "2026-03-01T00:00:00-03:00"
const endISO   = toSPISOEnd(endDate)      // "2026-03-31T23:59:59-03:00"
```

**Sintoma:** ligações e mensagens do início do dia somem do leaderboard — foram buscadas 3 horas tarde demais.

---

## UTC é correto para comparações de duração com TIMESTAMPTZ

Ao perguntar "houve evento nos últimos N horas?", a aritmética é sobre uma **duração absoluta** — independente de fuso. `Date.now()` em UTC é matematicamente correto.

```typescript
// CORRETO — "houve comunicação nos últimos 48h?"
const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
.gt('data_comunicacao', cutoff)  // ✓ comparação de instante absoluto

// CORRETO — timestamps de audit log (fetch_started_at, finished_at)
const now = new Date().toISOString()  // UTC ISO é TIMESTAMPTZ válido
```

Contraste com o caso ERRADO — filtrar por **início de dia em SP**:

```typescript
// ERRADO — "a partir do início do dia 01/03 em SP?"
const start = `${startDate}T00:00:00+00:00`  // ← desloca 3h atrás
.gte('data_comunicacao', start)              // deve usar toSPISOStart(startDate)
```

**Regra:** use `toSPISOStart/End` quando há uma **data de calendário** com semântica de "dia em SP". Use `.toISOString()` direto quando a pergunta é uma **duração** (últimas Nh) ou um **registro de auditoria**.

---

## Armadilha Histórica: Inversão MM/DD

`parse_date_flexible()` tem validação de range (rejeita datas > 30 dias no futuro) que protege contra inversão MM/DD silenciosa. Ex: `"12/02/2026"` poderia ser lido como dezembro (mês 12), mas o resultado `2026-12-02` seria rejeitado pois está muito no futuro → retorna NULL → a data fica NULL, não errada.
