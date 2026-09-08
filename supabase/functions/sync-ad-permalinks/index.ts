// Edge Function: sync-ad-permalinks
// Busca URLs públicos dos anúncios (Instagram/Facebook) via Meta Marketing API
// e salva em meta_ads_permalinks para exibição no dashboard de criativos.
//
// Endpoint Meta: GET /v21.0/?ids=<id1,id2,...>&fields=creative{permalink_url,instagram_permalink_url}
// Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
//
// Cron: diário às 05:00 UTC (02:00 BRT)
//
// Fase 2/Fatia 8: POR WORKSPACE — token Meta resolvido por workspace, insights
// filtrados por workspace_id, permalinks taggeados por workspace_id. Sem token global.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import {
  resolveWorkspaceCredential,
  CredentialResolutionError,
} from "../_shared/resolve-workspace-credentials.ts";

// ============================================================
// TYPES
// ============================================================

interface PermalinkRecord {
  ad_id: string;
  creative_code: string | null;
  instagram_permalink_url: string | null;
  permalink_url: string | null;
  fetched_at: string;
  workspace_id: string;
}

// Resposta da Meta batch API:
// { "<ad_id>": { creative: { instagram_permalink_url: "...", object_story_id: "page_id_post_id" } }, ... }
type MetaBatchResponse = Record<
  string,
  { creative?: { instagram_permalink_url?: string; object_story_id?: string } } | null
>;

// ============================================================
// CONFIG
// ============================================================

const META_API_VERSION = "v18.0"; // mesma versão usada em sync-meta-ads
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const BATCH_SIZE = 50; // limite seguro da batch API da Meta

// ============================================================
// HELPERS
// ============================================================

function extractCreativeCode(adName: string | null): string | null {
  if (!adName) return null;
  const match = adName.match(/CR-(\d+)/);
  return match ? `CR-${match[1]}` : null;
}

async function fetchPermalinks(
  adIds: string[],
  accessToken: string
): Promise<MetaBatchResponse> {
  const ids = adIds.join(",");
  // instagram_permalink_url = URL pública do post no Instagram
  // object_story_id = ID do post no Facebook (usado como fallback para construir URL)
  const fields = "creative{instagram_permalink_url,object_story_id}";
  const url = `${META_BASE_URL}/?ids=${encodeURIComponent(ids)}&fields=${fields}&access_token=${accessToken}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    const body: { request_source?: string; workspace_id?: string } = await req.json().catch(() => ({}));

    // Fase 2/Fatia 8: workspace_id OBRIGATORIO (fail-closed); token Meta POR workspace.
    if (!body.workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id obrigatorio (isolamento multi-tenant)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const workspaceId = body.workspace_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let META_ACCESS_TOKEN: string;
    try {
      const cred = await resolveWorkspaceCredential(
        supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0],
        workspaceId,
        "meta"
      );
      META_ACCESS_TOKEN = cred.apiKey;
    } catch (e) {
      const requestId = createRequestId();
      logSafeError('sync-ad-permalinks:credential', requestId, e);
      return new Response(
        JSON.stringify({ error: 'Credencial Meta indisponível para este workspace.', code: 'credential_unavailable', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. Buscar ad_ids únicos com código CR-XXX no ad_name (DO WORKSPACE) ──
    // Paginação para contornar o limite de 1000 rows do PostgREST
    const PAGE_SIZE = 1000;
    const adRows: { ad_id: string; ad_name: string }[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from("meta_ads_insights")
        .select("ad_id, ad_name")
        .eq("workspace_id", workspaceId)
        .ilike("ad_name", "%CR-%")
        .not("ad_id", "is", null)
        .order("ad_id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw new Error(`Erro ao buscar meta_ads_insights: ${error.message}`);
      if (!data || data.length === 0) break;

      adRows.push(...(data as { ad_id: string; ad_name: string }[]));
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // Deduplicar por ad_id (pode haver múltiplos dias para o mesmo ad)
    const uniqueAds = new Map<string, string>();
    for (const row of adRows) {
      if (row.ad_id && !uniqueAds.has(row.ad_id)) {
        uniqueAds.set(row.ad_id, row.ad_name ?? "");
      }
    }

    console.log(`[sync-ad-permalinks] ${uniqueAds.size} ad_ids únicos encontrados (workspace ${workspaceId}).`);

    if (uniqueAds.size === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum anúncio com CR-XXX encontrado.", fetched: 0, upserted: 0, workspace_id: workspaceId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Buscar permalinks em lotes de 50 ──────────────────────────────
    const adIdList = Array.from(uniqueAds.keys());
    const records: PermalinkRecord[] = [];
    const now = new Date().toISOString();
    let apiErrors = 0;
    const errorMessages: string[] = [];

    for (let i = 0; i < adIdList.length; i += BATCH_SIZE) {
      const batch = adIdList.slice(i, i + BATCH_SIZE);
      let batchResult: MetaBatchResponse;

      try {
        batchResult = await fetchPermalinks(batch, META_ACCESS_TOKEN);
      } catch (err) {
        const requestId = createRequestId();
        logSafeError('sync-ad-permalinks:batch', requestId, err);
        apiErrors++;
        if (errorMessages.length < 3) errorMessages.push('Não foi possível consultar parte dos anúncios.');
        continue;
      }

      for (const adId of batch) {
        const entry = batchResult[adId];
        const creative = entry?.creative;
        const adName = uniqueAds.get(adId) ?? "";

        // object_story_id formato: "<page_id>_<post_id>"
        // URL do Facebook: https://www.facebook.com/<page_id>/posts/<post_id>
        let facebookPostUrl: string | null = null;
        if (creative?.object_story_id) {
          const parts = creative.object_story_id.split("_");
          if (parts.length === 2) {
            facebookPostUrl = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
          }
        }

        records.push({
          ad_id: adId,
          creative_code: extractCreativeCode(adName),
          instagram_permalink_url: creative?.instagram_permalink_url ?? null,
          permalink_url: facebookPostUrl,
          fetched_at: now,
          workspace_id: workspaceId,
        });
      }
    }

    console.log(`[sync-ad-permalinks] ${records.length} registros prontos para upsert.`);

    // ── 3. Upsert em lotes para evitar payloads gigantes ─────────────────
    const UPSERT_BATCH = 500;
    let upserted = 0;

    for (let i = 0; i < records.length; i += UPSERT_BATCH) {
      const batch = records.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from("meta_ads_permalinks")
        .upsert(batch, { onConflict: "ad_id" });

      if (error) {
        console.error(`[sync-ad-permalinks] Erro no upsert lote ${i}:`, error);
      } else {
        upserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id: workspaceId,
        ads_found: uniqueAds.size,
        fetched: records.length,
        upserted,
        api_errors: apiErrors,
        ...(errorMessages.length > 0 && { error_samples: errorMessages }),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const requestId = createRequestId();
    logSafeError('sync-ad-permalinks', requestId, error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Não foi possível concluir a sincronização.',
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
