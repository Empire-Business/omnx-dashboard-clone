/**
 * Meta Ads — teste A→B de isolamento multi-tenant.
 *
 * Cenário (banco de TESTE real, via .env.test):
 *   - Workspace A (ownerA) tem a conta Meta "act_test_111" vinculada.
 *   - Workspace B (ownerB) tem a conta Meta "act_test_222" vinculada.
 *   - Workspace C (ownerC) não tem conta Meta vinculada.
 *
 * O que prova:
 *   1. workspace_meta_ad_accounts isola leitura (B não lê conta de A).
 *   2. INSERT direto em meta_ads_insights sem workspace_id é rejeitado (NOT NULL).
 *   3. INSERT com workspace_id mas account_id não vinculado é rejeitado pelo trigger.
 *   4. INSERT com workspace_id e account_id corretos funciona.
 *   5. UNIQUE constraint inclui workspace_id (mesmo ad_id,date em workspaces diferentes).
 *   6. RLS: B não lê insights de A.
 *   7. processar_meta_ads_raw exige workspace_id nos params (fail-closed).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../helpers/safe-guard';
import {
  getServiceClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

const HOOK_TIMEOUT_MS = 180_000;

describe('Meta Ads — isolamento A→B (banco de teste)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let ownerB: TestUser;
  let ownerC: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let wsC: TestWorkspace;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;

  const accountA = 'act_test_111';
  const accountB = 'act_test_222';

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('meta-owner-a'), 'Test123!@#');
    ownerB = await createTestUser(service, uniqueEmail('meta-owner-b'), 'Test123!@#');
    ownerC = await createTestUser(service, uniqueEmail('meta-owner-c'), 'Test123!@#');

    wsA = await createTestWorkspace(service, 'Meta Ads Isolation A', ownerA.id);
    wsB = await createTestWorkspace(service, 'Meta Ads Isolation B', ownerB.id);
    wsC = await createTestWorkspace(service, 'Meta Ads Isolation C', ownerC.id);

    // Adicionar owners como membros ativos (RLS depende de workspace_members)
    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);
    await addWorkspaceMember(service, wsC.id, ownerC.id, 'owner', ownerC.id);

    // Vincular contas Meta aos workspaces
    await service.from('workspace_meta_ad_accounts').insert([
      { workspace_id: wsA.id, account_id: accountA, is_active: true },
      { workspace_id: wsB.id, account_id: accountB, is_active: true },
    ]);

    clientA = await getAuthenticatedClient(ownerA.email, ownerA.password);
    clientB = await getAuthenticatedClient(ownerB.email, ownerB.password);
    clientC = await getAuthenticatedClient(ownerC.email, ownerC.password);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    // Limpar dados de teste
    await service.from('meta_ads_insights').delete().in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    await service.from('meta_ads_raw_insights').delete().in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    await service.from('meta_ads_campaigns').delete().in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    await service.from('workspace_meta_ad_accounts').delete().in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id, wsC.id]);
    await service.auth.admin.deleteUser(ownerA.id);
    await service.auth.admin.deleteUser(ownerB.id);
    await service.auth.admin.deleteUser(ownerC.id);
  }, HOOK_TIMEOUT_MS);

  it('workspace_meta_ad_accounts isola leitura entre tenants', async () => {
    const { data: dataA, error: errA } = await clientA
      .from('workspace_meta_ad_accounts')
      .select('account_id')
      .eq('workspace_id', wsA.id);
    expect(errA).toBeNull();
    expect(dataA?.map((r) => r.account_id)).toEqual([accountA]);

    const { data: dataB, error: errB } = await clientB
      .from('workspace_meta_ad_accounts')
      .select('account_id')
      .eq('workspace_id', wsA.id);
    expect(errB).toBeNull();
    expect(dataB).toEqual([]);
  });

  it('rejeita INSERT em meta_ads_insights sem workspace_id', async () => {
    const { error } = await service.from('meta_ads_insights').insert({
      account_id: accountA,
      campaign_id: 'camp_1',
      ad_id: 'ad_1',
      date: '2026-07-01',
      fetched_at: new Date().toISOString(),
    } as any);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/workspace_id/i);
  });

  it('rejeita INSERT em meta_ads_insights com account_id não vinculada ao workspace', async () => {
    const { error } = await service.from('meta_ads_insights').insert({
      workspace_id: wsC.id,
      account_id: accountA,
      campaign_id: 'camp_1',
      ad_id: 'ad_1',
      date: '2026-07-01',
      fetched_at: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/nao esta vinculada/i);
  });

  it('permite INSERT em meta_ads_insights com workspace_id e account_id corretos', async () => {
    const { error } = await service.from('meta_ads_insights').insert({
      workspace_id: wsA.id,
      account_id: accountA,
      campaign_id: 'camp_a1',
      ad_id: 'ad_a1',
      date: '2026-07-01',
      fetched_at: new Date().toISOString(),
    });

    expect(error).toBeNull();
  });

  it('UNIQUE constraint inclui workspace_id (mesmo ad_id,date em workspaces diferentes)', async () => {
    await service.from('meta_ads_insights').insert({
      workspace_id: wsA.id,
      account_id: accountA,
      campaign_id: 'camp_a1',
      ad_id: 'ad_shared',
      date: '2026-07-02',
      fetched_at: new Date().toISOString(),
    });

    const { error: dupError } = await service.from('meta_ads_insights').insert({
      workspace_id: wsA.id,
      account_id: accountA,
      campaign_id: 'camp_a1',
      ad_id: 'ad_shared',
      date: '2026-07-02',
      fetched_at: new Date().toISOString(),
    });

    expect(dupError).not.toBeNull();
    expect(dupError?.message).toMatch(/duplicate key/i);

    const { error: otherWsError } = await service.from('meta_ads_insights').insert({
      workspace_id: wsB.id,
      account_id: accountB,
      campaign_id: 'camp_b1',
      ad_id: 'ad_shared',
      date: '2026-07-02',
      fetched_at: new Date().toISOString(),
    });

    expect(otherWsError).toBeNull();
  });

  it('RLS impede que B leia insights de A', async () => {
    const { data: dataA, error: errA } = await clientA
      .from('meta_ads_insights')
      .select('ad_id')
      .eq('workspace_id', wsA.id);
    expect(errA).toBeNull();
    expect(dataA?.length).toBeGreaterThan(0);

    const { data: dataB, error: errB } = await clientB
      .from('meta_ads_insights')
      .select('ad_id')
      .eq('workspace_id', wsA.id);
    expect(errB).toBeNull();
    expect(dataB).toEqual([]);
  });

  it('processar_meta_ads_raw exige workspace_id nos params (fail-closed)', async () => {
    const { data: raw, error: rawErr } = await service
      .from('meta_ads_raw_insights')
      .insert({
        api_endpoint: '/insights',
        params: {
          account_id: accountA,
          level: 'ad',
          date_preset: 'today',
        },
        response_data: { data: [] },
        http_status: 200,
        records_count: 0,
        fetch_started_at: new Date().toISOString(),
        fetch_finished_at: new Date().toISOString(),
        workspace_id: wsA.id,
      })
      .select('id')
      .single();

    expect(rawErr).toBeNull();

    const { error } = await service.rpc('processar_meta_ads_raw', {
      p_raw_id: raw!.id,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/workspace_id obrigatorio/i);
  });

  it('processar_meta_ads_raw funciona quando workspace_id e account_id estão corretos', async () => {
    const { data: raw, error: rawErr } = await service
      .from('meta_ads_raw_insights')
      .insert({
        api_endpoint: '/insights',
        params: {
          account_id: accountA,
          level: 'ad',
          date_preset: 'today',
          workspace_id: wsA.id,
        },
        response_data: {
          data: [
            {
              campaign_id: 'camp_ok',
              campaign_name: 'Campanha OK',
              adset_id: 'as_ok',
              adset_name: 'Adset OK',
              ad_id: 'ad_ok',
              ad_name: 'Anuncio OK',
              date_start: '2026-07-03',
              spend: '10.50',
              impressions: '100',
              clicks: '5',
              reach: '80',
            },
          ],
        },
        http_status: 200,
        records_count: 1,
        fetch_started_at: new Date().toISOString(),
        fetch_finished_at: new Date().toISOString(),
        workspace_id: wsA.id,
      })
      .select('id')
      .single();

    expect(rawErr).toBeNull();

    const { data, error } = await service.rpc('processar_meta_ads_raw', {
      p_raw_id: raw!.id,
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ insights_inseridos: 1 });
  });
});
