// Edge Function: sync-opp-pipelines
// Enfileira GET /opportunities/{id} na fila central ghl_api_jobs,
// aplica resultados concluídos e corrige pipeline_id/pipeline_name.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import {
  enqueueGhlApiJob,
  extractGhlJobMeta,
  listUnhandledGhlApiJobs,
  markGhlApiJobsHandled,
} from '../_shared/ghl-api-queue.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

const CALLER = 'sync-opp-pipelines';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PendingOpportunityRow {
  id: string;
  ghl_opportunity_id: string | null;
  workspace_id: string | null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolvePipelineName(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  pipelineName: string | null,
): Promise<string | null> {
  if (pipelineName) return pipelineName;

  const { data: fallback, error } = await supabase
    .from('oportunidades')
    .select('pipeline_name')
    .eq('pipeline_id', pipelineId)
    .not('pipeline_name', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Fallback pipeline_name (${pipelineId}): ${error.message}`);
  }

  return fallback?.pipeline_name ?? null;
}

async function drainCompletedJobs(
  supabase: ReturnType<typeof createClient>,
  applyBatchSize: number,
): Promise<{
  processedJobs: number;
  updated: number;
  deadJobs: number;
  noData: number;
  notFound: number;
  invalidContext: number;
  errors: string[];
}> {
  const jobs = await listUnhandledGhlApiJobs(supabase, CALLER, applyBatchSize);
  const handledIds: number[] = [];

  let updated = 0;
  let deadJobs = 0;
  let noData = 0;
  let notFound = 0;
  let invalidContext = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      const context = job.context ?? {};
      const oppId = normalizeId(context.opportunity_id);

      if (!oppId) {
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
      if (meta.notFound) {
        notFound++;
        handledIds.push(job.id);
        continue;
      }

      const opportunity = job.result?.opportunity;
      const pipelineId = opportunity && typeof opportunity === 'object'
        ? (opportunity as Record<string, unknown>).pipelineId
        : null;
      const pipelineNameRaw = opportunity && typeof opportunity === 'object'
        ? (opportunity as Record<string, unknown>).pipelineName
        : null;

      if (typeof pipelineId !== 'string' || pipelineId.trim() === '') {
        noData++;
        handledIds.push(job.id);
        continue;
      }

      const pipelineName = await resolvePipelineName(
        supabase,
        pipelineId,
        typeof pipelineNameRaw === 'string' && pipelineNameRaw.trim() !== '' ? pipelineNameRaw : null,
      );

      const updatePayload: Record<string, string> = { pipeline_id: pipelineId };
      if (pipelineName) updatePayload.pipeline_name = pipelineName;

      const { error } = await supabase
        .from('oportunidades')
        .update(updatePayload)
        .eq('id', oppId);

      if (error) {
        throw new Error(`id=${oppId}: ${error.message}`);
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
    noData,
    notFound,
    invalidContext,
    errors,
  };
}

function mergeDrainResults(
  first: Awaited<ReturnType<typeof drainCompletedJobs>>,
  second: Awaited<ReturnType<typeof drainCompletedJobs>>,
): Awaited<ReturnType<typeof drainCompletedJobs>> {
  return {
    processedJobs: first.processedJobs + second.processedJobs,
    updated: first.updated + second.updated,
    deadJobs: first.deadJobs + second.deadJobs,
    noData: first.noData + second.noData,
    notFound: first.notFound + second.notFound,
    invalidContext: first.invalidContext + second.invalidContext,
    errors: [...first.errors, ...second.errors],
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
  const { data: pending, error } = await supabase
    .from('oportunidades')
    .select('id, ghl_opportunity_id, workspace_id')
    .or('pipeline_id.is.null,pipeline_name.is.null')
    .not('ghl_opportunity_id', 'is', null)
    .order('id')
    .limit(batchSize);

  if (error) {
    throw new Error(`Erro ao buscar oportunidades pendentes: ${error.message}`);
  }

  let enqueued = 0;
  let duplicates = 0;

  for (const opp of (pending ?? []) as PendingOpportunityRow[]) {
    if (!opp.ghl_opportunity_id) continue;
    if (!opp.workspace_id) continue; // fail-closed: job sem tenant morre no worker

    const inserted = await enqueueGhlApiJob(supabase, {
      url: `${GHL_API_BASE}/opportunities/${opp.ghl_opportunity_id}`,
      caller: CALLER,
      priority: 5,
      idempotencyKey: `${CALLER}:${opp.id}`,
      context: {
        opportunity_id: opp.id,
        ghl_opportunity_id: opp.ghl_opportunity_id,
        workspace_id: opp.workspace_id,
      },
      maxAttempts: 4,
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

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const initialApplied = await drainCompletedJobs(supabase, applyBatchSize);
    const queued = await enqueuePendingJobs(supabase, batchSize);
    const tailApplied = await drainCompletedJobs(supabase, applyBatchSize);
    const applied = mergeDrainResults(initialApplied, tailApplied);

    const { count: remaining } = await supabase
      .from('oportunidades')
      .select('*', { count: 'exact', head: true })
      .or('pipeline_id.is.null,pipeline_name.is.null');

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
      nodata: applied.noData,
      not_found: applied.notFound,
      invalid_context: applied.invalidContext,
      enqueued: queued.enqueued,
      active_duplicates: queued.duplicates,
      remaining: remaining ?? 0,
      queue_pending: queuePending ?? 0,
      queue_processing: queueProcessing ?? 0,
      errors: applied.errors.length > 0
        ? ['Algumas oportunidades não foram sincronizadas. Consulte os logs do servidor.']
        : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const requestId = createRequestId();
    logSafeError('sync-opp-pipelines', requestId, err);
    return new Response(JSON.stringify({
      error: 'Não foi possível concluir a sincronização.',
      request_id: requestId,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
