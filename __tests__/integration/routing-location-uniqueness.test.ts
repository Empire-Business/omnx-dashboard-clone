/**
 * Roteamento por location_id — Fase 2 (fatia 3)
 *
 * Prova o fim do "fallback silencioso para o workspace mais antigo":
 *  - UNIQUE parcial rejeita 2 workspaces ATIVOS com o mesmo ghl_location_id (23505);
 *  - get_workspace_id_by_ghl_location_id retorna o workspace certo no match exato
 *    (caminho feliz do cliente unico preservado);
 *  - a funcao retorna NULL (e NAO o "mais antigo") quando nao ha match;
 *  - evento nao resolvido cai em webhook_unresolved (dead-letter) e service_role le;
 *  - NEGATIVO: authenticated NAO le webhook_unresolved (operacional, sem workspace).
 *
 * Ref: docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 3, secoes 3.5 e 10.4).
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

const LOC_SHARED = 'LOC-F3-SHARED';
const LOC_UNKNOWN = 'LOC-F3-DOES-NOT-EXIST';

describe('roteamento por location_id — Fase 2 (fatia 3)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let ownerClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('f3-owner'), 'TestPassword123!');
    wsA = await createTestWorkspace(service, 'WS F3 A', owner.id);
    wsB = await createTestWorkspace(service, 'WS F3 B', owner.id);
    await addWorkspaceMember(service, wsA.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, wsB.id, owner.id, 'owner', owner.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);

    // Workspace A com location ativo (linha legitima do caminho feliz)
    const { error } = await service.from('ghl_integration_settings').insert({
      workspace_id: wsA.id,
      ghl_location_id: LOC_SHARED,
      is_active: true,
    });
    if (error) throw new Error(`seed ghl_integration_settings(A): ${error.message}`);
  });

  afterAll(async () => {
    await service.from('webhook_unresolved').delete().in('location_id', [LOC_SHARED, LOC_UNKNOWN]);
    await service.from('ghl_integration_settings').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [owner.id]);
  });

  it('UNIQUE parcial: 2 workspaces ATIVOS com mesmo ghl_location_id => 23505', async () => {
    const { error } = await service.from('ghl_integration_settings').insert({
      workspace_id: wsB.id,
      ghl_location_id: LOC_SHARED, // mesmo de A (ativo) -> deve rejeitar
      is_active: true,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('match exato: get_workspace_id_by_ghl_location_id retorna o workspace certo', async () => {
    const { data, error } = await service.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: LOC_SHARED,
    });
    expect(error).toBeNull();
    expect(data).toBe(wsA.id);
  });

  it('sem match: get_workspace_id_by_ghl_location_id retorna NULL (nao o "mais antigo")', async () => {
    const { data, error } = await service.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: LOC_UNKNOWN,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('dead-letter: evento nao resolvido cai em webhook_unresolved e service_role le', async () => {
    const { error: insErr } = await service.from('webhook_unresolved').insert({
      source: 'webhook-ghl',
      location_id: LOC_UNKNOWN,
      reason: 'no_match',
      payload: { example: true },
    });
    expect(insErr).toBeNull();

    const { data, error } = await service
      .from('webhook_unresolved')
      .select('id, source, location_id, reason, reprocessed_at')
      .eq('location_id', LOC_UNKNOWN)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.source).toBe('webhook-ghl');
    expect(data?.reason).toBe('no_match');
    expect(data?.reprocessed_at).toBeNull();
  });

  it('NEGATIVO: authenticated (owner) NAO le webhook_unresolved', async () => {
    const { data, error } = await ownerClient
      .from('webhook_unresolved')
      .select('id')
      .eq('location_id', LOC_UNKNOWN);
    // Sem policy para authenticated => RLS bloqueia: erro OU zero linhas. Ambos = nao vaza.
    const blocked = error !== null || (Array.isArray(data) && data.length === 0);
    expect(blocked).toBe(true);
  });
});
