import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

export interface GhlApiJobRow {
  id: number;
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  priority: number;
  status: 'pending' | 'processing' | 'done' | 'dead';
  attempts: number;
  max_attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
  caller: string | null;
  idempotency_key: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
  processed_at: string | null;
  next_retry_at: string;
  claimed_at: string | null;
  handled_at: string | null;
}

interface EnqueueGhlApiJobParams {
  url: string;
  caller: string;
  method?: string;
  body?: Record<string, unknown> | null;
  priority?: number;
  idempotencyKey?: string | null;
  context?: Record<string, unknown>;
  maxAttempts?: number;
}

export async function enqueueGhlApiJob(
  supabase: SupabaseClient,
  params: EnqueueGhlApiJobParams,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('enqueue_ghl_api_job', {
    p_url: params.url,
    p_method: params.method ?? 'GET',
    p_body: params.body ?? null,
    p_priority: params.priority ?? 5,
    p_caller: params.caller,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_context: params.context ?? {},
    p_max_attempts: params.maxAttempts ?? 4,
  });

  if (error) {
    throw new Error(`Erro ao enfileirar job GHL (${params.caller}): ${error.message}`);
  }

  return data === true;
}

export async function listUnhandledGhlApiJobs(
  supabase: SupabaseClient,
  caller: string,
  limit: number,
): Promise<GhlApiJobRow[]> {
  const { data, error } = await supabase
    .from('ghl_api_jobs')
    .select('id,url,method,body,priority,status,attempts,max_attempts,result,error,caller,idempotency_key,context,created_at,processed_at,next_retry_at,claimed_at,handled_at')
    .eq('caller', caller)
    .is('handled_at', null)
    .in('status', ['done', 'dead'])
    .order('processed_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Erro ao buscar jobs GHL concluídos (${caller}): ${error.message}`);
  }

  return (data ?? []) as GhlApiJobRow[];
}

export async function markGhlApiJobsHandled(
  supabase: SupabaseClient,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from('ghl_api_jobs')
    .update({ handled_at: new Date().toISOString() })
    .in('id', ids);

  if (error) {
    throw new Error(`Erro ao marcar jobs GHL como handled: ${error.message}`);
  }
}

export async function requeueStaleGhlApiJobs(
  supabase: SupabaseClient,
  staleAfterMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('requeue_stale_ghl_api_jobs', {
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (error) {
    throw new Error(`Erro ao reencaminhar jobs GHL stale: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}

export function extractGhlJobMeta(result: Record<string, unknown> | null): {
  httpStatus: number | null;
  notFound: boolean;
} {
  const meta = result?._meta;
  if (!meta || typeof meta !== 'object') {
    return { httpStatus: null, notFound: false };
  }

  const metaRecord = meta as Record<string, unknown>;
  return {
    httpStatus: typeof metaRecord.http_status === 'number' ? metaRecord.http_status : null,
    notFound: metaRecord.not_found === true,
  };
}
