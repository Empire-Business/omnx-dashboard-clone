// Edge Function: reconcile-contact-opportunities
//
// Modos:
// - audit: compara GHL vs banco sem gravar oportunidades
// - write: compara e faz upsert corretivo das oportunidades
//
// A execução completa é dividida em runs + itens persistidos em banco:
// - action=start   → cria run e enfileira todos os contatos
// - action=process → consome um batch do run em lotes
// - action=status  → resume o estado do run mais recente ou de um run_id

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
const CONTACT_PAGE_SIZE = 1000;
const ITEM_INSERT_CHUNK = 500;
const BASE_DELAY_MS = 130;

const rateLimitState = {
  remaining: 100,
  resetInMs: 0,
};

type RunMode = 'audit' | 'write';
type RunStatus = 'pending' | 'running' | 'done' | 'done_with_errors' | 'failed';

interface RunRow {
  id: string;
  mode: RunMode;
  scope: string;
  source: string;
  status: RunStatus;
  total_contacts: number;
  processed_contacts: number;
  success_contacts: number;
  error_contacts: number;
  contacts_with_missing: number;
  contacts_with_extra: number;
  opportunities_missing: number;
  opportunities_extra: number;
  opportunities_inserted: number;
  opportunities_updated: number;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReconcileItem {
  id: string;
  run_id: string;
  contato_id: string | null;
  ghl_contact_id: string;
  location_id: string;
  nome_contato: string | null;
  email_contato: string | null;
  attempts: number;
  created_at: string;
  last_error: string | null;
  claimed_at: string | null;
}

interface ContactRow {
  id: string;
  ghl_id: string;
  nome: string | null;
  email: string | null;
  location_id: string | null;
  telefone?: string | null;
  country?: string | null;
  timezone?: string | null;
  contact_type?: string | null;
  contact_source?: string | null;
  owner_id?: string | null;
  date_created?: string | null;
  tags?: string | null;
  primeiro_nome?: string | null;
  ultimo_nome?: string | null;
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

interface ProcessedItemResult {
  contato_id: string;
  nome_contato: string;
  email_contato: string | null;
  ghl_total: number;
  db_total: number;
  missing_in_db: string[];
  extra_in_db: string[];
  updated_in_db: string[];
  inserted_count: number;
  updated_count: number;
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
      console.warn(`[reconcile-contact-opp] rate-limit baixo (${label}) — aguardando ${waitMs}ms`);
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
      console.warn(`[reconcile-contact-opp] 429 ${label} — tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs + 500}ms`);
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

async function loadContactRow(
  supabase: ReturnType<typeof createClient>,
  item: ReconcileItem,
): Promise<ContactRow | null> {
  if (item.contato_id) {
    const { data, error } = await supabase
      .from('contatos')
      .select('id, ghl_id, nome, email, location_id, telefone, country, timezone, contact_type, contact_source, owner_id, date_created, tags, primeiro_nome, ultimo_nome')
      .eq('id', item.contato_id)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao carregar contato ${item.contato_id}: ${error.message}`);
    }

    if (data) return data as ContactRow;
  }

  const { data, error } = await supabase
    .from('contatos')
    .select('id, ghl_id, nome, email, location_id, telefone, country, timezone, contact_type, contact_source, owner_id, date_created, tags, primeiro_nome, ultimo_nome')
    .eq('ghl_id', item.ghl_contact_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar contato ${item.ghl_contact_id}: ${error.message}`);
  }

  return data as ContactRow | null;
}

async function ensureContactWriteContext(
  supabase: ReturnType<typeof createClient>,
  item: ReconcileItem,
  oppHint: GHLOpportunity['contact'] | null,
  apiKey: string,
): Promise<ContactRow> {
  const local = await loadContactRow(supabase, item);
  const needsApi = !local || !normalizeText(local.nome) || !normalizeEmail(local.email);
  const remote = needsApi ? await fetchGhlContact(item.ghl_contact_id, apiKey) : null;

  const resolvedLocationId =
    normalizeText(item.location_id) ||
    normalizeText(remote?.locationId) ||
    normalizeText(local?.location_id);

  if (!resolvedLocationId) {
    throw new Error(`location_id indefinido para contato ${item.ghl_contact_id}`);
  }

  const resolvedNome = buildContactName({
    name:
      normalizeText(local?.nome) ||
      normalizeText(oppHint?.name),
    firstName: normalizeText(remote?.firstName) || normalizeText(local?.primeiro_nome),
    lastName: normalizeText(remote?.lastName) || normalizeText(local?.ultimo_nome),
    email: normalizeEmail(local?.email) || normalizeEmail(oppHint?.email) || normalizeEmail(remote?.email),
    phone: normalizeText(remote?.phone) || normalizeText(local?.telefone),
  });

  const resolvedEmail =
    normalizeEmail(local?.email) ||
    normalizeEmail(oppHint?.email) ||
    normalizeEmail(remote?.email);

  if (local?.id) {
    const updatePayload: Record<string, unknown> = {
      location_id: resolvedLocationId,
    };

    if (normalizeText(local.nome) !== resolvedNome) updatePayload.nome = resolvedNome;
    if (resolvedEmail && normalizeEmail(local.email) !== resolvedEmail) updatePayload.email = resolvedEmail;

    if (remote) {
      const phone = normalizeText(remote.phone);
      const country = normalizeText(remote.country);
      const timezone = normalizeText(remote.timezone);
      const type = normalizeText(remote.type);
      const source = normalizeText(remote.source);
      const assignedTo = normalizeText(remote.assignedTo);
      const dateAdded = normalizeText(remote.dateAdded);
      const tags = Array.isArray(remote.tags) ? remote.tags.join(',') : null;
      const firstName = normalizeText(remote.firstName);
      const lastName = normalizeText(remote.lastName);

      if (phone) updatePayload.telefone = phone;
      if (country) updatePayload.country = country;
      if (timezone) updatePayload.timezone = timezone;
      if (type) updatePayload.contact_type = type;
      if (source) updatePayload.contact_source = source;
      if (assignedTo) updatePayload.owner_id = assignedTo;
      if (dateAdded) updatePayload.date_created = dateAdded;
      if (tags !== null) updatePayload.tags = tags;
      if (firstName) updatePayload.primeiro_nome = firstName;
      if (lastName) updatePayload.ultimo_nome = lastName;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('contatos')
        .update(updatePayload)
        .eq('id', local.id);

      if (updateError) {
        throw new Error(`Erro ao atualizar contato ${item.ghl_contact_id}: ${updateError.message}`);
      }
    }

    return {
      ...local,
      nome: resolvedNome,
      email: resolvedEmail,
      location_id: resolvedLocationId,
    };
  }

  const insertPayload: Record<string, unknown> = {
    ghl_id: item.ghl_contact_id,
    nome: resolvedNome,
    email: resolvedEmail,
    location_id: resolvedLocationId,
  };

  if (remote) {
    const phone = normalizeText(remote.phone);
    const country = normalizeText(remote.country);
    const timezone = normalizeText(remote.timezone);
    const type = normalizeText(remote.type);
    const source = normalizeText(remote.source);
    const assignedTo = normalizeText(remote.assignedTo);
    const dateAdded = normalizeText(remote.dateAdded);
    const tags = Array.isArray(remote.tags) ? remote.tags.join(',') : null;
    const firstName = normalizeText(remote.firstName);
    const lastName = normalizeText(remote.lastName);

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

  const { data: inserted, error: insertError } = await supabase
    .from('contatos')
    .upsert(insertPayload, { onConflict: 'ghl_id', ignoreDuplicates: false })
    .select('id, ghl_id, nome, email, location_id, telefone, country, timezone, contact_type, contact_source, owner_id, date_created, tags, primeiro_nome, ultimo_nome')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Erro ao criar contato ${item.ghl_contact_id}: ${insertError?.message ?? 'sem retorno do banco'}`);
  }

  return inserted as ContactRow;
}

async function fetchExistingOpportunitiesForContact(
  supabase: ReturnType<typeof createClient>,
  contatoId: string,
): Promise<ExistingOpportunityRow[]> {
  const { data, error } = await supabase
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
    .eq('contato_id', contatoId);

  if (error) {
    throw new Error(`Erro ao buscar oportunidades do contato ${contatoId}: ${error.message}`);
  }

  return (data ?? []) as ExistingOpportunityRow[];
}

function buildOpportunityPayload(
  opp: GHLOpportunity,
  contato: ContactRow,
  existing: ExistingOpportunityRow | null,
): OppToUpsert {
  const emailContato =
    normalizeEmail(opp.contact?.email) ||
    normalizeEmail(contato.email) ||
    normalizeEmail(existing?.email_contato);

  const nomeContato = buildContactName({
    name:
      normalizeText(opp.contact?.name) ||
      normalizeText(contato.nome) ||
      normalizeText(existing?.nome_contato),
    firstName: normalizeText(contato.primeiro_nome),
    lastName: normalizeText(contato.ultimo_nome),
    email: emailContato,
    phone: normalizeText(contato.telefone),
  });

  return {
    ghl_opportunity_id: opp.id,
    contato_id: contato.id,
    nome_contato: nomeContato,
    email_contato: emailContato,
    titulo: normalizeText(opp.name) || normalizeText(existing?.titulo),
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

function hasOpportunityDiff(payload: OppToUpsert, existing: ExistingOpportunityRow | null): boolean {
  if (!existing) return true;

  const comparableKeys: Array<keyof OppToUpsert> = [
    'contato_id',
    'nome_contato',
    'email_contato',
    'titulo',
    'valor',
    'status',
    'pipeline_id',
    'pipeline_stage_id',
    'pipeline_name',
    'opportunity_source',
    'vendedor_closer',
    'lost_reason',
    'resumo_ia',
    'percepcao_closer',
    'data_ultima_atividade',
    'data_lead_recebido',
  ];

  return comparableKeys.some((key) => {
    const left = payload[key];
    const right = existing[key as keyof ExistingOpportunityRow];
    return JSON.stringify(left) !== JSON.stringify(right);
  });
}

async function upsertOpportunities(
  supabase: ReturnType<typeof createClient>,
  payloads: OppToUpsert[],
): Promise<void> {
  if (payloads.length === 0) return;

  const { error } = await supabase
    .from('oportunidades')
    .upsert(payloads, {
      onConflict: 'ghl_opportunity_id',
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`UPSERT de oportunidades falhou: ${error.message}`);
  }
}

async function startRun(
  supabase: ReturnType<typeof createClient>,
  mode: RunMode,
  source: string,
  scope: string,
): Promise<RunRow> {
  const { data: activeRun, error: activeError } = await supabase
    .from('ghl_opp_reconcile_runs')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    throw new Error(`Erro ao verificar run ativo: ${activeError.message}`);
  }

  if (activeRun) {
    return activeRun as RunRow;
  }

  const { data: run, error: runError } = await supabase
    .from('ghl_opp_reconcile_runs')
    .insert({
      mode,
      scope,
      source,
      status: 'running',
      started_at: new Date().toISOString(),
      notes: mode === 'audit'
        ? 'Reconciliação audit-only iniciada'
        : 'Reconciliação write iniciada',
    })
    .select('*')
    .single();

  if (runError || !run) {
    throw new Error(`Erro ao criar run de reconciliação: ${runError?.message ?? 'sem retorno do banco'}`);
  }

  const runId = run.id as string;
  let totalContacts = 0;
  let page = 0;

  while (true) {
    const from = page * CONTACT_PAGE_SIZE;
    const to = from + CONTACT_PAGE_SIZE - 1;

    const { data: contacts, error: contactsError } = await supabase
      .from('contatos')
      .select('id, ghl_id, nome, email, location_id')
      .not('ghl_id', 'is', null)
      .order('id')
      .range(from, to);

    if (contactsError) {
      await supabase
        .from('ghl_opp_reconcile_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          notes: `Falha ao enfileirar contatos: ${contactsError.message}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);
      throw new Error(`Erro ao buscar contatos para reconciliação: ${contactsError.message}`);
    }

    if (!contacts || contacts.length === 0) {
      break;
    }

    const items = contacts
      .map((contact) => ({
        run_id: runId,
        contato_id: contact.id,
        ghl_contact_id: contact.ghl_id,
        location_id: normalizeText(contact.location_id),
        nome_contato: normalizeText(contact.nome),
        email_contato: normalizeEmail(contact.email),
      }))
      .filter((item) => item.location_id);

    for (let index = 0; index < items.length; index += ITEM_INSERT_CHUNK) {
      const chunk = items.slice(index, index + ITEM_INSERT_CHUNK);
      if (chunk.length === 0) continue;

      const { error: insertError } = await supabase
        .from('ghl_opp_reconcile_items')
        .insert(chunk);

      if (insertError) {
        await supabase
          .from('ghl_opp_reconcile_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            notes: `Falha ao inserir itens do run: ${insertError.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', runId);
        throw new Error(`Erro ao inserir itens de reconciliação: ${insertError.message}`);
      }

      totalContacts += chunk.length;
    }

    if (contacts.length < CONTACT_PAGE_SIZE) {
      break;
    }

    page++;
  }

  const { data: updatedRun, error: updateRunError } = await supabase
    .from('ghl_opp_reconcile_runs')
    .update({
      total_contacts: totalContacts,
      updated_at: new Date().toISOString(),
      notes: `Run criado com ${totalContacts} contatos`,
    })
    .eq('id', runId)
    .select('*')
    .single();

  if (updateRunError || !updatedRun) {
    throw new Error(`Erro ao finalizar criação do run: ${updateRunError?.message ?? 'sem retorno do banco'}`);
  }

  return updatedRun as RunRow;
}

async function requeueStaleRunItems(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  staleAfterMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('requeue_stale_ghl_opp_reconcile_items', {
    p_run_id: runId,
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (error) {
    throw new Error(`Erro ao reencaminhar itens stale do run ${runId}: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}

async function claimRunItems(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  batchSize: number,
  staleAfterMinutes: number,
): Promise<ReconcileItem[]> {
  const { data, error } = await supabase.rpc('claim_ghl_opp_reconcile_items', {
    p_run_id: runId,
    p_batch_size: batchSize,
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (error) {
    throw new Error(`Erro ao fazer claim dos itens do run ${runId}: ${error.message}`);
  }

  return (data ?? []) as ReconcileItem[];
}

async function incrementRunCounters(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  deltas: {
    processed_contacts?: number;
    success_contacts?: number;
    error_contacts?: number;
    contacts_with_missing?: number;
    contacts_with_extra?: number;
    opportunities_missing?: number;
    opportunities_extra?: number;
    opportunities_inserted?: number;
    opportunities_updated?: number;
  },
): Promise<void> {
  const { error } = await supabase.rpc('increment_ghl_opp_reconcile_run_counters', {
    p_run_id: runId,
    p_processed_contacts: deltas.processed_contacts ?? 0,
    p_success_contacts: deltas.success_contacts ?? 0,
    p_error_contacts: deltas.error_contacts ?? 0,
    p_contacts_with_missing: deltas.contacts_with_missing ?? 0,
    p_contacts_with_extra: deltas.contacts_with_extra ?? 0,
    p_opportunities_missing: deltas.opportunities_missing ?? 0,
    p_opportunities_extra: deltas.opportunities_extra ?? 0,
    p_opportunities_inserted: deltas.opportunities_inserted ?? 0,
    p_opportunities_updated: deltas.opportunities_updated ?? 0,
  });

  if (error) {
    throw new Error(`Erro ao atualizar contadores do run ${runId}: ${error.message}`);
  }
}

async function findRun(
  supabase: ReturnType<typeof createClient>,
  runId?: string | null,
): Promise<RunRow | null> {
  if (runId) {
    const { data, error } = await supabase
      .from('ghl_opp_reconcile_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar run ${runId}: ${error.message}`);
    }

    return data as RunRow | null;
  }

  const { data, error } = await supabase
    .from('ghl_opp_reconcile_runs')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar run ativo: ${error.message}`);
  }

  return data as RunRow | null;
}

async function summarizeRun(
  supabase: ReturnType<typeof createClient>,
  run: RunRow,
): Promise<Record<string, unknown>> {
  const [pendingCount, processingCount, errorCount, latestErrors] = await Promise.all([
    supabase
      .from('ghl_opp_reconcile_items')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('status', 'pending'),
    supabase
      .from('ghl_opp_reconcile_items')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('status', 'processing'),
    supabase
      .from('ghl_opp_reconcile_items')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('status', 'error'),
    supabase
      .from('ghl_opp_reconcile_items')
      .select('ghl_contact_id,last_error,processed_at')
      .eq('run_id', run.id)
      .eq('status', 'error')
      .order('processed_at', { ascending: false })
      .limit(5),
  ]);

  if (pendingCount.error || processingCount.error || errorCount.error) {
    throw new Error(`Erro ao resumir itens do run ${run.id}`);
  }

  if (latestErrors.error) {
    throw new Error(`Erro ao carregar erros recentes do run ${run.id}: ${latestErrors.error.message}`);
  }

  return {
    run,
    items: {
      pending: pendingCount.count ?? 0,
      processing: processingCount.count ?? 0,
      error: errorCount.count ?? 0,
      latest_errors: latestErrors.data ?? [],
    },
  };
}

// Fase 2/fatia 5: erro de fail-closed (sem tenant ou sem credencial). E TERMINAL:
// nao adianta retry — o item nao tem como ser processado sem dono/chave. O catch
// no handler marca o item como 'error' (nao 'pending') quando recebe este tipo,
// evitando loop infinito e deixando rastro auditavel na fila.
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
  item: ReconcileItem,
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

async function processRunItem(
  supabase: ReturnType<typeof createClient>,
  runMode: RunMode,
  item: ReconcileItem,
): Promise<ProcessedItemResult> {
  const contato = await loadContactRow(supabase, item);

  if (!contato?.id) {
    throw new Error(`Contato local ausente para run item ${item.ghl_contact_id}`);
  }

  // Fase 2/fatia 5: location_id vem do ITEM (sem fallback a chave global).
  // contato.location_id e apenas um fallback de DB (mesmo tenant), nunca global.
  const locationId =
    normalizeText(item.location_id) ||
    normalizeText(contato.location_id);

  if (!locationId) {
    throw new FailClosedError(
      `location_id indefinido para contato ${item.ghl_contact_id} (item ${item.id})`,
    );
  }

  // Resolve o workspace dono do location e a chave DESSE workspace (fail-closed).
  const apiKey = await resolveGhlApiKeyForLocation(supabase, locationId, item);

  const opps = await fetchAllOpportunitiesForContact(item.ghl_contact_id, locationId, apiKey);
  const remotePrimaryContact = opps.find((opp) => opp.contact)?.contact ?? null;
  const contatoContext = runMode === 'write'
    ? await ensureContactWriteContext(supabase, item, remotePrimaryContact, apiKey)
    : contato;

  const existingRows = await fetchExistingOpportunitiesForContact(supabase, contatoContext.id);
  const existingMap = new Map<string, ExistingOpportunityRow>();
  for (const row of existingRows) {
    existingMap.set(row.ghl_opportunity_id, row);
  }

  const dbIds = existingRows.map((row) => row.ghl_opportunity_id);
  const dbIdSet = new Set(dbIds);
  const ghlIds = opps.map((opp) => opp.id);
  const ghlIdSet = new Set(ghlIds);

  const missingInDb = ghlIds.filter((id) => !dbIdSet.has(id));
  const extraInDb = dbIds.filter((id) => !ghlIdSet.has(id));

  const payloads = opps.map((opp) => buildOpportunityPayload(opp, contatoContext, existingMap.get(opp.id) ?? null));
  const updatedInDb = payloads
    .filter((payload) => hasOpportunityDiff(payload, existingMap.get(payload.ghl_opportunity_id) ?? null))
    .map((payload) => payload.ghl_opportunity_id);

  if (runMode === 'write' && updatedInDb.length > 0) {
    await upsertOpportunities(supabase, payloads.filter((payload) => updatedInDb.includes(payload.ghl_opportunity_id)));
  }

  // Em modo write, o contador salvo em `contatos` precisa refletir o estado
  // após o upsert corretivo da madrugada, não o snapshot anterior.
  const dbTotalAfterReconcile = runMode === 'write'
    ? dbIds.length + missingInDb.length
    : dbIds.length;

  return {
    contato_id: contatoContext.id,
    nome_contato: buildContactName({
      name: normalizeText(contatoContext.nome) || normalizeText(item.nome_contato),
      firstName: normalizeText(contatoContext.primeiro_nome),
      lastName: normalizeText(contatoContext.ultimo_nome),
      email: normalizeEmail(contatoContext.email) || normalizeEmail(item.email_contato),
      phone: normalizeText(contatoContext.telefone),
    }),
    email_contato: normalizeEmail(contatoContext.email) || normalizeEmail(item.email_contato),
    ghl_total: ghlIds.length,
    db_total: dbTotalAfterReconcile,
    missing_in_db: missingInDb,
    extra_in_db: extraInDb,
    updated_in_db: updatedInDb,
    inserted_count: runMode === 'write' ? missingInDb.length : 0,
    updated_count: runMode === 'write'
      ? Math.max(updatedInDb.length - missingInDb.length, 0)
      : 0,
  };
}

async function updateContactOpportunityCounters(
  supabase: ReturnType<typeof createClient>,
  result: ProcessedItemResult,
): Promise<void> {
  const { error } = await supabase
    .from('contatos')
    .update({
      total_oportunidades_ghl: result.ghl_total,
      total_oportunidades_db: result.db_total,
    })
    .eq('id', result.contato_id);

  if (error) {
    throw new Error(`Falha ao atualizar contadores do contato ${result.contato_id}: ${error.message}`);
  }
}

async function finalizeRunIfFinished(
  supabase: ReturnType<typeof createClient>,
  run: RunRow,
): Promise<RunRow> {
  const [pendingCount, processingCount, refreshedRun] = await Promise.all([
    supabase
      .from('ghl_opp_reconcile_items')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('status', 'pending'),
    supabase
      .from('ghl_opp_reconcile_items')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', run.id)
      .eq('status', 'processing'),
    supabase
      .from('ghl_opp_reconcile_runs')
      .select('*')
      .eq('id', run.id)
      .single(),
  ]);

  if (pendingCount.error || processingCount.error) {
    throw new Error(`Erro ao verificar encerramento do run ${run.id}`);
  }

  if (refreshedRun.error || !refreshedRun.data) {
    throw new Error(`Erro ao recarregar run ${run.id}: ${refreshedRun.error?.message ?? 'sem dados'}`);
  }

  const currentRun = refreshedRun.data as RunRow;
  if ((pendingCount.count ?? 0) > 0 || (processingCount.count ?? 0) > 0) {
    return currentRun;
  }

  const finalStatus: RunStatus = currentRun.error_contacts > 0 ? 'done_with_errors' : 'done';

  const { data: finalizedRun, error: finalizeError } = await supabase
    .from('ghl_opp_reconcile_runs')
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes: finalStatus === 'done_with_errors'
        ? 'Run concluído com erros finais em alguns contatos'
        : 'Run concluído sem erros',
    })
    .eq('id', run.id)
    .select('*')
    .single();

  if (finalizeError || !finalizedRun) {
    throw new Error(`Erro ao finalizar run ${run.id}: ${finalizeError?.message ?? 'sem retorno do banco'}`);
  }

  return finalizedRun as RunRow;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    let action = normalizeText(body.action) || 'status';
    const mode = (normalizeText(body.mode) || 'audit') as RunMode;
    const scope = normalizeText(body.scope) || 'all_contacts';
    const source = normalizeText(body.source) || 'manual';
    const batchSize = Math.min(Math.max(Number(body.batch_size ?? 25), 1), 100);
    const staleAfterMinutes = Math.min(Math.max(Number(body.stale_after_minutes ?? 30), 1), 24 * 60);
    const autoProcess = Boolean(body.auto_process ?? false);
    let currentRunId = normalizeText(body.run_id);

    // GHL_API_KEY nao e mais exigida (resolvida por item). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (action === 'start') {
      const run = await startRun(supabase, mode, source, scope);

      if (autoProcess) {
        action = 'process';
        currentRunId = run.id;
      } else {
        return new Response(
          JSON.stringify({
            action: 'start',
            started: true,
            run,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    if (action === 'process') {
      const run = await findRun(supabase, currentRunId);
      if (!run) {
        return new Response(
          JSON.stringify({
            action: 'process',
            message: 'Nenhum run ativo para processar.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const staleRequeued = await requeueStaleRunItems(supabase, run.id, staleAfterMinutes);
      const claimed = await claimRunItems(supabase, run.id, batchSize, staleAfterMinutes);

      if (claimed.length === 0) {
        const finalizedRun = await finalizeRunIfFinished(supabase, run);
        return new Response(
          JSON.stringify({
            action: 'process',
            processed: 0,
            stale_requeued: staleRequeued,
            summary: await summarizeRun(supabase, finalizedRun),
            message: 'Nenhum item pendente no lote.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      let successContacts = 0;
      let errorContacts = 0;
      let contactsWithMissing = 0;
      let contactsWithExtra = 0;
      let opportunitiesMissing = 0;
      let opportunitiesExtra = 0;
      let opportunitiesInserted = 0;
      let opportunitiesUpdated = 0;
      const errorDetails: string[] = [];

      for (const item of claimed) {
        try {
          const result = await processRunItem(supabase, run.mode, item);

          if (run.mode === 'write') {
            await updateContactOpportunityCounters(supabase, result);
          }

          const { error: itemDoneError } = await supabase
            .from('ghl_opp_reconcile_items')
            .update({
              contato_id: result.contato_id,
              nome_contato: result.nome_contato,
              email_contato: result.email_contato,
              status: 'done',
              claimed_at: null,
              processed_at: new Date().toISOString(),
              last_error: null,
              ghl_total: result.ghl_total,
              db_total: result.db_total,
              missing_in_db: result.missing_in_db,
              extra_in_db: result.extra_in_db,
              updated_in_db: result.updated_in_db,
              inserted_count: result.inserted_count,
              updated_count: result.updated_count,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          if (itemDoneError) {
            throw new Error(`Falha ao marcar item ${item.id} como done: ${itemDoneError.message}`);
          }

          successContacts++;
          if (result.missing_in_db.length > 0) contactsWithMissing++;
          if (result.extra_in_db.length > 0) contactsWithExtra++;
          opportunitiesMissing += result.missing_in_db.length;
          opportunitiesExtra += result.extra_in_db.length;
          opportunitiesInserted += result.inserted_count;
          opportunitiesUpdated += result.updated_count;
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
            updated_at: new Date().toISOString(),
          };

          if (nextStatus === 'error') {
            updatePayload.processed_at = new Date().toISOString();
            errorContacts++;
          } else {
            updatePayload.processed_at = null;
          }

          const { error: itemRetryError } = await supabase
            .from('ghl_opp_reconcile_items')
            .update(updatePayload)
            .eq('id', item.id);

          if (itemRetryError) {
            console.error(`[reconcile-contact-opp] Erro ao atualizar item ${item.id}: ${itemRetryError.message}`);
          }

          errorDetails.push(`${item.ghl_contact_id}: ${errorMsg}`);
        }
      }

      await incrementRunCounters(supabase, run.id, {
        processed_contacts: successContacts + errorContacts,
        success_contacts: successContacts,
        error_contacts: errorContacts,
        contacts_with_missing: contactsWithMissing,
        contacts_with_extra: contactsWithExtra,
        opportunities_missing: opportunitiesMissing,
        opportunities_extra: opportunitiesExtra,
        opportunities_inserted: opportunitiesInserted,
        opportunities_updated: opportunitiesUpdated,
      });

      const finalizedRun = await finalizeRunIfFinished(supabase, run);

      return new Response(
        JSON.stringify({
          action: 'process',
          processed: claimed.length,
          success_contacts: successContacts,
          error_contacts: errorContacts,
          stale_requeued: staleRequeued,
          opportunities_missing: opportunitiesMissing,
          opportunities_extra: opportunitiesExtra,
          opportunities_inserted: opportunitiesInserted,
          opportunities_updated: opportunitiesUpdated,
          errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
          summary: await summarizeRun(supabase, finalizedRun),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const run = await findRun(supabase, currentRunId);
    return new Response(
      JSON.stringify({
        action: 'status',
        summary: run ? await summarizeRun(supabase, run) : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[reconcile-contact-opp] Erro fatal:', err);
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
