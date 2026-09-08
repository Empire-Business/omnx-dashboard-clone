// Edge Function: sync-contact-attribution
//
// Repara UTMs de contatos vindos de formulário do Facebook.
// Fonte de verdade operacional: GET /contacts/{id} do GHL, que já espelha
// os blocos attributionSource / lastAttributionSource recebidos da Meta.
//
// Fluxo:
//   1. Drena jobs concluídos de leitura (GET /contacts/{id})
//   2. Traduz attributionSource para o padrão interno do projeto
//   3. Atualiza contatos localmente apenas nos campos vazios
//   4. Enfileira jobs de escrita (PUT /contacts/{id}) para preencher custom fields vazios no GHL
//   5. Drena jobs concluídos de escrita
//   6. Enfileira novos jobs de leitura para contatos pendentes

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import {
  enqueueGhlApiJob,
  extractGhlJobMeta,
  listUnhandledGhlApiJobs,
  markGhlApiJobsHandled,
} from '../_shared/ghl-api-queue.ts';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '').trim();
const SUPABASE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '').trim();
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_APPLY_BATCH_SIZE = 300;
const DEFAULT_DAYS_BACK = 30;
const FETCH_CALLER = 'sync-contact-attribution-fetch';
const WRITE_CALLER = 'sync-contact-attribution-write';
const FORM_FB_TAG = '[cp] form-fb';

const BASE_FIELDS = ['utm_source', 'utm_campaign', 'utm_medium', 'utm_content', 'utm_term'] as const;
const MAX_ATTRIBUTION_ATTEMPTS = 10;
const REQUESTED_FIELDS = [
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'utm_content',
  'utm_term',
  'tt_content',
  'tt_term',
  'tt_campaign',
  'tt_source',
  'tt_medium',
] as const;

type RequestedField = (typeof REQUESTED_FIELDS)[number];

// Códigos de criativo atuais aceitam letras além de dígitos (ex.: CR-269h1,
// CR-296v2, CR-444vd1). A versão anterior (CR-(\d+)) rejeitava esses códigos e
// deixava os leads form-fb sem resolução de UTM. O case do criativo é
// preservado exatamente como vem da Meta (canonical no projeto: CR-444vd1).
const TRACKING_CODE_REGEX = /^M\d+_O(\d+)_P(\d+)_CR-([A-Za-z0-9]+)_PG(\d+)$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PendingContactRow {
  id: string;
  ghl_id: string | null;
  workspace_id: string | null;
  nome: string | null;
  email: string | null;
  contact_source: string | null;
  tags: string | null;
  date_created: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  utm_term: string | null;
  tt_content: string | null;
  tt_term: string | null;
  tt_campaign: string | null;
  tt_source: string | null;
  tt_medium: string | null;
  attribution_skip: boolean | null;
  attribution_attempts: number | null;
}

interface CustomFieldMappingRow {
  logical_name: RequestedField;
  ghl_custom_field_id: string;
  field_key: string | null;
  enabled: boolean;
}

interface UtmSourceRow {
  utm_source: string;
  nome: string | null;
  public_code: string | null;
}

interface UtmCampaignRow {
  utm_campaign: number | null;
  nome: string | null;
  page_code: string | null;
}

interface GhlCustomField {
  id?: string;
  value?: unknown;
}

interface GhlAttributionSource {
  sessionSource?: unknown;
  mediumId?: unknown;
  medium?: unknown;
  formId?: unknown;
  formName?: unknown;
  campaign?: unknown;
  utmCampaign?: unknown;
  campaignId?: unknown;
  utmMedium?: unknown;
  utmContent?: unknown;
  utmTerm?: unknown;
  adSetId?: unknown;
  adId?: unknown;
  utmSource?: unknown;
  source?: unknown;
  referrer?: unknown;
  keyword?: unknown;
  adSource?: unknown;
}

interface GhlContactResult {
  id?: string;
  locationId?: string;
  source?: string;
  attributionSource?: GhlAttributionSource | null;
  lastAttributionSource?: GhlAttributionSource | null;
  customFields?: GhlCustomField[] | null;
}

interface GhlWriteCustomFieldPayload {
  id: string;
  value: string;
}

interface ParsedTrackingCode {
  trackingCode: string;
  objectiveCode: string;
  publicCode: string;
  creativeCode: string;
  pageCode: string;
}

interface ResolvedAttribution {
  values: Partial<Record<RequestedField, string>>;
  diagnostics: string[];
}

interface LoadedConfig {
  fieldMappings: Map<RequestedField, CustomFieldMappingRow>;
  sourceByPublicCode: Map<string, string>;
  campaignByPageCode: Map<string, string>;
}

type AppSupabaseClient = SupabaseClient<any, 'public', any>;

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCode(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toUpperCase();
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function buildFiveMinuteSlot(now: Date): string {
  const slot = new Date(now);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / 5) * 5, 0, 0);
  return slot.toISOString().slice(0, 16);
}

function isoDateDaysAgo(daysBack: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString();
}

function hasFormFbTag(tags: string | null | undefined): boolean {
  if (!tags) return false;
  return tags.toLowerCase().includes(FORM_FB_TAG);
}

function pickFirstNonBlank(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function selectAttributionSource(contact: GhlContactResult | null | undefined): GhlAttributionSource | null {
  if (!contact) return null;

  const candidates = [
    contact.lastAttributionSource,
    contact.attributionSource,
  ];

  for (const candidate of candidates) {
    const source = candidate ?? null;
    if (!source || typeof source !== 'object') continue;
    const hasSignal = [
      (source as GhlAttributionSource).utmContent,
      (source as GhlAttributionSource).utmTerm,
      (source as GhlAttributionSource).adId,
      (source as GhlAttributionSource).campaignId,
      (source as GhlAttributionSource).formId,
    ].some((value) => normalizeText(value) !== null);
    if (hasSignal) return source as GhlAttributionSource;
  }

  return null;
}

function parseTrackingCode(rawValue: string | null): ParsedTrackingCode | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  const match = trimmed.match(TRACKING_CODE_REGEX);
  if (!match) return null;

  // Reconstrói o código em forma canônica: partes estruturais em maiúsculas
  // (são dígitos) e o criativo no case original vindo da Meta (ex.: CR-269h1).
  const mNumber = trimmed.match(/^M(\d+)_/i)?.[1] ?? '';
  const creativeCode = `CR-${match[3]}`;

  return {
    trackingCode: `M${mNumber}_O${match[1]}_P${match[2]}_${creativeCode}_PG${match[4]}`,
    objectiveCode: match[1],
    publicCode: `P${match[2]}`,
    creativeCode,
    pageCode: `PG${match[4]}`,
  };
}

function buildMergedValues(
  localContact: PendingContactRow,
  resolvedValues: Partial<Record<RequestedField, string>>,
): Partial<Record<RequestedField, string>> {
  const merged: Partial<Record<RequestedField, string>> = {};

  for (const field of REQUESTED_FIELDS) {
    const localValue = normalizeText(localContact[field]);
    const resolvedValue = normalizeText(resolvedValues[field]);
    if (localValue) merged[field] = localValue;
    else if (resolvedValue) merged[field] = resolvedValue;
  }

  return merged;
}

function buildLocalUpdatePayload(
  localContact: PendingContactRow,
  resolvedValues: Partial<Record<RequestedField, string>>,
): Partial<Record<RequestedField, string>> {
  const payload: Partial<Record<RequestedField, string>> = {};

  for (const field of REQUESTED_FIELDS) {
    if (!isBlank(localContact[field])) continue;
    const resolvedValue = normalizeText(resolvedValues[field]);
    if (resolvedValue) payload[field] = resolvedValue;
  }

  return payload;
}

function buildCustomFieldValueMap(customFields: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(customFields)) return map;

  for (const item of customFields) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = normalizeText(row.id);
    const value = normalizeText(row.value);
    if (id && value) map.set(id, value);
  }

  return map;
}

function buildWriteCustomFieldsPayload(
  mappings: Map<RequestedField, CustomFieldMappingRow>,
  currentCustomFieldValues: Map<string, string>,
  mergedValues: Partial<Record<RequestedField, string>>,
): GhlWriteCustomFieldPayload[] {
  const payload: GhlWriteCustomFieldPayload[] = [];

  for (const field of REQUESTED_FIELDS) {
    const mapping = mappings.get(field);
    if (!mapping || !mapping.enabled) continue;

    const nextValue = normalizeText(mergedValues[field]);
    if (!nextValue) continue;

    const currentValue = currentCustomFieldValues.get(mapping.ghl_custom_field_id);
    if (currentValue && currentValue.trim().length > 0) continue;

    payload.push({
      id: mapping.ghl_custom_field_id,
      value: nextValue,
    });
  }

  return payload;
}

function resolveAttribution(
  contactResult: GhlContactResult | null | undefined,
  config: LoadedConfig,
): ResolvedAttribution {
  const diagnostics: string[] = [];
  const values: Partial<Record<RequestedField, string>> = {};
  const attribution = selectAttributionSource(contactResult);

  if (!attribution) {
    diagnostics.push('Contato sem attributionSource/lastAttributionSource utilizável');
    return { values, diagnostics };
  }

  const trackingCode = pickFirstNonBlank(attribution.utmTerm, attribution.utmContent);
  const parsedCode = parseTrackingCode(trackingCode);

  if (!parsedCode) {
    diagnostics.push(`Tracking code ausente ou inválido: ${trackingCode ?? 'null'}`);
  } else {
    values.utm_term = parsedCode.trackingCode;
    values.utm_medium = parsedCode.objectiveCode;
    values.utm_content = parsedCode.creativeCode;

    const sourceCode = config.sourceByPublicCode.get(parsedCode.publicCode);
    if (sourceCode) values.utm_source = sourceCode;
    else diagnostics.push(`Sem mapeamento de utm_source para public_code=${parsedCode.publicCode}`);

    const campaignCode = config.campaignByPageCode.get(parsedCode.pageCode);
    if (campaignCode) values.utm_campaign = campaignCode;
    else diagnostics.push(`Sem mapeamento de utm_campaign para page_code=${parsedCode.pageCode}`);
  }

  const ttSource = pickFirstNonBlank(
    attribution.source,
    attribution.adSource,
    attribution.medium,
    contactResult?.source,
  );
  if (ttSource) values.tt_source = ttSource;

  const ttCampaign = pickFirstNonBlank(
    attribution.campaignId,
    attribution.utmCampaign,
    attribution.campaign,
  );
  if (ttCampaign) values.tt_campaign = ttCampaign;

  const paidSocial = normalizeText(attribution.sessionSource)?.toLowerCase() === 'paid social';
  const ttMedium = paidSocial ? 'cpc' : pickFirstNonBlank(attribution.medium, attribution.source);
  if (ttMedium) values.tt_medium = ttMedium;

  const adId = pickFirstNonBlank(attribution.adId);
  if (adId && values.utm_term) values.tt_content = `${adId}__${values.utm_term}`;
  else if (adId) values.tt_content = adId;

  const ttTerm = pickFirstNonBlank(attribution.adSetId, attribution.mediumId, attribution.formId);
  if (ttTerm) values.tt_term = ttTerm;

  return { values, diagnostics };
}

async function loadConfig(supabase: AppSupabaseClient): Promise<LoadedConfig> {
  const [mappingRes, sourceRes, campaignRes] = await Promise.all([
    supabase
      .from('ghl_custom_field_mappings')
      .select('logical_name, ghl_custom_field_id, field_key, enabled')
      .eq('enabled', true),
    supabase
      .from('utm_sources')
      .select('utm_source, nome, public_code')
      .not('public_code', 'is', null),
    supabase
      .from('utm_campaigns')
      .select('utm_campaign, nome, page_code')
      .not('page_code', 'is', null),
  ]);

  if (mappingRes.error) {
    throw new Error(`Erro ao carregar ghl_custom_field_mappings: ${mappingRes.error.message}`);
  }
  if (sourceRes.error) {
    throw new Error(`Erro ao carregar utm_sources: ${sourceRes.error.message}`);
  }
  if (campaignRes.error) {
    throw new Error(`Erro ao carregar utm_campaigns: ${campaignRes.error.message}`);
  }

  const fieldMappings = new Map<RequestedField, CustomFieldMappingRow>();
  for (const row of (mappingRes.data ?? []) as CustomFieldMappingRow[]) {
    fieldMappings.set(row.logical_name, row);
  }

  for (const field of REQUESTED_FIELDS) {
    if (!fieldMappings.has(field)) {
      throw new Error(`Custom field mapping ausente para ${field}`);
    }
  }

  const sourceByPublicCode = new Map<string, string>();
  for (const row of (sourceRes.data ?? []) as UtmSourceRow[]) {
    const publicCode = normalizeCode(row.public_code);
    const utmSource = normalizeText(row.utm_source);
    if (publicCode && utmSource) sourceByPublicCode.set(publicCode, utmSource);
  }

  const campaignByPageCode = new Map<string, string>();
  for (const row of (campaignRes.data ?? []) as UtmCampaignRow[]) {
    const pageCode = normalizeCode(row.page_code);
    const utmCampaign = row.utm_campaign != null ? String(row.utm_campaign) : null;
    if (pageCode && utmCampaign) campaignByPageCode.set(pageCode, utmCampaign);
  }

  return { fieldMappings, sourceByPublicCode, campaignByPageCode };
}

async function loadContactById(
  supabase: AppSupabaseClient,
  contactId: string,
): Promise<PendingContactRow | null> {
  const { data, error } = await supabase
    .from('contatos')
    .select(`
      id, ghl_id, workspace_id, nome, email, contact_source, tags, date_created,
      utm_source, utm_campaign, utm_medium, utm_content, utm_term,
      tt_content, tt_term, tt_campaign, tt_source, tt_medium,
      attribution_skip, attribution_attempts
    `)
    .eq('id', contactId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar contato ${contactId}: ${error.message}`);
  }

  return (data ?? null) as PendingContactRow | null;
}

async function drainFetchJobs(
  supabase: AppSupabaseClient,
  config: LoadedConfig,
  applyBatchSize: number,
): Promise<Record<string, number | string[]>> {
  const jobs = await listUnhandledGhlApiJobs(supabase, FETCH_CALLER, applyBatchSize);
  const handledIds: number[] = [];
  let fetchedDone = 0;
  let fetchedDead = 0;
  let localUpdated = 0;
  let writeEnqueued = 0;
  let skippedNoAttribution = 0;
  let skippedNoWrite = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      const contactId = normalizeText(job.context?.contato_id);
      const ghlId = normalizeText(job.context?.ghl_id);

      if (!contactId || !ghlId) {
        handledIds.push(job.id);
        errors.push(`job=${job.id}: contexto inválido`);
        continue;
      }

      if (job.status === 'dead') {
        fetchedDead++;
        handledIds.push(job.id);
        continue;
      }

      fetchedDone++;
      const localContact = await loadContactById(supabase, contactId);
      if (!localContact) {
        handledIds.push(job.id);
        continue;
      }

      const contactResult = (job.result?.contact ?? null) as GhlContactResult | null;
      const resolved = resolveAttribution(contactResult, config);
      const localPayload = buildLocalUpdatePayload(localContact, resolved.values);

      if (Object.keys(localPayload).length > 0) {
        const { error } = await supabase
          .from('contatos')
          .update(localPayload)
          .eq('id', contactId);

        if (error) {
          throw new Error(`Erro ao atualizar contato ${contactId}: ${error.message}`);
        }
        localUpdated++;
      }

      const mergedValues = buildMergedValues(localContact, resolved.values);
      const customFieldValueMap = buildCustomFieldValueMap(contactResult?.customFields ?? []);
      const writeCustomFields = buildWriteCustomFieldsPayload(
        config.fieldMappings,
        customFieldValueMap,
        mergedValues,
      );

      if (writeCustomFields.length === 0) {
        const noAttribution = Object.keys(mergedValues).length === 0;
        if (noAttribution) {
          skippedNoAttribution++;
          // Incrementa tentativas; marca skip se atingiu o máximo
          const currentAttempts = (localContact.attribution_attempts ?? 0) + 1;
          const shouldSkip = currentAttempts >= MAX_ATTRIBUTION_ATTEMPTS;
          await supabase
            .from('contatos')
            .update({
              attribution_attempts: currentAttempts,
              ...(shouldSkip ? { attribution_skip: true } : {}),
            })
            .eq('id', contactId);
        } else {
          skippedNoWrite++;
        }
        handledIds.push(job.id);
        continue;
      }

      // Fail-closed multi-tenant (Fase 2): job de escrita também exige tenant.
      if (!localContact.workspace_id) {
        skippedNoWrite++;
        handledIds.push(job.id);
        continue;
      }

      const inserted = await enqueueGhlApiJob(supabase, {
        url: `${GHL_API_BASE}/contacts/${ghlId}`,
        method: 'PUT',
        body: {
          customFields: writeCustomFields,
        },
        priority: 2,
        caller: WRITE_CALLER,
        idempotencyKey: `${WRITE_CALLER}:${contactId}:${buildFiveMinuteSlot(new Date())}`,
        context: {
          contato_id: contactId,
          ghl_id: ghlId,
          workspace_id: localContact.workspace_id,
          field_names: writeCustomFields.map((field) => field.id),
          diagnostics: resolved.diagnostics,
        },
        maxAttempts: 6,
      });

      if (inserted) writeEnqueued++;
      handledIds.push(job.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await markGhlApiJobsHandled(supabase, handledIds);

  return {
    fetched_done: fetchedDone,
    fetched_dead: fetchedDead,
    local_updated: localUpdated,
    write_enqueued: writeEnqueued,
    skipped_no_attribution: skippedNoAttribution,
    skipped_no_write: skippedNoWrite,
    fetch_errors: errors,
  };
}

async function drainWriteJobs(
  supabase: AppSupabaseClient,
  applyBatchSize: number,
): Promise<Record<string, number | string[]>> {
  const jobs = await listUnhandledGhlApiJobs(supabase, WRITE_CALLER, applyBatchSize);
  const handledIds: number[] = [];
  let writeDone = 0;
  let writeDead = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      const meta = extractGhlJobMeta(job.result);
      if (job.status === 'dead') {
        writeDead++;
      } else if (meta.httpStatus && meta.httpStatus >= 400) {
        errors.push(`job=${job.id}: HTTP ${meta.httpStatus}`);
      } else {
        writeDone++;
      }
      handledIds.push(job.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await markGhlApiJobsHandled(supabase, handledIds);

  return {
    write_done: writeDone,
    write_dead: writeDead,
    write_errors: errors,
  };
}

function isPendingBaseField(contact: PendingContactRow): boolean {
  return BASE_FIELDS.some((field) => isBlank(contact[field]));
}

async function enqueuePendingFetchJobs(
  supabase: AppSupabaseClient,
  batchSize: number,
  daysBack: number,
  backfill: boolean,
): Promise<Record<string, number>> {
  // Em modo backfill, ampliar a janela para 365 dias para cobrir leads antigos.
  const effectiveDaysBack = backfill ? Math.max(daysBack, 365) : daysBack;

  // Filtro de contact_source no SQL: inclui quem começa com 'facebook' OU tem NULL.
  // A tag [cp] form-fb é a fonte de verdade; contact_source pode estar vazio no GHL.
  const { data, error } = await supabase
    .from('contatos')
    .select(`
      id, ghl_id, workspace_id, nome, email, contact_source, tags, date_created,
      utm_source, utm_campaign, utm_medium, utm_content, utm_term,
      tt_content, tt_term, tt_campaign, tt_source, tt_medium,
      attribution_skip, attribution_attempts
    `)
    .not('ghl_id', 'is', null)
    .ilike('tags', `%${FORM_FB_TAG}%`)
    .eq('attribution_skip', false)
    .gte('date_created', isoDateDaysAgo(effectiveDaysBack))
    .or('contact_source.ilike.facebook%, contact_source.is.null')
    .order('date_created', { ascending: true, nullsFirst: true })
    .limit(Math.min(Math.max(batchSize * 3, batchSize), 500));

  if (error) {
    throw new Error(`Erro ao buscar contatos pendentes para attribution: ${error.message}`);
  }

  const candidates = ((data ?? []) as PendingContactRow[])
    .filter((row) => hasFormFbTag(row.tags))
    .filter((row) => isPendingBaseField(row))
    .slice(0, batchSize);

  let enqueued = 0;
  let duplicates = 0;
  let skippedNoTenant = 0;
  const slot = buildFiveMinuteSlot(new Date());

  for (const contato of candidates) {
    if (!contato.ghl_id) continue;
    // Fail-closed multi-tenant (Fase 2): sem workspace_id o worker mata o job
    // com missing_tenant — nem enfileirar.
    if (!contato.workspace_id) {
      skippedNoTenant++;
      continue;
    }
    const inserted = await enqueueGhlApiJob(supabase, {
      url: `${GHL_API_BASE}/contacts/${contato.ghl_id}`,
      method: 'GET',
      priority: 2,
      caller: FETCH_CALLER,
      idempotencyKey: `${FETCH_CALLER}:${contato.id}:${slot}`,
      context: {
        contato_id: contato.id,
        ghl_id: contato.ghl_id,
        workspace_id: contato.workspace_id,
        reason: 'facebook_form_missing_utm',
      },
      maxAttempts: 6,
    });

    if (inserted) enqueued++;
    else duplicates++;
  }

  return {
    fetch_candidates: candidates.length,
    fetch_enqueued: enqueued,
    fetch_duplicates: duplicates,
    fetch_skipped_no_tenant: skippedNoTenant,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const batchSize = Math.min(Math.max(Number(body.batch_size ?? DEFAULT_BATCH_SIZE), 1), 500);
    const applyBatchSize = Math.min(Math.max(Number(body.apply_batch_size ?? DEFAULT_APPLY_BATCH_SIZE), 1), 1000);
    const daysBack = Math.min(Math.max(Number(body.days_back ?? DEFAULT_DAYS_BACK), 1), 365);
    const backfill = body.backfill === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const config = await loadConfig(supabase);

    const writeDrain = await drainWriteJobs(supabase, applyBatchSize);
    const fetchDrain = await drainFetchJobs(supabase, config, applyBatchSize);
    const enqueueStats = await enqueuePendingFetchJobs(supabase, batchSize, daysBack, backfill);
    const finalWriteDrain = await drainWriteJobs(supabase, applyBatchSize);

    return new Response(JSON.stringify({
      mode: backfill ? 'backfill' : 'cron',
      days_back: daysBack,
      ...writeDrain,
      ...fetchDrain,
      ...enqueueStats,
      final_write_done: finalWriteDrain.write_done,
      final_write_dead: finalWriteDrain.write_dead,
      errors: (writeDrain.write_errors?.length || fetchDrain.fetch_errors?.length || finalWriteDrain.write_errors?.length)
        ? ['Algumas operações não foram concluídas. Consulte os logs do servidor.']
        : [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const requestId = createRequestId();
    logSafeError('sync-contact-attribution', requestId, err);
    return new Response(JSON.stringify({
      error: 'Não foi possível concluir a sincronização.',
      request_id: requestId,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
