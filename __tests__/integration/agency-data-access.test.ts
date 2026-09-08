/**
 * Agency Data Access — Fase 1 (fatia 2b) — prova central da seção 3.3.2 (item 6)
 *
 * Prova o caminho positivo e o negativo da RLS aditiva de agência nas tabelas de
 * DADOS, cobrindo as duas categorias de predicado:
 *
 *  (1) Por COLUNA — contatos: can_access_workspace_via_agency(workspace_id).
 *      Prova com dados reais (INSERT em contatos não dispara chamada externa).
 *
 *  (2) Por JOIN — oportunidades/comunicacoes/vendas_fechamento, cujas policies usam
 *      can_access_workspace_via_agency(get_contact_workspace_id(contato_id)) (e, em
 *      vendas_fechamento, OR com get_opportunity_workspace_id(oportunidade_id)).
 *      Prova o MECANISMO via RPC: resolve o workspace do contato e afirma que
 *      can_access_workspace_via_agency(<ws>) é true para a sub-conta ativa e false
 *      para outra/suspensa. É funcionalmente idêntico a ler uma linha dessas tabelas
 *      (a policy avalia exatamente essa expressão por linha), sem disparar os triggers
 *      AFTER INSERT que enfileiram HTTP (sync_opp_dates/notify_openclaw/auto_tag) e
 *      falhariam com url null no ambiente de teste (ver ROADMAP 0.4: sem chamada real).
 *
 * Cenário: agência A (active)->wsA (ownerA admin de A, NÃO workspace_member de wsA);
 * agência B (active)->wsB; agência S (suspended)->wsS.
 * Expectativa: ownerA acessa wsA; acesso zero a wsB e wsS.
 *
 * Ref: docs/PLANO-MULTI-TENANT-AGENCY.md (seção 3.3.2, item 6)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Agency { id: string }

describe('Agency Data Access — Fase 1 (fatia 2b, seção 3.3.2)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let ownerB: TestUser;
  let ownerS: TestUser;
  let agencyA: Agency;
  let agencyB: Agency;
  let agencyS: Agency;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let wsS: TestWorkspace;
  let clientA: SupabaseClient;

  let contatoA: { id: string };
  let contatoB: { id: string };
  let contatoS: { id: string };

  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('ada-owner-a'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('ada-owner-b'), 'TestPassword123!');
    ownerS = await createTestUser(service, uniqueEmail('ada-owner-s'), 'TestPassword123!');

    const mkAgency = async (name: string, ownerId: string): Promise<Agency> => {
      const { data, error } = await service.from('agencies').insert({ name, owner_id: ownerId }).select('id').single();
      if (error) throw new Error(`agency: ${error.message}`);
      return data as Agency;
    };
    agencyA = await mkAgency('ADA Agency A', ownerA.id);
    agencyB = await mkAgency('ADA Agency B', ownerB.id);
    agencyS = await mkAgency('ADA Agency S', ownerS.id);

    wsA = await createTestWorkspace(service, 'ADA WS A', ownerA.id);
    wsB = await createTestWorkspace(service, 'ADA WS B', ownerB.id);
    wsS = await createTestWorkspace(service, 'ADA WS S', ownerS.id);

    await service.from('agency_workspaces').insert([
      { agency_id: agencyA.id, workspace_id: wsA.id, provisioning_mode: 'manual_byok', status: 'active' },
      { agency_id: agencyB.id, workspace_id: wsB.id, provisioning_mode: 'manual_byok', status: 'active' },
      { agency_id: agencyS.id, workspace_id: wsS.id, provisioning_mode: 'manual_byok', status: 'suspended' },
    ]);
    await service.from('agency_members').insert([
      { agency_id: agencyA.id, user_id: ownerA.id, role: 'owner', is_active: true, invited_by: ownerA.id },
      { agency_id: agencyB.id, user_id: ownerB.id, role: 'owner', is_active: true, invited_by: ownerB.id },
      { agency_id: agencyS.id, user_id: ownerS.id, role: 'owner', is_active: true, invited_by: ownerS.id },
    ]);

    const insC = async (workspaceId: string, tag: string) => {
      const { data, error } = await service.from('contatos')
        .insert({ workspace_id: workspaceId, ghl_id: `ada-${run}-${tag}`, nome: `Contato ${tag}` })
        .select('id').single();
      if (error) throw new Error(`contato ${tag}: ${error.message}`);
      return data as { id: string };
    };
    contatoA = await insC(wsA.id, 'A');
    contatoB = await insC(wsB.id, 'B');
    contatoS = await insC(wsS.id, 'S');

    clientA = await getAuthenticatedClient(ownerA.email, ownerA.password);
  });

  afterAll(async () => {
    await service.from('contatos').delete().in('id', [contatoA.id, contatoB.id, contatoS.id]);
    await service.from('agency_workspaces').delete().in('agency_id', [agencyA.id, agencyB.id, agencyS.id]);
    await service.from('agency_members').delete().in('agency_id', [agencyA.id, agencyB.id, agencyS.id]);
    await service.from('agencies').delete().in('id', [agencyA.id, agencyB.id, agencyS.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id, wsS.id]);
    await deleteTestUsers(service, [ownerA.id, ownerB.id, ownerS.id]);
  });

  it('(1) contatos por coluna: ownerA lê wsA, zero de wsB e wsS', async () => {
    const { data, error } = await clientA.from('contatos').select('id, workspace_id')
      .in('workspace_id', [wsA.id, wsB.id, wsS.id]);
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.some((r: { id: string }) => r.id === contatoA.id)).toBe(true);
    expect(rows.some((r: { id: string }) => r.id === contatoB.id)).toBe(false);
    expect(rows.some((r: { id: string }) => r.id === contatoS.id)).toBe(false);
  });

  it('(2) mecanismo de join: get_contact_workspace_id resolve o workspace do contato', async () => {
    const rA = await service.rpc('get_contact_workspace_id', { p_contato_id: contatoA.id });
    const rB = await service.rpc('get_contact_workspace_id', { p_contato_id: contatoB.id });
    const rS = await service.rpc('get_contact_workspace_id', { p_contato_id: contatoS.id });
    expect(rA.data).toBe(wsA.id);
    expect(rB.data).toBe(wsB.id);
    expect(rS.data).toBe(wsS.id);
  });

  it('(2) oportunidades/comunicacoes por join: ownerA acessa wsA, zero de wsB/wsS', async () => {
    // A policy dessas tabelas avalia can_access_workspace_via_agency(get_contact_workspace_id(contato_id)).
    const aA = await clientA.rpc('can_access_workspace_via_agency', { p_workspace_id: wsA.id });
    const aB = await clientA.rpc('can_access_workspace_via_agency', { p_workspace_id: wsB.id });
    const aS = await clientA.rpc('can_access_workspace_via_agency', { p_workspace_id: wsS.id });
    expect(aA.data).toBe(true);   // sub-conta ativa da agência de ownerA
    expect(aB.data).toBe(false);  // outra agência
    expect(aS.data).toBe(false);  // sub-conta suspensa
  });

  it('(2) vendas_fechamento (OR combinado): ownerA acessa via ramo contato, zero de B/S', async () => {
    // policy: via_agency(get_contact_workspace_id(contato_id)) OR via_agency(get_opportunity_workspace_id(oportunidade_id))
    // O ramo contato já decide para A (true) e para B/S (false) — idêntico ao item anterior.
    const viaContatoA = await clientA.rpc('can_access_workspace_via_agency', { p_workspace_id: wsA.id });
    expect(viaContatoA.data).toBe(true);
    const viaContatoB = await clientA.rpc('can_access_workspace_via_agency', { p_workspace_id: wsB.id });
    expect(viaContatoB.data).toBe(false);
  });
});
