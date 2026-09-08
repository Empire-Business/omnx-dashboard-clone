// Janela de leitura omnx-desk (ex-EmpireDesk) → GHL — saúde da sincronização de vendas.
// Conta quantas vendas com origem omnx-desk existem em vendas_fechamento (aceita os dois
// valores 'omnx_desk' e o legado 'empiredesk') e a data da mais recente, para o monitor
// do omnx-desk comparar com o que ele acha que mandou.
//
// Autenticação + roteamento por secret (mesmo esquema das demais funções da ponte).
// Correção de 2026-08-05: a contagem não filtrava por workspace — o monitor de uma conta
// recebia o total de TODAS as contas (vazamento de agregado cross-tenant).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import { secretsEqual } from '../_shared/webhook-ghl-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const BRIDGE_SECRET =
  Deno.env.get('OMNX_DESK_BRIDGE_SECRET') || Deno.env.get('EMPIREDESK_BRIDGE_SECRET') || '';

const ORIGENS = ['omnx_desk', 'empiredesk'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-omnx-desk-secret, x-empiredesk-secret, authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Missing Supabase env vars' }, 500);

  const secret = extractSecret(req);
  if (!secret) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Workspace dono do secret.
  let workspaceId: string | null = null;
  try {
    const digest = await sha256Hex(secret);
    const { data: wsId, error: rpcErr } = await supabase.rpc(
      'resolve_workspace_by_omnx_desk_secret_digest',
      { p_digest: digest },
    );
    if (rpcErr) {
      const requestId = createRequestId();
      logSafeError('crm-sync-stats:resolve-secret', requestId, rpcErr);
      return json({ error: 'Não foi possível autenticar o secret.', request_id: requestId }, 500);
    }
    if (typeof wsId === 'string' && wsId.length > 0) workspaceId = wsId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-sync-stats:digest', requestId, e);
    return json({ error: 'Falha ao processar o secret.', request_id: requestId }, 500);
  }

  // 2. Fallback global: só quando existe exatamente UMA conta omnx_desk.
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
      logSafeError('crm-sync-stats:list-accounts', requestId, contasErr);
      return json({ error: 'Não foi possível resolver a conta.', request_id: requestId }, 500);
    }
    if ((contas?.length ?? 0) !== 1) {
      const requestId = createRequestId();
      logSafeError(
        'crm-sync-stats:global-secret-ambiguo',
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

  const { count, error } = await supabase
    .from('vendas_fechamento')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .in('origem', ORIGENS);
  if (error) {
    const requestId = createRequestId();
    logSafeError('crm-sync-stats', requestId, error);
    return json({ error: 'Não foi possível consultar o status da sincronização.', request_id: requestId }, 500);
  }

  const { data: last } = await supabase
    .from('vendas_fechamento')
    .select('updated_at')
    .eq('workspace_id', workspaceId)
    .in('origem', ORIGENS)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    origem_omnx_desk: count ?? 0,
    origem_empiredesk: count ?? 0, // compat: mesmo total, chave antiga preservada
    ultima_atualizacao: (last as { updated_at?: string } | null)?.updated_at ?? null,
  });
});
