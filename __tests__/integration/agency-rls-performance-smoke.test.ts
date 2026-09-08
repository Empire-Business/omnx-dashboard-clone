/**
 * Smoke test de PERFORMANCE (aproximado) da RLS aditiva de agência — Fase 1 (2c, parcial)
 *
 * ⚠️ ISTO NÃO É O "gate de performance production-like" exigido pelo plano-mãe
 * (docs/PLANO-MULTI-TENANT-AGENCY.md, seção 4.1). Aquele gate exige um projeto de
 * STAGING alimentado por um snapshot ANONIMIZADO de produção, com o volume e a
 * distribuição REAIS de dado (~4.770 oportunidades, ~78k comunicações, etc.) — dado
 * sintético uniforme não reproduz o comportamento real do planner em produção.
 *
 * O que este teste faz: semeia um volume sintético (5.000 linhas) em `contatos` no
 * banco de TESTE (fgjbmdsucruvtpywyhhf), mede a latência de uma leitura via o path
 * de membership DIRETO (workspace_members, não afetado pelo retrofit) contra o path
 * de admin de AGÊNCIA (novo, usa `can_access_workspace_via_agency`), e imprime os
 * números. Serve só como um PRIMEIRO SINAL informal (pega uma regressão óbvia antes
 * de precisar do staging de verdade) — não valida nem falha por threshold de tempo
 * (evita flakiness), só confirma corretude (mesma contagem de linhas nos dois paths)
 * e imprime a comparação para leitura humana no log do CI/terminal.
 *
 * Limitação conhecida: só testa o path de PREDICADO POR COLUNA (`contatos`,
 * `can_access_workspace_via_agency(workspace_id)`). NÃO testa o path por JOIN
 * (`oportunidades`, via `get_contact_workspace_id`) porque inserir em massa em
 * `oportunidades` dispara triggers AFTER INSERT que enfileiram efeitos (sync_opp_dates
 * etc.) — o mesmo motivo documentado em agency-data-access.test.ts para evitar
 * inserir linhas reais nessa tabela em teste. Isso fica para o staging real.
 *
 * Todo o volume sintético é apagado no afterAll (teardown determinístico).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

const SYNTHETIC_ROW_COUNT = 5000;
const BATCH_SIZE = 500;
const TIMED_RUNS = 5;

async function timeQuery(client: SupabaseClient, workspaceId: string): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < TIMED_RUNS; i++) {
    const start = performance.now();
    const { error } = await client
      .from('contatos')
      .select('id', { count: 'exact', head: false })
      .eq('workspace_id', workspaceId)
      .limit(200);
    if (error) throw new Error(`query falhou: ${error.message}`);
    samples.push(performance.now() - start);
  }
  return samples;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('Smoke de performance (aproximado) — RLS de agência sob volume sintético', () => {
  let service: SupabaseClient;
  let directMemberUser: TestUser;
  let agencyAdminUser: TestUser;
  let workspace: TestWorkspace;
  let agencyId: string;
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const contatoIds: string[] = [];

  beforeAll(async () => {
    service = getServiceClient();

    directMemberUser = await createTestUser(service, uniqueEmail('perf-direct'), 'TestPassword123!');
    agencyAdminUser = await createTestUser(service, uniqueEmail('perf-agency-admin'), 'TestPassword123!');

    workspace = await createTestWorkspace(service, 'PERF SMOKE WS', directMemberUser.id);
    await addWorkspaceMember(service, workspace.id, directMemberUser.id, 'owner', directMemberUser.id);

    const { data: agency, error: agencyError } = await service
      .from('agencies')
      .insert({ name: 'PERF SMOKE Agency', owner_id: agencyAdminUser.id })
      .select('id')
      .single();
    if (agencyError) throw new Error(`agency: ${agencyError.message}`);
    agencyId = (agency as { id: string }).id;

    await service.from('agency_workspaces').insert({
      agency_id: agencyId,
      workspace_id: workspace.id,
      provisioning_mode: 'manual_byok',
      status: 'active',
    });
    await service.from('agency_members').insert({
      agency_id: agencyId,
      user_id: agencyAdminUser.id,
      role: 'owner',
      is_active: true,
      invited_by: agencyAdminUser.id,
    });

    // Seed sintético em lotes (payload grande demais numa única chamada estoura limites do PostgREST).
    for (let batchStart = 0; batchStart < SYNTHETIC_ROW_COUNT; batchStart += BATCH_SIZE) {
      const batch = Array.from({ length: Math.min(BATCH_SIZE, SYNTHETIC_ROW_COUNT - batchStart) }, (_, i) => {
        const idx = batchStart + i;
        return {
          workspace_id: workspace.id,
          ghl_id: `perf-${run}-${idx}`,
          nome: `Contato sintético ${idx}`,
        };
      });
      const { data, error } = await service.from('contatos').insert(batch).select('id');
      if (error) throw new Error(`seed lote ${batchStart}: ${error.message}`);
      contatoIds.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
  }, 120_000);

  afterAll(async () => {
    // Apaga em lotes para não estourar limite de payload do .in() com 5000 ids.
    for (let i = 0; i < contatoIds.length; i += BATCH_SIZE) {
      const chunk = contatoIds.slice(i, i + BATCH_SIZE);
      await service.from('contatos').delete().in('id', chunk);
    }
    await service.from('agency_workspaces').delete().eq('agency_id', agencyId);
    await service.from('agency_members').delete().eq('agency_id', agencyId);
    await service.from('agencies').delete().eq('id', agencyId);
    await service.from('workspaces').delete().eq('id', workspace.id);
    await deleteTestUsers(service, [directMemberUser.id, agencyAdminUser.id]);
  }, 60_000);

  it(`seed sintético de ${SYNTHETIC_ROW_COUNT} contatos aplicado com sucesso`, () => {
    expect(contatoIds.length).toBe(SYNTHETIC_ROW_COUNT);
  });

  it('path DIRETO (workspace_members) e path de AGÊNCIA (via_agency) retornam a mesma correção, latência aproximada impressa no log', async () => {
    const directClient = await getAuthenticatedClient(directMemberUser.email, directMemberUser.password);
    const agencyClient = await getAuthenticatedClient(agencyAdminUser.email, agencyAdminUser.password);

    const directSamples = await timeQuery(directClient, workspace.id);
    const agencySamples = await timeQuery(agencyClient, workspace.id);

    const directMedian = median(directSamples);
    const agencyMedian = median(agencySamples);

    // eslint-disable-next-line no-console
    console.log(
      `[perf-smoke] ${SYNTHETIC_ROW_COUNT} contatos — path direto (mediana): ${directMedian.toFixed(1)}ms | ` +
      `path via agência (mediana): ${agencyMedian.toFixed(1)}ms | ` +
      `delta: ${(agencyMedian - directMedian).toFixed(1)}ms`
    );

    // Correção, não performance: ambos os paths devem enxergar as mesmas 200 linhas
    // (LIMIT), confirmando que o retrofit não quebrou o acesso legítimo.
    const { data: directRows, error: eDirect } = await directClient
      .from('contatos').select('id').eq('workspace_id', workspace.id).limit(200);
    const { data: agencyRows, error: eAgency } = await agencyClient
      .from('contatos').select('id').eq('workspace_id', workspace.id).limit(200);

    expect(eDirect).toBeNull();
    expect(eAgency).toBeNull();
    expect(directRows?.length).toBe(200);
    expect(agencyRows?.length).toBe(200);
  }, 60_000);
});
