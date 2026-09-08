import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-webhook-secret, authorization, content-type',
};

function tsMs(ms: number | undefined | null): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function parseCompra(body: any): Record<string, unknown> {
  const data       = body?.data ?? {};
  const purchase   = data.purchase ?? {};
  const buyer      = data.buyer ?? {};
  const product    = data.product ?? {};
  const offer      = purchase.offer ?? {};
  const payment    = purchase.payment ?? {};
  const price      = purchase.price ?? {};
  const fullPrice  = purchase.full_price ?? {};
  const origPrice  = purchase.original_offer_price ?? {};
  const address    = buyer.address ?? {};
  const tickets    = purchase.event_tickets ?? {};
  const affiliates: any[] = data.affiliates ?? [];
  const commissions: any[] = data.commissions ?? [];

  const comissaoProdutor    = commissions.find((c) => c.source === 'PRODUCER')?.value ?? null;
  const comissaoMarketplace = commissions.find((c) => c.source === 'MARKETPLACE')?.value ?? null;

  return {
    hotmart_event_id:      body?.id ?? null,
    transacao_id:          purchase.transaction ?? null,
    evento_tipo:           body?.event ?? null,
    data_evento:           tsMs(body?.creation_date),

    comprador_nome:        buyer.first_name ?? null,
    comprador_sobrenome:   buyer.last_name ?? null,
    comprador_email:       buyer.email ?? null,
    comprador_telefone:    buyer.checkout_phone ?? null,
    comprador_documento:   buyer.document || null,
    comprador_pais:        address.country ?? null,
    comprador_cidade:      address.city || null,
    comprador_cep:         address.zipcode || null,

    produto_id:            product.id ?? null,
    produto_ucode:         product.ucode ?? null,
    produto_nome:          product.name ?? null,

    oferta_codigo:         offer.code ?? null,
    oferta_nome:           offer.name ?? null,

    valor:                 price.value ?? null,
    valor_total:           fullPrice.value ?? null,
    valor_oferta_original: origPrice.value ?? null,
    moeda:                 price.currency_value ?? 'BRL',
    forma_pagamento:       payment.type ?? null,
    parcelas:              payment.installments_number ?? 1,
    comissao_produtor:     comissaoProdutor,
    comissao_marketplace:  comissaoMarketplace,

    quantidade_ingressos:  tickets.amount ?? 1,
    status:                purchase.status ?? null,

    data_pedido:           tsMs(purchase.order_date),
    data_aprovacao:        tsMs(purchase.approved_date),

    afiliado_nome:         affiliates[0]?.name || null,
    afiliado_codigo:       affiliates[0]?.affiliate_code || null,

    pais_compra:           purchase.checkout_country?.iso ?? null,
    modelo_negocio:        purchase.business_model ?? null,

    payload: body,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Auth obrigatória — fail-closed: se o secret não estiver configurado, bloqueia tudo.
  if (!WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Webhook secret not configured on server' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const secret = req.headers.get('x-webhook-secret');
  const auth   = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (secret !== WEBHOOK_SECRET && bearer !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const compra = parseCompra(body);
  console.log('Compra recebida:', compra.transacao_id, compra.status);

  const { data, error } = await supabase
    .from('maquina_de_conteudo')
    .upsert(compra, { onConflict: 'transacao_id', ignoreDuplicates: false })
    .select('id')
    .single();

  if (error) {
    const requestId = createRequestId();
    logSafeError('webhook-compras', requestId, error);
    return new Response(JSON.stringify({ error: 'Não foi possível processar a compra.', request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, id: data?.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
