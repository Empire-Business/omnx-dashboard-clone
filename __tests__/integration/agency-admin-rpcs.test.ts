/**
 * Gestao de agencia — Fase 5: suspender/reativar sub-conta (workspace)
 * docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 8, 3.6)
 *
 * O dono/admin de uma agencia consegue suspender/reativar as sub-contas
 * (agency_workspaces) dela, via as RPCs suspend_agency_workspace e
 * reactivate_agency_workspace. Provas:
 *  - NEGATIVO: staff da agencia NAO consegue suspender (42501);
 *  - NEGATIVO: admin de OUTRA agencia nao consegue suspender workspace que
 *    nao e dela (42501);
 *  - admin/owner da agencia suspende sub-conta 'active' com sucesso;
 *  - suspender de novo (ja suspensa) -> erro (guard de estado);
 *  - reactivate SEM p_confirmed=true -> erro (nao reativa automaticamente);
 *  - reactivate COM p_confirmed=true numa 'suspended' -> volta a 'active';
 *  - reactivate por quem nao e admin da agencia -> erro.
 *
 * Producao (qzesffnkqgelmtfblzkr) NUNCA e alvo: ver helpers/safe-guard.ts.
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

describe('Gestao de agencia — suspender/reativar sub-conta (Fase 5)', () => {
  let service: SupabaseClient;

  let ownerAgencyA: TestUser; // owner da agencia A
  let staffAgencyA: TestUser; // staff da agencia A (nao pode suspender)
  let ownerAgencyB: TestUser; // owner da agencia B (outra agencia)

  let wsA: TestWorkspace; // sub-conta da agencia A
  let wsB: TestWorkspace; // sub-conta da agencia B

  let agencyAId: string;
  let agencyBId: string;
  let agencyWorkspaceA: string; // id da linha em agency_workspaces (sub-conta A)
  let agencyWorkspaceB: string; // id da linha em agency_workspaces (sub-conta B)

  let ownerAClient: SupabaseClient;
  let staffAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerAgencyA = await createTestUser(service, uniqueEmail('agency-ownerA'), 'TestPassword123!');
    staffAgencyA = await createTestUser(service, uniqueEmail('agency-staffA'), 'TestPassword123!');
    ownerAgencyB = await createTestUser(service, uniqueEmail('agency-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS Agency A', ownerAgencyA.id);
    wsB = await createTestWorkspace(service, 'WS Agency B', ownerAgencyB.id);

    await addWorkspaceMember(service, wsA.id, ownerAgencyA.id, 'owner', ownerAgencyA.id);
    await addWorkspaceMember(service, wsB.id, ownerAgencyB.id, 'owner', ownerAgencyB.id);

    // Criar agencias diretamente (sem RPC de criacao ainda) via service_role.
    const { data: agencyA, error: eAgencyA } = await service
      .from('agencies')
      .insert({ name: 'Agencia A', owner_id: ownerAgencyA.id })
      .select('id')
      .single();
    if (eAgencyA) throw new Error(`Falha ao criar agencia A: ${eAgencyA.message}`);
    agencyAId = agencyA.id;

    const { data: agencyB, error: eAgencyB } = await service
      .from('agencies')
      .insert({ name: 'Agencia B', owner_id: ownerAgencyB.id })
      .select('id')
      .single();
    if (eAgencyB) throw new Error(`Falha ao criar agencia B: ${eAgencyB.message}`);
    agencyBId = agencyB.id;

    await service.from('agency_members').insert([
      { agency_id: agencyAId, user_id: ownerAgencyA.id, role: 'owner', is_active: true },
      { agency_id: agencyAId, user_id: staffAgencyA.id, role: 'staff', is_active: true },
      { agency_id: agencyBId, user_id: ownerAgencyB.id, role: 'owner', is_active: true },
    ]);

    const { data: awA, error: eAwA } = await service
      .from('agency_workspaces')
      .insert({
        agency_id: agencyAId,
        workspace_id: wsA.id,
        provisioning_mode: 'manual_byok',
        status: 'active',
      })
      .select('id')
      .single();
    if (eAwA) throw new Error(`Falha ao criar agency_workspaces A: ${eAwA.message}`);
    agencyWorkspaceA = awA.id;

    const { data: awB, error: eAwB } = await service
      .from('agency_workspaces')
      .insert({
        agency_id: agencyBId,
        workspace_id: wsB.id,
        provisioning_mode: 'manual_byok',
        status: 'active',
      })
      .select('id')
      .single();
    if (eAwB) throw new Error(`Falha ao criar agency_workspaces B: ${eAwB.message}`);
    agencyWorkspaceB = awB.id;

    ownerAClient = await getAuthenticatedClient(ownerAgencyA.email, ownerAgencyA.password);
    staffAClient = await getAuthenticatedClient(staffAgencyA.email, staffAgencyA.password);
    ownerBClient = await getAuthenticatedClient(ownerAgencyB.email, ownerAgencyB.password);
  });

  afterAll(async () => {
    await service.from('agency_workspaces').delete().in('agency_id', [agencyAId, agencyBId]);
    await service.from('agency_members').delete().in('agency_id', [agencyAId, agencyBId]);
    await service.from('agencies').delete().in('id', [agencyAId, agencyBId]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [ownerAgencyA.id, staffAgencyA.id, ownerAgencyB.id]);
  });

  it('NEGATIVO: staff da agencia NAO consegue suspender', async () => {
    const { data, error } = await staffAClient.rpc('suspend_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('NEGATIVO: admin de OUTRA agencia nao consegue suspender workspace que nao e dela', async () => {
    const { data, error } = await ownerBClient.rpc('suspend_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA, // ownerB e da agencia B, nao da A
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('admin/owner da agencia suspende uma sub-conta ativa com sucesso', async () => {
    const { error } = await ownerAClient.rpc('suspend_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
    });
    expect(error).toBeNull();

    const { data: row } = await service
      .from('agency_workspaces')
      .select('status')
      .eq('id', agencyWorkspaceA)
      .single();
    expect(row?.status).toBe('suspended');
  });

  it('suspender de novo (ja suspensa) -> erro de guard de estado', async () => {
    const { data, error } = await ownerAClient.rpc('suspend_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('reactivate SEM p_confirmed=true -> erro (nao reativa)', async () => {
    const { data, error } = await ownerAClient.rpc('reactivate_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
      p_confirmed: false,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: row } = await service
      .from('agency_workspaces')
      .select('status')
      .eq('id', agencyWorkspaceA)
      .single();
    expect(row?.status).toBe('suspended'); // continua suspensa
  });

  it('reactivate por quem nao e admin da agencia -> erro', async () => {
    const { data, error } = await staffAClient.rpc('reactivate_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
      p_confirmed: true,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('reactivate COM p_confirmed=true numa sub-conta suspensa -> volta a active', async () => {
    const { error } = await ownerAClient.rpc('reactivate_agency_workspace', {
      p_agency_workspace_id: agencyWorkspaceA,
      p_confirmed: true,
    });
    expect(error).toBeNull();

    const { data: row } = await service
      .from('agency_workspaces')
      .select('status')
      .eq('id', agencyWorkspaceA)
      .single();
    expect(row?.status).toBe('active');
  });
});
