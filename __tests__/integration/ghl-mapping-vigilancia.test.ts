/**
 * Vigilância automática de mudanças de campos GHL (achado da auditoria de
 * mapeamento GHL, 2026-07-12): discover-ghl-config só rodava sob clique manual,
 * sem nenhum agendamento revisitando o GHL para detectar campo novo/removido.
 *
 * Prova, com dados sintéticos (sem depender de credencial GHL real):
 *  - detect_ghl_mapping_changes cria alerta quando a contagem de um source muda
 *    entre os 2 discovery runs mais recentes;
 *  - é idempotente — rodar de novo sobre o mesmo par de runs não duplica alerta;
 *  - NÃO cria alerta quando a contagem não mudou;
 *  - NÃO cria alerta no primeiro discovery de um source (sem "anterior" para comparar);
 *  - RLS: owner/admin do workspace lê o alerta; usuário de outro workspace não vê nada;
 *  - discover-ghl-config aceita chamador service_role sem precisar de membership
 *    (necessário para o cron rodar sem um usuário logado) — testado via leitura do
 *    código-fonte da function (isServiceRoleCaller), não via chamada HTTP real (sem
 *    credencial GHL disponível no ambiente de teste).
 *
 * Ref: docs/GHL-MAPEAMENTO-VIGILANCIA.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const ROOT = join(__dirname, '..', '..');

describe('vigilância de mapeamento GHL — dispatch + detecção de mudanças', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let outsider: TestUser;
  let ws: TestWorkspace;
  let wsOther: TestWorkspace;
  let ownerClient: SupabaseClient;
  let outsiderClient: SupabaseClient;

  const insertedRunIds: string[] = [];

  async function insertRun(workspaceId: string, source: string, count: number, offsetMs: number) {
    const { data, error } = await service
      .from('ghl_discovery_runs')
      .insert({
        workspace_id: workspaceId,
        source,
        status: 'success',
        payload: { count },
        created_at: new Date(Date.now() + offsetMs).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed ghl_discovery_runs: ${error.message}`);
    insertedRunIds.push(data.id);
    return data.id as string;
  }

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('ghlwatch-owner'), 'TestPassword123!');
    outsider = await createTestUser(service, uniqueEmail('ghlwatch-outsider'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS GHL Watch', owner.id);
    wsOther = await createTestWorkspace(service, 'WS GHL Watch Other', outsider.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, wsOther.id, outsider.id, 'owner', outsider.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
    outsiderClient = await getAuthenticatedClient(outsider.email, outsider.password);
  });

  afterAll(async () => {
    await service.from('ghl_mapping_change_alerts').delete().in('workspace_id', [ws.id, wsOther.id]);
    await service.from('ghl_discovery_runs').delete().in('id', insertedRunIds);
    await service.from('workspace_members').delete().in('workspace_id', [ws.id, wsOther.id]);
    await service.from('workspaces').delete().in('id', [ws.id, wsOther.id]);
    await deleteTestUsers(service, [owner.id, outsider.id]);
  });

  it('cria alerta quando a contagem muda entre os 2 runs mais recentes', async () => {
    await insertRun(ws.id, 'contact_custom_fields', 10, -2000);
    await insertRun(ws.id, 'contact_custom_fields', 13, -1000);

    const { data, error } = await service.rpc('detect_ghl_mapping_changes', { p_workspace_id: ws.id });
    expect(error).toBeNull();

    const row = (data ?? []).find((r: { source: string }) => r.source === 'contact_custom_fields');
    expect(row).toBeTruthy();
    expect(row.previous_count).toBe(10);
    expect(row.current_count).toBe(13);
    expect(row.alert_created).toBe(true);

    const { data: alerts, error: alertErr } = await service
      .from('ghl_mapping_change_alerts')
      .select('previous_count, current_count, delta')
      .eq('workspace_id', ws.id)
      .eq('source', 'contact_custom_fields');
    expect(alertErr).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts![0].delta).toBe(3);
  });

  it('idempotente: rodar de novo sobre o mesmo par de runs não duplica alerta', async () => {
    const { error } = await service.rpc('detect_ghl_mapping_changes', { p_workspace_id: ws.id });
    expect(error).toBeNull();

    const { data: alerts, error: alertErr } = await service
      .from('ghl_mapping_change_alerts')
      .select('id')
      .eq('workspace_id', ws.id)
      .eq('source', 'contact_custom_fields');
    expect(alertErr).toBeNull();
    expect(alerts).toHaveLength(1); // ainda 1, não duplicou
  });

  it('NÃO cria alerta quando a contagem não mudou', async () => {
    await insertRun(ws.id, 'pipelines', 5, -1500);
    await insertRun(ws.id, 'pipelines', 5, -500);

    const { data, error } = await service.rpc('detect_ghl_mapping_changes', { p_workspace_id: ws.id });
    expect(error).toBeNull();
    const row = (data ?? []).find((r: { source: string }) => r.source === 'pipelines');
    expect(row.alert_created).toBe(false);

    const { data: alerts } = await service
      .from('ghl_mapping_change_alerts')
      .select('id')
      .eq('workspace_id', ws.id)
      .eq('source', 'pipelines');
    expect(alerts).toHaveLength(0);
  });

  it('NÃO cria alerta no primeiro discovery de um source (sem "anterior")', async () => {
    await insertRun(ws.id, 'opportunity_custom_fields', 7, 0);

    const { data, error } = await service.rpc('detect_ghl_mapping_changes', { p_workspace_id: ws.id });
    expect(error).toBeNull();
    const row = (data ?? []).find((r: { source: string }) => r.source === 'opportunity_custom_fields');
    expect(row.alert_created).toBe(false);

    const { data: alerts } = await service
      .from('ghl_mapping_change_alerts')
      .select('id')
      .eq('workspace_id', ws.id)
      .eq('source', 'opportunity_custom_fields');
    expect(alerts).toHaveLength(0);
  });

  it('RLS: owner do workspace lê o próprio alerta', async () => {
    const { data, error } = await ownerClient
      .from('ghl_mapping_change_alerts')
      .select('id, source')
      .eq('workspace_id', ws.id);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('NEGATIVO: usuário de outro workspace não vê o alerta', async () => {
    const { data, error } = await outsiderClient
      .from('ghl_mapping_change_alerts')
      .select('id')
      .eq('workspace_id', ws.id);
    const blocked = error !== null || (Array.isArray(data) && data.length === 0);
    expect(blocked).toBe(true);
  });

  it('discover-ghl-config aceita chamador service_role sem exigir membership de usuário', () => {
    const src = readFileSync(
      join(ROOT, 'supabase/functions/discover-ghl-config/index.ts'),
      'utf8',
    );
    expect(src).toContain('isServiceRoleCaller');
    expect(src).toContain('const isCron = isServiceRoleCaller(req)');
    expect(src).toMatch(/if\s*\(!isCron\s*&&\s*caller\)/);
  });

  it('migration de vigilância agenda os 2 crons (dispatch + detecção, staggered)', () => {
    const sql = readFileSync(
      join(ROOT, 'supabase/migrations/20260819000000_ghl_mapping_vigilancia.sql'),
      'utf8',
    );
    expect(sql).toContain("cron.schedule(\n    'ghl-mapping-discovery-watch'");
    expect(sql).toContain("cron.schedule(\n    'ghl-mapping-detect-changes'");
    expect(sql).toContain("'0 4 * * *'");
    expect(sql).toContain("'30 4 * * *'"); // 30min depois do dispatch
  });
});
