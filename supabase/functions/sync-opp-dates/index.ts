// Edge Function: sync-opp-dates
// Enfileira chamadas GET /opportunities/{id} na fila central ghl_api_jobs,
// aplica resultados concluídos e atualiza data_lead_recebido.

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

const CALLER = 'sync-opp-dates';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PendingOpportunityRow {
  id: string;
  ghl_opportunity_id: string | null;
  contatos: { workspace_id: string | null } | { workspace_id: string | null }[] | null;
}

type JobApplyKind =
  | 'updated'
  | 'dead'
  | 'not_found'
  | 'missing_created_at'
  | 'invalid_context';

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function drainCompletedJobs(
  supabase: ReturnType<typeof createClient>,
  applyBatchSize: number,
): Promise<{
  processedJobs: number;
  updated: number;
  deadJobs: number;
  notFound: number;
  missingCreatedAt: number;
  invalidContext: number;
  errors: string[];
}> {
  const jobs = await listUnhandledGhlApiJobs(supabase, CALLER, applyBatchSize);
  const handledIds: number[] = [];

  let updated = 0;
  let deadJobs = 0;
  let notFound = 0;
  let missingCreatedAt = 0;
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

      let outcome: JobApplyKind = 'dead';

      if (job.status === 'dead') {
        outcome = 'dead';
      } else {
        const meta = extractGhlJobMeta(job.result);
        if (meta.notFound) {
          outcome = 'not_found';
        } else {
          const opportunity = job.result?.opportunity;
          const createdAt = opportunity && typeof opportunity === 'object'
            ? (opportunity as Record<string, unknown>).createdAt
            : null;

          if (typeof createdAt !== 'string' || createdAt.trim() === '') {
            outcome = 'missing_created_at';
          } else {
            const { error } = await supabase
              .from('oportunidades')
              .update({ data_lead_recebido: createdAt })
              .eq('id', oppId)
              .is('data_lead_recebido', null);

            if (error) {
              throw new Error(`id=${oppId}: ${error.message}`);
            }

            outcome = 'updated';
          }
        }
      }

      if (outcome === 'updated') updated++;
      if (outcome === 'dead') deadJobs++;
      if (outcome === 'not_found') notFound++;
      if (outcome === 'missing_created_at') missingCreatedAt++;
      if (outcome === 'invalid_context') invalidContext++;

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
    missingCreatedAt,
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
    notFound: first.notFound + second.notFound,
    missingCreatedAt: first.missingCreatedAt + second.missingCreatedAt,
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
    .select('id, ghl_opportunity_id, contatos(workspace_id)')
    .is('data_lead_recebido', null)
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

    const ws = Array.isArray(opp.contatos) ? opp.contatos[0]?.workspace_id : opp.contatos?.workspace_id;

    const inserted = await enqueueGhlApiJob(supabase, {
      url: `${GHL_API_BASE}/opportunities/${opp.ghl_opportunity_id}`,
      caller: CALLER,
      priority: 5,
      idempotencyKey: `${CALLER}:${opp.id}`,
      context: {
        opportunity_id: opp.id,
        ghl_opportunity_id: opp.ghl_opportunity_id,
        workspace_id: ws ?? undefined,
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
      .is('data_lead_recebido', null);

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
      missing_created_at: applied.missingCreatedAt,
      invalid_context: applied.invalidContext,
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
    console.error('[sync-opp-dates] Erro fatal:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
