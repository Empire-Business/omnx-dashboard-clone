// Edge Function: diag-ghl
// Diagnostico read-only: lista pipelines e estagios do location GHL de um workspace.
//
// Fase 2 (credenciais por workspace): a chave NAO e mais global e o location_id
// NAO e mais hardcoded. O tenant vem do payload (workspace_id OU location_id) e a
// credencial e resolvida por workspace via helper (Vault + cache), montada por
// chamada em buildGhlHeaders. Fail-closed: sem tenant ou sem credencial => erro
// terminal (NUNCA cai em chave/location global).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

const BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

// Fase 2: a chave nao e mais global. E resolvida por workspace e montada por chamada.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

// Fase 2: erro fail-closed (sem tenant ou sem credencial). E TERMINAL para a
// chamada — sem tenant no payload ou sem credencial GHL resolvida para o
// workspace, NAO ha como diagnosticar. Propaga ate o catch do handler (HTTP 500)
// com mensagem auditavel; NUNCA cai em chave/location global.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailClosedError';
  }
}

interface TenantContext {
  workspaceId: string;
  apiKey: string;
  locationId: string;
}

// Resolve o contexto do tenant (1 workspace por chamada — diagnostico read-only):
//   1. workspace_id do payload JSON (ou query string) -> resolveGhlCredentials.
//   2. OU location_id (payload/query) -> RPC get_workspace_id_by_ghl_location_id
//      (sem fallback "mais antigo") -> workspace_id -> resolveGhlCredentials.
// Qualquer falha => FailClosedError (NUNCA chave/location global).
async function resolveTenantContext(
  req: Request,
  supabase: SupabaseClient,
): Promise<TenantContext> {
  let workspaceId: string | null = null;
  let locationId: string | null = null;

  // Payload JSON (POST) — fonte primaria.
  try {
    const body = await req.clone().json() as Record<string, unknown>;
    if (typeof body.workspace_id === 'string' && body.workspace_id.length > 0) {
      workspaceId = body.workspace_id;
    }
    if (typeof body.location_id === 'string' && body.location_id.length > 0) {
      locationId = body.location_id;
    }
  } catch {
    // Payload ausente ou invalido — tenta query string abaixo.
  }

  // Query string (GET) — conveniencia para diagnostico manual.
  if (!workspaceId && !locationId) {
    const url = new URL(req.url);
    workspaceId = url.searchParams.get('workspace_id');
    locationId = url.searchParams.get('location_id');
  }

  // location_id -> workspace_id via RPC segura (sem fallback "mais antigo").
  if (!workspaceId && locationId) {
    const { data, error } = await supabase.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: locationId,
    });
    if (error) {
      throw new FailClosedError(
        `falha ao resolver workspace pelo location_id ${locationId}: ${error.message}`,
      );
    }
    if (typeof data === 'string' && data.length > 0) {
      workspaceId = data;
    }
  }

  if (!workspaceId) {
    throw new FailClosedError(
      'tenant ausente — diag-ghl exige workspace_id ou location_id no payload/query (fail-closed, sem fallback)',
    );
  }

  let apiKey: string;
  let resolvedLocationId: string;
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId);
    apiKey = creds.apiKey;
    // location_id vem dos metadados da credencial; se nao houver, usa o do payload.
    resolvedLocationId = creds.locationId ?? locationId ?? '';
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err));
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId}: ${msg}`,
    );
  }

  if (!resolvedLocationId) {
    throw new FailClosedError(
      `workspace ${workspaceId} sem location_id nos metadados da credencial ghl`,
    );
  }

  return { workspaceId, apiKey, locationId: resolvedLocationId };
}

Deno.serve(async (req) => {
  const guardResponse = requireServiceRoleCaller(req);
  if (guardResponse) return guardResponse;

  try {
    // GHL_API_KEY nao e mais exigida (resolvida por workspace). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    // Resolve o tenant (workspace_id/location_id do payload) + credencial GHL do
    // workspace. Fail-closed: sem tenant ou sem credencial => FailClosedError.
    const { apiKey, locationId } = await resolveTenantContext(req, supabase);

    const res = await fetch(
      `${BASE}/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      { headers: buildGhlHeaders(apiKey) },
    );
    const data = await res.json();

    const result: Record<string, unknown> = {};
    for (const p of data.pipelines || []) {
      result[p.name] = {
        id: p.id,
        stages: Object.fromEntries((p.stages || []).map((s: Record<string, string>) => [s.name, s.id])),
      };
    }
    return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[diag-ghl] Erro fatal:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
