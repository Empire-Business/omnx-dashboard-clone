// Fase 2 (fatia 4) — extracao de tenant de um job da fila ghl_api_jobs.
//
// Modulo PURO (sem imports Deno/esm) para ser testado em Node (vitest) e
// importado pelo worker Deno. Apenas EXTRAI o tenant do job — NAO resolve
// location->workspace (isso fica no worker via RPC get_workspace_id_by_ghl_location_id,
// fatia 3) e NAO toca em credencial (isso e resolve-workspace-credentials.ts).
//
// Regra de prioridade (mais explicito primeiro):
//   1. coluna workspace_id (uuid) / location_id (text) do job
//   2. context.workspace_id / context.location_id (jsonb)
//
// Se nenhum tenant estiver disponivel => null (o worker trata como fail-closed:
// marca o job como 'dead' e envia para webhook_unresolved, NUNCA usa chave global).

export interface JobTenantInput {
  workspace_id?: string | null;
  location_id?: string | null;
  context?: Record<string, unknown> | null;
}

export interface JobTenant {
  workspaceId: string | null;
  locationId: string | null;
}

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Extrai o tenant de um job. Retorna null quando nao ha NENHUM sinal de tenant
 * (nem coluna nem context) — caso em que o worker deve falhar fechado.
 */
export function extractJobTenant(job: JobTenantInput): JobTenant | null {
  const workspaceId =
    cleanString(job.workspace_id) ?? cleanString(job.context?.workspace_id);
  const locationId =
    cleanString(job.location_id) ?? cleanString(job.context?.location_id);

  if (workspaceId === null && locationId === null) {
    return null;
  }
  return { workspaceId, locationId };
}
