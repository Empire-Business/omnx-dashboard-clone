/**
 * Agency Isolation Tests — Fase 1 (fundação do modelo de dados)
 *
 * Prova que as tabelas novas de agência (agencies, agency_members,
 * agency_workspaces) isolam dados entre agências distintas via RLS:
 *  - owner de agência A só vê a própria agência, seus membros e suas sub-contas;
 *  - owner de agência A NÃO vê agência B, membros de B nem sub-contas de B;
 *  - membro inativo (is_active = false) não vê nada;
 *  - service_role enxerga tudo (caminho das edge functions/RPCs).
 *
 * Escopo (decisão do dono — plano COMPLETO, sem corte de MVP): esta suíte cobre
 * apenas o isolamento da camada de agência (tabelas novas). A RLS aditiva
 * (can_access_workspace_via_agency + retrofit nas ~90 tabelas) é entregue em
 * fatia separada da Fase 1, com suíte dedicada (seção 3.3.1) e gate de
 * performance; o isolamento de dados de sub-conta continua coberto por
 * workspace-isolation.test.ts.
 *
 * Ref: docs/PLANO-MULTI-TENANT-AGENCY.md (seções 3.2, 3.3)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface TestAgency { id: string; name: string; owner_id: string }

describe('Agency Isolation — Fase 1 (fundação)', () => {
  let service: SupabaseClient;

  let ownerA: TestUser;
  let ownerB: TestUser;
  let staffInactive: TestUser;

  let agencyA: TestAgency;
  let agencyB: TestAgency;
  let workspaceA: TestWorkspace;
  let workspaceB: TestWorkspace;

  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientInactive: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('agency-owner-a'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('agency-owner-b'), 'TestPassword123!');
    staffInactive = await createTestUser(service, uniqueEmail('agency-staff-inactive'), 'TestPassword123!');

    // Agências (escrita via service_role — sem policy de INSERT para authenticated no MVP)
    const { data: aA, error: eA } = await service
      .from('agencies').insert({ name: 'Agency A - Iso', owner_id: ownerA.id })
      .select('id, name, owner_id').single();
    if (eA) throw new Error(`create agency A: ${eA.message}`);
    agencyA = aA as TestAgency;

    const { data: aB, error: eB } = await service
      .from('agencies').insert({ name: 'Agency B - Iso', owner_id: ownerB.id })
      .select('id, name, owner_id').single();
    if (eB) throw new Error(`create agency B: ${eB.message}`);
    agencyB = aB as TestAgency;

    // Membros: ownerA em A (owner), ownerB em B (owner), staffInactive em A (inativo)
    const members = [
      { agency_id: agencyA.id, user_id: ownerA.id, role: 'owner', invited_by: ownerA.id, is_active: true },
      { agency_id: agencyB.id, user_id: ownerB.id, role: 'owner', invited_by: ownerB.id, is_active: true },
      { agency_id: agencyA.id, user_id: staffInactive.id, role: 'staff', invited_by: ownerA.id, is_active: false },
    ];
    const { error: eM } = await service.from('agency_members').insert(members);
    if (eM) throw new Error(`add agency members: ${eM.message}`);

    // Sub-contas ligadas a cada agência
    workspaceA = await createTestWorkspace(service, 'Workspace de A', ownerA.id);
    workspaceB = await createTestWorkspace(service, 'Workspace de B', ownerB.id);
    const { error: eW } = await service.from('agency_workspaces').insert([
      { agency_id: agencyA.id, workspace_id: workspaceA.id, provisioning_mode: 'manual_byok', status: 'active' },
      { agency_id: agencyB.id, workspace_id: workspaceB.id, provisioning_mode: 'manual_byok', status: 'active' },
    ]);
    if (eW) throw new Error(`link agency_workspaces: ${eW.message}`);

    clientA = await getAuthenticatedClient(ownerA.email, ownerA.password);
    clientB = await getAuthenticatedClient(ownerB.email, ownerB.password);
    clientInactive = await getAuthenticatedClient(staffInactive.email, staffInactive.password);
  });

  afterAll(async () => {
    await service.from('agency_workspaces').delete().in('agency_id', [agencyA.id, agencyB.id]);
    await service.from('agency_members').delete().in('agency_id', [agencyA.id, agencyB.id]);
    await service.from('agencies').delete().in('id', [agencyA.id, agencyB.id]);
    await service.from('workspaces').delete().in('id', [workspaceA.id, workspaceB.id]);
    await deleteTestUsers(service, [ownerA.id, ownerB.id, staffInactive.id]);
  });

  it('owner A vê apenas a própria agência', async () => {
    const { data, error } = await clientA.from('agencies').select('id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(agencyA.id);
    expect(ids).not.toContain(agencyB.id);
    expect(ids.length).toBe(1);
  });

  it('owner B vê apenas a própria agência', async () => {
    const { data, error } = await clientB.from('agencies').select('id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(agencyB.id);
    expect(ids).not.toContain(agencyA.id);
    expect(ids.length).toBe(1);
  });

  it('owner A não vê membros da agência B', async () => {
    const { data, error } = await clientA.from('agency_members').select('agency_id, user_id');
    expect(error).toBeNull();
    const agencyIds = (data ?? []).map((r: { agency_id: string }) => r.agency_id);
    const userIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
    expect(agencyIds).not.toContain(agencyB.id);
    expect(userIds).not.toContain(ownerB.id);
  });

  it('owner A vê sub-conta de A e não vê sub-conta de B', async () => {
    const { data, error } = await clientA.from('agency_workspaces').select('agency_id, workspace_id');
    expect(error).toBeNull();
    const wsIds = (data ?? []).map((r: { workspace_id: string }) => r.workspace_id);
    const agencyIds = (data ?? []).map((r: { agency_id: string }) => r.agency_id);
    expect(wsIds).toContain(workspaceA.id);
    expect(wsIds).not.toContain(workspaceB.id);
    expect(agencyIds).not.toContain(agencyB.id);
  });

  it('membro inativo (is_active=false) não vê a agência', async () => {
    const { data, error } = await clientInactive.from('agencies').select('id');
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it('service_role enxerga todas as agências (caminho de RPC/edge)', async () => {
    const { data, error } = await service.from('agencies').select('id').in('id', [agencyA.id, agencyB.id]);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(2);
  });

  it('UNIQUE(workspace_id) impede sub-conta em duas agências', async () => {
    const { error } = await service.from('agency_workspaces').insert({
      agency_id: agencyB.id,
      workspace_id: workspaceA.id, // já pertence a agencyA
      provisioning_mode: 'manual_byok',
      status: 'active',
    });
    expect(error).not.toBeNull();
  });
});
