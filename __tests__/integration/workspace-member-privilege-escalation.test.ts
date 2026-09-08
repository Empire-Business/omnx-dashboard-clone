import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addWorkspaceMember,
  createTestUser,
  createTestWorkspace,
  deleteTestUsers,
  getAuthenticatedClient,
  getServiceClient,
  type TestUser,
  type TestWorkspace,
  uniqueEmail,
} from '../helpers/supabase-test-client';

describe('workspace_members privilege escalation guard', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let secondOwner: TestUser;
  let workspace: TestWorkspace;
  let secondWorkspace: TestWorkspace;
  let adminClient: SupabaseClient;
  let ownerClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('privilege-owner'), 'TestPassword123!');
    admin = await createTestUser(service, uniqueEmail('privilege-admin'), 'TestPassword123!');
    member = await createTestUser(service, uniqueEmail('privilege-member'), 'TestPassword123!');
    secondOwner = await createTestUser(service, uniqueEmail('privilege-second-owner'), 'TestPassword123!');

    workspace = await createTestWorkspace(service, 'Privilege guard workspace', owner.id);
    secondWorkspace = await createTestWorkspace(service, 'Privilege guard workspace B', secondOwner.id);

    await addWorkspaceMember(service, workspace.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, workspace.id, admin.id, 'admin', owner.id);
    await addWorkspaceMember(service, workspace.id, member.id, 'member', owner.id);
    await addWorkspaceMember(service, secondWorkspace.id, secondOwner.id, 'owner', secondOwner.id);
    await addWorkspaceMember(service, secondWorkspace.id, admin.id, 'admin', secondOwner.id);

    adminClient = await getAuthenticatedClient(admin.email, admin.password);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
  });

  afterAll(async () => {
    await service.from('workspaces').delete().in('id', [workspace.id, secondWorkspace.id]);
    await deleteTestUsers(service, [owner.id, admin.id, member.id, secondOwner.id]);
  });

  it('blocks an admin from promoting themselves to owner', async () => {
    const { error } = await adminClient
      .from('workspace_members')
      .update({ role: 'owner' })
      .eq('workspace_id', workspace.id)
      .eq('user_id', admin.id);

    expect(error).not.toBeNull();

    const { data } = await service
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace.id)
      .eq('user_id', admin.id)
      .single();
    expect(data?.role).toBe('admin');
  });

  it('blocks an admin from rebaixar or desativar the owner', async () => {
    const { error } = await adminClient
      .from('workspace_members')
      .update({ role: 'member', is_active: false })
      .eq('workspace_id', workspace.id)
      .eq('user_id', owner.id);

    expect(error).not.toBeNull();

    const { data } = await service
      .from('workspace_members')
      .select('role, is_active')
      .eq('workspace_id', workspace.id)
      .eq('user_id', owner.id)
      .single();
    expect(data).toMatchObject({ role: 'owner', is_active: true });
  });

  it('blocks an admin from moving a membership between workspaces', async () => {
    const { error } = await adminClient
      .from('workspace_members')
      .update({ workspace_id: secondWorkspace.id })
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id);

    expect(error).not.toBeNull();
  });

  it('allows an admin to change an operational field of a non-owner member', async () => {
    const { error } = await adminClient
      .from('workspace_members')
      .update({ clara_habilitado: true })
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id);

    expect(error).toBeNull();
  });

  it('blocks an owner from removing the last active owner', async () => {
    const { error } = await ownerClient
      .from('workspace_members')
      .update({ role: 'member', is_active: false })
      .eq('workspace_id', workspace.id)
      .eq('user_id', owner.id);

    expect(error).not.toBeNull();
  });
});
