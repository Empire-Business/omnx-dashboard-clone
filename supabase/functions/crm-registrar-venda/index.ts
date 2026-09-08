// Ponte omnx-desk (ex-EmpireDesk) → GHL — "balcão" de registro de venda.
// Recebe a venda validada + a oportunidade escolhida + comprovantes (URLs assinadas),
// copia os comprovantes para o bucket do GHL e faz UPSERT em vendas_fechamento.
//
// Autenticação + roteamento por secret (docs/INTEGRACAO-OMNX-DESK-VENDAS.md §0, §7):
//   - Aceita os DOIS headers durante a transição: x-omnx-desk-secret (novo) e
//     x-empiredesk-secret (antigo), ou Authorization: Bearer <secret>.
//   - Secret por conta (multi-tenant): o digest SHA-256 do secret resolve o
//     workspace dono via RPC. A oportunidade PRECISA pertencer a esse workspace,
//     senão 403 (isolamento cross-tenant fail-closed).
//   - Secret global (legado, env OMNX_DESK_BRIDGE_SECRET / EMPIREDESK_BRIDGE_SECRET):
//     autentica e grava no workspace da própria oportunidade (comportamento atual,
//     sem regressão). Aposentado quando entrar o 2º tenant.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import { secretsEqual } from '../_shared/webhook-ghl-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
// Secret global (legado). Novo nome com fallback para o antigo, para não quebrar deploys.
const BRIDGE_SECRET =
  Deno.env.get('OMNX_DESK_BRIDGE_SECRET') || Deno.env.get('EMPIREDESK_BRIDGE_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-omnx-desk-secret, x-empiredesk-secret, authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Pagamento {
  data?: string;
  valor?: number | string;
  forma?: string;
  plataforma?: string;
  sinal?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Extrai o secret informado (novo header, antigo header ou Bearer). Não valida aqui.
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Deriva os campos financeiros antigos a partir da lista rica de pagamentos.
// data_pagamento_entrada é gravada como meio-dia BRT para evitar erro de borda de fuso.
function derivarFinanceiro(pagamentos: Pagamento[]) {
  const lista = Array.isArray(pagamentos) ? pagamentos : [];
  const valorFaturado = lista.reduce((s, p) => s + num(p.valor), 0);

  const entrada =
    lista.find((p) => String(p.sinal ?? '').toLowerCase().includes('entrada')) ??
    [...lista].sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')))[0] ??
    null;

  const parcelas = lista.filter((p) => p !== entrada);
  const numeroParcelas = parcelas.length;
  const somaParcelas = parcelas.reduce((s, p) => s + num(p.valor), 0);
  // valor_faturado e uma coluna GERADA no banco: entrada + numero_parcelas * valor_parcela.
  // Usamos a media das parcelas como valor_parcela para que essa geracao bata com a soma
  // real dos pagamentos, mesmo quando as parcelas tem valores diferentes.
  const valorParcela = numeroParcelas > 0 ? somaParcelas / numeroParcelas : null;

  return {
    valor_faturado: valorFaturado, // informativo (a coluna no banco e GENERATED ALWAYS)
    valor_entrada: entrada ? num(entrada.valor) : null,
    data_pagamento_entrada: entrada?.data ? `${entrada.data}T12:00:00-03:00` : null,
    numero_parcelas: numeroParcelas,
    valor_parcela: valorParcela,
    forma_pagamento: entrada?.forma ?? null,
  };
}

async function copiarComprovantes(
  supabase: SupabaseClient,
  oppId: string,
  comprovantes: Array<{ url?: string; nome_original?: string; mime_type?: string; sinal?: string | null }>,
) {
  const out: Array<Record<string, unknown>> = [];
  const lista = Array.isArray(comprovantes) ? comprovantes : [];
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (!c?.url) continue;
    try {
      const res = await fetch(c.url);
      if (!res.ok) continue;
      const mime = c.mime_type || res.headers.get('content-type') || 'image/jpeg';
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = (c.nome_original?.split('.').pop() || mime.split('/').pop() || 'jpg').toLowerCase();
      const path = `vendas/${oppId}/${i}-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from('vendas-comprovantes')
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (up.error) {
        logSafeError('crm-registrar-venda:upload-receipt', createRequestId(), up.error);
        continue;
      }
      out.push({
        storage_path: path,
        nome_original: c.nome_original ?? null,
        mime_type: mime,
        tamanho_bytes: bytes.byteLength,
        sinal: c.sinal ?? null,
      });
    } catch (e) {
      logSafeError('crm-registrar-venda:copy-receipt', createRequestId(), e);
    }
  }
  return out;
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
  let tenantWorkspaceId: string | null = null; // não-nulo => caminho isolado por conta
  let isGlobalSecret = false;
  try {
    const digest = await sha256Hex(secret);
    const { data: wsId, error: rpcErr } = await supabase.rpc(
      'resolve_workspace_by_omnx_desk_secret_digest',
      { p_digest: digest },
    );
    if (rpcErr) {
      const requestId = createRequestId();
      logSafeError('crm-registrar-venda:resolve-secret', requestId, rpcErr);
      return json({ error: 'Não foi possível autenticar o secret.', request_id: requestId }, 500);
    }
    if (typeof wsId === 'string' && wsId.length > 0) {
      tenantWorkspaceId = wsId;
    }
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-registrar-venda:digest', requestId, e);
    return json({ error: 'Falha ao processar o secret.', request_id: requestId }, 500);
  }

  if (!tenantWorkspaceId) {
    // Sem credencial por conta: aceita o secret global (legado), em tempo constante.
    if (!BRIDGE_SECRET || !secretsEqual(secret, BRIDGE_SECRET)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    isGlobalSecret = true;
  }

  let body: {
    oportunidade_id?: unknown;
    venda?: Record<string, unknown>;
    comprovantes?: Array<{ url?: string; nome_original?: string; mime_type?: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const oportunidadeId = typeof body?.oportunidade_id === 'string' ? body.oportunidade_id : null;
  const venda = (body?.venda ?? {}) as Record<string, unknown>;
  if (!oportunidadeId) return json({ error: 'oportunidade_id é obrigatório' }, 400);

  // 1. Resolve o contato + workspace da oportunidade escolhida (FK obrigatória).
  const { data: opp, error: oppErr } = await supabase
    .from('oportunidades')
    .select('id, contato_id, workspace_id')
    .eq('id', oportunidadeId)
    .maybeSingle();
  if (oppErr) {
    const requestId = createRequestId();
    logSafeError('crm-registrar-venda:lookup-opportunity', requestId, oppErr);
    return json({ error: 'Não foi possível consultar a oportunidade.', request_id: requestId }, 500);
  }
  if (!opp) return json({ error: 'Oportunidade não encontrada' }, 404);
  if (!opp.contato_id) return json({ error: 'Oportunidade sem contato vinculado' }, 422);

  // Isolamento cross-tenant: no caminho por conta, a oportunidade PRECISA pertencer
  // ao workspace dono do secret. No caminho global (legado), grava no workspace da
  // própria oportunidade (comportamento atual).
  const oppWorkspaceId = typeof opp.workspace_id === 'string' ? opp.workspace_id : null;
  if (tenantWorkspaceId) {
    if (!oppWorkspaceId || oppWorkspaceId !== tenantWorkspaceId) {
      const requestId = createRequestId();
      logSafeError(
        'crm-registrar-venda:cross-tenant-denied',
        requestId,
        new Error('oportunidade de outro workspace'),
      );
      return json({ error: 'Oportunidade não pertence a esta conta.', request_id: requestId }, 403);
    }
  }
  const workspaceId = tenantWorkspaceId ?? oppWorkspaceId;

  // 2. Deriva financeiro.
  const pagamentos = Array.isArray(venda.pagamentos) ? (venda.pagamentos as Pagamento[]) : [];
  const fin = derivarFinanceiro(pagamentos);

  // 3. Robustez (§4.5/§5.1): nunca criar venda "cega" nem sobrescrever dado bom com null.
  //    - Se o payload não deriva data de entrada E não há venda existente com esse dado → 422.
  //    - Se já existe venda, preserva (COALESCE) valores bons quando o novo vier nulo.
  const { data: existente, error: exErr } = await supabase
    .from('vendas_fechamento')
    .select(
      'valor_entrada, data_pagamento_entrada, numero_parcelas, valor_parcela, forma_pagamento, contrato_status, op_link_do_contrato_assinado, data_da_assinatura_do_contrato',
    )
    .eq('oportunidade_id', oportunidadeId)
    .maybeSingle();
  if (exErr) {
    const requestId = createRequestId();
    logSafeError('crm-registrar-venda:lookup-existing', requestId, exErr);
    return json({ error: 'Não foi possível consultar a venda existente.', request_id: requestId }, 500);
  }

  const dataEntradaFinal = fin.data_pagamento_entrada ?? existente?.data_pagamento_entrada ?? null;
  if (!dataEntradaFinal) {
    return json(
      {
        error:
          'Pagamento sem data de entrada: informe ao menos um item em venda.pagamentos com "data" (a entrada). Ver docs/CONFIG-OMNX-DESK-USUARIO.md.',
      },
      422,
    );
  }

  // 4. Copia comprovantes.
  const comprovantesSalvos = await copiarComprovantes(supabase, oportunidadeId, body?.comprovantes ?? []);

  // 5. UPSERT em vendas_fechamento (idempotente por oportunidade_id), com merge server-side.
  const registro: Record<string, unknown> = {
    oportunidade_id: oportunidadeId,
    contato_id: opp.contato_id,
    origem: 'omnx_desk',
    nome_contratante: (venda.nome_contratante as string) ?? null,
    cpf_cnpj_contratante: (venda.cpf_cnpj_contratante as string) ?? null,
    logradouro_rua_avenida: (venda.logradouro_rua_avenida as string) ?? null,
    numero_endereco: (venda.numero_endereco as string) ?? null,
    complemento_endereco: (venda.complemento_endereco as string) ?? null,
    bairro: (venda.bairro as string) ?? null,
    municipio: (venda.municipio as string) ?? null,
    estado_uf: (venda.estado_uf as string) ?? null,
    cep: (venda.cep as string) ?? null,
    produto_vendido: (venda.produto_vendido as string) ?? null,
    observacoes_venda: (venda.observacoes_venda as string) ?? null,
    closer_nome: (venda.closer_nome as string) ?? null,
    closer_email: (venda.closer_email as string) ?? null,
    pagamentos,
    comprovantes: comprovantesSalvos,
    // COALESCE server-side: novo valor quando existir; senão preserva o já gravado.
    forma_pagamento: fin.forma_pagamento ?? existente?.forma_pagamento ?? null,
    valor_entrada: fin.valor_entrada ?? existente?.valor_entrada ?? null,
    numero_parcelas: fin.numero_parcelas ?? existente?.numero_parcelas ?? null,
    valor_parcela: fin.valor_parcela ?? existente?.valor_parcela ?? null,
    data_pagamento_entrada: dataEntradaFinal,
    updated_at: new Date().toISOString(),
  };

  // Estado do contrato no omnx-desk. Chega junto com a venda porque o CRM não tem
  // como saber sozinho que um contrato foi assinado fora do Clicksign. COALESCE em
  // todos: um envio sem contrato nunca apaga o que já estava gravado.
  const contrato = (venda.contrato ?? {}) as Record<string, unknown>;
  const contratoStatus = typeof contrato.status === 'string' ? contrato.status : null;
  const contratoLink = typeof contrato.link_assinatura === 'string' ? contrato.link_assinatura : null;
  const contratoAssinaturaData =
    typeof contrato.data_assinatura === 'string' ? contrato.data_assinatura : null;

  registro.contrato_status = contratoStatus ?? existente?.contrato_status ?? null;
  registro.op_link_do_contrato_assinado =
    contratoLink ?? existente?.op_link_do_contrato_assinado ?? null;
  registro.data_da_assinatura_do_contrato =
    contratoAssinaturaData ?? existente?.data_da_assinatura_do_contrato ?? null;
  // workspace_id explícito (§7.3): deriva do tenant/oportunidade resolvido, não só do trigger.
  if (workspaceId) registro.workspace_id = workspaceId;

  const { data, error } = await supabase
    .from('vendas_fechamento')
    .upsert(registro, { onConflict: 'oportunidade_id' })
    .select('id')
    .single();

  if (error) {
    const requestId = createRequestId();
    logSafeError('crm-registrar-venda', requestId, error);
    return json({ error: 'Não foi possível registrar a venda.', request_id: requestId }, 500);
  }

  return json({
    success: true,
    id: data?.id,
    valor_faturado: fin.valor_faturado,
    comprovantes_salvos: comprovantesSalvos.length,
  });
});
