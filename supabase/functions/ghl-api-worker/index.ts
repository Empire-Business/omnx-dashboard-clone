// Edge Function: ghl-api-worker
// Processa a fila centralizada de chamadas à API GHL (tabela ghl_api_jobs)
//
// Executado via:
//   1. Cron pg_cron: todo minuto (*/1 * * * *) — jobs normais e de backfill
//   2. Chamada direta via HTTP: webhook urgente pode invocar imediatamente
//
// Fluxo:
//   1. Claim N jobs pendentes atomicamente via claim_ghl_api_jobs() (SKIP LOCKED)
//   2. Para cada job: resolve o TENANT do job e a CREDENCIAL desse tenant
//      (resolveGhlCredentials) e executa a chamada HTTP à API GHL com a chave
//      DO TENANT — nunca mais uma GHL_API_KEY global.
//   3. Atualiza status: done | dead | pending (retry com next_retry_at)
//
// Isolamento de credencial (Fase 2 / fatia 4):
//   - A chave NAO e mais uma constante de modulo. Cada job resolve a chave do
//     seu workspace via resolveGhlCredentials(workspaceId) (helper compartilhado,
//     cache com rotation_version + TTL <=10s).
//   - FAIL-CLOSED: job sem tenant (nem coluna nem context) ou com location que
//     nao resolve workspace, ou sem credencial => status 'dead' + linha em
//     webhook_unresolved (dead-letter). NENHUM job usa chave global.
//   - Reprocessamento: dead-letter guarda payload para investigacao/reprocesso.
//
// Rate limiting:
//   - Estado local ao worker (único processo que chama GHL neste modelo)
//   - 130ms base entre requests (~7.7 req/s — abaixo do limite de 10 req/s)
//   - Backoff adaptativo por x-ratelimit-remaining
//   - 429 → retry automático com next_retry_at = agora + Retry-After
//
// Jobs nunca se perdem:
//   - Se excede max_attempts → status = 'dead' (auditável, não deletado)
//   - Se cai no meio do processo → 'processing' fica como flag de retry manual
//     (o cron lida com isso via next_retry_at)
//   - Sem tenant/credencial → 'dead' + webhook_unresolved (nao se perde)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { extractJobTenant } from '../_shared/job-tenant.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

// ============================================================
// CONFIGURAÇÃO
// ============================================================
//
// GHL_API_KEY global REMOVIDA (Fase 2/fatia 4): a chave e resolvida POR JOB.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY seguem obrigatorias (o worker precisa
// do client service_role para claim/update e para as RPCs de resolucao).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// Delay base conservador: 130ms = ~7.7 req/s (limite GHL = 10 req/s)
const BASE_DELAY_MS = 130;
const REQUEST_TIMEOUT_MS = 15000;

// Máximo de jobs por invocação (evitar timeout de 150s da edge function)
// 50 jobs × 130ms = 6.5s mínimo — há margem ampla para retries e delays
const MAX_JOBS_PER_RUN = 50;

// ============================================================
// TIPOS
// ============================================================

interface GhlApiJob {
  id:             number;
  url:            string;
  method:         string;
  body:           Record<string, unknown> | null;
  priority:       number;
  status:         string;
  attempts:       number;
  max_attempts:   number;
  result:         Record<string, unknown> | null;
  error:          string | null;
  caller:         string | null;
  idempotency_key: string | null;
  context:        Record<string, unknown> | null;
  workspace_id:   string | null;
  location_id:    string | null;
  created_at:     string;
  processed_at:   string | null;
  next_retry_at:  string;
  claimed_at:     string | null;
  handled_at:     string | null;
}

// ============================================================
// RATE LIMIT — estado local ao worker
// ============================================================
//
// Como o worker é o único ponto de saída para a GHL API neste modelo,
// manter o estado local é suficiente. Não precisa de estado externo.
//
// Limites GHL: 100 req / 10s
// Estratégia:
//   1. BASE_DELAY_MS entre todos os requests → ~7.7 req/s
//   2. remaining < 20 → pausa de 500ms
//   3. remaining < 5  → pausa até janela renovar (~1s)
//   4. 429 → retry com Retry-After ou backoff exponencial

const rl = {
  remaining: 100,
  resetInMs:  0,
};

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function applyRateLimitDelay(): Promise<void> {
  if (rl.remaining < 5) {
    const waitMs = Math.max(rl.resetInMs, 1000);
    console.warn(`[ghl-api-worker] remaining=${rl.remaining}, aguardando ${waitMs + 200}ms`);
    await delay(waitMs + 200);
  } else if (rl.remaining < 20) {
    await delay(500);
  } else {
    await delay(BASE_DELAY_MS);
  }
}

function updateRateLimit(res: Response): void {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const interval  = res.headers.get('x-ratelimit-interval-milliseconds');
  if (remaining !== null) rl.remaining = Number(remaining);
  if (interval  !== null) rl.resetInMs  = Number(interval);
}

// ============================================================
// EXECUTAR UM JOB
// ============================================================

type UnresolvedInfo = {
  source: 'ghl-api-worker';
  location_id: string | null;
  reason: 'missing_tenant' | 'no_match' | 'credential_unresolved';
  payload: Record<string, unknown>;
};

type JobOutcome =
  | { status: 'done';    result: Record<string, unknown> }
  | { status: 'retry';   error: string; next_retry_at: string }
  | { status: 'dead';    error: string; unresolved?: UnresolvedInfo };

function buildMetaResult(status: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _meta: {
      http_status: status,
      ...extra,
    },
  };
}

/**
 * Resolve o workspace dono do job.
 *   1. workspace_id da coluna/context (direto)
 *   2. senao, resolve location_id -> workspace via RPC (fatia 3; NULL = sem match)
 * Retorna null quando nao ha como determinar o tenant (fail-closed).
 */
async function resolveJobWorkspaceId(
  sb: SupabaseClient,
  job: GhlApiJob,
): Promise<{ workspaceId: string; locationId: string | null } | { workspaceId: null; locationId: string | null }> {
  const tenant = extractJobTenant(job);
  if (tenant === null) {
    return { workspaceId: null, locationId: null };
  }
  if (tenant.workspaceId !== null) {
    return { workspaceId: tenant.workspaceId, locationId: tenant.locationId };
  }
  // so location_id: resolve via funcao segura (sem fallback "mais antigo")
  const { data, error } = await sb.rpc('get_workspace_id_by_ghl_location_id', {
    p_location_id: tenant.locationId,
  });
  if (error || data === null) {
    return { workspaceId: null, locationId: tenant.locationId };
  }
  return { workspaceId: data as string, locationId: tenant.locationId };
}

async function executeJob(job: GhlApiJob, sb: SupabaseClient): Promise<JobOutcome> {
  // --- Isolamento de credencial: resolver tenant + chave ANTES de chamar a API ---
  const resolved = await resolveJobWorkspaceId(sb, job);

  if (resolved.workspaceId === null) {
    // FAIL-CLOSED: sem tenant nao ha como saber qual chave usar => nao chama a API.
    const hadLocation = resolved.locationId !== null;
    return {
      status: 'dead',
      error: hadLocation
        ? `missing_tenant: location_id '${resolved.locationId}' nao resolve workspace (no_match)`
        : 'missing_tenant: job sem workspace_id/location_id (coluna nem context)',
      unresolved: {
        source: 'ghl-api-worker',
        location_id: resolved.locationId,
        reason: hadLocation ? 'no_match' : 'missing_tenant',
        payload: { job_id: job.id, caller: job.caller, url: job.url, method: job.method, context: job.context },
      },
    };
  }

  let apiKey: string;
  try {
    const creds = await resolveGhlCredentials(sb, resolved.workspaceId);
    apiKey = creds.apiKey;
  } catch (err) {
    const msg = err instanceof CredentialResolutionError ? err.message : (err instanceof Error ? err.message : String(err));
    // FAIL-CLOSED: sem credencial do tenant => nao chama a API (nunca chave global).
    return {
      status: 'dead',
      error: `credential_unresolved: ${msg}`,
      unresolved: {
        source: 'ghl-api-worker',
        location_id: resolved.locationId,
        reason: 'credential_unresolved',
        payload: { job_id: job.id, caller: job.caller, workspace_id: resolved.workspaceId, url: job.url, method: job.method },
      },
    };
  }

  await applyRateLimitDelay();

  const fetchOpts: RequestInit = {
    method:  job.method,
    headers: buildGhlHeaders(apiKey),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (job.body && job.method !== 'GET') {
    fetchOpts.body = JSON.stringify(job.body);
  }

  let res: Response;
  try {
    res = await fetch(job.url, fetchOpts);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      (err instanceof DOMException && err.name === 'TimeoutError') ||
      (err instanceof Error && err.name === 'AbortError');
    const reason = isTimeout ? 'Timeout' : 'Network error';

    // Timeout/rede — sempre retry (não é culpa da regra de negócio)
    if (job.attempts >= job.max_attempts) {
      return { status: 'dead', error: `${reason} após ${job.attempts} tentativas: ${errMsg}` };
    }
    return {
      status:        'retry',
      error:         `${reason} tentativa ${job.attempts}: ${errMsg}`,
      next_retry_at: new Date(Date.now() + (isTimeout ? 3000 : 5000)).toISOString(),
    };
  }

  updateRateLimit(res);

  // 429 Too Many Requests — respeitar Retry-After
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const waitMs     = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, job.attempts);
    const retryAt    = new Date(Date.now() + waitMs + 500).toISOString();

    // Aguarda um pouco para o rate limit do estado local se recuperar
    await delay(Math.min(waitMs, 2000));

    if (job.attempts >= job.max_attempts) {
      return { status: 'dead', error: `429 após ${job.attempts} tentativas. Retry-After: ${retryAfter}` };
    }
    return {
      status:        'retry',
      error:         `429 tentativa ${job.attempts} — retry em ${waitMs}ms`,
      next_retry_at: retryAt,
    };
  }

  if (res.status === 404) {
    return {
      status: 'done',
      result: buildMetaResult(404, { not_found: true, url: job.url }),
    };
  }

  if (res.status === 401 || res.status === 403) {
    const errText = (await res.text()).slice(0, 500);
    return { status: 'dead', error: `HTTP ${res.status}: ${errText}` };
  }

  if (res.status >= 400 && res.status < 500) {
    const errText = (await res.text()).slice(0, 500);
    if (errText.toLowerCase().includes('not found')) {
      return {
        status: 'done',
        result: buildMetaResult(res.status, {
          not_found: true,
          url: job.url,
          message: errText,
        }),
      };
    }
    return { status: 'dead', error: `HTTP ${res.status}: ${errText}` };
  }

  // Outros erros HTTP (4xx exceto 429, 5xx)
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    const backoff  = 2000 * Math.pow(2, job.attempts - 1);

    if (job.attempts >= job.max_attempts) {
      return { status: 'dead', error: `HTTP ${res.status} após ${job.attempts} tentativas: ${errText}` };
    }
    return {
      status:        'retry',
      error:         `HTTP ${res.status} tentativa ${job.attempts}: ${errText}`,
      next_retry_at: new Date(Date.now() + backoff).toISOString(),
    };
  }

  // Sucesso
  const contentType = res.headers.get('content-type') || '';
  const result = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : buildMetaResult(res.status, {
      non_json_body: true,
      body_text: (await res.text()).slice(0, 1000),
    });

  return { status: 'done', result: result as Record<string, unknown> };
}

// ============================================================
// HANDLER HTTP
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  // GHL_API_KEY nao e mais exigida (resolvida por job). So o client Supabase e obrigatorio.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Parâmetro opcional: max_jobs (padrão 50, mínimo 1, máximo 200)
  let maxJobs = MAX_JOBS_PER_RUN;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (typeof body.max_jobs === 'number') {
        maxJobs = Math.max(1, Math.min(200, body.max_jobs));
      }
    }
  } catch { /* ignore */ }

  let staleRequeued = 0;
  const { data: staleData, error: staleErr } = await sb
    .rpc('requeue_stale_ghl_api_jobs', { p_stale_after_minutes: 15 });

  if (staleErr) {
    console.warn('[ghl-api-worker] Erro ao reencaminhar jobs stale:', staleErr.message);
  } else {
    staleRequeued = typeof staleData === 'number' ? staleData : 0;
  }

  // 1. Claim jobs pendentes de forma atômica (SKIP LOCKED)
  const { data: jobs, error: claimErr } = await sb
    .rpc('claim_ghl_api_jobs', { max_jobs: maxJobs });

  if (claimErr) {
    console.error('[ghl-api-worker] Erro ao claim jobs:', claimErr.message);
    return new Response(
      JSON.stringify({ error: claimErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const pendingJobs = (jobs ?? []) as GhlApiJob[];

  if (pendingJobs.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0, succeeded: 0, retried: 0, dead: 0, stale_requeued: staleRequeued, message: 'Fila vazia' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[ghl-api-worker] Processando ${pendingJobs.length} jobs...`);

  let succeeded = 0, retried = 0, dead = 0;

  // 2. Processar cada job sequencialmente (rate limit exige sequencial)
  for (const job of pendingJobs) {
    try {
      const outcome = await executeJob(job, sb);

      if (outcome.status === 'done') {
        await sb.from('ghl_api_jobs').update({
          status:       'done',
          result:       outcome.result,
          error:        null,
          processed_at: new Date().toISOString(),
          claimed_at:   null,
        }).eq('id', job.id);
        succeeded++;
      } else if (outcome.status === 'retry') {
        await sb.from('ghl_api_jobs').update({
          status:        'pending',
          error:         outcome.error.slice(0, 1000),
          next_retry_at: outcome.next_retry_at,
          processed_at:  null,
          claimed_at:    null,
        }).eq('id', job.id);
        retried++;
      } else {
        // dead (inclui fail-closed de tenant/credencial)
        await sb.from('ghl_api_jobs').update({
          status:       'dead',
          error:        outcome.error.slice(0, 1000),
          processed_at: new Date().toISOString(),
          claimed_at:   null,
        }).eq('id', job.id);
        dead++;
        // Dead-letter: job sem tenant/credencial vai para webhook_unresolved (nunca se perde)
        if (outcome.unresolved) {
          const { error: dlErr } = await sb.from('webhook_unresolved').insert(outcome.unresolved);
          if (dlErr) {
            console.error(`[ghl-api-worker] Falha ao gravar dead-letter do job ${job.id}: ${dlErr.message}`);
          }
        }
        console.warn(`[ghl-api-worker] Job ${job.id} morto (${job.caller}): ${outcome.error.slice(0, 200)}`);
      }
    } catch (err) {
      // Erro inesperado no próprio worker — não deixar job preso em 'processing'
      const errMsg = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const nextStatus = job.attempts >= job.max_attempts ? 'dead' : 'pending';
      await sb.from('ghl_api_jobs').update({
        status:        nextStatus,
        error:         `Worker error: ${errMsg}`,
        next_retry_at: nextStatus === 'pending' ? new Date(Date.now() + 5000).toISOString() : job.next_retry_at,
        processed_at:  nextStatus === 'dead' ? new Date().toISOString() : null,
        claimed_at:    null,
      }).eq('id', job.id);

      if (nextStatus === 'dead') {
        dead++;
      } else {
        retried++;
      }

      console.error(`[ghl-api-worker] Erro inesperado no job ${job.id}:`, err);
    }
  }

  const processed = pendingJobs.length;
  console.log(`[ghl-api-worker] Concluído: ${processed} jobs | ✅ ${succeeded} ok | 🔄 ${retried} retry | 💀 ${dead} dead`);

  return new Response(
    JSON.stringify({ processed, succeeded, retried, dead, stale_requeued: staleRequeued }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
