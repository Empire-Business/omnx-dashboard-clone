/**
 * Fase 3 — token de agencia GHL (so-leitura): RPCs self-service
 * docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.2, 6.6)
 *
 * Espelha __tests__/integration/byok-self-service.test.ts, mas para
 * agency_ghl_credentials (chaveado por agency_id, nao workspace_id). Provas:
 *  - NEGATIVO: staff da agencia (nao-admin) NAO grava (42501);
 *  - NEGATIVO: admin de OUTRA agencia NAO grava nesta;
 *  - admin/owner grava -> retorno e so rotation_version (int), nunca o token;
 *  - roundtrip no vault: o token esta no cofre (service_role le get_decrypted_secret);
 *  - salvar de novo rotaciona (rotation_version sobe) e o token novo substitui;
 *  - token/company_id vazio -> erro (22023);
 *  - get_agency_ghl_credential_status mostra conectado (sem token) para admin,
 *    e nada para nao-admin.
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
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

const TOKEN_1 = 'agency_tok_1_' + Math.random().toString(36).slice(2);
const TOKEN_2 = 'agency_tok_2_' + Math.random().toString(36).slice(2);
const COMPANY_ID_1 = 'company_1_' + Math.random().toString(36).slice(2);

describe('Fase 3 — token de agencia GHL self-service (secao 6.2)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let staffA: TestUser;
  let ownerB: TestUser;
  let agencyAId: string;
  let agencyBId: string;
  let ownerAClient: SupabaseClient;
  let staffAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('agencytok-ownerA'), 'TestPassword123!');
    staffA = await createTestUser(service, uniqueEmail('agencytok-staffA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('agencytok-ownerB'), 'TestPassword123!');

    // agency_members exige (indiretamente) um workspace valido de referencia
    // para o dono, mas agencies em si so precisa de owner_id.
    const wsA = await createTestWorkspace(service, 'WS AgencyTok A', ownerA.id);
    const wsB = await createTestWorkspace(service, 'WS AgencyTok B', ownerB.id);
    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    const { data: agencyA, error: eAgencyA } = await service
      .from('agencies')
      .insert({ name: 'Agencia Token A', owner_id: ownerA.id })
      .select('id')
      .single();
    if (eAgencyA) throw new Error(`Falha ao criar agencia A: ${eAgencyA.message}`);
    agencyAId = agencyA.id;

    const { data: agencyB, error: eAgencyB } = await service
      .from('agencies')
      .insert({ name: 'Agencia Token B', owner_id: ownerB.id })
      .select('id')
      .single();
    if (eAgencyB) throw new Error(`Falha ao criar agencia B: ${eAgencyB.message}`);
    agencyBId = agencyB.id;

    await service.from('agency_members').insert([
      { agency_id: agencyAId, user_id: ownerA.id, role: 'owner', is_active: true },
      { agency_id: agencyAId, user_id: staffA.id, role: 'staff', is_active: true },
      { agency_id: agencyBId, user_id: ownerB.id, role: 'owner', is_active: true },
    ]);

    ownerAClient = await getAuthenticatedClient(ownerA.email, ownerA.password);
    staffAClient = await getAuthenticatedClient(staffA.email, staffA.password);
    ownerBClient = await getAuthenticatedClient(ownerB.email, ownerB.password);
  });

  afterAll(async () => {
    await service.from('agency_ghl_credentials').delete().in('agency_id', [agencyAId, agencyBId]);
    await service.from('agency_members').delete().in('agency_id', [agencyAId, agencyBId]);
    await service.from('agencies').delete().in('id', [agencyAId, agencyBId]);
    await deleteTestUsers(service, [ownerA.id, staffA.id, ownerB.id]);
  });

  it('NEGATIVO: staff da agencia (nao-admin) NAO grava o token', async () => {
    const { data, error } = await staffAClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId,
      p_token: TOKEN_1,
      p_company_id: COMPANY_ID_1,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('NEGATIVO: admin de OUTRA agencia NAO grava neste', async () => {
    const { data, error } = await ownerBClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId, // ownerB e admin da agencia B, nao da A
      p_token: TOKEN_1,
      p_company_id: COMPANY_ID_1,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('admin/owner grava: retorno e so rotation_version (int), nunca o token', async () => {
    const { data, error } = await ownerAClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId,
      p_token: TOKEN_1,
      p_company_id: COMPANY_ID_1,
    });
    expect(error).toBeNull();
    expect(data).toBe(1); // rotation_version inicial
    expect(JSON.stringify(data)).not.toContain(TOKEN_1);
  });

  it('roundtrip no vault: o token esta no cofre (sem plaintext na tabela)', async () => {
    const { data: meta, error: eMeta } = await service
      .rpc('get_agency_credential_meta', { p_agency_id: agencyAId })
      .maybeSingle();
    expect(eMeta).toBeNull();
    const row = meta as { secret_key_id: string; company_id: string; rotation_version: number };
    expect(row.rotation_version).toBe(1);
    expect(row.company_id).toBe(COMPANY_ID_1);

    const { data: plain, error: eDec } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(eDec).toBeNull();
    expect(plain).toBe(TOKEN_1);
  });

  it('salvar de novo rotaciona: rotation_version sobe e o token novo substitui', async () => {
    const { data, error } = await ownerAClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId,
      p_token: TOKEN_2,
      p_company_id: COMPANY_ID_1,
    });
    expect(error).toBeNull();
    expect(data).toBe(2); // subiu

    const { data: meta } = await service
      .rpc('get_agency_credential_meta', { p_agency_id: agencyAId })
      .maybeSingle();
    const row = meta as { secret_key_id: string };
    const { data: plain } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: row.secret_key_id,
    });
    expect(plain).toBe(TOKEN_2);
    expect(plain).not.toBe(TOKEN_1);
  });

  it('token vazio e recusado (22023)', async () => {
    const { data, error } = await ownerAClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId,
      p_token: '   ',
      p_company_id: COMPANY_ID_1,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('company_id vazio e recusado (22023)', async () => {
    const { data, error } = await ownerAClient.rpc('save_agency_ghl_credential', {
      p_agency_id: agencyAId,
      p_token: TOKEN_2,
      p_company_id: '',
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('get_agency_ghl_credential_status: admin ve conectado, sem o token', async () => {
    const { data, error } = await ownerAClient
      .rpc('get_agency_ghl_credential_status', { p_agency_id: agencyAId })
      .maybeSingle();
    expect(error).toBeNull();
    const row = data as { company_id: string; rotation_version: number } | null;
    expect(row).toBeTruthy();
    expect(row!.rotation_version).toBe(2);
    expect(row!.company_id).toBe(COMPANY_ID_1);
    expect(JSON.stringify(row)).not.toContain(TOKEN_1);
    expect(JSON.stringify(row)).not.toContain(TOKEN_2);
    expect(JSON.stringify(row)).not.toContain('secret_key_id');
  });

  it('NEGATIVO: get_agency_ghl_credential_status nao mostra nada a nao-admin', async () => {
    const { data, error } = await staffAClient
      .rpc('get_agency_ghl_credential_status', { p_agency_id: agencyAId })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
