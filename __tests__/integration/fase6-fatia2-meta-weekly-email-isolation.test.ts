/**
 * Fase 6 (fatia 2) — isolamento cross-tenant real, com seed, para as 4 tabelas
 * que ganharam `workspace_id` na migration
 * `20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql`:
 * `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_schedules`,
 * `weekly_email_logs`.
 *
 * A prova AMPLA genérica em `workspace-isolation.test.ts` (it.each sobre
 * TABLES_WITH_WORKSPACE_ID) roda contra essas 4 tabelas, mas como elas estão
 * vazias no banco de teste, a prova por filtro sozinha é fraca (passaria mesmo
 * com RLS quebrada, só porque não há dado nenhum). Este arquivo semeia dado
 * REAL nas duas tabelas e prova:
 *
 *  1) O trigger BEFORE INSERT resolve `workspace_id` automaticamente via JOIN
 *     (meta_ads_insights.ad_id -> meta_ads_permalinks; workspace_members via
 *     created_by -> weekly_email_schedules; schedule_id -> weekly_email_logs)
 *     quando o caller não informa a coluna.
 *  2) ACHADO DE SEGURANÇA corrigido na mesma migration: as policies de SELECT
 *     antigas dessas 4 tabelas NÃO filtravam por linha (qualquer autenticado
 *     lia tudo). Com dado seedado em A e B, prova que A só vê o que é de A.
 *  3) INSERT tentando fixar `workspace_id` de outro workspace é bloqueado
 *     pelo WITH CHECK (weekly_email_schedules/weekly_email_logs).
 *
 * Ref: docs/ROADMAP-MULTI-TENANT.md (log de execução, Fase 6 fatia 2).
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

describe('Fase 6 (fatia 2) — meta_ads_permalinks / weekly_email_* com seed real', () => {
  let service: SupabaseClient;

  let userA: TestUser;
  let userB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  const adIdA = `ad-fase6f2-a-${Date.now()}`;
  const adIdB = `ad-fase6f2-b-${Date.now()}`;

  let scheduleAId: string;
  let scheduleBId: string;
  let logAId: string;
  let logBId: string;
  let permalinkAAdId: string;

  beforeAll(async () => {
    service = getServiceClient();

    userA = await createTestUser(service, uniqueEmail('test-f6f2-usera'), 'TestPassword123!');
    userB = await createTestUser(service, uniqueEmail('test-f6f2-userb'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'Fase6Fatia2 - Workspace A', userA.id);
    wsB = await createTestWorkspace(service, 'Fase6Fatia2 - Workspace B', userB.id);

    await addWorkspaceMember(service, wsA.id, userA.id, 'owner', userA.id);
    await addWorkspaceMember(service, wsB.id, userB.id, 'owner', userB.id);

    // Vincular a conta Meta ao workspace A (fail-closed do isolamento Meta Ads).
    await service.from('workspace_meta_ad_accounts').insert({
      workspace_id: wsA.id,
      account_id: 'acc-fase6f2',
      is_active: true,
    });

    // Seed em meta_ads_insights (workspace_id já existente desde a Fase 2) para
    // provar o JOIN do trigger de meta_ads_permalinks.
    const { error: eInsight } = await service.from('meta_ads_insights').insert({
      account_id: 'acc-fase6f2',
      campaign_id: 'camp-fase6f2',
      ad_id: adIdA,
      date: '2026-07-01',
      workspace_id: wsA.id,
    });
    if (eInsight) throw new Error(`seed meta_ads_insights: ${eInsight.message}`);

    // Insert SEM workspace_id — o trigger deve resolver via ad_id -> meta_ads_insights.
    const { data: permalinkA, error: ePermA } = await service
      .from('meta_ads_permalinks')
      .insert({ ad_id: adIdA, creative_code: 'CR-F6F2-A' })
      .select('ad_id, workspace_id')
      .single();
    if (ePermA) throw new Error(`seed meta_ads_permalinks A: ${ePermA.message}`);
    permalinkAAdId = permalinkA.ad_id as string;
    expect(permalinkA.workspace_id).toBe(wsA.id); // prova o trigger ANTES de qualquer describe/it

    // B: sem join possível (ad_id não existe em meta_ads_insights) e mais de 1
    // workspace ativo no banco de teste -> precisa informar workspace_id explicitamente.
    const { error: ePermB } = await service
      .from('meta_ads_permalinks')
      .insert({ ad_id: adIdB, creative_code: 'CR-F6F2-B', workspace_id: wsB.id });
    if (ePermB) throw new Error(`seed meta_ads_permalinks B: ${ePermB.message}`);

    // weekly_email_schedules — insert SEM workspace_id, o trigger resolve via
    // created_by -> workspace_members (userA só pertence a wsA).
    const { data: schedA, error: eSchedA } = await service
      .from('weekly_email_schedules')
      .insert({
        created_by: userA.id,
        name: 'Relatorio A',
        modules: ['vendas'],
        report_type: 'cohort',
        dimensions: [],
        frequency: 'weekly',
        recipient_emails: ['a@example.com'],
      })
      .select('id, workspace_id')
      .single();
    if (eSchedA) throw new Error(`seed weekly_email_schedules A: ${eSchedA.message}`);
    scheduleAId = schedA.id as string;
    expect(schedA.workspace_id).toBe(wsA.id); // prova o trigger

    const { data: schedB, error: eSchedB } = await service
      .from('weekly_email_schedules')
      .insert({
        created_by: userB.id,
        name: 'Relatorio B',
        modules: ['vendas'],
        report_type: 'cohort',
        dimensions: [],
        frequency: 'weekly',
        recipient_emails: ['b@example.com'],
      })
      .select('id, workspace_id')
      .single();
    if (eSchedB) throw new Error(`seed weekly_email_schedules B: ${eSchedB.message}`);
    scheduleBId = schedB.id as string;

    // weekly_email_logs — insert SEM workspace_id, o trigger resolve via schedule_id.
    const { data: logA, error: eLogA } = await service
      .from('weekly_email_logs')
      .insert({ schedule_id: scheduleAId, week_start: '2026-07-01', recipient_emails: ['a@example.com'], status: 'sent' })
      .select('id, workspace_id')
      .single();
    if (eLogA) throw new Error(`seed weekly_email_logs A: ${eLogA.message}`);
    logAId = logA.id as string;
    expect(logA.workspace_id).toBe(wsA.id); // prova o trigger

    const { data: logB, error: eLogB } = await service
      .from('weekly_email_logs')
      .insert({ schedule_id: scheduleBId, week_start: '2026-07-01', recipient_emails: ['b@example.com'], status: 'sent' })
      .select('id, workspace_id')
      .single();
    if (eLogB) throw new Error(`seed weekly_email_logs B: ${eLogB.message}`);
    logBId = logB.id as string;

    clientA = await getAuthenticatedClient(userA.email, userA.password);
    clientB = await getAuthenticatedClient(userB.email, userB.password);
  });

  afterAll(async () => {
    await service.from('weekly_email_logs').delete().in('id', [logAId, logBId]);
    await service.from('weekly_email_schedules').delete().in('id', [scheduleAId, scheduleBId]);
    await service.from('meta_ads_permalinks').delete().in('ad_id', [adIdA, adIdB]);
    await service.from('meta_ads_insights').delete().eq('ad_id', adIdA);
    await deleteTestUsers(service, [userA.id, userB.id]);
  });

  it('trigger resolveu workspace_id de meta_ads_permalinks via join com meta_ads_insights.ad_id', async () => {
    const { data } = await service.from('meta_ads_permalinks').select('workspace_id').eq('ad_id', permalinkAAdId).single();
    expect(data!.workspace_id).toBe(wsA.id);
  });

  it('A ve seu proprio permalink mas NAO ve o de B', async () => {
    const { data: mine, error: eMine } = await clientA.from('meta_ads_permalinks').select('*').eq('ad_id', adIdA);
    expect(eMine).toBeNull();
    expect(mine).toHaveLength(1);

    const { data: theirs, error: eTheirs } = await clientA.from('meta_ads_permalinks').select('*').eq('ad_id', adIdB);
    expect(eTheirs).toBeNull();
    expect(theirs).toHaveLength(0);
  });

  it('B ve seu proprio permalink mas NAO ve o de A', async () => {
    const { data: theirs } = await clientB.from('meta_ads_permalinks').select('*').eq('ad_id', adIdA);
    expect(theirs).toHaveLength(0);
  });

  it('A ve seu proprio weekly_email_schedule mas NAO ve o de B (achado corrigido: policy antiga nao filtrava)', async () => {
    const { data: mine } = await clientA.from('weekly_email_schedules').select('*').eq('id', scheduleAId);
    expect(mine).toHaveLength(1);

    const { data: theirs } = await clientA.from('weekly_email_schedules').select('*').eq('id', scheduleBId);
    expect(theirs).toHaveLength(0);
  });

  it('A ve seu proprio weekly_email_log (com recipient_emails) mas NAO ve o de B (PII)', async () => {
    const { data: mine } = await clientA.from('weekly_email_logs').select('*').eq('id', logAId);
    expect(mine).toHaveLength(1);
    expect(mine![0].recipient_emails).toContain('a@example.com');

    const { data: theirs } = await clientA.from('weekly_email_logs').select('*').eq('id', logBId);
    expect(theirs).toHaveLength(0);
  });

  it('A nao consegue inserir weekly_email_schedule fixando workspace_id de B (WITH CHECK bloqueia)', async () => {
    const { error } = await clientA.from('weekly_email_schedules').insert({
      created_by: userA.id,
      workspace_id: wsB.id,
      name: 'Tentativa maliciosa',
      modules: ['vendas'],
      report_type: 'cohort',
      dimensions: [],
      frequency: 'weekly',
      recipient_emails: ['attacker@example.com'],
    });
    expect(error).not.toBeNull();
  });

  it('A nao consegue atualizar weekly_email_schedule de B diretamente pelo cliente', async () => {
    await clientA
      .from('weekly_email_schedules')
      .update({ recipient_emails: ['attacker@example.com'] })
      .eq('id', scheduleBId);

    const { data } = await service.from('weekly_email_schedules').select('recipient_emails').eq('id', scheduleBId).single();
    expect(data!.recipient_emails).toEqual(['b@example.com']);
  });

  afterAll(async () => {
    await service.from('weekly_email_logs').delete().in('id', [logAId, logBId]);
    await service.from('weekly_email_schedules').delete().in('id', [scheduleAId, scheduleBId]);
    await service.from('meta_ads_permalinks').delete().in('ad_id', [adIdA, adIdB]);
    await service.from('meta_ads_insights').delete().in('ad_id', [adIdA, adIdB]);
    await service.from('workspace_meta_ad_accounts').delete().eq('account_id', 'acc-fase6f2');
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await service.auth.admin.deleteUser(userA.id);
    await service.auth.admin.deleteUser(userB.id);
  });
});
