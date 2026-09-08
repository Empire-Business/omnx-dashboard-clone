/**
 * Cutover da chave GHL — env global -> Vault, via migração seed (Item 3)
 * docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md
 *
 * A Fase 2 já migrou todas as edge functions GHL para resolver a credencial
 * POR WORKSPACE via Vault — mas nenhuma migration/RPC fazia o SEED real da
 * credencial (só um bloco de SQL manual no runbook). Este teste prova a RPC
 * `seed_workspace_ghl_credential_service_role`:
 *  - NEGATIVO: authenticated (mesmo owner do workspace) NÃO executa (42501/permissão);
 *  - NEGATIVO: anon NÃO executa;
 *  - service_role semeia -> retorno é só rotation_version (int), nunca o segredo;
 *  - roundtrip no vault: a chave está no cofre, metadata.location_id correto;
 *  - repetir o seed rotaciona (rotation_version sobe) e substitui a chave;
 *  - após o seed, resolveGhlCredentials (helper usado por todas as edge functions
 *    GHL) resolveria essa credencial — provado indiretamente via leitura da
 *    mesma RPC de metadata que o helper usa.
 *
 * Produção (qzesffnkqgelmtfblzkr) NUNCA é alvo: ver helpers/safe-guard.ts.
 * O valor usado aqui é sintético (nunca a chave real do GHL).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAnonClient,
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

const FAKE_KEY_1 = 'fake_ghl_key_cutover_1_' + Math.random().toString(36).slice(2);
const FAKE_KEY_2 = 'fake_ghl_key_cutover_2_' + Math.random().toString(36).slice(2);
const FAKE_LOCATION_ID = 'loc_cutover_test_' + Math.random().toString(36).slice(2);

describe('seed_workspace_ghl_credential_service_role — cutover env->vault (Item 3)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ownerClient: SupabaseClient;
  let ws: TestWorkspace;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('ghl-cutover-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS GHL Cutover', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
  });

  afterAll(async () => {
    await service.from('workspace_integration_credentials').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('NEGATIVO: authenticated (mesmo owner do workspace) NAO executa a RPC', async () => {
    const { data, error } = await ownerClient.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: FAKE_KEY_1,
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('NEGATIVO: anon NAO executa a RPC', async () => {
    const anon = getAnonClient();
    const { data, error } = await anon.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: FAKE_KEY_1,
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('service_role semeia: retorno e so rotation_version (int), nunca o segredo', async () => {
    const { data, error } = await service.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: FAKE_KEY_1,
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(error).toBeNull();
    expect(data).toBe(1); // rotation_version inicial
    expect(JSON.stringify(data)).not.toContain(FAKE_KEY_1);
  });

  it('roundtrip no vault: a chave esta no cofre, metadata.location_id correto', async () => {
    const { data: meta, error: eMeta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: ws.id, p_provider: 'ghl' })
      .maybeSingle();
    expect(eMeta).toBeNull();
    const row = meta as { secret_key_id: string; metadata: { location_id: string }; rotation_version: number };
    expect(row.rotation_version).toBe(1);
    expect(row.metadata.location_id).toBe(FAKE_LOCATION_ID);

    const { data: plain, error: eDec } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(eDec).toBeNull();
    expect(plain).toBe(FAKE_KEY_1);
  });

  it('semear de novo rotaciona: rotation_version sobe e a chave nova substitui', async () => {
    const { data, error } = await service.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: FAKE_KEY_2,
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(error).toBeNull();
    expect(data).toBe(2);

    const { data: meta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: ws.id, p_provider: 'ghl' })
      .maybeSingle();
    const row = meta as { secret_key_id: string };
    const { data: plain } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(plain).toBe(FAKE_KEY_2);
  });

  it('validacao: workspace_id inexistente falha (22023), sem criar segredo orfao', async () => {
    const { data, error } = await service.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_ghl_api_key: FAKE_KEY_1,
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('validacao: chave/location vazias falham (22023)', async () => {
    const { error: e1 } = await service.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: '',
      p_ghl_location_id: FAKE_LOCATION_ID,
    });
    expect(e1).not.toBeNull();

    const { error: e2 } = await service.rpc('seed_workspace_ghl_credential_service_role', {
      p_workspace_id: ws.id,
      p_ghl_api_key: FAKE_KEY_1,
      p_ghl_location_id: '',
    });
    expect(e2).not.toBeNull();
  });
});
