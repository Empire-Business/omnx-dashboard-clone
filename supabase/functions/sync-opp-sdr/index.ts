// Edge Function: sync-opp-sdr
// Sincroniza oportunidades.sdr_name via GET /opportunities/{id} da API GHL
// (campo `followers` do objeto — array de ids de usuário).
//
// HISTÓRICO (2026-07-18): até hoje a URL era /opportunities/{id}/followers,
// endpoint que NUNCA existiu na conta — 4,6M de jobs retornaram 404 e nenhum
// sdr_name veio da API (todos vieram de backfills de contatos.owner_name).
// O drain agora resolve followers[0] → ghl_users.nome e SEMPRE cai para
// contatos.owner_name quando não resolve (regra de negócio documentada).
//
// Fluxo (3 fases — mesmo padrão de sync-opp-pipelines):
//   Fase 1: Drena jobs done/dead do caller='sync-opp-sdr' e aplica sdr_name
//   Fase 2: Enfileira GET /opportunities/{id} para opps com sdr_name IS NULL
//   Fase 3: Drena novamente (pega jobs que concluíram durante a Fase 2)

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

const CALLER = 'sync-opp-sdr';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface PendingOppRow {
  id: string;
  ghl_opportunity_id: string | null;
  contato_id: string | null;
  workspace_id: string | null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveFollowerName(
  supabase: ReturnType<typeof createClient>,
  followerIds: string[],
  contato_id: string | null,
): Promise<string | null> {
  // 1. followers[0] (id de usuário GHL) → nome canônico em ghl_users
  const firstId = followerIds.find((v) => typeof v === 'string' && v.trim() !== '');
  if (firstId) {
    const { data: ghlUser } = await supabase
      .from('ghl_users')
      .select('nome')
      .eq('ghl_id', firstId.trim())
      .maybeSingle();

    if (ghlUser?.nome && String(ghlUser.nome).trim() !== '') {
      return String(ghlUser.nome).trim();
    }
  }

  // 2. Fallback (regra de negócio): contatos.owner_name do contato associado
  if (contato_id) {
    const { data: contato } = await supabase
      .from('contatos')
      .select('owner_name')
      .eq('id', contato_id)
      .maybeSingle();

    if (contato?.owner_name && String(contato.owner_name).trim() !== '') {
      return String(contato.owner_name).trim();
    }
  }

  return null;
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
      const contato_id = normalizeId(context.contato_id);

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

      // notFound (404 = opp inexistente no GHL): sem dados de followers,
      // mas NÃO pula — segue para o fallback contatos.owner_name.
      const meta = extractGhlJobMeta(job.result);
      if (meta.notFound) notFound++;

      // GET /opportunities/{id} retorna { opportunity: { followers: string[] } }
      const oppResult = job.result?.opportunity as Record<string, unknown> | undefined;
      const followersRaw = meta.notFound ? [] : (oppResult?.followers ?? []);
      const followerIds: string[] = Array.isArray(followersRaw)
        ? (followersRaw as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];

      const sdrName = await resolveFollowerName(supabase, followerIds, contato_id);

      if (!sdrName) {
        // Sem nome resolvido (contato também sem owner_name) — marca como handled
        // para não reprocessar indefinidamente; próximo webhook atualizará
        noData++;
        handledIds.push(job.id);
        continue;
      }

      const { error } = await supabase
        .from('oportunidades')
        .update({ sdr_name: sdrName })
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
    .select('id, ghl_opportunity_id, contato_id, workspace_id')
    .is('sdr_name', null)
    .not('ghl_opportunity_id', 'is', null)
    .order('id')
    .limit(batchSize);

  if (error) {
    throw new Error(`Erro ao buscar oportunidades pendentes: ${error.message}`);
  }

  let enqueued = 0;
  let duplicates = 0;

  for (const opp of (pending ?? []) as PendingOppRow[]) {
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
        contato_id: opp.contato_id ?? null,
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

    // Fase 1: drena jobs concluídos de execuções anteriores
    const initialApplied = await drainCompletedJobs(supabase, applyBatchSize);

    // Fase 2: enfileira opps sem sdr_name
    const queued = await enqueuePendingJobs(supabase, batchSize);

    // Fase 3: drena novamente (pega jobs que concluíram durante a Fase 2)
    const tailApplied = await drainCompletedJobs(supabase, applyBatchSize);

    const applied = mergeDrainResults(initialApplied, tailApplied);

    // Contagem de pendentes restantes
    const { count: remaining } = await supabase
      .from('oportunidades')
      .select('*', { count: 'exact', head: true })
      .is('sdr_name', null)
      .not('ghl_opportunity_id', 'is', null);

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
      errors: applied.errors.length > 0 ? applied.errors.slice(0, 20) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-opp-sdr] Erro fatal:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
