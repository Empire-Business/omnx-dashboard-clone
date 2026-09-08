// Edge Function: Recebe webhooks do GHL e salva json bruto.
//
// Fase 2 (fatia 6) — autenticacao POR WORKSPACE (manual_byok):
//   - Antes: um WEBHOOK_SECRET global autenticava TODOS os tenants (anti-pattern).
//   - Agora: extrai locationId do payload ANTES de autenticar -> busca o
//     webhook_secret do workspace em ghl_integration_settings (por location_id,
//     is_active) -> compara em tempo constante. Sem match / sem secret / secret
//     errado => 401 + linha em webhook_unresolved (dead-letter, nunca descarte).
//   - O cliente atual (1 workspace com location_id configurado e eventos com
//     locationId) segue passando. Eventos sem locationId => 401 + dead-letter
//     (reprocessavel pela secao 10.4 do plano).
//
// Resposta segue 202 imediato (GHL tem timeout curto); processamento via waitUntil.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { extractLocationId, secretsEqual } from '../_shared/webhook-ghl-auth.ts';
import { checkContractShape, buildContractWarnings } from '../_shared/webhook-ghl-contract.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-webhook-secret, authorization, content-type',
};

type RejectReason = 'missing_location' | 'no_match' | 'no_secret' | 'auth_failed';

async function reject(
  sb: SupabaseClient | null,
  reason: RejectReason,
  locationId: string | null,
  payload: unknown,
): Promise<Response> {
  // Dead-letter sincrono (1 insert) para NUNCA perder o evento. Se nao houver
  // client (env faltando) ou o insert falhar, seguimos com 401 mesmo assim.
  if (sb) {
    try {
      await sb.from('webhook_unresolved').insert({
        source: 'webhook-ghl',
        location_id: locationId,
        reason,
        payload: payload ?? null,
      });
    } catch (e) {
      console.error('[webhook-ghl] falha ao gravar dead-letter:', e instanceof Error ? e.message : String(e));
    }
  }
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function providedSecret(req: Request): string | null {
  const xSecret = req.headers.get('x-webhook-secret');
  if (xSecret) return xSecret;
  const auth = req.headers.get('Authorization');
  if (auth) {
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) return parts[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 1. Parse do payload ANTES de autenticar (locationId vem do body).
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // 2. Extrai locationId; sem ele nao ha como saber o tenant => 401 + dead-letter.
  const locationId = extractLocationId(payload);
  if (!locationId) {
    return reject(supabase, 'missing_location', null, payload);
  }

  // 3. Busca o webhook_secret do workspace dono deste location_id (ativo).
  const { data: settings, error: settingsErr } = await supabase
    .from('ghl_integration_settings')
    .select('workspace_id, webhook_secret')
    .eq('ghl_location_id', locationId)
    .eq('is_active', true)
    .maybeSingle();

  if (settingsErr || !settings) {
    return reject(supabase, 'no_match', locationId, payload);
  }

  const typedSettings = settings as { workspace_id: string; webhook_secret: string | null };
  const expectedSecret = typedSettings.webhook_secret;
  if (!expectedSecret) {
    return reject(supabase, 'no_secret', locationId, payload);
  }

  // 4. Compara o secret informado com o do workspace (tempo constante).
  const given = providedSecret(req);
  if (!secretsEqual(given, expectedSecret)) {
    return reject(supabase, 'auth_failed', locationId, payload);
  }

  // 4.5. Checagem de FORMATO contra o contrato (docs/CONTRATO-WEBHOOK-CRM.md).
  //      Nunca bloqueia nem descarta o evento — so gera aviso na resposta
  //      (para quem estiver testando o payload via curl) e, de forma
  //      assincrona, um registro em webhook_contract_mismatches para o dono
  //      acompanhar (vigilancia). Nenhum detalhe tecnico interno vaza aqui.
  const shape = checkContractShape(payload);
  const contractWarnings = buildContractWarnings(shape);

  // 5. Autenticado: processa de forma assincrona (responde 202 rapido).
  const process = async () => {
    const { data, error } = await supabase
      .from('webhooks_ghl')
      .insert({ payload, location_id: locationId })
      .select('id')
      .single();

    if (error) {
      console.error('[webhook-ghl] insert error:', error.message);
      return;
    }

    if (shape.missingIdentifiers.length > 0 || shape.unknownCustomDataKeys.length > 0) {
      try {
        await supabase.from('webhook_contract_mismatches').insert({
          workspace_id: typedSettings.workspace_id,
          location_id: locationId,
          webhook_ghl_id: data.id,
          missing_identifiers: shape.missingIdentifiers,
          unknown_customdata_keys: shape.unknownCustomDataKeys,
        });
      } catch (e) {
        console.error('[webhook-ghl] falha ao gravar contract mismatch:', e instanceof Error ? e.message : String(e));
      }
    }

    // Dispara sync de comunicações se for evento de mensagem/ligação
    const isMessageEvent =
      payload?.conversationId ||
      payload?.type === 'InboundMessage' ||
      payload?.type === 'OutboundMessage';

    if (isMessageEvent) {
      const contactId = payload?.contactId as string | undefined;
      const syncBody = contactId
        ? { mode: 'backfill_by_contact', contactId, batch_size: 1, location_id: locationId }
        : { mode: 'incremental', location_id: locationId };

      fetch(
        `${SUPABASE_URL}/functions/v1/sync-ghl-conversations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify(syncBody),
        }
      ).catch(() => {});

    }

    // ── WEBHOOK DE WORKFLOW (Customer Replied) ──
    const isWorkflowWebhook = !payload?.type && !payload?.conversationId && payload?.id;
    if (isWorkflowWebhook) {
      const ghlContactId = String(payload.id);

      const { data: contatoRow } = await supabase
        .from('contatos')
        .select('id')
        .eq('ghl_id', ghlContactId)
        .maybeSingle();

      const contatoInternalId = contatoRow?.id as string | undefined;

      if (contatoInternalId) {
        fetch(`${SUPABASE_URL}/functions/v1/sync-ghl-conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
          body: JSON.stringify({ mode: 'incremental', contactId: ghlContactId, location_id: locationId }),
        }).catch(() => {});

        console.log(`[webhook-ghl] workflow-trigger: contact=${ghlContactId} → sync disparado`);
      }
    }

    console.log('[webhook-ghl] saved:', data.id);
  };

  // @ts-ignore — EdgeRuntime disponível no ambiente Supabase
  EdgeRuntime.waitUntil(process());

  const responseBody: Record<string, unknown> = { received: true };
  if (contractWarnings.length > 0) {
    responseBody.warnings = contractWarnings;
  }

  return new Response(JSON.stringify(responseBody), {
    status: 202,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
