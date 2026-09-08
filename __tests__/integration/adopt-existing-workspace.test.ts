import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addWorkspaceMember,
  createTestUser,
  createTestWorkspace,
  deleteTestUsers,
  getServiceClient,
  type TestUser,
  type TestWorkspace,
  uniqueEmail,
} from '../helpers/supabase-test-client';

function stableManifest(manifest: Record<string, unknown>) {
  const { _generated_at, ...stableFields } = manifest;
  return stableFields;
}

describe('adoção reversível do workspace existente', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let workspace: TestWorkspace;
  let agencyId: string;
  const legacyCredentialSecretId = randomUUID();
  const workspaceName = 'Workspace legado para adoção';

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('legacy-adoption-owner'), 'TestPassword123!');
    workspace = await createTestWorkspace(service, workspaceName, owner.id);
    await addWorkspaceMember(service, workspace.id, owner.id, 'owner', owner.id);

    const { error: credentialError } = await service
      .from('workspace_integration_credentials')
      .insert({
        workspace_id: workspace.id,
        provider: 'ghl',
        secret_key_id: legacyCredentialSecretId,
        metadata: { location_id: 'LOC-LEGACY-ADOPTION-TEST' },
      });
    if (credentialError) throw new Error(`seed legacy credential: ${credentialError.message}`);

    const { data, error } = await service
      .from('agencies')
      .insert({ name: `Agência adoção ${Date.now()}`, owner_id: owner.id })
      .select('id')
      .single();
    if (error || !data) throw new Error(`seed agency: ${error?.message}`);
    agencyId = data.id;
  });

  afterAll(async () => {
    if (agencyId) await service.from('agencies').delete().eq('id', agencyId);
    if (workspace?.id) {
      await service
        .from('workspace_integration_credentials')
        .delete()
        .eq('workspace_id', workspace.id);
    }
    if (workspace?.id) await service.from('workspaces').delete().eq('id', workspace.id);
    if (owner?.id) await deleteTestUsers(service, [owner.id]);
  });

  it('exige confirmação exata do nome antes de criar vínculo', async () => {
    const { error } = await service.rpc('adopt_existing_workspace_service_role', {
      p_agency_id: agencyId,
      p_workspace_id: workspace.id,
      p_confirmation_name: 'nome incorreto',
      p_ghl_location_id: null,
    });
    expect(error).not.toBeNull();

    const { data } = await service
      .from('agency_workspaces')
      .select('id')
      .eq('workspace_id', workspace.id);
    expect(data).toEqual([]);
  });

  it('cria somente o vínculo legado e é idempotente', async () => {
    const before = await service.rpc('export_workspace_data_manifest', {
      p_workspace_id: workspace.id,
    });
    expect(before.error).toBeNull();

    const payload = {
      p_agency_id: agencyId,
      p_workspace_id: workspace.id,
      p_confirmation_name: workspaceName,
      p_ghl_location_id: null,
    };
    const first = await service.rpc('adopt_existing_workspace_service_role', payload);
    const second = await service.rpc('adopt_existing_workspace_service_role', payload);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const after = await service.rpc('export_workspace_data_manifest', {
      p_workspace_id: workspace.id,
    });
    expect(after.error).toBeNull();
    expect(stableManifest(after.data as Record<string, unknown>)).toEqual(
      stableManifest(before.data as Record<string, unknown>),
    );

    const { data: legacyCredential, error: legacyCredentialError } = await service
      .from('workspace_integration_credentials')
      .select('workspace_id, provider, secret_key_id')
      .eq('workspace_id', workspace.id)
      .eq('provider', 'ghl')
      .single();
    expect(legacyCredentialError).toBeNull();
    expect(legacyCredential).toMatchObject({
      workspace_id: workspace.id,
      provider: 'ghl',
      secret_key_id: legacyCredentialSecretId,
    });

    const { data: link } = await service
      .from('agency_workspaces')
      .select('agency_id, workspace_id, provisioning_mode, status')
      .eq('workspace_id', workspace.id)
      .single();
    expect(link).toMatchObject({
      agency_id: agencyId,
      workspace_id: workspace.id,
      provisioning_mode: 'legacy_adopted',
      status: 'active',
    });
  });

  it('desvincula sem remover workspace ou memberships', async () => {
    const { error } = await service.rpc('detach_adopted_workspace_service_role', {
      p_workspace_id: workspace.id,
      p_confirmation_name: workspaceName,
    });
    expect(error).toBeNull();

    const { data: links } = await service
      .from('agency_workspaces')
      .select('id')
      .eq('workspace_id', workspace.id);
    const { data: existingWorkspace } = await service
      .from('workspaces')
      .select('id')
      .eq('id', workspace.id)
      .single();
    const { data: members } = await service
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspace.id)
      .eq('user_id', owner.id);

    expect(links).toEqual([]);
    expect(existingWorkspace?.id).toBe(workspace.id);
    expect(members).toHaveLength(1);
  });
});
