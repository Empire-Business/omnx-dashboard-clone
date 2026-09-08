/**
 * Fase 8 — LGPD/offboarding: expurgo completo de workspace.
 * docs/PLANO-MULTI-TENANT-AGENCY.md (secao 15 + 16) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md
 *
 * Prova, contra o banco de TESTE real:
 *  - dry_run=true roda os DELETEs de verdade mas NAO commita nada (rollback via
 *    RAISE) — conta exatamente o que seria apagado sem apagar de verdade;
 *  - purge real (dry_run=false) apaga 100% dos dados do workspace A, incluindo
 *    a cadeia de cascade (contatos -> oportunidades/comunicacoes/vendas_fechamento/
 *    reunioes), a FK bloqueante (ghl_tasks), as FKs SET NULL que o cascade da
 *    workspace NAO cobriria sozinho (ghl_opp_reconcile_items, ghl_users,
 *    ghl_calendars), e as tabelas sem FK (webhooks_ghl/contact_opp_sync_queue/
 *    webhook_unresolved) via location_id;
 *  - ZERO vazamento cross-tenant: o workspace B (dados paralelos) permanece
 *    100% intacto depois do purge de A;
 *  - confirmation_name errado -> RECUSA (fail-closed), nada e apagado;
 *  - apos o purge, a linha em workspaces some e nenhuma linha orfa (contato_id
 *    apontando pro workspace apagado) sobra em nenhuma tabela testada.
 *
 * Producao (qzesffnkqgelmtfblzkr) NUNCA e alvo: ver helpers/safe-guard.ts.
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

describe('Fase 8 — expurgo LGPD de workspace (purge_workspace_data)', () => {
  let service: SupabaseClient;

  let ownerA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;

  const locationA = `loc-purge-a-${Date.now()}`;
  const locationB = `loc-purge-b-${Date.now()}`;

  let contatoAId: string;
  let contatoBId: string;
  let reconcileRunId: string;

  async function seedWorkspaceData(ws: TestWorkspace, owner: TestUser, locationId: string) {
    const { data: contato, error: eContato } = await service
      .from('contatos')
      .insert({
        ghl_id: `ghl-${ws.id}`,
        nome: `Lead de teste ${ws.name}`,
        email: `lead-${ws.id}@example.com`,
        workspace_id: ws.id,
      })
      .select('id')
      .single();
    if (eContato) throw new Error(`seed contato: ${eContato.message}`);
    const contatoId = contato.id as string;

    const { error: eOpp } = await service.from('oportunidades').insert({
      contato_id: contatoId,
      workspace_id: ws.id,
      ghl_opportunity_id: `opp-${ws.id}`,
      nome_contato: `Lead de teste ${ws.name}`,
      data_lead_recebido: new Date().toISOString(), // evita trigger_sync_opp_dates (so dispara se NULL)
    });
    if (eOpp) throw new Error(`seed oportunidade: ${eOpp.message}`);

    const { error: eComu } = await service.from('comunicacoes').insert({
      contato_id: contatoId,
      workspace_id: ws.id,
      tipo: 'mensagem',
      mensagem_body: 'ola',
    });
    if (eComu) throw new Error(`seed comunicacao: ${eComu.message}`);

    const { error: eReuniao } = await service.from('reunioes').insert({
      contato_id: contatoId,
    });
    if (eReuniao) throw new Error(`seed reuniao: ${eReuniao.message}`);

    const { error: eTask } = await service.from('ghl_tasks').insert({
      ghl_task_id: `task-${ws.id}`,
      contato_id: contatoId,
      title: 'Ligar pro lead',
    });
    if (eTask) throw new Error(`seed ghl_task: ${eTask.message}`);

    const { error: eGhlUser } = await service.from('ghl_users').insert({
      ghl_id: `user-${ws.id}`,
      nome: `Usuario GHL ${ws.name}`,
      email: `ghluser-${ws.id}@example.com`,
      workspace_id: ws.id,
    });
    if (eGhlUser) throw new Error(`seed ghl_users: ${eGhlUser.message}`);

    const { error: eCal } = await service.from('ghl_calendars').insert({
      ghl_id: `cal-${ws.id}`,
      nome: `Calendario ${ws.name}`,
      workspace_id: ws.id,
      location_id: locationId,
    });
    if (eCal) throw new Error(`seed ghl_calendars: ${eCal.message}`);

    const { error: eSettings } = await service.from('ghl_integration_settings').insert({
      workspace_id: ws.id,
      ghl_location_id: locationId,
      is_active: true,
    });
    if (eSettings) throw new Error(`seed ghl_integration_settings: ${eSettings.message}`);

    const { error: eWebhook } = await service.from('webhooks_ghl').insert({
      payload: { type: 'ContactCreate', locationId },
      location_id: locationId,
    });
    if (eWebhook) throw new Error(`seed webhooks_ghl: ${eWebhook.message}`);

    const { error: eQueue } = await service.from('contact_opp_sync_queue').insert({
      ghl_contact_id: `ghl-contact-${ws.id}`,
      location_id: locationId,
    });
    if (eQueue) throw new Error(`seed contact_opp_sync_queue: ${eQueue.message}`);

    const { error: eUnresolved } = await service.from('webhook_unresolved').insert({
      source: 'webhook-ghl',
      location_id: locationId,
      reason: 'location_sem_workspace_ativo',
    });
    if (eUnresolved) throw new Error(`seed webhook_unresolved: ${eUnresolved.message}`);

    const { error: eStevo } = await service.from('stevo_whatsapp_calls').insert({
      call_id: `call-${ws.id}`,
      workspace_id: ws.id,
      caller: '+5511900000000',
      receiver: '+5511911111111',
    });
    if (eStevo) throw new Error(`seed stevo_whatsapp_calls: ${eStevo.message}`);

    // AI: usuario dono do workspace, membership EXCLUSIVA (so este workspace) -> deve ser apagado no purge.
    const { data: conv, error: eConv } = await service
      .from('ai_conversations')
      .insert({ user_id: owner.id, title: `Conversa ${ws.name}`, workspace_id: ws.id })
      .select('id')
      .single();
    if (eConv) throw new Error(`seed ai_conversations: ${eConv.message}`);
    const { error: eMsg } = await service
      .from('ai_messages')
      .insert({ conversation_id: conv.id, role: 'user', content: 'oi clara' });
    if (eMsg) throw new Error(`seed ai_messages: ${eMsg.message}`);

    // ghl_opp_reconcile_items precisa de um run pai.
    const { data: run, error: eRun } = await service
      .from('ghl_opp_reconcile_runs')
      .insert({ mode: 'audit', scope: 'all', source: 'test', status: 'done' })
      .select('id')
      .single();
    if (eRun) throw new Error(`seed ghl_opp_reconcile_runs: ${eRun.message}`);
    const { error: eItem } = await service.from('ghl_opp_reconcile_items').insert({
      run_id: run.id,
      ghl_contact_id: `ghl-contact-${ws.id}`,
      contato_id: contatoId,
      location_id: locationId,
    });
    if (eItem) throw new Error(`seed ghl_opp_reconcile_items: ${eItem.message}`);

    return { contatoId, reconcileRunId: run.id as string };
  }

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('purge-ownerA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('purge-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, `WS Purge A ${Date.now()}`, ownerA.id);
    wsB = await createTestWorkspace(service, `WS Purge B ${Date.now()}`, ownerB.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    const seededA = await seedWorkspaceData(wsA, ownerA, locationA);
    contatoAId = seededA.contatoId;
    reconcileRunId = seededA.reconcileRunId;

    const seededB = await seedWorkspaceData(wsB, ownerB, locationB);
    contatoBId = seededB.contatoId;
  }, 60000);

  afterAll(async () => {
    // Workspace A ja foi apagado pelo purge (se o teste principal rodou); limpa B manualmente.
    await service.from('ghl_opp_reconcile_runs').delete().eq('id', reconcileRunId).select();
    await service.from('workspaces').delete().eq('id', wsB.id);
    await deleteTestUsers(service, [ownerA.id, ownerB.id]);
  }, 30000);

  it('recusa expurgo quando p_confirmation_name nao bate (fail-closed) — nada e apagado', async () => {
    const { error } = await service.rpc('purge_workspace_data', {
      p_workspace_id: wsA.id,
      p_confirmation_name: 'nome errado de propósito',
      p_dry_run: true,
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/confirmação não bate/);

    const { data: aindaExiste } = await service.from('workspaces').select('id').eq('id', wsA.id).maybeSingle();
    expect(aindaExiste).not.toBeNull();
  });

  it('dry_run=true calcula contagens reais mas NAO commita (rollback)', async () => {
    const { error } = await service.rpc('purge_workspace_data', {
      p_workspace_id: wsA.id,
      p_confirmation_name: wsA.name,
      p_dry_run: true,
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/DRY_RUN_ROLLBACK/);

    const report = JSON.parse(error!.message.replace('DRY_RUN_ROLLBACK: ', ''));
    expect(report.contatos_e_cascade_crm).toBe(1);
    expect(report.ghl_tasks).toBe(1);
    expect(report.ghl_opp_reconcile_items).toBe(1);
    expect(report.ghl_users).toBe(1);
    expect(report.ghl_calendars).toBe(1);
    expect(report.webhooks_ghl).toBe(1);
    expect(report.contact_opp_sync_queue).toBe(1);
    expect(report.webhook_unresolved).toBe(1);
    expect(report.stevo_whatsapp_calls).toBe(1);
    expect(report.ai_messages).toBe(1);
    expect(report.ai_conversations).toBe(1);
    expect(report.workspaces_row).toBe(1);

    // Nada foi de fato apagado — workspace A e seus dados continuam la.
    const { data: aindaExiste } = await service.from('workspaces').select('id').eq('id', wsA.id).maybeSingle();
    expect(aindaExiste).not.toBeNull();
    const { data: contatoAindaExiste } = await service
      .from('contatos')
      .select('id')
      .eq('id', contatoAId)
      .maybeSingle();
    expect(contatoAindaExiste).not.toBeNull();
  });

  it('purge real (dry_run=false) apaga 100% do workspace A e NAO toca no workspace B', async () => {
    const { data, error } = await service.rpc('purge_workspace_data', {
      p_workspace_id: wsA.id,
      p_confirmation_name: wsA.name,
      p_dry_run: false,
    });
    expect(error).toBeNull();
    expect(data.workspaces_row).toBe(1);
    expect(data.contatos_e_cascade_crm).toBe(1);

    // --- Workspace A: 100% apagado, sem orfaos ---
    const tablesAndFilters: Array<[string, Record<string, string>]> = [
      ['workspaces', { id: wsA.id }],
      ['contatos', { workspace_id: wsA.id }],
      ['oportunidades', { workspace_id: wsA.id }],
      ['comunicacoes', { workspace_id: wsA.id }],
      ['vendas_fechamento', { workspace_id: wsA.id }],
      ['ghl_users', { workspace_id: wsA.id }],
      ['ghl_calendars', { workspace_id: wsA.id }],
      ['ghl_integration_settings', { workspace_id: wsA.id }],
      ['workspace_members', { workspace_id: wsA.id }],
      ['webhooks_ghl', { location_id: locationA }],
      ['contact_opp_sync_queue', { location_id: locationA }],
      ['webhook_unresolved', { location_id: locationA }],
      ['stevo_whatsapp_calls', { workspace_id: wsA.id }],
    ];
    for (const [table, filter] of tablesAndFilters) {
      const { data: rows, error: selErr } = await service.from(table).select('id').match(filter);
      expect(selErr, `select em ${table} falhou`).toBeNull();
      expect(rows?.length ?? 0, `linhas residuais em ${table} apos purge`).toBe(0);
    }

    // reunioes/ghl_tasks/ghl_opp_reconcile_items nao tem workspace_id — checar por contato_id orfao.
    const { data: reunioesOrfas } = await service.from('reunioes').select('id').eq('contato_id', contatoAId);
    expect(reunioesOrfas?.length ?? 0).toBe(0);
    const { data: tasksOrfas } = await service.from('ghl_tasks').select('id').eq('contato_id', contatoAId);
    expect(tasksOrfas?.length ?? 0).toBe(0);
    const { data: itemsOrfaos } = await service
      .from('ghl_opp_reconcile_items')
      .select('id')
      .eq('contato_id', contatoAId);
    expect(itemsOrfaos?.length ?? 0).toBe(0);

    // AI: conversa do owner A (membership exclusiva) apagada.
    const { data: convsA } = await service.from('ai_conversations').select('id').eq('user_id', ownerA.id);
    expect(convsA?.length ?? 0).toBe(0);

    // --- Workspace B: 100% intacto (zero vazamento cross-tenant do purge) ---
    const { data: wsBAinda } = await service.from('workspaces').select('id').eq('id', wsB.id).maybeSingle();
    expect(wsBAinda).not.toBeNull();
    const { data: contatoB } = await service.from('contatos').select('id').eq('id', contatoBId).maybeSingle();
    expect(contatoB).not.toBeNull();
    const { data: webhooksB } = await service.from('webhooks_ghl').select('id').eq('location_id', locationB);
    expect(webhooksB?.length ?? 0).toBe(1);
    const { data: ghlUsersB } = await service.from('ghl_users').select('id').eq('workspace_id', wsB.id);
    expect(ghlUsersB?.length ?? 0).toBe(1);
    const { data: convsB } = await service.from('ai_conversations').select('id').eq('user_id', ownerB.id);
    expect(convsB?.length ?? 0).toBe(1);
    const { data: stevoB } = await service.from('stevo_whatsapp_calls').select('id').eq('workspace_id', wsB.id);
    expect(stevoB?.length ?? 0).toBe(1);
  }, 30000);

  it('export_workspace_data_manifest reporta zero para workspace ja apagado (prova de completude)', async () => {
    // Workspace A ja foi apagado no teste anterior — a função deve recusar (não existe mais).
    const { error } = await service.rpc('export_workspace_data_manifest', { p_workspace_id: wsA.id });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/não encontrado/);
  });

  it('export_workspace_data_manifest do workspace B reflete os dados reais (contagem > 0)', async () => {
    const { data, error } = await service.rpc('export_workspace_data_manifest', { p_workspace_id: wsB.id });
    expect(error).toBeNull();
    expect(data.contatos).toBe(1);
    expect(data.ghl_users).toBe(1);
    expect(data.webhooks_ghl).toBe(1);
    expect(data.stevo_whatsapp_calls).toBe(1);
    expect(Array.isArray(data._gaps_nao_isolaveis_hoje)).toBe(true);
  });
});
