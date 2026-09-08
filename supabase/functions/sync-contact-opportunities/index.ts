// Edge Function: sync-contact-opportunities
//
// Sincroniza TODAS as oportunidades de um contato via API GHL.
//
// Regras críticas:
// - Cada oportunidade é identificada por ghl_opportunity_id
// - data_lead_recebido permanece API-only (sync-opp-dates)
// - Campos existentes não podem ser apagados por payload parcial da API
// - A fila usa claim atômico via RPC e recupera itens presos em processing

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

// Fase 2/fatia 5: chave NAO e mais global. E resolvida POR ITEM (location_id ->
// workspace via RPC fatia 3 -> credencial via helper fatia 2). buildGhlHeaders
// monta o header por chamada com a chave do tenant dono do item.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 130;

const rateLimitState = {
  remaining: 100,
  resetInMs: 0,
};

interface QueueItem {
  id: string;
  ghl_contact_id: string;
  location_id: string | null;
  attempts: number;
  created_at: string;
  last_error: string | null;
  claimed_at: string | null;
}

interface GHLOpportunity {
  id: string;
  name?: string;
  status?: string;
  value?: number;
  pipeline?: { id?: string; name?: string };
  stage?: { id?: string; name?: string };
  contact?: { id?: string; name?: string; email?: string };
  assignedToUser?: { id?: string; name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
  customData?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
}

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  country?: string;
  timezone?: string;
  type?: string;
  source?: string;
  assignedTo?: string;
  locationId?: string;
  dateAdded?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface EnsuredContact {
  id: string;
  ghl_id: string;
  nome: string;
  email: string | null;
  location_id: string;
}

interface ExistingOpportunityRow {
  ghl_opportunity_id: string;
  contato_id: string | null;
  nome_contato: string | null;
  email_contato: string | null;
  titulo: string | null;
  valor: number | null;
  status: string | null;
  pipeline_id: string | null;
  pipeline_stage_id: string | null;
  pipeline_name: string | null;
  opportunity_source: string | null;
  vendedor_closer: string | null;
  lost_reason: string | null;
  resumo_ia: string | null;
  percepcao_closer: string | null;
  data_ultima_atividade: string | null;
  data_lead_recebido: string | null;
}

interface OppToUpsert {
  ghl_opportunity_id: string;
  contato_id: string;
  nome_contato: string;
  email_contato: string | null;
  titulo: string | null;
  valor: number | null;
  status: string;
  pipeline_id: string | null;
  pipeline_stage_id: string | null;
  pipeline_name: string | null;
  opportunity_source: string | null;
  vendedor_closer: string | null;
  lost_reason: string | null;
  resumo_ia: string | null;
  percepcao_closer: string | null;
  data_ultima_atividade: string | null;
  data_lead_recebido: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function buildContactName(candidate: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const direct = normalizeText(candidate.name);
  if (direct) return direct;

  const composed = [normalizeText(candidate.firstName), normalizeText(candidate.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (composed) return composed;

  const email = normalizeEmail(candidate.email);
  if (email) return email;

  const phone = normalizeText(candidate.phone);
  if (phone) return phone;

  return 'Sem nome';
}

function extractCustomField(
  customData: Array<{ key: string; value: string }> | undefined,
  keyVariants: string[],
): string | null {
  if (!customData || !Array.isArray(customData)) return null;

  for (const variant of keyVariants) {
    const found = customData.find((item) => item.key?.toLowerCase() === variant.toLowerCase());
    const normalized = normalizeText(found?.value);
    if (normalized) return normalized;
  }

  return null;
}

async function ghlFetch(urlStr: string, apiKey: string, label = ''): Promise<Response> {
  const MAX_RETRIES = 4;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (rateLimitState.remaining < 5) {
      const waitMs = Math.max(rateLimitState.resetInMs, 1000);
      console.warn(`[sync-contact-opp] rate-limit baixo (${label}) — aguardando ${waitMs}ms`);
      await delay(waitMs + 200);
    } else if (rateLimitState.remaining < 20) {
      await delay(500);
    } else {
      await delay(BASE_DELAY_MS);
    }

    const res = await fetch(urlStr, { headers: buildGhlHeaders(apiKey) });

    const remaining = res.headers.get('x-ratelimit-remaining');
    const interval = res.headers.get('x-ratelimit-interval-milliseconds');
    if (remaining !== null) rateLimitState.remaining = Number(remaining);
    if (interval !== null) rateLimitState.resetInMs = Number(interval);

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, attempt);
      console.warn(`[sync-contact-opp] 429 ${label} — tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs + 500}ms`);
      if (attempt >= MAX_RETRIES) {
        throw new Error(`GHL 429 após ${MAX_RETRIES} tentativas: ${label}`);
      }
      await delay(waitMs + 500);
      continue;
    }

    return res;
  }

  throw new Error(`ghlFetch: loop inesperado (${label})`);
}

async function fetchAllOpportunitiesForContact(ghlContactId: string, locationId: string, apiKey: string): Promise<GHLOpportunity[]> {
  const allOpps: GHLOpportunity[] = [];
  let pageUrl = `${GHL_API_BASE}/opportunities/search?contact_id=${encodeURIComponent(ghlContactId)}&location_id=${encodeURIComponent(locationId)}&limit=100`;

  while (pageUrl) {
    const res = await ghlFetch(pageUrl, apiKey, `/opportunities?contact_id=${ghlContactId}`);

    if (res.status === 404) {
      console.warn(`[sync-contact-opp] Contato ${ghlContactId} não encontrado na API ao buscar oportunidades`);
      break;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GHL /opportunities?contact_id=${ghlContactId} ${res.status}: ${errText}`);
    }

    const data = await res.json() as {
      opportunities?: GHLOpportunity[];
      pageInfo?: { nextPageUrl?: string };
      meta?: { nextPageUrl?: string };
    };

    allOpps.push(...(data.opportunities || []));
    pageUrl = data.pageInfo?.nextPageUrl || data.meta?.nextPageUrl || '';
  }

  return allOpps;
}

async function fetchGhlContact(ghlContactId: string, apiKey: string): Promise<GHLContact | null> {
  const res = await ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, apiKey, `/contacts/${ghlContactId}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GHL /contacts/${ghlContactId} ${res.status}: ${errText}`);
  }

  const data = await res.json() as { contact?: GHLContact };
  return data.contact ?? null;
}

async function ensureLocalContactRecord(
  supabase: ReturnType<typeof createClient>,
  ghlContactId: string,
  locationId: string,
  oppHint: GHLOpportunity['contact'] | null,
  apiKey: string,
): Promise<EnsuredContact> {
  const { data: localContact, error: localError } = await supabase
    .from('contatos')
    .select('id, ghl_id, nome, email, location_id')
    .eq('ghl_id', ghlContactId)
    .maybeSingle();

  if (localError) {
    throw new Error(`Erro ao buscar contato ${ghlContactId} no Supabase: ${localError.message}`);
  }

  const needsApi = !localContact || !normalizeText(localContact.nome) || !normalizeEmail(localContact.email);
  const remoteContact = needsApi ? await fetchGhlContact(ghlContactId, apiKey) : null;

  const resolvedLocationId =
    normalizeText(locationId) ||
    normalizeText(remoteContact?.locationId) ||
    normalizeText(localContact?.location_id);

  if (!resolvedLocationId) {
    throw new Error(`location_id indefinido para contato ${ghlContactId}`);
  }

  const resolvedNome = buildContactName({
    name: normalizeText(localContact?.nome) ||
      normalizeText(oppHint?.name) ||
      null,
    firstName: normalizeText(remoteContact?.firstName),
    lastName: normalizeText(remoteContact?.lastName),
    email: normalizeEmail(localContact?.email) ||
      normalizeEmail(oppHint?.email) ||
      normalizeEmail(remoteContact?.email),
    phone: normalizeText(remoteContact?.phone),
  });

  const resolvedEmail =
    normalizeEmail(localContact?.email) ||
    normalizeEmail(oppHint?.email) ||
    normalizeEmail(remoteContact?.email);

  if (localContact?.id) {
    const updatePayload: Record<string, unknown> = {
      location_id: resolvedLocationId,
    };

    if (normalizeText(localContact.nome) !== resolvedNome) {
      updatePayload.nome = resolvedNome;
    }

    if (resolvedEmail && normalizeEmail(localContact.email) !== resolvedEmail) {
      updatePayload.email = resolvedEmail;
    }

    if (remoteContact) {
      const phone = normalizeText(remoteContact.phone);
      const country = normalizeText(remoteContact.country);
      const timezone = normalizeText(remoteContact.timezone);
      const type = normalizeText(remoteContact.type);
      const source = normalizeText(remoteContact.source);
      const assignedTo = normalizeText(remoteContact.assignedTo);
      const dateAdded = normalizeText(remoteContact.dateAdded);
      const tags = Array.isArray(remoteContact.tags) ? remoteContact.tags.join(',') : null;

      if (phone) updatePayload.telefone = phone;
      if (country) updatePayload.country = country;
      if (timezone) updatePayload.timezone = timezone;
      if (type) updatePayload.contact_type = type;
      if (source) updatePayload.contact_source = source;
      if (assignedTo) updatePayload.owner_id = assignedTo;
      if (dateAdded) updatePayload.date_created = dateAdded;
      if (tags !== null) updatePayload.tags = tags;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('contatos')
        .update(updatePayload)
        .eq('id', localContact.id);

      if (updateError) {
        throw new Error(`Erro ao atualizar contato ${ghlContactId}: ${updateError.message}`);
      }
    }

    return {
      id: localContact.id,
      ghl_id: ghlContactId,
      nome: resolvedNome,
      email: resolvedEmail,
      location_id: resolvedLocationId,
    };
  }

  const insertPayload: Record<string, unknown> = {
    ghl_id: ghlContactId,
    nome: resolvedNome,
    email: resolvedEmail,
    location_id: resolvedLocationId,
  };

  if (remoteContact) {
    const phone = normalizeText(remoteContact.phone);
    const country = normalizeText(remoteContact.country);
    const timezone = normalizeText(remoteContact.timezone);
    const type = normalizeText(remoteContact.type);
    const source = normalizeText(remoteContact.source);
    const assignedTo = normalizeText(remoteContact.assignedTo);
    const dateAdded = normalizeText(remoteContact.dateAdded);
    const tags = Array.isArray(remoteContact.tags) ? remoteContact.tags.join(',') : null;
    const firstName = normalizeText(remoteContact.firstName);
    const lastName = normalizeText(remoteContact.lastName);

    if (phone) insertPayload.telefone = phone;
    if (country) insertPayload.country = country;
    if (timezone) insertPayload.timezone = timezone;
    if (type) insertPayload.contact_type = type;
    if (source) insertPayload.contact_source = source;
    if (assignedTo) insertPayload.owner_id = assignedTo;
    if (dateAdded) insertPayload.date_created = dateAdded;
    if (tags !== null) insertPayload.tags = tags;
    if (firstName) insertPayload.primeiro_nome = firstName;
    if (lastName) insertPayload.ultimo_nome = lastName;
  }

  const { data: insertedContact, error: insertError } = await supabase
    .from('contatos')
    .upsert(insertPayload, { onConflict: 'ghl_id', ignoreDuplicates: false })
    .select('id, ghl_id, nome, email, location_id')
    .single();

  if (insertError || !insertedContact) {
    throw new Error(`Erro ao criar contato ${ghlContactId}: ${insertError?.message ?? 'sem retorno do banco'}`);
  }

  return {
    id: insertedContact.id,
    ghl_id: ghlContactId,
    nome: buildContactName({
      name: normalizeText(insertedContact.nome),
      email: normalizeEmail(insertedContact.email),
    }),
    email: normalizeEmail(insertedContact.email),
    location_id: normalizeText(insertedContact.location_id) || resolvedLocationId,
  };
}

function buildOpportunityPayload(
  opp: GHLOpportunity,
  ensuredContact: EnsuredContact,
  existing: ExistingOpportunityRow | null,
): OppToUpsert {
  const oppName = normalizeText(opp.name);
  const oppEmail = normalizeEmail(opp.contact?.email);
  const existingEmail = normalizeEmail(existing?.email_contato);

  return {
    ghl_opportunity_id: opp.id,
    contato_id: ensuredContact.id,
    nome_contato: buildContactName({
      name:
        normalizeText(opp.contact?.name) ||
        normalizeText(existing?.nome_contato) ||
        ensuredContact.nome,
      email: oppEmail || existingEmail || ensuredContact.email,
    }),
    email_contato: oppEmail || existingEmail || ensuredContact.email,
    titulo: oppName || normalizeText(existing?.titulo),
    valor: typeof opp.value === 'number' ? opp.value : existing?.valor ?? null,
    status: normalizeText(opp.status) || normalizeText(existing?.status) || 'open',
    pipeline_id: normalizeText(opp.pipeline?.id) || normalizeText(existing?.pipeline_id),
    pipeline_stage_id: normalizeText(opp.stage?.id) || normalizeText(existing?.pipeline_stage_id),
    pipeline_name: normalizeText(opp.pipeline?.name) || normalizeText(existing?.pipeline_name),
    opportunity_source:
      extractCustomField(opp.customData, ['{{ opportunity.source }}', '{{opportunity.source}}']) ||
      normalizeText(existing?.opportunity_source),
    vendedor_closer: normalizeText(opp.assignedToUser?.name) || null,
    lost_reason:
      extractCustomField(opp.customData, ['{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}']) ||
      normalizeText(existing?.lost_reason),
    resumo_ia:
      extractCustomField(opp.customData, ['{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}']) ||
      normalizeText(existing?.resumo_ia),
    percepcao_closer:
      extractCustomField(opp.customData, ['{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}']) ||
      normalizeText(existing?.percepcao_closer),
    data_ultima_atividade: normalizeText(opp.updatedAt) || normalizeText(existing?.data_ultima_atividade),
    data_lead_recebido: normalizeText(existing?.data_lead_recebido),
  };
}

async function upsertOpportunitiesForContact(
  supabase: ReturnType<typeof createClient>,
  ensuredContact: EnsuredContact,
  opps: GHLOpportunity[],
): Promise<number> {
  if (opps.length === 0) {
    return 0;
  }

  const oppIds = opps.map((opp) => opp.id);
  const { data: existingRows, error: existingError } = await supabase
    .from('oportunidades')
    .select(`
      ghl_opportunity_id,
      contato_id,
      nome_contato,
      email_contato,
      titulo,
      valor,
      status,
      pipeline_id,
      pipeline_stage_id,
      pipeline_name,
      opportunity_source,
      vendedor_closer,
      lost_reason,
      resumo_ia,
      percepcao_closer,
      data_ultima_atividade,
      data_lead_recebido
    `)
    .in('ghl_opportunity_id', oppIds);

  if (existingError) {
    throw new Error(`Erro ao buscar oportunidades existentes: ${existingError.message}`);
  }

  const existingMap = new Map<string, ExistingOpportunityRow>();
  for (const row of existingRows || []) {
    existingMap.set(row.ghl_opportunity_id, row as ExistingOpportunityRow);
  }

  const oppsToUpsert: OppToUpsert[] = opps.map((opp) =>
    buildOpportunityPayload(opp, ensuredContact, existingMap.get(opp.id) ?? null)
  );

  const { error: upsertError } = await supabase
    .from('oportunidades')
    .upsert(oppsToUpsert, {
      onConflict: 'ghl_opportunity_id',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(`UPSERT falhou: ${upsertError.message}`);
  }

  return oppsToUpsert.length;
}

async function requeueStaleItems(
  supabase: ReturnType<typeof createClient>,
  staleAfterMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('requeue_stale_contact_opp_sync_queue', {
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (error) {
    throw new Error(`Erro ao reencaminhar itens stale da fila: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}

async function claimQueueItems(
  supabase: ReturnType<typeof createClient>,
  batchSize: number,
  staleAfterMinutes: number,
): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('claim_contact_opp_sync_queue', {
    p_batch_size: batchSize,
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (error) {
    throw new Error(`Erro ao fazer claim da fila: ${error.message}`);
  }

  return (data ?? []) as QueueItem[];
}

// Fase 2/fatia 5: erro de fail-closed (sem tenant ou sem credencial). E TERMINAL:
// nao adianta retry — o item nao tem como ser processado sem dono/chave. O catch
// em processClaimedItems marca o item como 'error' (nao 'pending') quando recebe
// este tipo, evitando loop infinito e deixando rastro auditavel na fila.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailClosedError';
  }
}

// Resolve a chave GHL do workspace dono de um location_id (por item).
//   1. location_id -> workspace via RPC segura da fatia 3 (NULL = sem match, sem
//      fallback "mais antigo").
//   2. credencial do workspace via helper da fatia 2 (Vault + cache).
// Qualquer falha => FailClosedError (NUNCA cai em chave global).
async function resolveGhlApiKeyForLocation(
  supabase: ReturnType<typeof createClient>,
  locationId: string,
  item: QueueItem,
): Promise<string> {
  const { data: workspaceId, error: rpcErr } = await supabase.rpc(
    'get_workspace_id_by_ghl_location_id',
    { p_location_id: locationId },
  );
  if (rpcErr || !workspaceId) {
    throw new FailClosedError(
      `location_id '${locationId}' nao resolve workspace (item ${item.id})${rpcErr ? ': ' + rpcErr.message : ''}`,
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
      `credencial ghl nao resolvida para workspace ${workspaceId} (item ${item.id}): ${msg}`,
    );
  }
}

async function processQueueItem(
  supabase: ReturnType<typeof createClient>,
  item: QueueItem,
): Promise<{ upserted: number; oppCount: number }> {
  // Fase 2/fatia 5: location_id vem do ITEM (sem fallback a GHL_LOCATION_ID global).
  const locationId = normalizeText(item.location_id);
  if (!locationId) {
    throw new FailClosedError(
      `item ${item.id} sem location_id (contato ${item.ghl_contact_id})`,
    );
  }

  // Resolve o workspace dono do location e a chave DESSE workspace (fail-closed).
  const apiKey = await resolveGhlApiKeyForLocation(supabase, locationId, item);

  const opps = await fetchAllOpportunitiesForContact(item.ghl_contact_id, locationId, apiKey);
  const primaryHint = opps.find((opp) => opp.contact)?.contact ?? null;
  const ensuredContact = await ensureLocalContactRecord(supabase, item.ghl_contact_id, locationId, primaryHint, apiKey);
  const upserted = await upsertOpportunitiesForContact(supabase, ensuredContact, opps);

  return {
    upserted,
    oppCount: opps.length,
  };
}

async function processClaimedItems(
  supabase: ReturnType<typeof createClient>,
  claimed: QueueItem[],
): Promise<{
  done: number;
  retried: number;
  errored: number;
  upserted: number;
  errorDetails: string[];
}> {
  let done = 0;
  let retried = 0;
  let errored = 0;
  let upserted = 0;
  const errorDetails: string[] = [];

  for (const item of claimed) {
    try {
      const result = await processQueueItem(supabase, item);

      const { error: doneError } = await supabase
        .from('contact_opp_sync_queue')
        .update({
          status: 'done',
          claimed_at: null,
          last_error: null,
          processed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (doneError) {
        throw new Error(`Falha ao marcar fila como done: ${doneError.message}`);
      }

      done++;
      upserted += result.upserted;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Fail-closed (sem tenant/credencial) e TERMINAL: marca 'error' direto,
      // sem retry (nao adianta tentar de novo sem dono/chave).
      const isFailClosed = err instanceof FailClosedError;
      const nextStatus = (isFailClosed || item.attempts >= MAX_ATTEMPTS) ? 'error' : 'pending';
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        claimed_at: null,
        last_error: errorMsg,
      };

      if (nextStatus === 'error') {
        updatePayload.processed_at = new Date().toISOString();
        errored++;
      } else {
        updatePayload.processed_at = null;
        retried++;
      }

      const { error: retryError } = await supabase
        .from('contact_opp_sync_queue')
        .update(updatePayload)
        .eq('id', item.id);

      if (retryError) {
        console.error(`[sync-contact-opp] Erro ao atualizar fila ${item.id}: ${retryError.message}`);
      }

      errorDetails.push(`${item.ghl_contact_id}: ${errorMsg}`);
    }
  }

  return {
    done,
    retried,
    errored,
    upserted,
    errorDetails,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const requestedBatchSize = Math.min(Math.max(Number(body.batch_size ?? 50), 1), 50);
    const exactBatchSize = body.exact_batch_size === true;
    const batchSize = exactBatchSize ? requestedBatchSize : Math.max(requestedBatchSize, 50);
    const maxBatches = Math.min(Math.max(Number(body.max_batches ?? 2), 1), 3);
    const maxRunMs = Math.min(Math.max(Number(body.max_run_ms ?? 110_000), 10_000), 240_000);
    const staleAfterMinutes = Math.min(Math.max(Number(body.stale_after_minutes ?? 30), 1), 24 * 60);

    // GHL_API_KEY nao e mais exigida (resolvida por item). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const runStartedAt = Date.now();

    const staleRequeued = await requeueStaleItems(supabase, staleAfterMinutes);
    let processed = 0;
    let batchesRun = 0;
    let done = 0;
    let retried = 0;
    let errored = 0;
    let upserted = 0;
    const errorDetails: string[] = [];
    let stoppedByTimeLimit = false;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
      const claimed = await claimQueueItems(supabase, batchSize, staleAfterMinutes);
      if (claimed.length === 0) {
        break;
      }

      batchesRun++;
      processed += claimed.length;

      const batchResult = await processClaimedItems(supabase, claimed);
      done += batchResult.done;
      retried += batchResult.retried;
      errored += batchResult.errored;
      upserted += batchResult.upserted;
      errorDetails.push(...batchResult.errorDetails);

      if (Date.now() - runStartedAt >= maxRunMs) {
        stoppedByTimeLimit = true;
        break;
      }
    }

    const { count: remaining } = await supabase
      .from('contact_opp_sync_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (processed === 0) {
      return new Response(
        JSON.stringify({
          processed: 0,
          batches_run: 0,
          batch_size: batchSize,
          max_batches: maxBatches,
          exact_batch_size: exactBatchSize,
          done: 0,
          retried: 0,
          errored: 0,
          stale_requeued: staleRequeued,
          remaining: remaining ?? 0,
          message: 'Nenhum contato pendente no lote.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        processed,
        batches_run: batchesRun,
        batch_size: batchSize,
        max_batches: maxBatches,
        exact_batch_size: exactBatchSize,
        done,
        retried,
        errored,
        stale_requeued: staleRequeued,
        upserted,
        remaining: remaining ?? 0,
        stopped_by_time_limit: stoppedByTimeLimit,
        elapsed_ms: Date.now() - runStartedAt,
        errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[sync-contact-opp] Erro fatal:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
