// Ponte omnx-desk → GHL — marca uma oportunidade como VENDA GANHA (Assinada).
// Chamada quando um contrato é assinado no omnx-desk (Clicksign). Move o card do lead
// para o pipeline "Vendas SQL", etapa "Assinada", status "won" no GoHighLevel e espelha
// o novo estado na tabela `oportunidades` (o webhook do GHL não é confiável p/ isso).
//
// Autenticação: mesmo esquema da crm-registrar-venda (secret por tenant via digest SHA-256
// → workspace, com fallback ao secret global legado). Isolamento cross-tenant fail-closed.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import { secretsEqual } from '../_shared/webhook-ghl-auth.ts';
import { resolveGhlCredentials } from '../_shared/resolve-workspace-credentials.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const BRIDGE_SECRET =
  Deno.env.get('OMNX_DESK_BRIDGE_SECRET') || Deno.env.get('EMPIREDESK_BRIDGE_SECRET') || '';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

// Nomes (não IDs) do destino de "venda ganha". Resolvidos p/ ID via API por workspace,
// para não hardcodar IDs de um location específico (multi-tenant safe).
const PIPELINE_GANHO = 'Vendas SQL';
const STAGE_GANHO = 'Assinada';

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

function ghlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
  };
}

// Descobre {pipelineId, stageId} do destino "Vendas SQL / Assinada" no location do workspace.
async function resolveDestino(
  apiKey: string,
  locationId: string,
): Promise<{ pipelineId: string; stageId: string } | null> {
  const res = await fetch(
    `${GHL_API_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
    { headers: ghlHeaders(apiKey) },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }>;
  };
  const pipe = (data.pipelines ?? []).find((p) => p.name === PIPELINE_GANHO);
  if (!pipe) return null;
  const stage = (pipe.stages ?? []).find((s) => s.name === STAGE_GANHO);
  if (!stage) return null;
  return { pipelineId: pipe.id, stageId: stage.id };
}

// Resolve a oportunidade da VENDA DO DESK mais recente do cliente (por telefone/e-mail).
// Casa o contato por e-mail e/ou pelos últimos 8 dígitos do telefone (confirmando no código),
// depois pega a vendas_fechamento origem 'omnx_desk' mais recente desse(s) contato(s).
async function resolverPorVendaDesk(
  supabase: SupabaseClient,
  args: { telefone: string | null; email: string | null; workspaceId: string | null },
): Promise<string | null> {
  const digits = (args.telefone ?? '').replace(/\D/g, '');
  const ultimos = digits.slice(-8);
  const contatoIds = new Set<string>();

  if (ultimos.length >= 8) {
    let q = supabase.from('contatos').select('id, telefone').ilike('telefone', `%${ultimos}%`);
    if (args.workspaceId) q = q.eq('workspace_id', args.workspaceId);
    const { data } = await q;
    for (const c of data ?? []) {
      if (String((c as { telefone?: string }).telefone ?? '').replace(/\D/g, '').endsWith(ultimos)) {
        contatoIds.add((c as { id: string }).id);
      }
    }
  }
  // Bloqueia '%' (wildcard multi-char do LIKE) — e-mails reais não têm '%'; evita match amplo
  // por e-mail malformado vindo de contrato importado.
  const emailLimpo = args.email && args.email.includes('@') && !args.email.includes('%') ? args.email : null;
  if (emailLimpo) {
    let q = supabase.from('contatos').select('id').ilike('email', emailLimpo);
    if (args.workspaceId) q = q.eq('workspace_id', args.workspaceId);
    const { data } = await q;
    for (const c of data ?? []) contatoIds.add((c as { id: string }).id);
  }
  if (contatoIds.size === 0) return null;

  let vq = supabase
    .from('vendas_fechamento')
    .select('oportunidade_id, created_at')
    .in('contato_id', Array.from(contatoIds))
    .eq('origem', 'omnx_desk')
    .not('oportunidade_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (args.workspaceId) vq = vq.eq('workspace_id', args.workspaceId);
  const { data: vendas } = await vq;
  return (vendas?.[0] as { oportunidade_id?: string })?.oportunidade_id ?? null;
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

  // Roteamento por secret: (1) digest → workspace por conta; (2) fallback ao secret global.
  let tenantWorkspaceId: string | null = null;
  try {
    const digest = await sha256Hex(secret);
    const { data: wsId, error: rpcErr } = await supabase.rpc(
      'resolve_workspace_by_omnx_desk_secret_digest',
      { p_digest: digest },
    );
    if (rpcErr) {
      const requestId = createRequestId();
      logSafeError('crm-marcar-assinada:resolve-secret', requestId, rpcErr);
      return json({ error: 'Não foi possível autenticar o secret.', request_id: requestId }, 500);
    }
    if (typeof wsId === 'string' && wsId.length > 0) tenantWorkspaceId = wsId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-marcar-assinada:digest', requestId, e);
    return json({ error: 'Falha ao processar o secret.', request_id: requestId }, 500);
  }

  if (!tenantWorkspaceId) {
    if (!BRIDGE_SECRET || !secretsEqual(secret, BRIDGE_SECRET)) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  let body: { oportunidade_id?: unknown; telefone?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  let oportunidadeId = typeof body?.oportunidade_id === 'string' ? body.oportunidade_id : null;
  const telefone = typeof body?.telefone === 'string' ? body.telefone : null;
  const email = typeof body?.email === 'string' ? body.email : null;

  // Resolução determinística: sem oportunidade_id explícito, acha a oportunidade que tem
  // a VENDA DO DESK registrada (vendas_fechamento origem 'omnx_desk') para o contato
  // casado por telefone/e-mail. Isso ignora oportunidades antigas do histórico (webinário,
  // evento, etc.) e escolhe exatamente o card da venda que gerou o contrato.
  if (!oportunidadeId) {
    if (!telefone && !email) return json({ error: 'oportunidade_id ou telefone/email obrigatório' }, 400);
    try {
      oportunidadeId = await resolverPorVendaDesk(supabase, { telefone, email, workspaceId: tenantWorkspaceId });
    } catch (e) {
      const requestId = createRequestId();
      logSafeError('crm-marcar-assinada:resolver', requestId, e);
      return json({ error: 'Falha ao resolver oportunidade.', request_id: requestId }, 500);
    }
    if (!oportunidadeId) return json({ error: 'sem_venda_desk', motivo: 'nenhuma venda do Desk para este cliente' }, 404);
  }

  // 1. Resolve a oportunidade (id GHL real + workspace + estado atual).
  const { data: opp, error: oppErr } = await supabase
    .from('oportunidades')
    .select('id, ghl_opportunity_id, workspace_id, pipeline_name, pipeline_stage_id, status')
    .eq('id', oportunidadeId)
    .maybeSingle();
  if (oppErr) {
    const requestId = createRequestId();
    logSafeError('crm-marcar-assinada:lookup-opp', requestId, oppErr);
    return json({ error: 'Não foi possível consultar a oportunidade.', request_id: requestId }, 500);
  }
  if (!opp) return json({ error: 'Oportunidade não encontrada' }, 404);
  if (!opp.ghl_opportunity_id) return json({ error: 'Oportunidade sem ghl_opportunity_id' }, 422);

  const oppWorkspaceId = typeof opp.workspace_id === 'string' ? opp.workspace_id : null;
  if (tenantWorkspaceId && oppWorkspaceId !== tenantWorkspaceId) {
    const requestId = createRequestId();
    logSafeError(
      'crm-marcar-assinada:cross-tenant-denied',
      requestId,
      new Error('oportunidade de outro workspace'),
    );
    return json({ error: 'Oportunidade não pertence a esta conta.', request_id: requestId }, 403);
  }
  const workspaceId = tenantWorkspaceId ?? oppWorkspaceId;
  if (!workspaceId) return json({ error: 'Workspace indefinido' }, 422);

  // 2. Idempotência: já está em Vendas SQL / Assinada / won → nada a fazer.
  if (opp.status === 'won' && opp.pipeline_stage_id === STAGE_GANHO) {
    return json({ success: true, already: true, ghl_opportunity_id: opp.ghl_opportunity_id });
  }

  // 3. Credenciais GHL do workspace (BYOK/Vault) + destino resolvido por nome.
  let apiKey: string;
  let locationId: string | null;
  try {
    const cred = await resolveGhlCredentials(supabase, workspaceId);
    apiKey = cred.apiKey;
    locationId = cred.locationId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-marcar-assinada:resolve-ghl-cred', requestId, e);
    return json({ error: 'Sem credencial GHL para o workspace.', request_id: requestId }, 502);
  }
  if (!locationId) return json({ error: 'Workspace sem location_id do GHL' }, 422);

  const destino = await resolveDestino(apiKey, locationId);
  if (!destino) {
    return json({ error: `Pipeline "${PIPELINE_GANHO}"/etapa "${STAGE_GANHO}" não encontrada no GHL` }, 502);
  }

  // 4. PUT no GHL: move o card para Vendas SQL / Assinada / won.
  const putRes = await fetch(`${GHL_API_BASE}/opportunities/${opp.ghl_opportunity_id}`, {
    method: 'PUT',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({
      pipelineId: destino.pipelineId,
      pipelineStageId: destino.stageId,
      status: 'won',
    }),
  });
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '');
    const requestId = createRequestId();
    logSafeError('crm-marcar-assinada:put', requestId, new Error(`GHL ${putRes.status}: ${detail.slice(0, 300)}`));
    return json({ error: 'GHL rejeitou a atualização.', status: putRes.status, request_id: requestId }, 502);
  }

  // 5. Espelha o novo estado na tabela oportunidades (o webhook não é confiável p/ isso).
  const { error: updErr } = await supabase
    .from('oportunidades')
    .update({
      pipeline_id: destino.pipelineId,
      pipeline_name: PIPELINE_GANHO,
      pipeline_stage_id: STAGE_GANHO,
      status: 'won',
    })
    .eq('id', oportunidadeId);
  if (updErr) {
    // O card já foi movido no GHL; o espelho é secundário — loga mas retorna sucesso.
    logSafeError('crm-marcar-assinada:mirror', createRequestId(), updErr);
  }

  return json({ success: true, ghl_opportunity_id: opp.ghl_opportunity_id, moved_to: `${PIPELINE_GANHO}/${STAGE_GANHO}` });
});
