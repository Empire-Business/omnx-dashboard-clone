/**
 * Isolamento de `workspace_deletion_requests` (Fase 8 — LGPD) contra o banco de TESTE real.
 *
 * Lacuna encontrada na auditoria de 2026-07-11: a tabela nasceu com `workspace_id`
 * (migration `20260811000000_fase8_lgpd_workspace_purge.sql`) e política de SELECT
 * restrita a owner/admin do workspace, mas nunca teve prova cross-tenant dedicada —
 * só era exercitada indiretamente pelo fluxo de `purge-workspace.ts`.
 *
 * Prova:
 *  1) Owner/admin do workspace A não vê o pedido de exclusão do workspace B.
 *  2) Member comum (não owner/admin) do próprio workspace A também não vê o pedido
 *     de A — a política exige owner/admin, não "qualquer membro".
 *  3) INSERT/UPDATE direto pelo cliente autenticado é bloqueado — só service_role
 *     (via RPC) pode mutar o ciclo de vida do pedido.
 *
 * Ref: docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md, supabase/migrations/20260811000000_fase8_lgpd_workspace_purge.sql
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

describe('Isolamento cross-tenant — workspace_deletion_requests', () => {
  let service: SupabaseClient;

  let ownerA: TestUser;
  let memberA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;

  let clientOwnerA: SupabaseClient;
  let clientMemberA: SupabaseClient;
  let clientOwnerB: SupabaseClient;

  let requestAId: string;
  let requestBId: string;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('test-wdr-ownera'), 'TestPassword123!');
    memberA = await createTestUser(service, uniqueEmail('test-wdr-membera'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('test-wdr-ownerb'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WDR Isolation - Workspace A', ownerA.id);
    wsB = await createTestWorkspace(service, 'WDR Isolation - Workspace B', ownerB.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsA.id, memberA.id, 'member', ownerA.id);
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    // Só service_role insere (regra da tabela: INSERT/UPDATE/DELETE só via RPC/service_role).
    const { data: reqA, error: errA } = await service
      .from('workspace_deletion_requests')
      .insert({
        workspace_id: wsA.id,
        workspace_name_snapshot: wsA.name,
        requested_by: ownerA.id,
        reason: 'teste de isolamento A',
      })
      .select('id')
      .single();
    if (errA) throw new Error(`seed workspace_deletion_requests A: ${errA.message}`);
    requestAId = reqA.id as string;

    const { data: reqB, error: errB } = await service
      .from('workspace_deletion_requests')
      .insert({
        workspace_id: wsB.id,
        workspace_name_snapshot: wsB.name,
        requested_by: ownerB.id,
        reason: 'teste de isolamento B',
      })
      .select('id')
      .single();
    if (errB) throw new Error(`seed workspace_deletion_requests B: ${errB.message}`);
    requestBId = reqB.id as string;

    clientOwnerA = await getAuthenticatedClient(ownerA.email, ownerA.password);
    clientMemberA = await getAuthenticatedClient(memberA.email, memberA.password);
    clientOwnerB = await getAuthenticatedClient(ownerB.email, ownerB.password);
  });

  afterAll(async () => {
    await service.from('workspace_deletion_requests').delete().in('id', [requestAId, requestBId]);
    await deleteTestUsers(service, [ownerA.id, memberA.id, ownerB.id]);
  });

  it('owner de A ve o pedido de exclusao do proprio workspace A', async () => {
    const { data, error } = await clientOwnerA
      .from('workspace_deletion_requests')
      .select('*')
      .eq('id', requestAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('owner de A NAO ve o pedido de exclusao do workspace B', async () => {
    const { data, error } = await clientOwnerA
      .from('workspace_deletion_requests')
      .select('*')
      .eq('workspace_id', wsB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('owner de B NAO ve o pedido de exclusao do workspace A', async () => {
    const { data, error } = await clientOwnerB
      .from('workspace_deletion_requests')
      .select('*')
      .eq('workspace_id', wsA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('member comum de A (nao owner/admin) NAO ve o pedido de exclusao do proprio workspace A', async () => {
    const { data, error } = await clientMemberA
      .from('workspace_deletion_requests')
      .select('*')
      .eq('workspace_id', wsA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('owner de A NAO consegue inserir pedido de exclusao diretamente pelo cliente', async () => {
    const { error } = await clientOwnerA.from('workspace_deletion_requests').insert({
      workspace_id: wsA.id,
      workspace_name_snapshot: 'Insercao maliciosa direta',
      requested_by: ownerA.id,
    });
    expect(error).not.toBeNull();
  });

  it('owner de A NAO consegue atualizar o status do pedido de B diretamente pelo cliente', async () => {
    await clientOwnerA
      .from('workspace_deletion_requests')
      .update({ status: 'cancelled', cancelled_reason: 'tentativa maliciosa' })
      .eq('id', requestBId);

    const { data } = await service
      .from('workspace_deletion_requests')
      .select('status')
      .eq('id', requestBId)
      .single();
    expect(data!.status).toBe('export_pending');
  });
});
