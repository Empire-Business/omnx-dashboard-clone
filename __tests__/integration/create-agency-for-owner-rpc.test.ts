/**
 * RPC create_agency_for_owner_service_role — bootstrap da primeira agência de
 * uma instância. migration 20260814000000_create_agency_for_owner_service_role.sql
 *
 * ACHADO desta sessão: existiam RPCs de bootstrap para credencial GHL
 * (seed_workspace_ghl_credential_service_role) e para sub-contas
 * (provision-new-client.ts --mode=agency-subaccount), mas nenhuma via segura
 * para criar a AGÊNCIA em si — sem isso, o runbook de produção do 1º tenant
 * dependeria de SQL solto, proibido pela regra 20 do CLAUDE.md.
 *
 * Prova:
 *  1) fail-closed: owner_id inexistente em auth.users -> RAISE EXCEPTION,
 *     nenhuma linha criada.
 *  2) idempotente: 2a chamada com o mesmo owner_id retorna o MESMO agency_id
 *     (não duplica), mesmo passando um nome diferente.
 *  3) cria agency_members (role='owner') no mesmo fluxo — nunca uma agência
 *     órfã sem membership.
 *  4) authenticated/anon não conseguem executar a função (service_role only).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { getServiceClient, getAuthenticatedClient, createTestUser, uniqueEmail, TestUser } from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('RPC create_agency_for_owner_service_role', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let agencyId: string;

  afterAll(async () => {
    if (agencyId) await service.from('agencies').delete().eq('id', agencyId);
    if (owner) await service.auth.admin.deleteUser(owner.id);
  });

  it('recusa owner_id inexistente (fail-closed)', async () => {
    service = getServiceClient();
    const fakeId = '11111111-2222-3333-4444-555555555555';
    const { error } = await service.rpc('create_agency_for_owner_service_role', {
      p_owner_id: fakeId,
      p_agency_name: 'Nunca deveria existir',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/não encontrado/);

    const { data } = await service.from('agencies').select('id').eq('owner_id', fakeId);
    expect(data).toHaveLength(0);
  });

  it('cria agencia + membership owner na primeira chamada', async () => {
    owner = await createTestUser(service, uniqueEmail('test-create-agency-owner'), 'TestPassword123!');

    const { data, error } = await service.rpc('create_agency_for_owner_service_role', {
      p_owner_id: owner.id,
      p_agency_name: 'Test Create Agency RPC',
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    agencyId = data as string;

    const { data: members } = await service.from('agency_members').select('*').eq('agency_id', agencyId);
    expect(members).toHaveLength(1);
    expect(members![0].user_id).toBe(owner.id);
    expect(members![0].role).toBe('owner');
    expect(members![0].is_active).toBe(true);
  });

  it('e idempotente: 2a chamada com o mesmo owner_id retorna o mesmo agency_id, sem duplicar', async () => {
    const { data, error } = await service.rpc('create_agency_for_owner_service_role', {
      p_owner_id: owner.id,
      p_agency_name: 'Nome diferente ignorado na 2a chamada',
    });
    expect(error).toBeNull();
    expect(data).toBe(agencyId);

    const { data: allForOwner } = await service.from('agencies').select('id').eq('owner_id', owner.id);
    expect(allForOwner).toHaveLength(1);

    const { data: members } = await service.from('agency_members').select('id').eq('agency_id', agencyId);
    expect(members).toHaveLength(1); // ON CONFLICT DO NOTHING nao duplicou o membership
  });

  it('authenticated nao consegue executar a RPC (service_role only)', async () => {
    const memberUser = await createTestUser(service, uniqueEmail('test-create-agency-caller'), 'TestPassword123!');
    const client = await getAuthenticatedClient(memberUser.email, memberUser.password);

    const { error } = await client.rpc('create_agency_for_owner_service_role', {
      p_owner_id: memberUser.id,
      p_agency_name: 'Tentativa nao autorizada',
    });
    expect(error).not.toBeNull();

    await service.auth.admin.deleteUser(memberUser.id);
  });
});
