/**
 * Lookup de webhook_secret por location — Fase 2 (fatia 6)
 *
 * Prova a QUERY que o webhook-ghl usa para autenticar por workspace:
 *  - dado workspace A com ghl_location_id + webhook_secret (ativo), o SELECT por
 *    location_id retorna o secret DESSE workspace (e o workspace_id);
 *  - por location_id inexistente => null (no_match => 401 + dead-letter);
 *  - dead-letter (webhook_unresolved) aceita o evento rejeitado (nao se perde).
 *
 * Lacuna honesta: a execucao HTTP real do handler (401/202) e Deno + fetch;
 * validada em staging/Fatia 9. Aqui cobrimos a query de autenticacao (que decide
 * QUEM autentica) contra o banco real + a logica pura em webhook-ghl-auth.test.ts.
 *
 * Ref: docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 6).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

const LOC_A = 'LOC-F6-A';
const SECRET_A = 'secA-f6-12345';
const LOC_NONE = 'LOC-F6-NONE';

describe('webhook-ghl lookup por location — Fase 2 (fatia 6)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let wsA: TestWorkspace;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('f6-owner'), 'TestPassword123!');
    wsA = await createTestWorkspace(service, 'WS F6 A', owner.id);
    await addWorkspaceMember(service, wsA.id, owner.id, 'owner', owner.id);

    const { error } = await service.from('ghl_integration_settings').insert({
      workspace_id: wsA.id,
      ghl_location_id: LOC_A,
      webhook_secret: SECRET_A,
      is_active: true,
    });
    if (error) throw new Error(`seed ghl_integration_settings: ${error.message}`);
  });

  afterAll(async () => {
    await service.from('webhook_unresolved').delete().in('location_id', [LOC_A, LOC_NONE, null as unknown as string]);
    await service.from('ghl_integration_settings').delete().eq('workspace_id', wsA.id);
    await service.from('workspace_members').delete().eq('workspace_id', wsA.id);
    await service.from('workspaces').delete().eq('id', wsA.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('lookup por location_id ativo retorna o webhook_secret do workspace certo', async () => {
    const { data, error } = await service
      .from('ghl_integration_settings')
      .select('workspace_id, webhook_secret')
      .eq('ghl_location_id', LOC_A)
      .eq('is_active', true)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.workspace_id).toBe(wsA.id);
    expect(data?.webhook_secret).toBe(SECRET_A);
  });

  it('lookup por location_id inexistente retorna null (no_match => 401 + dead-letter)', async () => {
    const { data, error } = await service
      .from('ghl_integration_settings')
      .select('workspace_id, webhook_secret')
      .eq('ghl_location_id', LOC_NONE)
      .eq('is_active', true)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('evento rejeitado cai em webhook_unresolved (dead-letter, source webhook-ghl)', async () => {
    const { error: insErr } = await service.from('webhook_unresolved').insert({
      source: 'webhook-ghl',
      location_id: LOC_NONE,
      reason: 'no_match',
      payload: { example: true },
    });
    expect(insErr).toBeNull();

    const { data, error } = await service
      .from('webhook_unresolved')
      .select('source, location_id, reason')
      .eq('location_id', LOC_NONE)
      .eq('source', 'webhook-ghl')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.source).toBe('webhook-ghl');
    expect(data?.reason).toBe('no_match');
  });
});
