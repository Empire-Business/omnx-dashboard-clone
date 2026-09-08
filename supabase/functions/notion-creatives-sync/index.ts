// Edge Function: notion-creatives-sync
// Description: Syncs creatives from Notion databases to Supabase
// Supports both paid (single database) and organic (multiple databases)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  resolveWorkspaceCredential,
  CredentialResolutionError,
} from "../_shared/resolve-workspace-credentials.ts";
import { requireServiceRoleCaller } from "../_shared/require-service-role.ts";

// ============================================================
// TYPES
// ============================================================

interface NotionProperty {
  id: string;
  type: string;
  [key: string]: unknown;
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
  created_time: string;
  last_edited_time: string;
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

interface SyncRequest {
  database_type: "paid" | "organic";
  request_source: "manual" | "cron";
  start_date?: string;  // YYYY-MM-DD
  end_date?: string;    // YYYY-MM-DD
  workspace_id?: string; // obrigatorio (isolamento multi-tenant)
}

interface CreativeRecord {
  notion_page_id: string;
  external_id: string | null;
  name: string | null;
  status: string | null;
  available_date: string | null;
  format: string | null;
  cta_objective: string | null;
  objective: string | null;
  social_network: string | null;
  micro_program: string | null;
  videos_folder_url: string | null;
  final_asset_url: string | null;
  post_url: string | null;
  profile: string | null;
  database_type: "paid" | "organic";
  notion_database_id: string;
  raw_properties: Record<string, unknown>;
}

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

// Fase 2/Fatia 8: NOTION_API_KEY agora e POR WORKSPACE (workspace_integration_credentials,
// provider 'notion') — nunca global. Os database IDs vem EXCLUSIVAMENTE do metadata da
// credencial (notion_database_id_paid / notion_database_id_organic): o fallback a env
// global foi removido (fail-closed multi-tenant, 2026-07-17) — sem metadata, 422.
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ============================================================
// NOTION API HELPERS
// ============================================================

async function queryNotionDatabase(
  databaseId: string,
  notionToken: string,
  startCursor?: string,
  startDate?: string,
  endDate?: string
): Promise<NotionQueryResponse> {
  const body: Record<string, unknown> = {
    page_size: 100,
  };

  if (startCursor) {
    body.start_cursor = startCursor;
  }

  // Add date filter if provided
  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {
      property: "Concluído",
      date: {},
    };

    if (startDate) {
      dateFilter.date.on_or_after = startDate;
    }
    if (endDate) {
      dateFilter.date.on_or_before = endDate;
    }

    body.filter = dateFilter;
  }

  const response = await fetch(
    `${NOTION_API_BASE}/databases/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============================================================
// PROPERTY EXTRACTORS
// ============================================================

function extractTitle(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "title") return null;
  
  const titleArray = prop.title as Array<{ plain_text: string }>;
  if (!titleArray || titleArray.length === 0) return null;
  
  return titleArray[0].plain_text || null;
}

function extractUniqueId(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "unique_id") return null;
  
  const uniqueId = prop.unique_id as { prefix?: string; number?: number };
  if (!uniqueId.number) return null;
  
  const prefix = uniqueId.prefix || "";
  return prefix ? `${prefix}-${uniqueId.number}` : `${uniqueId.number}`;
}

function extractStatus(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "status") return null;
  
  const status = prop.status as { name?: string };
  return status?.name || null;
}

function extractDate(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "date") return null;
  
  const date = prop.date as { start?: string } | null;
  if (!date?.start) return null;
  
  // Extract just the date part (YYYY-MM-DD)
  return date.start.split("T")[0];
}

function extractMultiSelectFirst(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "multi_select") return null;
  
  const multiSelect = prop.multi_select as Array<{ name: string }>;
  if (!multiSelect || multiSelect.length === 0) return null;
  
  return multiSelect[0].name || null;
}

function extractSelect(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "select") return null;
  
  const select = prop.select as { name?: string } | null;
  return select?.name || null;
}

function extractUrl(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop || prop.type !== "url") return null;

  return prop.url as string | null;
}

// Aceita tanto select quanto multi_select (retorna primeiro item)
function extractSelectOrMultiFirst(properties: Record<string, NotionProperty>, propName: string): string | null {
  const prop = properties[propName];
  if (!prop) return null;
  if (prop.type === "select") {
    const select = prop.select as { name?: string } | null;
    return select?.name || null;
  }
  if (prop.type === "multi_select") {
    const ms = prop.multi_select as Array<{ name: string }>;
    return ms && ms.length > 0 ? ms[0].name : null;
  }
  return null;
}

// ============================================================
// PAGE TO CREATIVE CONVERTER
// ============================================================

function pageToCreative(page: NotionPage, databaseType: "paid" | "organic", databaseId: string): CreativeRecord | null {
  const props = page.properties;
  
  // Extract external_id (ID field) - required
  let externalId = extractUniqueId(props, "ID");
  if (!externalId) {
    // Skip records without valid ID
    return null;
  }

  // Padroniza external_id por tipo: anúncios (paid) sempre CR-XXXX,
  // conteúdos orgânicos permanecem com o número puro.
  const isNumeric = /^\d+$/.test(externalId);
  if (databaseType === "paid" && isNumeric) {
    externalId = `CR-${externalId}`;
  } else if (databaseType === "organic" && externalId.toUpperCase().startsWith("CR-")) {
    externalId = externalId.slice(3);
  }

  return {
    notion_page_id: page.id,
    external_id: externalId,
    name: extractTitle(props, "Nome"),
    status: extractStatus(props, "Status"),
    available_date: extractDate(props, "Concluído"),
    format: extractMultiSelectFirst(props, "Formato"),
    cta_objective: extractMultiSelectFirst(props, "Objetivo CTA"),
    objective: extractSelectOrMultiFirst(props, "Objetivo"),
    social_network: extractMultiSelectFirst(props, "Rede Social"),
    micro_program: extractSelect(props, "MicroPrograma"),
    videos_folder_url: extractUrl(props, "Pasta dos videos"),
    final_asset_url: extractUrl(props, "Arquivo final"),
    post_url: extractUrl(props, "Link do Anúncio"),
    profile: extractSelect(props, "Perfil"),
    database_type: databaseType,
    notion_database_id: databaseId,
    raw_properties: props,
  };
}

// ============================================================
// SYNC LOGIC
// ============================================================

async function syncDatabase(
  supabase: ReturnType<typeof createClient>,
  notionToken: string,
  databaseId: string,
  databaseType: "paid" | "organic",
  workspaceId: string,
  runId: string,
  startDate?: string,
  endDate?: string
): Promise<{ fetched: number; inserted: number; updated: number; skipped: number }> {
  const stats = { fetched: 0, inserted: 0, updated: 0, skipped: 0 };
  let hasMore = true;
  let nextCursor: string | null = null;

  while (hasMore) {
    // Query Notion
    const response = await queryNotionDatabase(databaseId, notionToken, nextCursor || undefined, startDate, endDate);
    
    stats.fetched += response.results.length;

    // Process each page
    for (const page of response.results) {
      const creative = pageToCreative(page, databaseType, databaseId);
      
      if (!creative) {
        stats.skipped++;
        continue;
      }

      // Upsert to Supabase
      const { error } = await supabase
        .from("notion_creatives")
        .upsert({
          workspace_id: workspaceId,
          notion_page_id: creative.notion_page_id,
          external_id: creative.external_id,
          name: creative.name,
          status: creative.status,
          available_date: creative.available_date,
          format: creative.format,
          cta_objective: creative.cta_objective,
          objective: creative.objective,
          social_network: creative.social_network,
          micro_program: creative.micro_program,
          videos_folder_url: creative.videos_folder_url,
          final_asset_url: creative.final_asset_url,
          post_url: creative.post_url,
          profile: creative.profile,
          database_type: creative.database_type,
          notion_database_id: creative.notion_database_id,
          raw_properties: creative.raw_properties,
          source: 'notion',
          synced_at: new Date().toISOString(),
        }, {
          onConflict: "workspace_id,notion_page_id",
        });

      if (error) {
        console.error(`Error upserting creative ${creative.external_id}:`, error);
        stats.skipped++;
      } else {
        // Check if it was insert or update (we can't easily tell with upsert)
        stats.inserted++; // Simplified: count all as inserted
      }
    }

    hasMore = response.has_more;
    nextCursor = response.next_cursor;

    // Update run progress
    await supabase
      .from("notion_sync_runs")
      .update({
        records_fetched: stats.fetched,
        records_inserted: stats.inserted,
        records_skipped: stats.skipped,
      })
      .eq("id", runId);
  }

  return stats;
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  try {
    // Parse request body
    const body: SyncRequest = await req.json();
    const { database_type, request_source, start_date, end_date } = body;

    if (!database_type || !["paid", "organic"].includes(database_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid database_type. Must be 'paid' or 'organic'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fase 2/Fatia 8: workspace_id OBRIGATORIO (fail-closed) — fim do fallback "primeiro
    // workspace" (limit 1) que misturava criativos entre clientes.
    if (!body.workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id obrigatorio (isolamento multi-tenant)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const workspaceId = body.workspace_id;

    // Supabase (service role) + credencial Notion resolvida POR workspace (vault).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let notionToken: string;
    let credMetadata: Record<string, unknown> = {};
    try {
      const cred = await resolveWorkspaceCredential(
        supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0],
        workspaceId,
        "notion"
      );
      notionToken = cred.apiKey;
      credMetadata = cred.metadata ?? {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({ error: `Credencial Notion indisponivel para o workspace: ${msg}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Database IDs: EXCLUSIVAMENTE do metadata da credencial do workspace.
    // Sem metadata => 422 fail-closed (nunca env global).
    let databaseIds: string[] = [];
    if (database_type === "paid") {
      const fromMeta = credMetadata.notion_database_id_paid;
      if (typeof fromMeta !== "string" || !fromMeta) {
        return new Response(
          JSON.stringify({ error: "Complete o cadastro da credencial Notion desta conta: metadata notion_database_id_paid ausente." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      databaseIds = [fromMeta];
    } else {
      const fromMeta = credMetadata.notion_database_id_organic;
      if (typeof fromMeta !== "string" || !fromMeta) {
        return new Response(
          JSON.stringify({ error: "Complete o cadastro da credencial Notion desta conta: metadata notion_database_id_organic ausente." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      databaseIds = fromMeta.split(",").map(id => id.trim());
    }

    // Create sync run record
    const { data: runRecord, error: runError } = await supabase
      .from("notion_sync_runs")
      .insert({
        workspace_id: workspaceId,
        database_type,
        notion_database_id: databaseIds.join(","),
        request_source,
        start_date,
        end_date,
        status: "running",
      })
      .select("id")
      .single();

    if (runError || !runRecord) {
      throw new Error(`Failed to create sync run record: ${runError?.message}`);
    }

    const runId = runRecord.id;
    const totalStats = { fetched: 0, inserted: 0, updated: 0, skipped: 0 };

    // Sync each database
    for (const databaseId of databaseIds) {
      console.log(`Syncing database ${databaseId} (${database_type})...`);
      
      const stats = await syncDatabase(
        supabase,
        notionToken,
        databaseId,
        database_type,
        workspaceId,
        runId,
        start_date,
        end_date
      );

      totalStats.fetched += stats.fetched;
      totalStats.inserted += stats.inserted;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
    }

    // Update run record to success
    await supabase
      .from("notion_sync_runs")
      .update({
        status: "success",
        records_fetched: totalStats.fetched,
        records_inserted: totalStats.inserted,
        records_updated: totalStats.updated,
        records_skipped: totalStats.skipped,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        database_type,
        databases_synced: databaseIds.length,
        stats: totalStats,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sync error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
