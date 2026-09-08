/**
 * Tenancy Mode Classification — Fase 1 (fatia 3)
 *
 * Prova o criterio de aceite "cliente atual nao percebe mudanca" (secao 4.1,
 * item 4 do plano): com dados REAIS do banco de TESTE, um usuario com 1
 * workspace ativo e 0 participacoes em agencia e classificado como
 * 'single-tenant' pela MESMA funcao pura usada pelo app (importada de
 * eb-dash2/src/lib/tenancy-mode). Cobre tambem o caminho 'multi-tenant'
 * (membro de agencia).
 *
 * Escopo honesto: este teste valida a DECISAO (funcao pura) contra contagens
 * reais do banco. A busca assincrona `resolveTenancyMode(userId)` (workspace.ts)
 * apenas faz 2 COUNTs e delega a ela; ela nao e exercitada aqui porque o
 * harness de integracao da raiz nao resolve o alias `@` de eb-dash2/src
 * (environment `node`, sem jsdom). A regra de negocio fica provada pela funcao
 * pura (unit em eb-dash2 + aqui com dados reais).
 *
 * Ref: docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 3.4 e 4.1)
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
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTenancyModeFromCounts } from '../../eb-dash2/src/lib/tenancy-mode';

describe('Tenancy Mode Classification — Fase 1 (fatia 3)', () => {
  let service: SupabaseClient;
  let singleUser: TestUser;
  let singleWorkspace: TestWorkspace;
  let agencyUser: TestUser;
  let agencyWorkspace: TestWorkspace;
  let agencyId: string;

  beforeAll(async () => {
    service = getServiceClient();

    // Cenario single-tenant (cliente atual): 1 usuario, 1 workspace ativo, 0 agency_members.
    singleUser = await createTestUser(service, uniqueEmail('tenancy-single'), 'TestPassword123!');
    singleWorkspace = await createTestWorkspace(service, 'WS Single', singleUser.id);
    await addWorkspaceMember(service, singleWorkspace.id, singleUser.id, 'owner', singleUser.id);

    // Cenario multi-tenant: 1 usuario, 1 workspace ativo, 1 membership em agencia.
    agencyUser = await createTestUser(service, uniqueEmail('tenancy-agency'), 'TestPassword123!');
    agencyWorkspace = await createTestWorkspace(service, 'WS Agency', agencyUser.id);
    await addWorkspaceMember(service, agencyWorkspace.id, agencyUser.id, 'owner', agencyUser.id);

    const { data: a, error: eA } = await service
      .from('agencies')
      .insert({ name: 'Agency Tenancy', owner_id: agencyUser.id })
      .select('id')
      .single();
    if (eA) throw new Error(`create agency: ${eA.message}`);
    agencyId = (a as { id: string }).id;

    const { error: eM } = await service.from('agency_members').insert({
      agency_id: agencyId,
      user_id: agencyUser.id,
      role: 'owner',
      invited_by: agencyUser.id,
      is_active: true,
    });
    if (eM) throw new Error(`add agency member: ${eM.message}`);
  });

  afterAll(async () => {
    await service.from('agency_members').delete().eq('agency_id', agencyId);
    await service.from('agencies').delete().eq('id', agencyId);
    await service
      .from('workspace_members')
      .delete()
      .in('workspace_id', [singleWorkspace.id, agencyWorkspace.id]);
    await service.from('workspaces').delete().in('id', [singleWorkspace.id, agencyWorkspace.id]);
    await deleteTestUsers(service, [singleUser.id, agencyUser.id]);
  });

  async function countFor(
    userId: string
  ): Promise<{ workspaceCount: number; agencyMemberCount: number }> {
    const ws = await service
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);
    const ag = await service
      .from('agency_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);
    return { workspaceCount: ws.count ?? 0, agencyMemberCount: ag.count ?? 0 };
  }

  it("cliente atual (1 workspace, 0 agency) => 'single-tenant'", async () => {
    const counts = await countFor(singleUser.id);
    expect(counts).toEqual({ workspaceCount: 1, agencyMemberCount: 0 });
    expect(resolveTenancyModeFromCounts(counts)).toBe('single-tenant');
  });

  it("membro de agencia (1 workspace, 1 agency) => 'multi-tenant'", async () => {
    const counts = await countFor(agencyUser.id);
    expect(counts).toEqual({ workspaceCount: 1, agencyMemberCount: 1 });
    expect(resolveTenancyModeFromCounts(counts)).toBe('multi-tenant');
  });
});
