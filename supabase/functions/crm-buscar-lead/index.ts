// Ponte omnx-desk (ex-EmpireDesk) → GHL — "balcão" de consulta de lead.
// Recebe telefone e/ou e-mail e devolve os contatos candidatos (com oportunidades,
// a mais recente primeiro).
//
// Autenticação + roteamento por secret (mesmo esquema da crm-registrar-venda):
//   - Aceita x-omnx-desk-secret (novo), x-empiredesk-secret (antigo) ou Bearer.
//   - Secret por conta: o digest SHA-256 resolve o workspace dono via RPC, e a busca
//     é SEMPRE restrita a esse workspace.
//   - Secret global (legado): sem workspace derivável, a busca seria cross-tenant —
//     por isso ele só é aceito quando existe exatamente UM workspace com credencial
//     omnx_desk, e a busca é fixada nesse workspace. Caso contrário, 401 fail-closed.
//
// Correção de 2026-08-05: antes daqui, a RPC era chamada sem workspace e a guarda
// `auth.role() = 'service_role'` dava passe-livre — a busca varria TODAS as contas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import { secretsEqual } from '../_shared/webhook-ghl-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const BRIDGE_SECRET =
  Deno.env.get('OMNX_DESK_BRIDGE_SECRET') || Deno.env.get('EMPIREDESK_BRIDGE_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-omnx-desk-secret, x-empiredesk-secret, authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractSecret(req: Request): string | null {
  const omnx = req.headers.get('x-omnx-desk-secret');
  if (omnx && omnx.length > 0) return omnx;
  const legacy = req.headers.get('x-empiredesk-secret');
  if (legacy && legacy.length > 0) return legacy;
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return bearer && bearer.length > 0 ? bearer : null;
}

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Missing Supabase env vars' }, 500);

  const secret = extractSecret(req);
  if (!secret) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Resolve o workspace dono do secret (caminho por conta).
  let workspaceId: string | null = null;
  try {
    const digest = await sha256Hex(secret);
    const { data: wsId, error: rpcErr } = await supabase.rpc(
      'resolve_workspace_by_omnx_desk_secret_digest',
      { p_digest: digest },
    );
    if (rpcErr) {
      const requestId = createRequestId();
      logSafeError('crm-buscar-lead:resolve-secret', requestId, rpcErr);
      return json({ error: 'Não foi possível autenticar o secret.', request_id: requestId }, 500);
    }
    if (typeof wsId === 'string' && wsId.length > 0) workspaceId = wsId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-buscar-lead:digest', requestId, e);
    return json({ error: 'Falha ao processar o secret.', request_id: requestId }, 500);
  }

  // 2. Fallback do secret global (legado). Diferente da escrita, aqui NÃO existe
  //    oportunidade para derivar o dono — então só é seguro enquanto houver uma
  //    única conta omnx_desk cadastrada. Com duas ou mais, nega (fail-closed).
  if (!workspaceId) {
    if (!BRIDGE_SECRET || !secretsEqual(secret, BRIDGE_SECRET)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const { data: contas, error: contasErr } = await supabase
      .from('workspace_integration_credentials')
      .select('workspace_id')
      .eq('provider', 'omnx_desk');
    if (contasErr) {
      const requestId = createRequestId();
      logSafeError('crm-buscar-lead:list-accounts', requestId, contasErr);
      return json({ error: 'Não foi possível resolver a conta.', request_id: requestId }, 500);
    }
    if ((contas?.length ?? 0) !== 1) {
      const requestId = createRequestId();
      logSafeError(
        'crm-buscar-lead:global-secret-ambiguo',
        requestId,
        new Error(`secret global com ${contas?.length ?? 0} contas omnx_desk`),
      );
      return json(
        {
          error:
            'Secret global não identifica a conta. Cadastre o secret próprio da conta em Administração → Integrações → omnx-desk.',
          request_id: requestId,
        },
        401,
      );
    }
    workspaceId = (contas as Array<{ workspace_id: string }>)[0].workspace_id;
  }

  let body: { telefone?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const telefone = typeof body?.telefone === 'string' ? body.telefone : null;
  const email = typeof body?.email === 'string' ? body.email : null;
  if (!telefone && !email) return json({ error: 'Informe telefone ou email' }, 400);

  const { data, error } = await supabase.rpc('buscar_lead_para_venda', {
    p_workspace_id: workspaceId,
    p_telefone: telefone,
    p_email: email,
  });

  if (error) {
    const requestId = createRequestId();
    logSafeError('crm-buscar-lead', requestId, error);
    return json({ error: 'Não foi possível consultar o lead.', request_id: requestId }, 500);
  }

  return json({ candidatos: data ?? [] });
});
