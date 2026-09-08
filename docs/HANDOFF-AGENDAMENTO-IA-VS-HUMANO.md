# Handoff: Rastrear Agendamentos por IA vs Humano no GHL

> **Status:** implementado em 2026-07-08  
> **Autor:** Kimi Code  
> **Data:** 2026-07-07  
> **Implementado em:** 2026-07-08  
> **Destinatário:** programador que vai implementar (nível iniciante/intermediário)

---

## 1. O que a gente quer fazer?

Hoje o sistema salva **quando** um lead foi agendado, mas não salva **como** ele foi agendado.

A gente quer saber, para cada agendamento:

1. Foi a **SDR IA** (Conversations AI) ou um **humano** (calendar page / Google Calendar)?
2. **Qual calendário** foi usado?
3. **Qual usuário do GHL** fez o agendamento (quando for humano)?
4. Mostrar isso de forma visível nos painéis de **Aquisição**, **Pré-vendas** e **Tráfego**.

---

## 2. Resumo para o programador (leia primeiro)

A API do GHL já entrega essa informação. O problema é que o `sync-appointment-dates` hoje pega só a **lista resumida** de appointments. A gente precisa mudar ele para:

1. Pegar a lista de appointments de cada contato (já faz isso).
2. Para cada appointment, fazer uma **chamada extra** pedindo os detalhes completos.
3. Salvar os novos campos no banco.
4. Mostrar os novos campos nos painéis.

> **Cuidado:** isso aumenta o número de chamadas à API do GHL. Hoje são ~N chamadas (uma por contato). Depois serão ~N + M chamadas (uma por contato + uma por appointment). A API do GHL aguenta, mas é importante manter o delay entre chamadas.

---

## 3. O que a API do GHL entrega

### 3.1 Endpoint que já usamos hoje (lista resumida)

```http
GET https://services.leadconnectorhq.com/contacts/{contactId}/appointments
Authorization: Bearer {GHL_API_KEY}
Version: 2021-04-15
```

Esse endpoint retorna a lista, mas **não** tem `createdBy`.

### 3.2 Endpoint novo que vamos usar (detalhe completo)

```http
GET https://services.leadconnectorhq.com/calendars/appointments/{appointmentId}
Authorization: Bearer {GHL_API_KEY}
Version: 2021-04-15
```

Esse endpoint retorna o objeto completo, incluindo:

```json
{
  "id": "MpuyoBYVvsxcgEVNyQRK",
  "calendarId": "06S4JOBQymgIssiCM0FC",
  "assignedUserId": "5lGQtGCMNJOpiEgVKTHR",
  "createdBy": {
    "source": "conversations_ai",
    "userId": null,
    "channel": "web",
    "timestamp": "2026-04-06T20:19:16.864Z"
  },
  "reportingSource": {
    "creation": "other",
    "mode": null
  }
}
```

### 3.3 Significado dos campos importantes

| Campo | O que significa | Exemplo |
|---|---|---|
| `createdBy.source` | **De onde veio o agendamento** | `conversations_ai` = IA; `calendar_page` = humano pelo link; `google_calendar` = sync externo |
| `createdBy.userId` | **ID do usuário do GHL** que agendou. Só vem preenchido quando é humano. | `fmNfovWHhnE4I9VttMkw` |
| `createdBy.channel` | Canal usado | `web_app`, `web`, `event_sync` |
| `calendarId` | ID do calendário onde foi agendado | `06S4JOBQymgIssiCM0FC` |
| `assignedUserId` | ID do usuário dono do calendário / closer | `5lGQtGCMNJOpiEgVKTHR` |
| `reportingSource.creation` | Modo de criação relatado | `user` = humano; `other` = IA/sistema |

### 3.4 Exemplos reais da nossa conta

#### Exemplo A — Agendado pela IA

```json
{
  "id": "MpuyoBYVvsxcgEVNyQRK",
  "calendarId": "06S4JOBQymgIssiCM0FC",
  "assignedUserId": "5lGQtGCMNJOpiEgVKTHR",
  "createdBy": {
    "source": "conversations_ai",
    "userId": null,
    "channel": "web",
    "timestamp": "2026-04-06T20:19:16.864Z"
  }
}
```

Resultado: `Booked by = -` na interface do GHL porque `userId` é `null`.

#### Exemplo B — Agendado por humano (calendar page)

```json
{
  "id": "RgxuaaDCcdqLlFk6GRM0",
  "calendarId": "radlkQa7okVy5ylderf9",
  "assignedUserId": "fmNfovWHhnE4I9VttMkw",
  "createdBy": {
    "source": "calendar_page",
    "userId": "fmNfovWHhnE4I9VttMkw",
    "channel": "web_app",
    "timestamp": "2026-07-07T21:08:42.978Z"
  }
}
```

Resultado: `Booked by = Lucas Leonardo` na interface do GHL.

---

## 4. Checklist de implementação

- [x] Criar migration adicionando colunas na tabela `oportunidades`
- [x] Atualizar a edge function `sync-appointment-dates`
- [x] Criar/atualizar cache de usuários e calendários do GHL
- [x] Atualizar tipos TypeScript no frontend
- [x] Adicionar filtros/labels nos painéis de Aquisição, Pré-vendas e Tráfego
- [ ] Testar com leads reais agendados por IA e por humano

---

## 5. Parte 1 — Banco de dados (Supabase)

### 5.1 Criar migration

Crie o arquivo:

```
supabase/migrations/20260708000000_add_agendamento_origem_oportunidades.sql
```

> Use a data/hora atual no nome do arquivo. Siga o padrão `YYYYMMDDHHMMSS_...`.

Coloque esse conteúdo:

```sql
-- Adiciona rastreamento de origem do agendamento (IA vs humano)
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS agendamento_origem TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_nome TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_por_user_email TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_calendar_name TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_assigned_user_id TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_assigned_user_nome TEXT;

-- Comentários para documentar
COMMENT ON COLUMN public.oportunidades.agendamento_origem IS 'Fonte do agendamento no GHL: conversations_ai, calendar_page, google_calendar, etc.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_id IS 'ID do usuário do GHL que criou o agendamento (quando humano). Quando IA, fica NULL.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_nome IS 'Nome do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_email IS 'Email do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_id IS 'ID do calendário do GHL onde o agendamento foi feito.';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_name IS 'Nome legível do calendário do GHL.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_id IS 'ID do dono do calendário / closer atribuído.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_nome IS 'Nome do dono do calendário / closer atribuído.';
```

### 5.2 Rodar a migration

```bash
supabase db push
```

Ou, se estiver usando migrações manuais no painel do Supabase, rode o SQL em `SQL Editor > New query`.

---

## 6. Parte 2 — Edge function `sync-appointment-dates`

Arquivo: `supabase/functions/sync-appointment-dates/index.ts`

### 6.1 Adicionar novos campos no tipo `GhlAppointment`

Procure essa interface no arquivo:

```ts
interface GhlAppointment {
  id?: string;
  startTime?: string;
  appointmentStatus?: string;
  // ...
}
```

Adicione os novos campos:

```ts
interface GhlAppointment {
  id?: string;
  startTime?: string;
  appointmentStatus?: string;
  appointment_status?: string;
  status?: string;
  calendarStatus?: string;
  calendar_status?: string;
  deleted?: boolean | string | number | null;
  isDeleted?: boolean | string | number | null;
  canceled?: boolean | string | number | null;
  cancelled?: boolean | string | number | null;
  isCanceled?: boolean | string | number | null;
  isCancelled?: boolean | string | number | null;

  // NOVOS CAMPOS
  calendarId?: string | null;
  assignedUserId?: string | null;
  createdBy?: {
    source?: string | null;
    userId?: string | null;
    channel?: string | null;
    timestamp?: string | null;
  } | null;
}
```

### 6.2 Criar função para buscar detalhes do appointment

Adicione antes da função `fetchAppointments`:

```ts
/**
 * Busca os detalhes completos de um appointment no GHL.
 * O endpoint /contacts/{id}/appointments retorna só o resumo.
 * Precisamos chamar /calendars/appointments/{id} para ter createdBy, calendarId, etc.
 */
async function fetchAppointmentDetail(appointmentId: string): Promise<GhlAppointment | null> {
  try {
    const res = await fetch(
      `${GHL_API_BASE}/calendars/appointments/${appointmentId}`,
      { headers: GHL_HEADERS },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[${CALLER}] Erro ao buscar detalhe do appointment ${appointmentId}: ${res.status} ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    return (data?.appointment ?? data ?? null) as GhlAppointment | null;
  } catch (err) {
    console.warn(`[${CALLER}] Exceção ao buscar detalhe do appointment ${appointmentId}:`, err);
    return null;
  }
}
```

### 6.3 Buscar detalhes dos appointments ativos

Dentro da função `fetchAppointments`, depois de filtrar os appointments ativos, busque os detalhes:

```ts
const events: GhlAppointment[] = (rawEvents as GhlAppointment[])
  .filter((appointment) => !isDeletedAppointment(appointment) && !isCanceledAppointment(appointment));

// NOVO: enriquecer cada appointment com os detalhes completos
const enrichedEvents: GhlAppointment[] = [];
for (const event of events) {
  if (event.id) {
    const detail = await fetchAppointmentDetail(event.id);
    if (detail) {
      enrichedEvents.push({ ...event, ...detail });
      await sleep(GHL_DELAY_MS);
      continue;
    }
  }
  enrichedEvents.push(event);
}

return {
  appointments: enrichedEvents,
  rawAppointments: (rawEvents as GhlAppointment[]).map(summarizeAppointmentForDebug),
  httpStatus: res.status,
};
```

> **Importante:** essa chamada extra gera mais requisições. Mantenha o `GHL_DELAY_MS` (já existe no arquivo) para não bater no rate limit.

### 6.4 Atualizar a função `summarizeAppointmentForDebug`

Adicione os novos campos no log de debug:

```ts
function summarizeAppointmentForDebug(appointment: GhlAppointment) {
  return {
    id: appointment.id ?? null,
    startTime: appointment.startTime ?? null,
    statuses: collectAppointmentStatuses(appointment),
    deleted: isDeletedAppointment(appointment),
    canceled: isCanceledAppointment(appointment),
    // NOVOS CAMPOS
    calendarId: appointment.calendarId ?? null,
    assignedUserId: appointment.assignedUserId ?? null,
    createdBySource: appointment.createdBy?.source ?? null,
    createdByUserId: appointment.createdBy?.userId ?? null,
    createdByChannel: appointment.createdBy?.channel ?? null,
    rawDeleted: appointment.deleted ?? appointment.isDeleted ?? null,
    rawCanceled:
      appointment.canceled ??
      appointment.cancelled ??
      appointment.isCanceled ??
      appointment.isCancelled ??
      null,
  };
}
```

### 6.5 Buscar nomes de usuários e calendários

Para salvar os nomes legíveis, precisamos buscar os usuários e calendários do GHL.

#### Opção A — buscar sob demanda (mais simples)

Crie uma função para buscar um usuário pelo ID:

```ts
const userCache = new Map<string, { name: string; email: string }>();

async function fetchGhlUser(userId: string): Promise<{ name: string; email: string } | null> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const res = await fetch(
      `${GHL_API_BASE}/users/${userId}`,
      { headers: GHL_HEADERS },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const user = {
      name: data?.name ?? '',
      email: data?.email ?? '',
    };
    userCache.set(userId, user);
    return user;
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar usuário ${userId}:`, err);
    return null;
  }
}
```

E uma função para buscar o nome do calendário:

```ts
const calendarCache = new Map<string, string>();

async function fetchGhlCalendarName(calendarId: string): Promise<string | null> {
  if (calendarCache.has(calendarId)) {
    return calendarCache.get(calendarId)!;
  }

  try {
    const res = await fetch(
      `${GHL_API_BASE}/calendars/${calendarId}?locationId=${Deno.env.get('GHL_LOCATION_ID') || ''}`,
      { headers: GHL_HEADERS },
    );

    if (!res.ok) return null;

    const data = await res.json();
    const name = data?.calendar?.name ?? data?.name ?? null;
    if (name) calendarCache.set(calendarId, name);
    return name;
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar calendário ${calendarId}:`, err);
    return null;
  }
}
```

> Atenção: a variável `GHL_LOCATION_ID` não existe ainda. Você pode usar a locationId fixa do ambiente ou passar por parâmetro. O arquivo já usa `locationId` nas chamadas? Não — o endpoint `/contacts/{id}/appointments` não precisa. Para `/calendars/{id}` pode ser necessário. Se der erro, tente sem `locationId` primeiro.

#### Opção B — usar tabelas já existentes

Verifique se já existem tabelas como `ghl_users` e `ghl_calendars` no banco. Se existirem, use elas em vez de chamar a API toda vez. Isso é mais eficiente.

Para descobrir:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ghl_users', 'ghl_calendars', 'usuarios_ghl', 'calendarios_ghl');
```

Se existir, adapte as funções acima para consultar o Supabase em vez da API do GHL.

### 6.6 Atualizar o update da oportunidade

No handler principal, onde o código faz:

```ts
const { error: updateErr } = await supabase
  .from('oportunidades')
  .update({
    data_reuniao_agendada:    dateStr,
    data_reuniao_agendada_ts: tsStr,
    data_agendamento_reuniao: dateStr,
    data_agendamento_vendas:  dateStr,
    last_appointment_sync_at: new Date().toISOString(),
  })
  .eq('id', opp.id);
```

Substitua por:

```ts
const latest = appointments[0];
const dateStr = extractDateBRT(latest.startTime ?? '');
const tsStr = extractTimestampUTC(latest.startTime ?? '');

// NOVO: extrair origem do agendamento
const createdBySource = latest.createdBy?.source ?? null;
const createdByUserId = latest.createdBy?.userId ?? null;
const calendarId = latest.calendarId ?? null;
const assignedUserId = latest.assignedUserId ?? null;

// Buscar nomes dos usuários/calendário
const [creatorUser, assignedUser, calendarName] = await Promise.all([
  createdByUserId ? fetchGhlUser(createdByUserId) : Promise.resolve(null),
  assignedUserId ? fetchGhlUser(assignedUserId) : Promise.resolve(null),
  calendarId ? fetchGhlCalendarName(calendarId) : Promise.resolve(null),
]);

const { error: updateErr } = await supabase
  .from('oportunidades')
  .update({
    data_reuniao_agendada:    dateStr,
    data_reuniao_agendada_ts: tsStr,
    data_agendamento_reuniao: dateStr,
    data_agendamento_vendas:  dateStr,
    // NOVOS CAMPOS
    agendamento_origem: createdBySource,
    agendamento_por_user_id: createdByUserId,
    agendamento_por_user_nome: creatorUser?.name ?? null,
    agendamento_por_user_email: creatorUser?.email ?? null,
    agendamento_calendar_id: calendarId,
    agendamento_calendar_name: calendarName,
    agendamento_assigned_user_id: assignedUserId,
    agendamento_assigned_user_nome: assignedUser?.name ?? null,
    last_appointment_sync_at: new Date().toISOString(),
  })
  .eq('id', opp.id);
```

### 6.7 Limpar campos quando não houver agendamento

Quando o lead não tem appointment ativo, o código limpa as datas. Também limpe os novos campos:

```ts
const { error: clearErr } = await supabase
  .from('oportunidades')
  .update({
    data_reuniao_agendada: null,
    data_reuniao_agendada_ts: null,
    data_agendamento_reuniao: null,
    data_agendamento_vendas: null,
    // NOVOS CAMPOS
    agendamento_origem: null,
    agendamento_por_user_id: null,
    agendamento_por_user_nome: null,
    agendamento_por_user_email: null,
    agendamento_calendar_id: null,
    agendamento_calendar_name: null,
    agendamento_assigned_user_id: null,
    agendamento_assigned_user_nome: null,
    last_appointment_sync_at: new Date().toISOString(),
  })
  .eq('id', opp.id);
```

---

## 7. Parte 3 — Painéis do frontend

### 7.1 Atualizar os tipos TypeScript

Encontre o tipo `OppRow` (usado nos painéis). Provavelmente em:

- `eb-dash2/src/hooks/useLeads.ts`
- `eb-dash2/src/hooks/useTrafego.ts`
- `eb-dash2/src/hooks/usePrevendas.ts` (se existir)

Adicione os novos campos:

```ts
interface OppRow {
  // ... campos existentes ...

  // NOVOS CAMPOS
  agendamento_origem?: string | null
  agendamento_por_user_id?: string | null
  agendamento_por_user_nome?: string | null
  agendamento_por_user_email?: string | null
  agendamento_calendar_id?: string | null
  agendamento_calendar_name?: string | null
  agendamento_assigned_user_id?: string | null
  agendamento_assigned_user_nome?: string | null
}
```

### 7.2 Onde mostrar nos painéis

A ideia é adicionar um **badge/label** indicando "IA" ou "Humano" perto da data de agendamento.

#### Função helper reutilizável

Crie um componente ou helper:

```ts
// eb-dash2/src/lib/appointment-origin.ts

export type AppointmentOrigin = 'conversations_ai' | 'calendar_page' | 'google_calendar' | 'other' | null

export function getAppointmentOriginLabel(origin: string | null | undefined): string {
  if (origin === 'conversations_ai') return 'SDR IA'
  if (origin === 'calendar_page') return 'Humano'
  if (origin === 'google_calendar') return 'Google Calendar'
  return 'Desconhecido'
}

export function getAppointmentOriginBadgeColor(origin: string | null | undefined): string {
  if (origin === 'conversations_ai') return 'bg-purple-100 text-purple-800 border-purple-200'
  if (origin === 'calendar_page') return 'bg-blue-100 text-blue-800 border-blue-200'
  if (origin === 'google_calendar') return 'bg-gray-100 text-gray-800 border-gray-200'
  return 'bg-gray-100 text-gray-600'
}
```

#### Componente visual

```tsx
// eb-dash2/src/components/appointment-origin-badge.tsx

import { getAppointmentOriginLabel, getAppointmentOriginBadgeColor } from '@/lib/appointment-origin'

interface AppointmentOriginBadgeProps {
  origin: string | null | undefined
  calendarName?: string | null
  bookedByName?: string | null
}

export function AppointmentOriginBadge({ origin, calendarName, bookedByName }: AppointmentOriginBadgeProps) {
  if (!origin) return null

  const label = getAppointmentOriginLabel(origin)
  const color = getAppointmentOriginBadgeColor(origin)

  const tooltip = [
    `Origem: ${label}`,
    calendarName ? `Calendário: ${calendarName}` : null,
    bookedByName ? `Agendado por: ${bookedByName}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  )
}
```

### 7.3 Painel de Aquisição

Localize a coluna ou card onde aparece a data de agendamento. Adicione o badge ao lado:

```tsx
<div className="flex items-center gap-2">
  <span>{formatDate(lead.data_reuniao_agendada)}</span>
  <AppointmentOriginBadge
    origin={lead.agendamento_origem}
    calendarName={lead.agendamento_calendar_name}
    bookedByName={lead.agendamento_por_user_nome}
  />
</div>
```

### 7.4 Painel de Pré-vendas

Mesma coisa. Procure onde mostra `data_agendamento_reuniao` ou `data_reuniao_agendada`.

```tsx
<div className="flex items-center gap-2">
  <span>{formatDate(lead.data_agendamento_reuniao)}</span>
  <AppointmentOriginBadge
    origin={lead.agendamento_origem}
    calendarName={lead.agendamento_calendar_name}
    bookedByName={lead.agendamento_por_user_nome}
  />
</div>
```

### 7.5 Painel de Tráfego

No painel de tráfego geralmente não mostra linha a linha, mas sim métricas agregadas. Aqui a gente quer **cards com contagem**:

- Total de agendamentos
- Agendamentos por IA
- Agendamentos por humano
- Taxa de IA vs Humano

#### Exemplo de card

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
  <MetricCard
    title="Agendamentos por IA"
    value={leads.filter((l) => l.agendamento_origem === 'conversations_ai').length}
  />
  <MetricCard
    title="Agendamentos por humano"
    value={leads.filter((l) => l.agendamento_origem === 'calendar_page').length}
  />
  <MetricCard
    title="Total agendado"
    value={leads.filter((l) => l.data_reuniao_agendada).length}
  />
</div>
```

### 7.6 Filtros (opcional, mas poderoso)

Adicione um filtro nos painéis de Aquisição e Pré-vendas:

```tsx
<select
  value={originFilter}
  onChange={(e) => setOriginFilter(e.target.value)}
>
  <option value="">Todas as origens</option>
  <option value="conversations_ai">SDR IA</option>
  <option value="calendar_page">Humano</option>
  <option value="google_calendar">Google Calendar</option>
</select>
```

E aplique no `loadLeads`:

```ts
if (originFilter) {
  query = query.eq('agendamento_origem', originFilter)
}
```

---

## 8. Parte 4 — Testes

### 8.1 Testar a edge function localmente

```bash
supabase functions serve sync-appointment-dates
```

Em outro terminal, chame com um contato específico:

```bash
curl -X POST http://localhost:54321/functions/v1/sync-appointment-dates \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_ghl_id": "RGWd0tQaP1y5czIEs6Pv",
    "include_debug": true
  }'
```

Verifique no JSON de resposta:

- `appointments_seen` deve ter `createdBySource`
- `active_appointments` deve ter `createdBySource`, `calendarId`, `assignedUserId`

### 8.2 Verificar no banco

```sql
SELECT
  id,
  data_reuniao_agendada,
  agendamento_origem,
  agendamento_por_user_nome,
  agendamento_calendar_name,
  agendamento_assigned_user_nome
FROM oportunidades
WHERE contato_id IN (
  SELECT id FROM contatos WHERE ghl_id = 'RGWd0tQaP1y5czIEs6Pv'
);
```

Esperado para o contato `RGWd0tQaP1y5czIEs6Pv` (Matheus Silveira):

| data_reuniao_agendada | agendamento_origem | agendamento_por_user_nome | agendamento_calendar_name | agendamento_assigned_user_nome |
|---|---|---|---|---|
| 2026-04-07 | conversations_ai | NULL | Diagnóstico - Acelerador de Audiência | Bruno Andrease |

### 8.3 Verificar nos painéis

1. Abra o painel de Aquisição.
2. Encontre o lead Matheus Silveira.
3. Deve aparecer um badge roxo escrito **"SDR IA"** ao lado da data de agendamento.
4. Passe o mouse sobre o badge. Deve aparecer um tooltip com o calendário.

---

## 9. Cuidados importantes

### 9.1 Rate limit da API do GHL

A API do GHL permite aproximadamente **100 requisições a cada 10 segundos**.

Hoje o `sync-appointment-dates` já tem um delay de 150ms entre chamadas. Como agora vamos fazer mais chamadas (uma por appointment), recomendo aumentar o delay para **250ms** ou mais, ou limitar o número de appointments detalhados por contato (ex: só os 3 mais recentes).

```ts
const GHL_DELAY_MS = 250; // aumentar de 150 para 250
```

### 9.2 Não salvar dados sensíveis

Nunca salve a API key do GHL no código. Ela já está na variável de ambiente `GHL_API_KEY` das edge functions.

### 9.3 Tratar `createdBy.userId` nulo

Quando o agendamento é da IA, `createdBy.userId` vem `null`. Isso é esperado. O campo `agendamento_por_user_nome` deve ficar `NULL` no banco.

### 9.4 Backfill

Depois de implementar, rode o backfill para preencher os dados históricos:

```bash
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-appointment-dates \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "backfill": true, "batch_size": 50, "max_cycles": 5 }'
```

> Substitua a URL e a `ANON_KEY` pelos valores do projeto.

---

## 10. Anexo — Payloads completos de exemplo

### 10.1 Agendamento por IA

```json
{
  "appointment": {
    "id": "MpuyoBYVvsxcgEVNyQRK",
    "calendarId": "06S4JOBQymgIssiCM0FC",
    "assignedUserId": "5lGQtGCMNJOpiEgVKTHR",
    "createdBy": {
      "source": "conversations_ai",
      "traceId": "5a6e8c1b-e9be-4221-aec1-a7ba04b52d70",
      "userId": null,
      "timestamp": "2026-04-06T20:19:16.864Z"
    },
    "startTime": "2026-04-07T13:30:00.000Z",
    "status": "booked"
  }
}
```

### 10.2 Agendamento por humano

```json
{
  "appointment": {
    "id": "RgxuaaDCcdqLlFk6GRM0",
    "calendarId": "radlkQa7okVy5ylderf9",
    "assignedUserId": "fmNfovWHhnE4I9VttMkw",
    "createdBy": {
      "source": "calendar_page",
      "channel": "web_app",
      "traceId": "1b743d87-157f-4618-954c-c659e9cfae60",
      "userId": "fmNfovWHhnE4I9VttMkw",
      "timestamp": "2026-07-07T21:08:42.978Z"
    },
    "startTime": "2026-07-08T13:00:00.000Z",
    "status": "booked"
  }
}
```

---

## 11. Dúvidas frequentes

**P: Por que `createdBy.userId` é null quando é IA?**
R: Porque a IA do GHL não é um usuário da conta. A interface do GHL mostra "Booked by: -" nesses casos.

**P: E se o lead tiver vários appointments?**
R: O `sync-appointment-dates` já pega o mais recente. Os novos campos serão preenchidos com base no appointment mais recente ativo.

**P: O nome do calendário muda?**
R: Pode mudar. Por isso salvamos tanto o `calendarId` (estável) quanto o `calendarName` (legível). Se o nome mudar, basta rodar o backfill novamente.

**P: Precisa atualizar o webhook-ghl?**
R: Não necessariamente. O webhook pode enviar dados de agendamento, mas a fonte mais confiável é o `sync-appointment-dates`, que busca direto na API do GHL.
