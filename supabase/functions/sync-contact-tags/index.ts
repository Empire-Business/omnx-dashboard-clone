// Edge Function: sync-contact-tags
// Enfileira GET /contacts/{ghl_id} na fila central ghl_api_jobs,
// aplica resultados concluídos e atualiza contatos.tags.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';
import {
  enqueueGhlApiJob,
  extractGhlJobMeta,
  listUnhandledGhlApiJobs,
  markGhlApiJobsHandled,
} from '../_shared/ghl-api-queue.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

const CALLER = 'sync-contact-tags';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PendingContactRow {
  id: string;
  ghl_id: string | null;
  tags?: string | null;
  updated_at?: string | null;
  workspace_id?: string | null;
}

interface WebhookBatchRepairRow {
  candidate_count: number | null;
  updated_count: number | null;
}

interface WebhookTargetRepairRow {
  found_webhook: boolean | null;
  updated_count: number | null;
  tags_value: string | null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(tags: unknown): string {
  if (!Array.isArray(tags)) return '';
  return tags
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(',');
}

function buildUrgentSlot(now: Date): string {
  const slot = new Date(now);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / 15) * 15, 0, 0);
  return slot.toISOString().slice(0, 16);
}

async function repairTagsFromWebhookBatch(
  supabase: ReturnType<typeof createClient>,
  batchSize: number,
  daysBack: number,
  onlyNull: boolean,
): Promise<{ candidateCount: number; updatedCount: number }> {
  const { data, error } = await supabase.rpc('sync_tags_from_webhook_batch', {
    p_limit: batchSize,
    p_days_back: daysBack,
    p_only_null: onlyNull,
  });

  if (error) {
    const message = error.message ?? '';
    if (
      message.includes('Could not find the function public.sync_tags_from_webhook_batch')
      || message.includes('function public.sync_tags_from_webhook_batch')
      || message.includes('does not exist')
    ) {
      console.warn('[sync-contact-tags] RPC sync_tags_from_webhook_batch indisponível no banco remoto; seguindo sem repair em lote.');
      return { candidateCount: 0, updatedCount: 0 };
    }
    throw new Error(`Erro ao reparar tags via webhook em lote: ${message}`);
  }

  const row = Array.isArray(data) ? (data[0] as WebhookBatchRepairRow | undefined) : undefined;
  return {
    candidateCount: row?.candidate_count ?? 0,
    updatedCount: row?.updated_count ?? 0,
  };
}

async function repairTagsFromWebhookTarget(
  supabase: ReturnType<typeof createClient>,
  contatoId: string | null,
  ghlId: string | null,
  daysBack: number,
): Promise<{ foundWebhook: boolean; updatedCount: number; tagsValue: string | null }> {
  if (!contatoId && !ghlId) {
    return { foundWebhook: false, updatedCount: 0, tagsValue: null };
  }

  const { data, error } = await supabase.rpc('sync_tags_from_webhook_target', {
    p_contact_id: contatoId,
    p_ghl_id: ghlId,
    p_days_back: daysBack,
  });

  if (error) {
    const message = error.message ?? '';
    if (
      message.includes('Could not find the function public.sync_tags_from_webhook_target')
      || message.includes('function public.sync_tags_from_webhook_target')
      || message.includes('does not exist')
    ) {
      console.warn('[sync-contact-tags] RPC sync_tags_from_webhook_target indisponível no banco remoto; seguindo sem repair direcionado.');
      return { foundWebhook: false, updatedCount: 0, tagsValue: null };
    }
    throw new Error(`Erro ao reparar tags via webhook direcionado: ${message}`);
  }

  const row = Array.isArray(data) ? (data[0] as WebhookTargetRepairRow | undefined) : undefined;
  return {
    foundWebhook: row?.found_webhook === true,
    updatedCount: row?.updated_count ?? 0,
    tagsValue: row?.tags_value ?? null,
  };
}

async function drainCompletedJobs(
  supabase: ReturnType<typeof createClient>,
  applyBatchSize: number,
): Promise<{
  processedJobs: number;
  updated: number;
  deadJobs: number;
  notFound: number;
  invalidContext: number;
  errors: string[];
}> {
  const jobs = await listUnhandledGhlApiJobs(supabase, CALLER, applyBatchSize);
  const handledIds: number[] = [];

  let updated = 0;
  let deadJobs = 0;
  let notFound = 0;
  let invalidContext = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      const context = job.context ?? {};
      const contactId = normalizeId(context.contato_id);

      if (!contactId) {
        invalidContext++;
        handledIds.push(job.id);
        continue;
      }

      if (job.status === 'dead') {
        deadJobs++;
        handledIds.push(job.id);
        continue;
      }

      const meta = extractGhlJobMeta(job.result);
      let tagsValue = '';

      if (meta.notFound) {
        notFound++;
      } else {
        const contact = job.result?.contact;
        const tags = contact && typeof contact === 'object'
          ? (contact as Record<string, unknown>).tags
          : [];
        tagsValue = normalizeTags(tags);
      }

      const { error } = await supabase
        .from('contatos')
        .update({ tags: tagsValue })
        .eq('id', contactId);

      if (error) {
        throw new Error(`id=${contactId}: ${error.message}`);
      }

      updated++;
      handledIds.push(job.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await markGhlApiJobsHandled(supabase, handledIds);

  return {
    processedJobs: jobs.length,
    updated,
    deadJobs,
    notFound,
    invalidContext,
    errors,
  };
}

async function enqueuePendingJobs(
  supabase: ReturnType<typeof createClient>,
  batchSize: number,
): Promise<{
  attempted: number;
  enqueued: number;
  duplicates: number;
}> {
  // Há dois trilhos:
  // 1. contatos com tags nulas: prioridade alta e reprocesso por slot de 15 min
  // 2. contatos já preenchidos: refresh diário para manter tags atualizadas
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const urgentSlot = buildUrgentSlot(new Date());
  const urgentBatchSize = Math.min(batchSize, Math.max(Math.ceil(batchSize * 0.6), 1));
  const normalBatchSize = Math.max(batchSize - urgentBatchSize, 0);

  const { data: urgentPending, error: urgentError } = await supabase
    .from('contatos')
    .select('id, ghl_id, tags, updated_at, workspace_id')
    .not('ghl_id', 'is', null)
    .is('tags', null)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(urgentBatchSize);

  if (urgentError) {
    throw new Error(`Erro ao buscar contatos urgentes para tags: ${urgentError.message}`);
  }

  const { data: normalPending, error: normalError } = await supabase
    .from('contatos')
    .select('id, ghl_id, tags, updated_at, workspace_id')
    .not('ghl_id', 'is', null)
    .not('tags', 'is', null)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(normalBatchSize);

  if (normalError) {
    throw new Error(`Erro ao buscar contatos pendentes: ${normalError.message}`);
  }

  const pendingMap = new Map<string, PendingContactRow>();
  for (const contato of (urgentPending ?? []) as PendingContactRow[]) {
    pendingMap.set(contato.id, contato);
  }
  for (const contato of (normalPending ?? []) as PendingContactRow[]) {
    if (!pendingMap.has(contato.id)) pendingMap.set(contato.id, contato);
  }
  const pending = Array.from(pendingMap.values());

  let enqueued = 0;
  let duplicates = 0;

  for (const contato of pending) {
    if (!contato.ghl_id) continue;
    if (!contato.workspace_id) continue; // fail-closed: job sem tenant morre no worker
    const hasTags = typeof contato.tags === 'string' && contato.tags.trim().length > 0;
    const idempotencyKey = hasTags
      ? `${CALLER}:${contato.id}:${today}`
      : `${CALLER}:${contato.id}:${urgentSlot}`;

    const inserted = await enqueueGhlApiJob(supabase, {
      url: `${GHL_API_BASE}/contacts/${contato.ghl_id}`,
      caller: CALLER,
      priority: hasTags ? 5 : 2,
      idempotencyKey,
      context: {
        contato_id: contato.id,
        ghl_id: contato.ghl_id,
        reason: hasTags ? 'refresh' : 'null_tags_recovery',
        workspace_id: contato.workspace_id,
      },
      maxAttempts: hasTags ? 4 : 8,
    });

    if (inserted) enqueued++;
    else duplicates++;
  }

  return {
    attempted: pending?.length ?? 0,
    enqueued,
    duplicates,
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
    const batchSize = Math.min(Math.max(Number(body.batch_size ?? 100), 1), 500);
    const applyBatchSize = Math.min(
      Math.max(Number(body.apply_batch_size ?? Math.max(batchSize * 5, 200)), 1),
      1000,
    );
    const webhookRepairBatchSize = Math.min(
      Math.max(Number(body.webhook_repair_batch_size ?? Math.max(batchSize, 100)), 1),
      1000,
    );
    const webhookRepairDaysBack = Math.min(
      Math.max(Number(body.webhook_repair_days_back ?? 30), 1),
      365,
    );
    const webhookRepairOnlyNull = body.webhook_repair_only_null !== false;
    const targetContactId = normalizeId(body.contact_id);
    const targetGhlId = normalizeId(body.ghl_id);

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const applied = await drainCompletedJobs(supabase, applyBatchSize);
    const webhookRepair = targetContactId || targetGhlId
      ? await repairTagsFromWebhookTarget(supabase, targetContactId, targetGhlId, webhookRepairDaysBack)
      : await repairTagsFromWebhookBatch(
        supabase,
        webhookRepairBatchSize,
        webhookRepairDaysBack,
        webhookRepairOnlyNull,
      );
    const queued = await enqueuePendingJobs(supabase, batchSize);

    const { count: remaining } = await supabase
      .from('contatos')
      .select('*', { count: 'exact', head: true })
      .is('tags', null);

    const { count: queuePending } = await supabase
      .from('ghl_api_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('caller', CALLER)
      .eq('status', 'pending');

    const { count: queueProcessing } = await supabase
      .from('ghl_api_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('caller', CALLER)
      .eq('status', 'processing');

    return new Response(JSON.stringify({
      processed_jobs: applied.processedJobs,
      updated: applied.updated,
      dead_jobs: applied.deadJobs,
      not_found: applied.notFound,
      invalid_context: applied.invalidContext,
      webhook_repair: webhookRepair,
      enqueued: queued.enqueued,
      active_duplicates: queued.duplicates,
      remaining: remaining ?? 0,
      queue_pending: queuePending ?? 0,
      queue_processing: queueProcessing ?? 0,
      errors: applied.errors.length > 0 ? applied.errors.slice(0, 20) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-contact-tags] Erro fatal:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
