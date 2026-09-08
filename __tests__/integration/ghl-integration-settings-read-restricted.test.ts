/**
 * ghl_integration_settings — SELECT restrito a owner/admin (2026-07-14)
 *
 * Achado da auditoria de segurança escopada à consolidação da conexão GHL:
 * a policy antiga "members can read" deixava QUALQUER membro ativo do
 * workspace (não só owner/admin) ler webhook_secret em texto plano.
 * Migration 20260826000000 troca por "owner/admin can read".
 *
 * Produção (qzesffnkqgelmtfblzkr) NUNCA é alvo: ver helpers/safe-guard.ts.
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

describe('ghl_integration_settings — SELECT restrito a owner/admin', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let member: TestUser;
  let ws: TestWorkspace;
  let ownerClient: SupabaseClient;
  let memberClient: SupabaseClient;
  const webhookSecret = 'whsec_' + Math.random().toString(36).slice(2);
  const locationId = 'LOC_readrestrict_' + Math.random().toString(36).slice(2, 10);

  beforeAll(async () => {
    service = getServiceClient();

    owner = await createTestUser(service, uniqueEmail('ghlread-owner'), 'TestPassword123!');
    member = await createTestUser(service, uniqueEmail('ghlread-member'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS GhlReadRestrict', owner.id);

    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, ws.id, member.id, 'member', owner.id); // member NAO e admin

    const { error } = await service.from('ghl_integration_settings').insert({
      workspace_id: ws.id,
      ghl_location_id: locationId,
      webhook_secret: webhookSecret,
    });
    if (error) throw new Error(`seed ghl_integration_settings: ${error.message}`);

    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
    memberClient = await getAuthenticatedClient(member.email, member.password);
  });

  afterAll(async () => {
    await service.from('ghl_integration_settings').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id, member.id]);
  });

  it('owner do workspace le webhook_secret normalmente', async () => {
    const { data, error } = await ownerClient
      .from('ghl_integration_settings')
      .select('webhook_secret')
      .eq('workspace_id', ws.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.webhook_secret).toBe(webhookSecret);
  });

  it('NEGATIVO: member comum (nao-admin) NAO le mais a linha (RLS bloqueia)', async () => {
    const { data, error } = await memberClient
      .from('ghl_integration_settings')
      .select('webhook_secret')
      .eq('workspace_id', ws.id)
      .maybeSingle();
    // RLS bloqueia silenciosamente (0 linhas), sem erro de permissao.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
