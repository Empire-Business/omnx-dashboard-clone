// Edge Function: sync-appointment-dates
//
// Chama diretamente GET /contacts/{contactId}/appointments para cada opp
// elegível fora do pipeline de Recuperação e atualiza data_reuniao_agendada,
// data_agendamento_reuniao e data_agendamento_vendas com a data do
// appointment mais recente ativo (não deletado e não cancelado) — os 3
// campos sempre recebem o mesmo valor, vindo da mesma fonte confiável.
// Se não houver nenhum appointment ativo, limpa os 3 campos.
//
// Além das datas:
// - Rastreia a origem do agendamento (IA vs humano), calendário e usuário
//   que criou o agendamento, usando o endpoint /calendars/appointments/{id}.
// - Grava appointment_status com o status REAL do GHL do appointment de
//   referência (showed/completed/noshow/confirmed/new/cancelled/invalid/...).
//   É fato, não inferência — usado pelo painel para categorizar cada
//   agendamento sem deixar "sem status".
// - Infere data_realizacao_vendas a partir dos status 'showed'/'completed'
//   e data_no_show a partir de 'noshow'. Se o GHL muda o status (ex: noshow
//   → showed), corrige os campos. Cancelados NÃO são mais descartados: se só
//   houver cancelados, o mais recente vira referência com status 'cancelled'.
//
// data_agendamento_reuniao/data_agendamento_vendas eram preenchidos pelo
// webhook (extrair_dados_ghl) sem nenhuma guarda — um webhook sem o
// customData esperado apagava ou desatualizava o valor. Migration
// 20260706000000 removeu essa extração do webhook; esta função assumiu
// os 2 campos, igual já fazia com data_reuniao_agendada desde 20260326110000.
//
// ⚠️ NÃO usa ghl_api_jobs — chama a API GHL diretamente para ter
//    resultado imediato sem esperar fila. O endpoint de appointments
//    é leve e não conflita com outros callers na fila.
//
// Modos:
//   - Cron (padrão):  processa opps onde last_appointment_sync_at
//                     é NULL ou mais antigo que SYNC_INTERVAL_MINUTES
//                     em múltiplos sublotes por execução
//   - Backfill:       POST { "backfill": true } — força todas as opps

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const GHL_API_BASE          = 'https://services.leadconnectorhq.com';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

// Fase 2 (isolamento de credenciais): a chave GHL NAO e mais global. E resolvida
// POR OPP — o location_id do contato dono da opp mapeia para um workspace via
// RPC da fatia 3, e a credencial vem do helper da fatia 2. buildGhlHeaders monta
// o header por chamada com a chave do tenant dono da opp. Sem chave global.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

const CALLER                   = 'sync-appointment-dates';
const PIPELINE_RECUPERACAO_ID  = 'Sn1Guqcm6zwZNTVOOf5L';
const SYNC_INTERVAL_MINUTES    = 10; // re-sincroniza cada opp a cada 10 min no máximo
const ACTIVE_LOOKBACK_DAYS     = 90; // sync frequente só para universo operacional recente/ativo
const DEFAULT_BATCH_SIZE       = 100;
const DEFAULT_MAX_CYCLES       = 3;  // cada request processa até 3 sublotes
const GHL_DELAY_MS             = 250; // delay entre chamadas GHL para não hammerar API

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ============================================================
// TIPOS
// ============================================================

interface OppRow {
  id: string;
  ghl_opportunity_id?: string | null;
  contato_id?: string | null;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  data_reuniao_agendada: string | null;
  data_agendamento_reuniao?: string | null;
  data_agendamento_vendas?: string | null;
  data_realizacao_vendas?: string | null;
  data_no_show?: string | null;
  data_no_show_vendas?: string | null;
  appointment_status?: string | null;
  last_appointment_sync_at?: string | null;
  contatos: {
    ghl_id: string;
    location_id?: string | null;
  };
}

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

  // NOVOS CAMPOS — detalhes do appointment
  calendarId?: string | null;
  assignedUserId?: string | null;
  createdBy?: {
    source?: string | null;
    userId?: string | null;
    channel?: string | null;
    timestamp?: string | null;
  } | null;
}

interface GhlUser {
  name: string;
  email: string;
}

const CANCELED_APPOINTMENT_STATUSES = new Set([
  'canceled',
  'cancelled',
  'cancelado',
  'cancelada',
]);

// ============================================================
// HELPERS
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extrai a data no fuso de São Paulo (BRT = UTC-3) de uma string startTime da API GHL.
 *
 * A API GHL retorna startTime no fuso local da conta (America/Sao_Paulo para contas BR).
 * Formato observado: "YYYY-MM-DD HH:MM:SS" (sem sufixo de timezone).
 * Também suporta ISO 8601 com T: "YYYY-MM-DDTHH:MM:SS".
 *
 * Como o valor já está em BRT, extrai-se apenas os primeiros 10 chars ("YYYY-MM-DD").
 * Se por algum motivo vier com Z (UTC), converte para BRT antes de extrair a data.
 */
function extractDateBRT(startTime: string): string | null {
  if (!startTime || typeof startTime !== 'string') return null;

  const s = startTime.trim();

  if (s.endsWith('Z') || /[+\-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  }

  const dateStr = s.replace('T', ' ').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr;
}

/**
 * Converte startTime do GHL para um TIMESTAMPTZ ISO 8601 (UTC).
 * GHL BR retorna sem timezone → assume BRT (UTC-3).
 */
function extractTimestampUTC(startTime: string): string | null {
  if (!startTime || typeof startTime !== 'string') return null;
  const s = startTime.trim();

  // Se já tem timezone explícita, Date() trata corretamente
  if (s.endsWith('Z') || /[+\-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Sem timezone → GHL BR está em BRT (UTC-3); adiciona offset manualmente
  const normalized = s.replace(' ', 'T');
  const d = new Date(normalized + '-03:00');
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeAppointmentStatus(status?: string | null): string | null {
  if (!status || typeof status !== 'string') return null;
  return status.trim().toLowerCase();
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function collectAppointmentStatuses(appointment: GhlAppointment): string[] {
  const candidates = [
    appointment.appointmentStatus,
    appointment.appointment_status,
    appointment.status,
    appointment.calendarStatus,
    appointment.calendar_status,
  ];

  return candidates
    .map((value) => normalizeAppointmentStatus(value))
    .filter((value): value is string => value !== null);
}

function isDeletedAppointment(appointment: GhlAppointment): boolean {
  return (
    isTruthyFlag(appointment.deleted) ||
    isTruthyFlag(appointment.isDeleted)
  );
}

function isCanceledAppointment(appointment: GhlAppointment): boolean {
  if (
    isTruthyFlag(appointment.canceled) ||
    isTruthyFlag(appointment.cancelled) ||
    isTruthyFlag(appointment.isCanceled) ||
    isTruthyFlag(appointment.isCancelled)
  ) {
    return true;
  }

  return collectAppointmentStatuses(appointment)
    .some((status) => CANCELED_APPOINTMENT_STATUSES.has(status));
}

const SHOWED_APPOINTMENT_STATUSES = new Set([
  'showed',
  'completed',
]);

const NOSHOW_APPOINTMENT_STATUSES = new Set([
  'noshow',
  'no_show',
  'no-show',
]);

function isShowedAppointment(appointment: GhlAppointment): boolean {
  return collectAppointmentStatuses(appointment)
    .some((status) => SHOWED_APPOINTMENT_STATUSES.has(status));
}

function isNoShowAppointment(appointment: GhlAppointment): boolean {
  return collectAppointmentStatuses(appointment)
    .some((status) => NOSHOW_APPOINTMENT_STATUSES.has(status));
}

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

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function fetchContactIdsByGhlId(
  supabase: ReturnType<typeof createClient>,
  contactGhlId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('contatos')
    .select('id')
    .eq('ghl_id', contactGhlId);

  if (error) {
    throw new Error(`Erro ao buscar contato por ghl_id=${contactGhlId}: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

// Fase 2: erro de fail-closed (sem tenant ou sem credencial para a opp). E
// TERMINAL para a opp — sem dono/chave nao ha como sincronizar. Como esta
// funcao nao tem fila com status por item, o erro e contabilizado (api_errors/
// errors) e a opp e pulada nesta execucao; nao aborta o lote inteiro.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailClosedError';
  }
}

// Resolve a chave GHL do workspace dono de um location_id (por opp).
//   1. location_id -> workspace via RPC segura da fatia 3 (NULL = sem match,
//      sem fallback "mais antigo").
//   2. credencial do workspace via helper da fatia 2 (Vault + cache).
// Qualquer falha => FailClosedError (NUNCA cai em chave global).
async function resolveGhlApiKeyForLocation(
  supabase: SupabaseClient,
  locationId: string,
  oppId: string,
): Promise<string> {
  const { data: workspaceId, error: rpcErr } = await supabase.rpc(
    'get_workspace_id_by_ghl_location_id',
    { p_location_id: locationId },
  );
  if (rpcErr || !workspaceId) {
    throw new FailClosedError(
      `location_id '${locationId}' nao resolve workspace (opp ${oppId})${rpcErr ? ': ' + rpcErr.message : ''}`,
    );
  }
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId as string);
    return creds.apiKey;
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err));
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId} (opp ${oppId}): ${msg}`,
    );
  }
}

// ============================================================
// CACHE DE USUÁRIOS E CALENDÁRIOS
// ============================================================

const userCache = new Map<string, GhlUser | null>();
const calendarCache = new Map<string, string | null>();

async function fetchGhlUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  apiKey: string,
): Promise<GhlUser | null> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  // 1) Tenta do banco primeiro (cache local)
  try {
    const { data, error } = await supabase
      .from('ghl_users')
      .select('nome, email')
      .eq('ghl_id', userId)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const user = {
        name: data.nome ?? '',
        email: data.email ?? '',
      };
      userCache.set(userId, user);
      return user;
    }
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar usuário ${userId} do banco:`, err);
  }

  // 2) Fallback para API do GHL
  try {
    const res = await fetch(
      `${GHL_API_BASE}/users/${userId}`,
      { headers: buildGhlHeaders(apiKey) },
    );

    if (!res.ok) {
      userCache.set(userId, null);
      return null;
    }

    const data = await res.json();
    const user = {
      name: data?.name ?? '',
      email: data?.email ?? '',
    };
    userCache.set(userId, user);
    return user;
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar usuário ${userId} na API:`, err);
    userCache.set(userId, null);
    return null;
  }
}

async function fetchGhlCalendarName(
  supabase: ReturnType<typeof createClient>,
  calendarId: string,
  apiKey: string,
  locationId: string,
): Promise<string | null> {
  if (calendarCache.has(calendarId)) {
    return calendarCache.get(calendarId)!;
  }

  // 1) Tenta do banco primeiro (cache local)
  try {
    const { data, error } = await supabase
      .from('ghl_calendars')
      .select('nome')
      .eq('ghl_id', calendarId)
      .limit(1)
      .maybeSingle();

    if (!error && data?.nome) {
      calendarCache.set(calendarId, data.nome);
      return data.nome;
    }
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar calendário ${calendarId} do banco:`, err);
  }

  // 2) Fallback para API do GHL
  try {
    const url = `${GHL_API_BASE}/calendars/${calendarId}?locationId=${encodeURIComponent(locationId)}`;
    const res = await fetch(url, { headers: buildGhlHeaders(apiKey) });

    if (!res.ok) {
      calendarCache.set(calendarId, null);
      return null;
    }

    const data = await res.json();
    const name = data?.calendar?.name ?? data?.name ?? null;
    calendarCache.set(calendarId, name);
    return name;
  } catch (err) {
    console.warn(`[${CALLER}] Erro ao buscar calendário ${calendarId} na API:`, err);
    calendarCache.set(calendarId, null);
    return null;
  }
}

// ============================================================
// CARGA DE OPORTUNIDADES
// ============================================================

interface LoadOppOptions {
  batchSize: number;
  backfill: boolean;
  oppIdFilter: string;
  contactGhlFilter: string;
}

async function loadEligibleOpps(
  supabase: ReturnType<typeof createClient>,
  options: LoadOppOptions,
): Promise<OppRow[]> {
  const { batchSize, backfill, oppIdFilter, contactGhlFilter } = options;
  const recentDateFloor = isoDateDaysAgo(ACTIVE_LOOKBACK_DAYS);

  let query = supabase
    .from('oportunidades')
    .select('id, ghl_opportunity_id, contato_id, pipeline_id, pipeline_name, data_reuniao_agendada, data_agendamento_reuniao, data_agendamento_vendas, data_realizacao_vendas, data_no_show, data_no_show_vendas, appointment_status, last_appointment_sync_at, contatos!inner(ghl_id, location_id)')
    .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
    .not('contatos.ghl_id', 'is', null)
    .order('last_appointment_sync_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (oppIdFilter) {
    query = query.eq('id', oppIdFilter);
  }

  if (contactGhlFilter) {
    const contactIds = await fetchContactIdsByGhlId(supabase, contactGhlFilter);
    if (contactIds.length === 0) return [];
    query = query.in('contato_id', contactIds);
  }

  if (!backfill && !oppIdFilter && !contactGhlFilter) {
    const cutoff = new Date(Date.now() - SYNC_INTERVAL_MINUTES * 60 * 1000).toISOString();
    // Regra de elegibilidade:
    // 1) Opportunidades nunca sincronizadas (last_appointment_sync_at IS NULL)
    //    são SEMPRE elegíveis — garantem que novas opps sem datas preenchidas
    //    pelo webhook não fiquem invisíveis no cron.
    // 2) Opportunidades já sincronizadas: requer data_reuniao_agendada,
    //    data_agendamento_vendas ou data_agendamento_reuniao dentro do
    //    lookback E sync obsoleto. data_agendamento_reuniao entrou aqui
    //    em 20260706 — sem isso, opps cujo único sinal era esse campo
    //    (legado do webhook) nunca voltavam a ser verificadas.
    query = query.or(
      `or(` +
        `last_appointment_sync_at.is.null,` +
        `and(or(data_agendamento_vendas.gte.${recentDateFloor},data_reuniao_agendada.gte.${recentDateFloor},data_agendamento_reuniao.gte.${recentDateFloor}),last_appointment_sync_at.lt.${cutoff})` +
      `)`,
    );
  }

  if (backfill && !oppIdFilter && !contactGhlFilter) {
    query = query.or(
      `data_agendamento_vendas.gte.${recentDateFloor},data_reuniao_agendada.gte.${recentDateFloor},data_agendamento_reuniao.gte.${recentDateFloor}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao buscar opps: ${error.message}`);
  }

  return (data ?? []) as unknown as OppRow[];
}

// ============================================================
// API GHL — APPOINTMENTS
// ============================================================

/**
 * Busca os detalhes completos de um appointment no GHL.
 * O endpoint /contacts/{id}/appointments retorna só o resumo.
 * Precisamos chamar /calendars/appointments/{id} para ter createdBy, calendarId, etc.
 */
async function fetchAppointmentDetail(appointmentId: string, apiKey: string): Promise<GhlAppointment | null> {
  try {
    const res = await fetch(
      `${GHL_API_BASE}/calendars/appointments/${appointmentId}`,
      { headers: buildGhlHeaders(apiKey) },
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

/**
 * Busca appointments de um contato na API GHL.
 * Retorna array de appointments ativos (não deletados e não cancelados),
 * enriquecidos com detalhes completos de cada appointment.
 */
async function fetchAppointments(contactGhlId: string, apiKey: string): Promise<{
  appointments: GhlAppointment[];
  rawAppointments?: ReturnType<typeof summarizeAppointmentForDebug>[];
  httpStatus: number;
  error?: string;
}> {
  try {
    const res = await fetch(
      `${GHL_API_BASE}/contacts/${contactGhlId}/appointments`,
      { headers: buildGhlHeaders(apiKey) },
    );

    if (res.status === 404) {
      return { appointments: [], httpStatus: 404 };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { appointments: [], httpStatus: res.status, error: text.substring(0, 200) };
    }

    const data = await res.json();
    const rawEvents = Array.isArray(data?.events)
      ? data.events
      : Array.isArray(data?.appointments)
        ? data.appointments
        : [];

    // Mantém cancelados na lista — eles são um desfecho real e precisam ser
    // enxergados (antes eram filtrados fora, fazendo agendamentos cancelados
    // "sumirem" do painel). Só descartamos deletados.
    const events: GhlAppointment[] = (rawEvents as GhlAppointment[])
      .filter((appointment) => !isDeletedAppointment(appointment));

    // NOVO: enriquecer cada appointment com os detalhes completos
    const enrichedEvents: GhlAppointment[] = [];
    for (const event of events) {
      if (event.id) {
        const detail = await fetchAppointmentDetail(event.id, apiKey);
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
  } catch (err) {
    return { appointments: [], httpStatus: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    // GHL_API_KEY nao e mais exigida (resolvida por opp). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing env: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const body            = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const backfill        = body.backfill === true;
    const batchSize       = Math.min(Math.max(Number(body.batch_size ?? DEFAULT_BATCH_SIZE), 1), 500);
    const maxCycles       = Math.min(Math.max(Number(body.max_cycles ?? DEFAULT_MAX_CYCLES), 1), 10);
    const oppIdFilter     = typeof body.opp_id === 'string' ? body.opp_id.trim() : '';
    const contactGhlFilter = typeof body.contact_ghl_id === 'string' ? body.contact_ghl_id.trim() : '';
    const includeDebug    = body.include_debug === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Limpa caches a cada execução para evitar stale entre requests
    userCache.clear();
    calendarCache.clear();

    // ----------------------------------------------------------------
    // 2. Chamar API GHL diretamente para cada opp
    // ----------------------------------------------------------------
    let processed    = 0;
    let updated      = 0;
    let cleared      = 0;
    let noAppoint    = 0;
    let notFound     = 0;
    let apiErrors    = 0;
    const errors: string[] = [];
    const debugRows: Array<Record<string, unknown>> = [];

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      const opps = await loadEligibleOpps(supabase, {
        batchSize,
        backfill,
        oppIdFilter,
        contactGhlFilter,
      });

      if (opps.length === 0) {
        break;
      }

      for (const opp of opps) {
        processed++;
        const contactGhlId = opp.contatos?.ghl_id;
        if (!contactGhlId) continue;

        // Fase 2: resolve o tenant POR OPP. O location_id vem do contato dono da
        // opp (contatos.location_id); mapeia para workspace via RPC (fatia 3) e
        // a chave GHL vem do helper (fatia 2). Fail-closed: sem location_id ou
        // sem credencial, a opp e pulada (contabilizada) e o lote segue — sem
        // abortar as demais opps e SEM cair em chave global.
        const locationId = opp.contatos?.location_id?.trim() ?? '';
        let apiKey: string;
        if (!locationId) {
          apiErrors++;
          errors.push(`opp=${opp.id} contact=${contactGhlId}: opp ${opp.id} sem location_id no contato`);
          await sleep(GHL_DELAY_MS);
          continue;
        }
        try {
          apiKey = await resolveGhlApiKeyForLocation(supabase, locationId, opp.id);
        } catch (err) {
          if (err instanceof FailClosedError) {
            apiErrors++;
            errors.push(`opp=${opp.id} contact=${contactGhlId}: ${err.message}`);
            await sleep(GHL_DELAY_MS);
            continue;
          }
          throw err;
        }

        const { appointments, rawAppointments, httpStatus, error: fetchErr } = await fetchAppointments(contactGhlId, apiKey);

        // 404 ou 400 "Contact not found" — contato não existe mais no GHL
        const isNotFound =
          httpStatus === 404 ||
          (httpStatus === 400 && fetchErr?.includes('Contact not found'));

        if (isNotFound) {
          notFound++;
          // Contato não existe mais no GHL (deletado/mesclado): o agendamento é
          // órfão. Limpa as datas + status para não poluir o painel com
          // agendamentos que não existem mais no GHL.
          await supabase
            .from('oportunidades')
            .update({
              data_reuniao_agendada: null,
              data_reuniao_agendada_ts: null,
              data_agendamento_reuniao: null,
              data_agendamento_vendas: null,
              appointment_status: null,
              last_appointment_sync_at: new Date().toISOString(),
            })
            .eq('id', opp.id);
          await sleep(GHL_DELAY_MS);
          continue;
        }

        if (fetchErr || httpStatus === 0 || httpStatus >= 500) {
          apiErrors++;
          errors.push(`opp=${opp.id} contact=${contactGhlId} status=${httpStatus}: ${fetchErr ?? ''}`);
          await sleep(GHL_DELAY_MS);
          continue;
        }

        if (includeDebug) {
          debugRows.push({
            opp_id: opp.id,
            ghl_opportunity_id: opp.ghl_opportunity_id ?? null,
            pipeline_id: opp.pipeline_id ?? null,
            pipeline_name: opp.pipeline_name ?? null,
            contact_ghl_id: contactGhlId,
            current_date: opp.data_reuniao_agendada,
            data_agendamento_reuniao: opp.data_agendamento_reuniao ?? null,
            data_agendamento_vendas: opp.data_agendamento_vendas ?? null,
            last_appointment_sync_at: opp.last_appointment_sync_at ?? null,
            appointments_seen: rawAppointments ?? [],
            active_appointments: appointments.map(summarizeAppointmentForDebug),
          });
        }

        if (appointments.length === 0) {
          noAppoint++;
          const { error: clearErr } = await supabase
            .from('oportunidades')
            .update({
              data_reuniao_agendada: null,
              data_reuniao_agendada_ts: null,
              data_agendamento_reuniao: null,
              data_agendamento_vendas: null,
              appointment_status: null,
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
          if (clearErr) {
            errors.push(`opp=${opp.id}: clear error: ${clearErr.message}`);
          } else if (opp.data_reuniao_agendada) {
            cleared++;
          }
          await sleep(GHL_DELAY_MS);
          continue;
        }

        // Separa ativos de cancelados. Cancelado é um desfecho real — se só
        // houver cancelados, usamos o mais recente cancelado como referência
        // (antes eles eram filtrados fora e o agendamento "sumia").
        const activeAppointments   = appointments.filter((a) => !isCanceledAppointment(a));
        const canceledAppointments = appointments.filter((a) => isCanceledAppointment(a));
        const byDateDesc = (a: GhlAppointment, b: GhlAppointment) =>
          new Date((b.startTime ?? '').replace(' ', 'T')).getTime() -
          new Date((a.startTime ?? '').replace(' ', 'T')).getTime();
        const referencePool = activeAppointments.length > 0 ? activeAppointments : canceledAppointments;
        referencePool.sort(byDateDesc);
        const latest       = referencePool[0];
        const onlyCanceled = activeAppointments.length === 0;
        const dateStr      = extractDateBRT(latest.startTime ?? '');

        if (!dateStr) {
          errors.push(`opp=${opp.id}: startTime inválido: ${latest.startTime}`);
          await sleep(GHL_DELAY_MS);
          continue;
        }

        const tsStr = extractTimestampUTC(latest.startTime ?? '');

        // Status REAL do GHL do appointment de referência (fato, não inferência).
        // Usado pelo painel para categorizar sem deixar ninguém "sem status".
        const referenceStatuses = collectAppointmentStatuses(latest);
        const referenceStatus = onlyCanceled
          ? (referenceStatuses.find((s) => CANCELED_APPOINTMENT_STATUSES.has(s)) ?? 'cancelled')
          : (referenceStatuses[0] ?? null);

        // NOVO: extrair origem do agendamento
        const createdBySource = latest.createdBy?.source ?? null;
        const createdByUserId = latest.createdBy?.userId ?? null;
        const calendarId = latest.calendarId ?? null;
        const assignedUserId = latest.assignedUserId ?? null;

        // Regra de desfecho — o GHL é a fonte da verdade:
        //  - showed/completed → realizacao=date e zera no-show (corrige se mudou)
        //  - noshow           → no-show=date e zera realizacao (corrige se mudou)
        //  - demais (confirmed/new/cancelled/invalid/rescheduled) → preserva
        //    datas existentes; o appointment_status é que manda na categoria.
        const showed = isShowedAppointment(latest);
        const noShow = isNoShowAppointment(latest);
        let dataRealizacaoVendas = opp.data_realizacao_vendas;
        let dataNoShow = opp.data_no_show;
        if (showed) {
          dataRealizacaoVendas = opp.data_realizacao_vendas ?? dateStr;
          dataNoShow = null;
        } else if (noShow) {
          dataNoShow = opp.data_no_show ?? dateStr;
          dataRealizacaoVendas = null;
        }

        // Buscar nomes dos usuários/calendário (cache local + API)
        const [creatorUser, assignedUser, calendarName] = await Promise.all([
          createdByUserId ? fetchGhlUser(supabase, createdByUserId, apiKey) : Promise.resolve(null),
          assignedUserId ? fetchGhlUser(supabase, assignedUserId, apiKey) : Promise.resolve(null),
          calendarId ? fetchGhlCalendarName(supabase, calendarId, apiKey, locationId) : Promise.resolve(null),
        ]);

        const { error: updateErr } = await supabase
          .from('oportunidades')
          .update({
            data_reuniao_agendada:    dateStr,
            data_reuniao_agendada_ts: tsStr,
            data_agendamento_reuniao: dateStr,
            data_agendamento_vendas:  dateStr,
            // Status REAL do GHL do appointment de referência (fato).
            appointment_status: referenceStatus,
            // NOVOS CAMPOS
            agendamento_origem: createdBySource,
            agendamento_por_user_id: createdByUserId,
            agendamento_por_user_nome: creatorUser?.name ?? null,
            agendamento_por_user_email: creatorUser?.email ?? null,
            agendamento_calendar_id: calendarId,
            agendamento_calendar_name: calendarName,
            agendamento_assigned_user_id: assignedUserId,
            agendamento_assigned_user_nome: assignedUser?.name ?? null,
            // Status do appointment (showed/noshow/completed)
            data_realizacao_vendas: dataRealizacaoVendas,
            data_no_show: dataNoShow,
            last_appointment_sync_at: new Date().toISOString(),
          })
          .eq('id', opp.id);

        if (updateErr) {
          errors.push(`opp=${opp.id}: update error: ${updateErr.message}`);
        } else {
          updated++;
        }

        await sleep(GHL_DELAY_MS);
      }

      if (oppIdFilter || contactGhlFilter || includeDebug) {
        break;
      }
    }

    // ----------------------------------------------------------------
    // 3. Contar quantas ainda faltam
    // ----------------------------------------------------------------
    const { count: remaining } = await supabase
      .from('oportunidades')
      .select('*', { count: 'exact', head: true })
      .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
      .or(`data_agendamento_vendas.gte.${isoDateDaysAgo(ACTIVE_LOOKBACK_DAYS)},data_reuniao_agendada.gte.${isoDateDaysAgo(ACTIVE_LOOKBACK_DAYS)},data_agendamento_reuniao.gte.${isoDateDaysAgo(ACTIVE_LOOKBACK_DAYS)}`)
      .is('last_appointment_sync_at', null);

    return new Response(JSON.stringify({
      mode:             backfill ? 'backfill' : 'cron',
      processed,
      updated,
      cleared,
      no_appointment:   noAppoint,
      not_found:        notFound,
      api_errors:       apiErrors,
      remaining_never_synced: remaining ?? 0,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      debug: includeDebug ? debugRows : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(`[${CALLER}] Erro fatal:`, err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
