/**
 * Regressão do bug "leads conectados contabilizados como não conectados"
 * (2026-07-12, achado real: lead robertdantasml@gmail.com).
 *
 * Causa raiz (2 problemas encadeados, corrigidos em
 * supabase/migrations/20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql):
 *
 * 1) resolve_ghl_field_value() só normalizava espaços da VARIAÇÃO cadastrada
 *    em ghl_field_mappings (ex: '{{opportunity.mqlconectado}}', sem espaço),
 *    mas o GHL desta conta manda a chave customData COM espaço interno
 *    ('{{ opportunity.mqlconectado }}'). O campo nunca resolvia.
 * 2) extrair_dados_ghl_v2() sobrescrevia data_conectado sem COALESCE no
 *    UPDATE — um webhook subsequente sem o campo resolvido zerava um
 *    data_conectado que já tinha sido confirmado.
 *
 * Este teste prova as duas pontas contra o banco real:
 *  - um webhook com a chave espaçada no payload resolve e preenche
 *    data_conectado (prova do problema 1);
 *  - um segundo webhook da MESMA oportunidade, sem o campo populado, não
 *    apaga o data_conectado já setado (prova do problema 2 / COALESCE).
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

const LOCATION_ID = `LOC-CONECTADO-${Date.now().toString(36)}`;
const GHL_CONTACT_ID = `contact-conectado-${Date.now().toString(36)}`;
const GHL_OPPORTUNITY_ID = `opp-conectado-${Date.now().toString(36)}`;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: GHL_OPPORTUNITY_ID,
    contact_id: GHL_CONTACT_ID,
    locationId: LOCATION_ID,
    email: 'robert-teste@example.com',
    full_name: 'Robert Teste',
    status: 'open',
    pipeline_id: 'pipeline-teste',
    ...overrides,
  };
}

describe('bug fix: data_conectado — espaçamento de chave GHL + COALESCE', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ws: TestWorkspace;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('conectado-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS Conectado Regressao', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);

    const { error: settingsError } = await service.from('ghl_integration_settings').insert({
      workspace_id: ws.id,
      ghl_location_id: LOCATION_ID,
      webhook_secret: 'secret-teste-conectado',
      is_active: true,
    });
    if (settingsError) throw new Error(`seed ghl_integration_settings: ${settingsError.message}`);

    // Mapeamento tal como está hoje em produção: variação SEM espaço interno.
    const { error: mappingError } = await service.from('ghl_field_mappings').upsert(
      {
        workspace_id: ws.id,
        logical_name: 'data_conectado',
        ghl_field_key: '{{opportunity.mqlconectado}}',
        field_type: 'date',
        variations: ['{{opportunity.mqlconectado}}', '{{opportunity.d_mqlconectado}}'],
        enabled: true,
      },
      { onConflict: 'workspace_id,logical_name' }
    );
    if (mappingError) throw new Error(`seed ghl_field_mappings: ${mappingError.message}`);
  });

  afterAll(async () => {
    await service.from('oportunidades').delete().eq('ghl_opportunity_id', GHL_OPPORTUNITY_ID);
    await service.from('contatos').delete().eq('ghl_id', GHL_CONTACT_ID);
    await service.from('webhooks_ghl').delete().eq('location_id', LOCATION_ID);
    await service.from('ghl_field_mappings').delete().eq('workspace_id', ws.id);
    await service.from('ghl_integration_settings').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('seed: contato + oportunidade pré-existentes (fora do fluxo de webhook, para isolar o PASSO 2b/UPDATE do teste)', async () => {
    // data_lead_recebido já preenchido de propósito: se ficasse NULL, o INSERT
    // dispararia tr_sync_opp_dates_on_insert -> chamada HTTP real ao GHL, que
    // não está configurada neste workspace de teste e é irrelevante para o bug
    // de data_conectado (esse campo é gerenciado por sync-opp-dates, não pelo
    // webhook — ver regra "data_lead_recebido via API GHL" do CLAUDE.md).
    const { data: contato, error: contatoError } = await service
      .from('contatos')
      .insert({
        workspace_id: ws.id,
        ghl_id: GHL_CONTACT_ID,
        nome: 'Robert Teste',
        email: 'robert-teste@example.com',
        tags: 'conectado',
      })
      .select('id')
      .single();
    if (contatoError) throw new Error(`seed contato: ${contatoError.message}`);

    const { error: oppError } = await service.from('oportunidades').insert({
      ghl_opportunity_id: GHL_OPPORTUNITY_ID,
      contato_id: contato!.id,
      nome_contato: 'Robert Teste',
      email_contato: 'robert-teste@example.com',
      status: 'open',
      pipeline_id: 'pipeline-teste',
      pipeline_name: 'Pipeline Teste',
      data_lead_recebido: new Date('2026-07-03T10:39:11.582Z').toISOString(),
      data_conectado: null,
    });
    if (oppError) throw new Error(`seed oportunidade: ${oppError.message}`);
  });

  it('resolve_ghl_field_value encontra a chave "{{ opportunity.mqlconectado }}" (com espaços) mesmo com variação sem espaço cadastrada', async () => {
    const { data, error } = await service.rpc('resolve_ghl_field_value', {
      p_payload: {
        customData: {
          '{{ opportunity.mqlconectado }}': '8/7/2026 12:44 PM',
          '{{ opportunity.d_mqlconectado }}': '2026-07-08',
        },
      },
      p_variations: ['{{opportunity.mqlconectado}}', '{{opportunity.d_mqlconectado}}'],
    });
    expect(error).toBeNull();
    expect(data).toBe('8/7/2026 12:44 PM');
  });

  it('webhook com customData espaçado preenche data_conectado na oportunidade nova', async () => {
    const { data: webhook, error: insertError } = await service
      .from('webhooks_ghl')
      .insert({
        location_id: LOCATION_ID,
        payload: basePayload({
          customData: {
            '{{ opportunity.mqlconectado }}': '8/7/2026 12:44 PM',
            '{{ opportunity.d_mqlconectado }}': '2026-07-08',
          },
        }),
      })
      .select('id')
      .single();
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { error: rpcError } = await service.rpc('extrair_dados_ghl_v2', {
      p_webhook_id: webhook!.id,
    });
    expect(rpcError).toBeNull();

    const { data: opp, error: oppError } = await service
      .from('oportunidades')
      .select('data_conectado')
      .eq('ghl_opportunity_id', GHL_OPPORTUNITY_ID)
      .single();
    expect(oppError).toBeNull();
    expect(opp?.data_conectado).toBe('2026-07-08');
  });

  it('webhook seguinte SEM o campo populado não apaga o data_conectado já confirmado (COALESCE)', async () => {
    const { data: webhook, error: insertError } = await service
      .from('webhooks_ghl')
      .insert({
        location_id: LOCATION_ID,
        payload: basePayload({
          pipeline_stage_id: 'Reunião agendada',
          customData: {
            '{{ opportunity.mqlconectado }}': '',
            '{{ opportunity.d_mqlconectado }}': '',
          },
        }),
      })
      .select('id')
      .single();
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { error: rpcError } = await service.rpc('extrair_dados_ghl_v2', {
      p_webhook_id: webhook!.id,
    });
    expect(rpcError).toBeNull();

    const { data: opp, error: oppError } = await service
      .from('oportunidades')
      .select('data_conectado')
      .eq('ghl_opportunity_id', GHL_OPPORTUNITY_ID)
      .single();
    expect(oppError).toBeNull();
    // Antes da correção este valor virava NULL a cada webhook sem o campo resolvido.
    expect(opp?.data_conectado).toBe('2026-07-08');
  });
});
