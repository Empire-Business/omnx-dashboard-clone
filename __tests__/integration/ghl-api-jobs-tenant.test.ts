/**
 * Fila ghl_api_jobs com tenant explicito — Fase 2 (fatia 4)
 *
 * Prova a base que o worker (Deno) usa para resolver credencial POR JOB:
 *  - as colunas workspace_id/location_id existem e persistem;
 *  - extractJobTenant sobre uma LINHA REAL da fila devolve o tenant certo;
 *  - location_id (sem workspace_id) resolve workspace via RPC (encadeamento que o
 *    worker faz antes de buscar a credencial);
 *  - job orfao (sem tenant) e detectado (extractJobTenant === null) => o worker
 *    marca 'dead' + dead-letter, NUNCA chave global.
 *
 * Lacuna honesta: o teste "2 jobs de tenants distintos usam chaves distintas
 * (mock da API GHL captura o Authorization)" exige rodar o WORKER Deno com
 * secrets reais no Vault e fetch mockado — nao roda em Node/vitest (import esm.sh
 * + Vault sem driver pg). Esse caminho e validado em STAGING (worker real) e a
 * decifracao ja foi provada na Fatia 0 (psql). Aqui cobrimos a REGRA de
 * resolucao de tenant por job contra o banco real, que e a parte que decide
 * QUAL chave sera usada.
 *
 * Ref: docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 4).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import { extractJobTenant } from '../../supabase/functions/_shared/job-tenant';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOC_A = 'LOC-F4-A';
const LOC_NONE = 'LOC-F4-NONE';

interface JobRow {
  id: number;
  workspace_id: string | null;
  location_id: string | null;
  context: Record<string, unknown> | null;
}

describe('ghl_api_jobs tenant — Fase 2 (fatia 4)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let wsA: TestWorkspace;
  const createdJobIds: number[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('f4-owner'), 'TestPassword123!');
    wsA = await createTestWorkspace(service, 'WS F4 A', owner.id);
    await addWorkspaceMember(service, wsA.id, owner.id, 'owner', owner.id);

    const { error } = await service.from('ghl_integration_settings').insert({
      workspace_id: wsA.id,
      ghl_location_id: LOC_A,
      is_active: true,
    });
    if (error) throw new Error(`seed ghl_integration_settings: ${error.message}`);
  });

  afterAll(async () => {
    if (createdJobIds.length > 0) {
      await service.from('ghl_api_jobs').delete().in('id', createdJobIds);
    }
    await service.from('ghl_integration_settings').delete().eq('workspace_id', wsA.id);
    await service.from('workspace_members').delete().eq('workspace_id', wsA.id);
    await service.from('workspaces').delete().eq('id', wsA.id);
    await deleteTestUsers(service, [owner.id]);
  });

  async function insertJob(fields: {
    workspace_id?: string | null;
    location_id?: string | null;
    context?: Record<string, unknown>;
  }): Promise<JobRow> {
    const { data, error } = await service
      .from('ghl_api_jobs')
      .insert({
        url: 'https://services.leadconnectorhq.com/test',
        method: 'GET',
        status: 'pending',
        caller: 'f4-test',
        ...fields,
      })
      .select('id, workspace_id, location_id, context')
      .single();
    if (error) throw new Error(`insert job: ${error.message}`);
    createdJobIds.push((data as JobRow).id);
    return data as JobRow;
  }

  it('job com workspace_id na coluna => tenant resolvido na linha real', async () => {
    const job = await insertJob({ workspace_id: wsA.id, location_id: LOC_A, context: {} });
    const t = extractJobTenant(job);
    expect(t?.workspaceId).toBe(wsA.id);
    expect(t?.locationId).toBe(LOC_A);
  });

  it('job so com context.location_id => RPC resolve o workspace (encadeamento do worker)', async () => {
    const job = await insertJob({ context: { location_id: LOC_A } });
    const t = extractJobTenant(job);
    expect(t?.workspaceId).toBeNull();
    expect(t?.locationId).toBe(LOC_A);

    // o worker, nesse caso, chama get_workspace_id_by_ghl_location_id(locationId):
    const { data, error } = await service.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: t?.locationId,
    });
    expect(error).toBeNull();
    expect(data).toBe(wsA.id);
  });

  it('job orfao (sem tenant em coluna nem context) => extractJobTenant null (fail-closed)', async () => {
    const job = await insertJob({ context: { foo: 'bar' } });
    expect(extractJobTenant(job)).toBeNull();
  });

  it('job com location_id inexistente => RPC retorna null (no_match => dead + dead-letter)', async () => {
    const job = await insertJob({ context: { location_id: LOC_NONE } });
    const t = extractJobTenant(job);
    expect(t?.workspaceId).toBeNull();

    const { data, error } = await service.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: LOC_NONE,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
