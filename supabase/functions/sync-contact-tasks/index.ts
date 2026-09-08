// Edge Function: sync-contact-tasks
//
// Sincroniza tasks pendentes do GHL para a tabela ghl_tasks.
// Foco: contatos ativos nos pipelines de discagem (Pré-Vendas MQL, Auto Agendamento).
// Roda a cada 15 min via pg_cron para capturar tasks criadas antes do webhook.
//
// Fase 2 (isolamento de credenciais por workspace): a chave GHL nao e mais global.
// Cada contato pertence a um location (GHL) -> workspace (via RPC segura da fatia 3)
// -> credencial (via helper da fatia 2). A chave e resolvida POR CONTATO (por item),
// porque contatos de tenants distintos podem aparecer no mesmo lote. Sem tenant ou
// sem credencial => FailClosedError (terminal, NUNCA chave global).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Fase 2: header montado por chamada com a chave do tenant dono do contato.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const PIPELINE_DISCAGEM = ['Pré-Vendas MQL', 'Auto Agendamento'];
const BATCH_SIZE = 20;
const DELAY_MS   = 150;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Fase 2: erro de fail-closed (sem tenant ou sem credencial). E TERMINAL: sem
// location_id/workspace/chave nao ha como sincronizar o contato — nao adianta
// retry. O catch por item contabiliza como erro e segue (esta funcao nao tem
// fila com status 'pending'; cada execucao re-busca os contatos ativos).
class FailClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailClosedError';
  }
}

// Resolve a chave GHL do workspace dono do location_id de um contato (por item).
//   1. location_id -> workspace via RPC segura da fatia 3 (NULL = sem match, sem
//      fallback "mais antigo").
//   2. credencial do workspace via helper da fatia 2 (Vault + cache).
// Qualquer falha => FailClosedError (NUNCA cai em chave global).
async function resolveGhlApiKeyForLocation(
  supabase: SupabaseClient<any, 'public', any>,
  locationId: string | null | undefined,
  contatoGhlId: string,
): Promise<string> {
  const loc = typeof locationId === 'string' ? locationId.trim() : '';
  if (!loc) {
    throw new FailClosedError(
      `contato ${contatoGhlId} sem location_id — nao resolve workspace (sem fallback global)`,
    );
  }

  const { data: workspaceId, error: rpcErr } = await supabase.rpc(
    'get_workspace_id_by_ghl_location_id',
    { p_location_id: loc },
  );
  if (rpcErr || !workspaceId) {
    throw new FailClosedError(
      `location_id '${loc}' (contato ${contatoGhlId}) nao resolve workspace${rpcErr ? ': ' + rpcErr.message : ''}`,
    );
  }

  try {
    const creds = await resolveGhlCredentials(supabase as unknown as SupabaseClient, workspaceId as string);
    return creds.apiKey;
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err));
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId} (contato ${contatoGhlId}): ${msg}`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // 1. Busca contatos ativos nos pipelines de discagem (com location_id do tenant)
    const { data: opps, error: oppsErr } = await supabase
      .from('oportunidades')
      .select('contato_id, contatos(id, ghl_id, location_id)')
      .eq('status', 'open')
      .in('pipeline_name', PIPELINE_DISCAGEM);

    if (oppsErr) throw oppsErr;

    // Deduplica por contato_id (um contato pode ter N oportunidades)
    const seen = new Set<string>();
    const contatos: { contatoId: string; ghlId: string; locationId: string | null }[] = [];
    for (const o of opps ?? []) {
      const c = o.contatos as { id: string; ghl_id: string | null; location_id: string | null } | null;
      if (!c?.ghl_id || seen.has(c.id)) continue;
      seen.add(c.id);
      contatos.push({ contatoId: c.id, ghlId: c.ghl_id, locationId: c.location_id ?? null });
    }

    console.log(`[sync-contact-tasks] ${contatos.length} contatos ativos para sincronizar`);

    let synced = 0;
    let errors = 0;

    // 2. Processa em batches para não estourar rate limit do GHL
    for (let i = 0; i < contatos.length; i += BATCH_SIZE) {
      const batch = contatos.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async ({ contatoId, ghlId, locationId }) => {
        try {
          // Fase 2: chave do tenant dono do contato (por item). Fail-closed se
          // nao resolver — sem chave global.
          const apiKey = await resolveGhlApiKeyForLocation(supabase, locationId, ghlId);

          const res = await fetch(`${GHL_API_BASE}/contacts/${ghlId}/tasks`, {
            headers: buildGhlHeaders(apiKey),
          });

          if (!res.ok) {
            console.warn(`[sync-contact-tasks] GHL ${ghlId}: ${res.status}`);
            errors++;
            return;
          }

          const data = await res.json();
          const tasks: Record<string, unknown>[] = data.tasks ?? [];

          // Filtra apenas tasks pendentes
          const pendentes = tasks.filter(t => !t.completed && !t.isDeleted);

          for (const t of pendentes) {
            let dueDate: string | null = null;
            try {
              if (t.dueDate) dueDate = new Date(t.dueDate as string).toISOString();
            } catch { /* ignora datas inválidas */ }

            await supabase.from('ghl_tasks').upsert({
              ghl_task_id:        String(t.id ?? t.taskId ?? ''),
              contact_ghl_id:     ghlId,
              contato_id:         contatoId,
              title:              (t.title as string) ?? null,
              due_date:           dueDate,
              completed:          false,
              deleted:            false,
              assigned_to_ghl_id: (t.assignedTo as string) ?? null,
              task_type:          (t.taskType as string) ?? 'Call',
              updated_at:         new Date().toISOString(),
            }, { onConflict: 'ghl_task_id', ignoreDuplicates: false });
          }

          synced++;
        } catch (err) {
          // Fail-closed (sem tenant/credencial) e TERMINAL: contabiliza como erro
          // sem retry (esta funcao nao tem fila 'pending'; proximo tick re-busca).
          const isFailClosed = err instanceof FailClosedError;
          const msg = err instanceof Error ? err.message : String(err);
          if (isFailClosed) {
            console.error(`[sync-contact-tasks] FAIL-CLOSED contato ${ghlId} (terminal): ${msg}`);
          } else {
            console.error(`[sync-contact-tasks] Erro no contato ${ghlId}:`, err);
          }
          errors++;
        }
      }));

      if (i + BATCH_SIZE < contatos.length) await sleep(DELAY_MS);
    }

    console.log(`[sync-contact-tasks] Concluído: ${synced} ok, ${errors} erros`);

    return new Response(
      JSON.stringify({ ok: true, total: contatos.length, synced, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-contact-tasks] Erro fatal:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
