/**
 * workspace_integration_credentials — Fase 2 (fatia 1)
 *
 * Prova a base de credencial por tenant:
 *  - service_role faz CRUD na tabela;
 *  - UNIQUE(workspace_id, provider) rejeita duplicata;
 *  - updated_at muda em UPDATE e rotation_version pode ser incrementado;
 *  - NEGATIVO: authenticated (mesmo OWNER do workspace) NAO le a tabela
 *    (RLS enabled sem policy para authenticated, ou REVOKE — ambos bloqueiam);
 *  - provider fora do enum e rejeitado pelo CHECK.
 *
 * O segredo real (Vault) ja foi provado na Fatia 0; aqui usamos um UUID
 * qualquer para secret_key_id, pois o escopo desta fatia e a TABELA
 * (estrutura/RLS). A integracao ponta a ponta (vault -> helper) vem na Fatia 2.
 *
 * Ref: docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 1), plano v3 secao 5.1.
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

describe('workspace_integration_credentials — Fase 2 (fatia 1)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ws: TestWorkspace;
  let ownerClient: SupabaseClient;
  let rowId: string;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('wic-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS Cred', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
  });

  afterAll(async () => {
    await service
      .from('workspace_integration_credentials')
      .delete()
      .eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('service_role consegue INSERT (rotation_version default 1)', async () => {
    const { data, error } = await service
      .from('workspace_integration_credentials')
      .insert({
        workspace_id: ws.id,
        provider: 'ghl',
        secret_key_id: randomUUID(),
        metadata: { location_id: 'LOC-X' },
      })
      .select('id, rotation_version, updated_at, created_at')
      .single();
    expect(error).toBeNull();
    expect(data?.rotation_version).toBe(1);
    rowId = (data as { id: string }).id;
  });

  it('service_role consegue SELECT', async () => {
    const { data, error } = await service
      .from('workspace_integration_credentials')
      .select('id')
      .eq('id', rowId)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(rowId);
  });

  it('UNIQUE(workspace_id, provider) rejeita duplicata', async () => {
    const { error } = await service
      .from('workspace_integration_credentials')
      .insert({ workspace_id: ws.id, provider: 'ghl', secret_key_id: randomUUID() });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('UPDATE incrementa rotation_version e muda updated_at (trigger)', async () => {
    const before = (
      await service
        .from('workspace_integration_credentials')
        .select('updated_at')
        .eq('id', rowId)
        .single()
    ).data?.updated_at;
    await new Promise((r) => setTimeout(r, 30));
    const { data, error } = await service
      .from('workspace_integration_credentials')
      .update({ rotation_version: 2 })
      .eq('id', rowId)
      .select('rotation_version, updated_at')
      .single();
    expect(error).toBeNull();
    expect(data?.rotation_version).toBe(2);
    expect(data?.updated_at).not.toBe(before);
  });

  it('NEGATIVO: authenticated (owner do workspace) NAO le a tabela', async () => {
    const { data, error } = await ownerClient
      .from('workspace_integration_credentials')
      .select('id');
    // Bloqueio por RLS (0 linhas, sem erro) OU por GRANT (erro de permissao):
    // ambos significam "authenticated nao le o segredo".
    const blocked = error !== null || (data ?? []).length === 0;
    expect(blocked).toBe(true);
  });

  it('provider fora do enum e rejeitado pelo CHECK', async () => {
    const { error } = await service
      .from('workspace_integration_credentials')
      .insert({ workspace_id: ws.id, provider: 'provedor-x', secret_key_id: randomUUID() });
    expect(error).not.toBeNull();
  });
});
