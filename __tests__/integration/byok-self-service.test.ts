/**
 * BYOK self-service — Fase 4 (fatia 1): porteiro seguro de credencial
 *
 * O admin/owner do workspace, JA LOGADO, cadastra a propria chave (a UI da
 * Fatia 2 vai chamar esta RPC). Provas:
 *  - NEGATIVO: member (nao-admin) NAO grava (42501);
 *  - NEGATIVO: admin de OUTRO workspace NAO grava neste (42501);
 *  - admin grava -> retorno e so rotation_version (int), NUNCA o segredo;
 *  - roundtrip no vault (service_role le get_decrypted_secret) = a chave;
 *  - salvar de novo rotaciona (rotation_version sobe) e a chave nova substitui;
 *  - provider invalido -> erro (22023);
 *  - get_workspace_credential_status mostra conectado + metadata SEM segredo,
 *    e nao-admin nao ve nada.
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

const SECRET_1 = 'tok_self_1_' + Math.random().toString(36).slice(2);
const SECRET_2 = 'tok_self_2_' + Math.random().toString(36).slice(2);

describe('BYOK self-service — Fase 4 (fatia 1)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let memberA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let ownerAClient: SupabaseClient;
  let memberAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('byok-ownerA'), 'TestPassword123!');
    memberA = await createTestUser(service, uniqueEmail('byok-memberA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('byok-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS BYOK A', ownerA.id);
    wsB = await createTestWorkspace(service, 'WS BYOK B', ownerB.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsA.id, memberA.id, 'member', ownerA.id); // member NAO e admin
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    ownerAClient = await getAuthenticatedClient(ownerA.email, ownerA.password);
    memberAClient = await getAuthenticatedClient(memberA.email, memberA.password);
    ownerBClient = await getAuthenticatedClient(ownerB.email, ownerB.password);
  });

  afterAll(async () => {
    await service.from('workspace_integration_credentials').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [ownerA.id, memberA.id, ownerB.id]);
  });

  it('NEGATIVO: member (nao-admin) NAO grava credencial', async () => {
    const { data, error } = await memberAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: SECRET_1,
      p_metadata: { location_id: 'L1' },
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('NEGATIVO: admin de OUTRO workspace NAO grava neste', async () => {
    const { data, error } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id, // ownerB e admin de wsB, nao de wsA
      p_provider: 'ghl',
      p_secret: SECRET_1,
      p_metadata: {},
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('admin grava: retorno e so rotation_version (int), nunca o segredo', async () => {
    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: SECRET_1,
      p_metadata: { location_id: 'L1' },
    });
    expect(error).toBeNull();
    expect(data).toBe(1); // rotation_version inicial
    // O retorno NUNCA contem o segredo.
    expect(JSON.stringify(data)).not.toContain(SECRET_1);
  });

  it('roundtrip no vault: a chave esta no cofre (sem plaintext na tabela)', async () => {
    const { data: meta, error: eMeta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: 'ghl' })
      .maybeSingle();
    expect(eMeta).toBeNull();
    const row = meta as { secret_key_id: string; metadata: { location_id: string }; rotation_version: number };
    expect(row.rotation_version).toBe(1);
    expect(row.metadata.location_id).toBe('L1');

    const { data: plain, error: eDec } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(eDec).toBeNull();
    expect(plain).toBe(SECRET_1);
  });

  it('salvar de novo rotaciona: rotation_version sobe e a chave nova substitui', async () => {
    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: SECRET_2,
      p_metadata: { location_id: 'L1' },
    });
    expect(error).toBeNull();
    expect(data).toBe(2); // subiu

    const { data: meta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: 'ghl' })
      .maybeSingle();
    const row = meta as { secret_key_id: string };
    const { data: plain } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(plain).toBe(SECRET_2); // chave nova
    expect(plain).not.toBe(SECRET_1); // chave velha saiu
  });

  it('provider invalido e recusado (22023)', async () => {
    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'twitter',
      p_secret: 'x',
      p_metadata: {},
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('get_workspace_credential_status: admin ve conectado + metadata, sem segredo', async () => {
    const { data, error } = await ownerAClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ provider: string; rotation_version: number; metadata: { location_id: string } }>;
    const ghl = rows.find((r) => r.provider === 'ghl');
    expect(ghl).toBeTruthy();
    expect(ghl!.rotation_version).toBe(2);
    expect(ghl!.metadata.location_id).toBe('L1');
    // Nenhuma coluna de segredo e nenhum valor de segredo vaza.
    expect(JSON.stringify(rows)).not.toContain(SECRET_1);
    expect(JSON.stringify(rows)).not.toContain(SECRET_2);
    expect(JSON.stringify(rows)).not.toContain('secret_key_id');
  });

  it('NEGATIVO: get_workspace_credential_status nao mostra nada a nao-admin', async () => {
    const { data, error } = await memberAClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });
});
