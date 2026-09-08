// Edge Function: sync-ghl-users
// Sincroniza a tabela ghl_users com a lista de usuários do location GHL.
//
// Fluxo:
//   1. GET /users/?locationId={locationId} da API GHL
//   2. Upsert em ghl_users (ghl_id → id, nome, email, role_ghl, deleted)
//   3. Soft-delete usuários que não vieram na API (deleted = true)
//
// Não usa ghl_api_jobs porque é uma única chamada de listagem.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { isServiceRoleCaller } from '../_shared/require-service-role.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

// Fase 2 (credenciais por workspace): a chave NAO e mais global. E resolvida por
// workspace via helper (Vault + cache) e montada por chamada em buildGhlHeaders.
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

interface GhlApiUser {
  id: string;
  name: string;
  email?: string;
  deleted?: boolean;
  roles?: {
    role?: string;
  };
}

interface SyncResult {
  total_from_api: number;
  inserted: number;
  updated: number;
  unchanged: number;
  marked_deleted: number;
  errors: string[];
  workspace_id: string | null;
}

// Fase 2: erro fail-closed (sem tenant ou sem credencial). E TERMINAL para a
// chamada — sem workspace_id no payload ou sem credencial GHL resolvida para o
// workspace, NAO ha como sincronizar. Propaga ate o catch do handler (HTTP 500)
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

// Resolve o contexto do tenant (1 workspace por chamada):
//   1. workspace_id vem do payload JSON (fail-closed se ausente — SEM fallback a
//      "workspace mais antigo").
//   2. credencial GHL do workspace via helper (Vault + cache) -> apiKey + locationId.
// Qualquer falha => FailClosedError (NUNCA chave/location global).
async function resolveTenantContext(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<TenantContext> {
  let workspaceId: string | null = null;
  try {
    const body = await req.clone().json() as Record<string, unknown>;
    if (typeof body.workspace_id === 'string' && body.workspace_id.length > 0) {
      workspaceId = body.workspace_id;
    }
  } catch {
    // Payload ausente ou inválido — tratado como fail-closed abaixo
  }

  if (!workspaceId) {
    throw new FailClosedError(
      'workspace_id ausente no payload — sync-ghl-users exige workspace_id (fail-closed, sem fallback)',
    );
  }

  let apiKey: string;
  let locationId: string;
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId);
    apiKey = creds.apiKey;
    locationId = creds.locationId ?? '';
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err));
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId}: ${msg}`,
    );
  }

  if (!locationId) {
    throw new FailClosedError(
      `workspace ${workspaceId} sem location_id nos metadados da credencial ghl`,
    );
  }

  return { workspaceId, apiKey, locationId };
}

async function fetchGhlUsers(apiKey: string, locationId: string): Promise<GhlApiUser[]> {
  const url = `${GHL_API_BASE}/users/?locationId=${encodeURIComponent(locationId)}`;
  const res = await fetch(url, { headers: buildGhlHeaders(apiKey) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GHL API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json().catch(() => ({}));
  const users = Array.isArray(data.users) ? data.users : [];

  return users.map((u: Record<string, unknown>) => ({
    id: String(u.id ?? ''),
    name: String(u.name ?? ''),
    email: typeof u.email === 'string' ? u.email : null,
    deleted: u.deleted === true,
    roles: u.roles && typeof u.roles === 'object'
      ? { role: String((u.roles as Record<string, unknown>).role ?? '') }
      : undefined,
  })).filter((u: GhlApiUser) => u.id.length > 0);
}

async function isAuthorized(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  // 1. Permite chamadas internas (cron via pg_cron) com o service_role_key.
  //    Substitui o antigo checador de 'x-cron-secret'/CRON_SECRET, que era
  //    inerte: o cron nunca enviava esse header (só Authorization: Bearer
  //    anon_key). Consolidado no guard único de _shared/require-service-role.ts.
  if (isServiceRoleCaller(req)) {
    return true;
  }

  // 2. Exige JWT valido de usuario autenticado admin/owner
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  return !!membership;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // GHL_API_KEY nao e mais exigida (resolvida por workspace). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    if (!await isAuthorized(req, supabase)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve o contexto do tenant (workspace_id do payload + credencial GHL do
    // workspace). Fail-closed: sem workspace_id ou sem credencial => FailClosedError.
    const { workspaceId, apiKey, locationId } = await resolveTenantContext(req, supabase);

    // 1. Buscar usuários do GHL (location_id e chave do workspace resolvido)
    const ghlUsers = await fetchGhlUsers(apiKey, locationId);
    const apiIds = new Set(ghlUsers.map(u => u.id));

    // 2. Buscar usuários existentes no banco
    // ISOLAMENTO POR CONTA (obrigatorio): a leitura e filtrada por workspace_id.
    // Sem esse filtro, o sync de uma conta enxergava os usuarios de TODAS as
    // outras e, no passo 4, marcava todos eles como deleted = true. Foi o que
    // aconteceu em producao em 2026-08-25 — o time inteiro da conta real sumiu
    // porque o sync da sub-conta de burn-in rodou por ultimo.
    const { data: existingRows, error: existingErr } = await supabase
      .from('ghl_users')
      .select('ghl_id, nome, email, role_ghl, deleted')
      .eq('workspace_id', workspaceId);

    if (existingErr) {
      throw new Error(`Erro ao buscar ghl_users: ${existingErr.message}`);
    }

    const existingMap = new Map<string, typeof existingRows[number]>();
    for (const row of (existingRows ?? [])) {
      if (row.ghl_id) existingMap.set(row.ghl_id, row);
    }

    // 3. Upsert
    const result: SyncResult = {
      total_from_api: ghlUsers.length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      marked_deleted: 0,
      errors: [],
      workspace_id: workspaceId,
    };

    const now = new Date().toISOString();

    for (const user of ghlUsers) {
      const existing = existingMap.get(user.id);
      const roleGhl = user.roles?.role || null;

      if (!existing) {
        // Novo usuário — inserir
        const { error: insertErr } = await supabase.from('ghl_users').insert({
          ghl_id:      user.id,
          nome:        user.name,
          email:       user.email,
          role_ghl:    roleGhl,
          deleted:     user.deleted ?? false,
          papeis:      [],
          workspace_id: workspaceId,
          created_at:  now,
          updated_at:  now,
        });

        if (insertErr) {
          result.errors.push(`insert ${user.id}: ${insertErr.message}`);
        } else {
          result.inserted++;
        }
      } else {
        // Verificar se mudou algo relevante
        // workspace_id nao entra mais na comparacao nem no UPDATE: a linha ja
        // pertence a este workspace (o SELECT acima filtra por ele). Reescrever
        // o campo era justamente o que transferia o usuario entre contas.
        const changed =
          existing.nome !== user.name ||
          existing.email !== user.email ||
          existing.role_ghl !== roleGhl ||
          existing.deleted !== (user.deleted ?? false);

        if (changed) {
          const { error: updateErr } = await supabase.from('ghl_users').update({
            nome:         user.name,
            email:        user.email,
            role_ghl:     roleGhl,
            deleted:      user.deleted ?? false,
            updated_at:   now,
          }).eq('ghl_id', user.id).eq('workspace_id', workspaceId);

          if (updateErr) {
            result.errors.push(`update ${user.id}: ${updateErr.message}`);
          } else {
            result.updated++;
          }
        } else {
          result.unchanged++;
        }
      }
    }

    // 4. Soft-delete usuários que não vieram na API (exceto os já marcados)
    const idsToMarkDeleted: string[] = [];
    for (const [ghlId, row] of existingMap) {
      if (!apiIds.has(ghlId) && row.deleted === false) {
        idsToMarkDeleted.push(ghlId);
      }
    }

    if (idsToMarkDeleted.length > 0) {
      const { error: delErr } = await supabase
        .from('ghl_users')
        .update({ deleted: true, updated_at: now })
        .eq('workspace_id', workspaceId)
        .in('ghl_id', idsToMarkDeleted);

      if (delErr) {
        result.errors.push(`soft-delete: ${delErr.message}`);
      } else {
        result.marked_deleted = idsToMarkDeleted.length;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-ghl-users] Erro fatal:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
