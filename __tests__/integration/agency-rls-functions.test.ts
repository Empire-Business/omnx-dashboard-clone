/**
 * Agency RLS Functions — Fase 1 (fatia 2a) — suíte dedicada e exaustiva (seção 3.3.1)
 *
 * Testa as 3 funções de risco máximo isoladamente, antes de elas virarem policy
 * nas ~90 tabelas (fatia 2b). Cada chamada usa client autenticado (JWT real),
 * então auth.uid() dentro das funções SECURITY DEFINER é o usuário da sessão.
 *
 * Casos obrigatórios (seção 3.3.1):
 *  - admin de agência ativa => true na sub-conta da agência;
 *  - status != 'active' (suspended/pending) => false, mesmo com role='owner' e ativo;
 *  - is_active = false => false;
 *  - role fora de ('owner','admin') => false (staff);
 *  - sub-conta de outra agência => false;
 *  - múltiplas linhas (uma ativa, uma inativa) => a inativa nunca concede;
 *  - agency_workspaces com agência deletada (ON DELETE CASCADE) => false;
 *  - p_workspace_id inexistente/NULL => false;
 *  - is_agency_member / is_agency_admin: member vs admin vs staff vs inativo vs fora.
 *
 * Ref: docs/PLANO-MULTI-TENANT-AGENCY.md (seção 3.3.1)
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

interface Agency { id: string }

describe('Agency RLS functions — Fase 1 (fatia 2a, seção 3.3.1)', () => {
  let service: SupabaseClient;

  let ownerActive: TestUser;
  let ownerSuspended: TestUser;
  let ownerPending: TestUser;
  let userStaff: TestUser;
  let userInactive: TestUser;
  let userMulti: TestUser;
  let ownerGone: TestUser;
  let outsider: TestUser;

  let agencyActive: Agency;
  let agencySuspended: Agency;
  let agencyPending: Agency;
  let agencyGone: Agency;

  let wsActive: TestWorkspace;
  let wsSuspended: TestWorkspace;
  let wsPending: TestWorkspace;
  let wsGone: TestWorkspace;

  let cOwnerActive: SupabaseClient;
  let cOwnerSuspended: SupabaseClient;
  let cOwnerPending: SupabaseClient;
  let cStaff: SupabaseClient;
  let cInactive: SupabaseClient;
  let cMulti: SupabaseClient;
  let cOwnerGone: SupabaseClient;
  let cOutsider: SupabaseClient;

  const allUsers: TestUser[] = [];
  const allWorkspaces: TestWorkspace[] = [];
  const allAgencies: Agency[] = [];

  async function mkUser(local: string): Promise<TestUser> {
    const u = await createTestUser(service, uniqueEmail(local), 'TestPassword123!');
    allUsers.push(u);
    return u;
  }
  async function mkAgency(name: string, ownerId: string): Promise<Agency> {
    const { data, error } = await service.from('agencies').insert({ name, owner_id: ownerId }).select('id').single();
    if (error) throw new Error(`agency ${name}: ${error.message}`);
    const a = data as Agency; allAgencies.push(a); return a;
  }
  async function mkWs(name: string, ownerId: string): Promise<TestWorkspace> {
    const w = await createTestWorkspace(service, name, ownerId);
    allWorkspaces.push(w); return w;
  }
  async function link(agencyId: string, workspaceId: string, status: 'active' | 'suspended' | 'pending') {
    const { error } = await service.from('agency_workspaces').insert({
      agency_id: agencyId, workspace_id: workspaceId, provisioning_mode: 'manual_byok', status,
    });
    if (error) throw new Error(`link: ${error.message}`);
  }
  async function member(agencyId: string, userId: string, role: 'owner' | 'admin' | 'staff', active: boolean, invitedBy: string) {
    const { error } = await service.from('agency_members').insert({
      agency_id: agencyId, user_id: userId, role, is_active: active, invited_by: invitedBy,
    });
    if (error) throw new Error(`member: ${error.message}`);
  }

  beforeAll(async () => {
    service = getServiceClient();

    ownerActive = await mkUser('rls-owner-active');
    ownerSuspended = await mkUser('rls-owner-suspended');
    ownerPending = await mkUser('rls-owner-pending');
    userStaff = await mkUser('rls-staff');
    userInactive = await mkUser('rls-inactive');
    userMulti = await mkUser('rls-multi');
    ownerGone = await mkUser('rls-owner-gone');
    outsider = await mkUser('rls-outsider');

    agencyActive = await mkAgency('Agency Active', ownerActive.id);
    agencySuspended = await mkAgency('Agency Suspended', ownerSuspended.id);
    agencyPending = await mkAgency('Agency Pending', ownerPending.id);
    agencyGone = await mkAgency('Agency Gone', ownerGone.id);

    wsActive = await mkWs('WS Active', ownerActive.id);
    wsSuspended = await mkWs('WS Suspended', ownerSuspended.id);
    wsPending = await mkWs('WS Pending', ownerPending.id);
    wsGone = await mkWs('WS Gone', ownerGone.id);

    await link(agencyActive.id, wsActive.id, 'active');
    await link(agencySuspended.id, wsSuspended.id, 'suspended');
    await link(agencyPending.id, wsPending.id, 'pending');
    await link(agencyGone.id, wsGone.id, 'active');

    await member(agencyActive.id, ownerActive.id, 'owner', true, ownerActive.id);
    await member(agencySuspended.id, ownerSuspended.id, 'owner', true, ownerSuspended.id);
    await member(agencyPending.id, ownerPending.id, 'owner', true, ownerPending.id);
    await member(agencyActive.id, userStaff.id, 'staff', true, ownerActive.id);        // staff não é owner/admin
    await member(agencyActive.id, userInactive.id, 'admin', false, ownerActive.id);    // admin mas inativo
    await member(agencyActive.id, userMulti.id, 'owner', true, ownerActive.id);        // multi: ativo em A
    await member(agencySuspended.id, userMulti.id, 'owner', false, ownerSuspended.id); // multi: inativo em Suspended
    await member(agencyGone.id, ownerGone.id, 'owner', true, ownerGone.id);

    cOwnerActive = await getAuthenticatedClient(ownerActive.email, ownerActive.password);
    cOwnerSuspended = await getAuthenticatedClient(ownerSuspended.email, ownerSuspended.password);
    cOwnerPending = await getAuthenticatedClient(ownerPending.email, ownerPending.password);
    cStaff = await getAuthenticatedClient(userStaff.email, userStaff.password);
    cInactive = await getAuthenticatedClient(userInactive.email, userInactive.password);
    cMulti = await getAuthenticatedClient(userMulti.email, userMulti.password);
    cOwnerGone = await getAuthenticatedClient(ownerGone.email, ownerGone.password);
    cOutsider = await getAuthenticatedClient(outsider.email, outsider.password);
  });

  afterAll(async () => {
    const aIds = allAgencies.map((a) => a.id);
    const wIds = allWorkspaces.map((w) => w.id);
    await service.from('agency_workspaces').delete().in('agency_id', aIds);
    await service.from('agency_members').delete().in('agency_id', aIds);
    await service.from('agencies').delete().in('id', aIds);
    await service.from('workspaces').delete().in('id', wIds);
    await deleteTestUsers(service, allUsers.map((u) => u.id));
  });

  const canAccess = async (c: SupabaseClient, wsId: string | null): Promise<boolean | null> => {
    const { data, error } = await c.rpc('can_access_workspace_via_agency', { p_workspace_id: wsId });
    expect(error).toBeNull();
    return data as boolean | null;
  };

  it('admin de agência ativa acessa a sub-conta da agência', async () => {
    expect(await canAccess(cOwnerActive, wsActive.id)).toBe(true);
  });

  it("status 'suspended' nunca concede (mesmo owner ativo)", async () => {
    expect(await canAccess(cOwnerSuspended, wsSuspended.id)).toBe(false);
  });

  it("status 'pending' nunca concede", async () => {
    expect(await canAccess(cOwnerPending, wsPending.id)).toBe(false);
  });

  it("role 'staff' (fora de owner/admin) não concede", async () => {
    expect(await canAccess(cStaff, wsActive.id)).toBe(false);
  });

  it('membro inativo (is_active=false) não concede', async () => {
    expect(await canAccess(cInactive, wsActive.id)).toBe(false);
  });

  it('sub-conta de outra agência não concede', async () => {
    expect(await canAccess(cOwnerActive, wsSuspended.id)).toBe(false);
    expect(await canAccess(cOutsider, wsActive.id)).toBe(false);
  });

  it('múltiplas linhas: ativa concede, inativa não', async () => {
    expect(await canAccess(cMulti, wsActive.id)).toBe(true);     // linha ativa em agencyActive
    expect(await canAccess(cMulti, wsSuspended.id)).toBe(false); // linha inativa em agencySuspended
  });

  it('agência deletada (ON DELETE CASCADE) zera o acesso', async () => {
    expect(await canAccess(cOwnerGone, wsGone.id)).toBe(true); // antes de deletar
    await service.from('agencies').delete().eq('id', agencyGone.id); // CASCADE em agency_workspaces/members
    expect(await canAccess(cOwnerGone, wsGone.id)).toBe(false); // depois: sem linha em agency_workspaces
  });

  it('workspace inexistente ou NULL retorna false', async () => {
    expect(await canAccess(cOwnerActive, '00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(await canAccess(cOwnerActive, null)).toBe(false);
  });

  it('is_agency_member / is_agency_admin: owner', async () => {
    const m = await cOwnerActive.rpc('is_agency_member', { p_agency_id: agencyActive.id });
    const a = await cOwnerActive.rpc('is_agency_admin', { p_agency_id: agencyActive.id });
    expect(m.data).toBe(true);
    expect(a.data).toBe(true);
  });

  it('is_agency_member=true mas is_agency_admin=false para staff', async () => {
    const m = await cStaff.rpc('is_agency_member', { p_agency_id: agencyActive.id });
    const a = await cStaff.rpc('is_agency_admin', { p_agency_id: agencyActive.id });
    expect(m.data).toBe(true);
    expect(a.data).toBe(false);
  });

  it('is_agency_member=false para inativo e para outsider', async () => {
    const mi = await cInactive.rpc('is_agency_member', { p_agency_id: agencyActive.id });
    const mo = await cOutsider.rpc('is_agency_member', { p_agency_id: agencyActive.id });
    expect(mi.data).toBe(false);
    expect(mo.data).toBe(false);
  });
});
