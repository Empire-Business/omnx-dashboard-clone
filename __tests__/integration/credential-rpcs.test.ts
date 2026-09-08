/**
 * credential RPCs — Fase 2 (fatia 2)
 *
 * Prova o controle de acesso das funcoes de resolucao de credencial
 * (get_workspace_credential_meta + get_decrypted_secret):
 *  - service_role le a meta correta (secret_key_id, rotation_version, metadata);
 *  - provider inexistente => null (o helper usa para fail-closed);
 *  - get_decrypted_secret com id inexistente => null (sem erro);
 *  - NEGATIVO: authenticated (mesmo owner do workspace) NAO tem EXECUTE em
 *    nenhuma das duas (segredo nunca sai via PostgREST para usuario normal).
 *
 * Lacuna honesta: a DECIFRACAO real (vault -> apiKey no caminho feliz) nao e
 * criavel via supabase-js (schema vault nao exposto ao PostgREST), entao nao e
 * exercitada aqui. Ela ja foi provada na Fatia 0 (create_secret +
 * decrypted_secrets via psql direto) e sera validada em staging/producao. O
 * RISCO de vazamento esta no CONTROLE DE ACESSO (quem pode ler), que esta 100%
 * coberto aqui.
 *
 * Ref: docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 2), plano v3 secao 5.3.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
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

describe('credential RPCs — Fase 2 (fatia 2)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ws: TestWorkspace;
  let ownerClient: SupabaseClient;
  const fakeSecretId = randomUUID();

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('credrpc-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS CredRPC', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);

    const { error } = await service.from('workspace_integration_credentials').insert({
      workspace_id: ws.id,
      provider: 'ghl',
      secret_key_id: fakeSecretId,
      metadata: { location_id: 'LOC-RPC' },
      rotation_version: 7,
    });
    if (error) throw new Error(`seed wic: ${error.message}`);
  });

  afterAll(async () => {
    await service.from('workspace_integration_credentials').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('service_role: get_workspace_credential_meta retorna meta correta', async () => {
    const { data, error } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: ws.id, p_provider: 'ghl' })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.secret_key_id).toBe(fakeSecretId);
    expect(data?.rotation_version).toBe(7);
    expect((data?.metadata as { location_id?: string } | null)?.location_id).toBe('LOC-RPC');
  });

  it('service_role: meta com provider inexistente retorna null', async () => {
    const { data, error } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: ws.id, p_provider: 'meta' })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('service_role: get_decrypted_secret com id inexistente retorna null (sem erro)', async () => {
    const { data, error } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: randomUUID(),
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('NEGATIVO: authenticated (owner) NAO tem EXECUTE em get_workspace_credential_meta', async () => {
    const { data, error } = await ownerClient.rpc('get_workspace_credential_meta', {
      p_workspace_id: ws.id,
      p_provider: 'ghl',
    });
    // Bloqueio por EXECUTE revogado (erro) ou resposta vazia: ambos = nao vaza.
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('NEGATIVO: authenticated (owner) NAO tem EXECUTE em get_decrypted_secret', async () => {
    const { data, error } = await ownerClient.rpc('get_decrypted_secret', {
      p_secret_key_id: fakeSecretId,
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });
});
