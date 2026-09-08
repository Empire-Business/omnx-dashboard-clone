/**
 * Link de gravação da call de vendas — Aba Reuniões (Fase 6.7, ROADMAP).
 *
 * Chave GHL CONFIRMADA em produção (2026-07-15) em payloads reais de
 * webhooks_ghl: customData['{{opportunity.link_da_gravao_da_call_de_vendas}}']
 * (o GHL remove "ç"/"ã" do nome do campo customizado
 * "Link da Gravação da Call de Vendas").
 *
 * A extração JÁ existe: trigger tr_extrair_vendas_fechamento →
 * extrair_vendas_fechamento_do_webhook (criada em 20260325140000; a versão
 * vigente — ver baseline_public_schema — aceita as duas grafias da chave,
 * sem e com espaços, e tem GUARD amplo com os campos de contrato).
 * Evidência em produção: vendas_fechamento.link_gravacao_call_vendas populado
 * para a oportunidade cujos webhooks trazem a chave; as demais 4.925
 * oportunidades com vf simplesmente nunca receberam o campo preenchido no GHL
 * (verificado webhook a webhook em 2026-07-15 — zero perda de extração).
 *
 * Este teste prova, contra o banco real, o fluxo que alimenta a coluna
 * "Gravação" da aba Reuniões (vendas_fechamento.link_gravacao_call_vendas):
 *
 *  1. webhook de oportunidade com a chave popula vf.link_gravacao_call_vendas
 *     (a chave sozinha já passa no GUARD — pode chegar isolada);
 *  2. webhook posterior SEM a chave (mas com campo financeiro) faz upsert
 *     via COALESCE e PRESERVA o link já extraído;
 *  3. webhook sem nenhum campo relevante NÃO cria linha em vendas_fechamento
 *     (GUARD impede linha vazia);
 *  4. a variação COM espaços da chave também é extraída (COALESCE de grafias).
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

const RUN = Date.now().toString(36);
const LOCATION_ID = `LOC-GRAV-${RUN}`;
const GHL_CONTACT_ID = `contact-grav-${RUN}`;
const GHL_OPP_ID = `opp-grav-${RUN}`;
const GHL_OPP2_ID = `opp-grav2-${RUN}`;
const CHAVE = '{{opportunity.link_da_gravao_da_call_de_vendas}}';
// A extrair_vendas_fechamento_do_webhook real (baseline_public_schema, linha ~6459)
// aceita as duas grafias — sem e com espaços dentro das chaves.
const CHAVE_COM_ESPACOS = '{{ opportunity.link_da_gravao_da_call_de_vendas }}';
const LINK = 'https://drive.google.com/file/d/GRAVACAO-TESTE-123/view';

function oppPayload(ghlOppId: string, customData: Record<string, unknown>) {
  return {
    id: ghlOppId,
    contact_id: GHL_CONTACT_ID,
    type: 'OpportunityUpdate',
    locationId: LOCATION_ID,
    // full_name/email presentes como num payload real do GHL — evita depender
    // do fallback de nome da extrair_dados_ghl_v2 (fix 20260907000000), que não
    // é o objeto deste teste.
    full_name: 'Contato Gravacao Teste',
    email: 'contato-gravacao@example.com',
    customData,
  };
}

describe('link de gravação da call de vendas — extrair_vendas_fechamento_do_webhook', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ws: TestWorkspace;
  let contatoId: string;
  let oppId: string;
  let opp2Id: string;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('grav-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS Link Gravacao', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);

    const { error: settingsError } = await service.from('ghl_integration_settings').insert({
      workspace_id: ws.id,
      ghl_location_id: LOCATION_ID,
      webhook_secret: 'secret-teste-gravacao',
      is_active: true,
    });
    if (settingsError) throw new Error(`seed ghl_integration_settings: ${settingsError.message}`);

    const { data: contato, error: contatoError } = await service
      .from('contatos')
      .insert({ ghl_id: GHL_CONTACT_ID, nome: 'Contato Gravacao Teste', workspace_id: ws.id })
      .select('id')
      .single();
    if (contatoError) throw new Error(`seed contato: ${contatoError.message}`);
    contatoId = contato!.id;

    // data_lead_recebido preenchido: evita que a trigger tr_sync_opp_dates_on_insert
    // dispare sync_opp_dates_job() (que depende de config de URL ausente no banco de teste).
    const seedOpp = {
      contato_id: contatoId,
      nome_contato: 'Contato Gravacao Teste',
      workspace_id: ws.id,
      data_lead_recebido: new Date().toISOString(),
    };

    const { data: opp, error: oppError } = await service
      .from('oportunidades')
      .insert({ ...seedOpp, ghl_opportunity_id: GHL_OPP_ID })
      .select('id')
      .single();
    if (oppError) throw new Error(`seed oportunidade: ${oppError.message}`);
    oppId = opp!.id;

    const { data: opp2, error: opp2Error } = await service
      .from('oportunidades')
      .insert({ ...seedOpp, ghl_opportunity_id: GHL_OPP2_ID })
      .select('id')
      .single();
    if (opp2Error) throw new Error(`seed oportunidade 2: ${opp2Error.message}`);
    opp2Id = opp2!.id;
  });

  afterAll(async () => {
    await service.from('vendas_fechamento').delete().in('oportunidade_id', [oppId, opp2Id]);
    await service.from('oportunidades').delete().in('id', [oppId, opp2Id]);
    await service.from('contatos').delete().eq('id', contatoId);
    await service.from('webhooks_ghl').delete().eq('location_id', LOCATION_ID);
    await service.from('ghl_integration_settings').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('webhook com a chave de gravação popula vf.link_gravacao_call_vendas (chave isolada passa no GUARD)', async () => {
    const { error: insertError } = await service.from('webhooks_ghl').insert({
      location_id: LOCATION_ID,
      payload: oppPayload(GHL_OPP_ID, { [CHAVE]: LINK }),
    });
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { data: vf, error: vfError } = await service
      .from('vendas_fechamento')
      .select('oportunidade_id, link_gravacao_call_vendas')
      .eq('oportunidade_id', oppId)
      .maybeSingle();
    expect(vfError).toBeNull();
    expect(vf).not.toBeNull();
    expect(vf?.link_gravacao_call_vendas).toBe(LINK);
  });

  it('webhook posterior SEM a chave (com campo financeiro) faz upsert e PRESERVA o link (COALESCE)', async () => {
    const { error: insertError } = await service.from('webhooks_ghl').insert({
      location_id: LOCATION_ID,
      payload: oppPayload(GHL_OPP_ID, { '{{opportunity.valor_a_ser_pago_de_entrada}}': '497' }),
    });
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { data: vf, error: vfError } = await service
      .from('vendas_fechamento')
      .select('link_gravacao_call_vendas, valor_entrada')
      .eq('oportunidade_id', oppId)
      .single();
    expect(vfError).toBeNull();
    expect(vf?.valor_entrada).toBe(497);
    expect(vf?.link_gravacao_call_vendas).toBe(LINK); // preservado
  });

  it('webhook sem nenhum campo relevante NÃO cria linha em vendas_fechamento (GUARD)', async () => {
    const { error: insertError } = await service.from('webhooks_ghl').insert({
      location_id: LOCATION_ID,
      // resumo_ia não é lido pela extrair_vendas_fechamento_do_webhook —
      // todos os campos do GUARD ficam NULL e a linha não é criada.
      payload: oppPayload(GHL_OPP2_ID, { '{{opportunity.resumo_ia}}': 'texto qualquer' }),
    });
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { data: vf, error: vfError } = await service
      .from('vendas_fechamento')
      .select('oportunidade_id')
      .eq('oportunidade_id', opp2Id)
      .maybeSingle();
    expect(vfError).toBeNull();
    expect(vf).toBeNull();
  });

  it('variação COM espaços da chave ({{ opportunity.link_... }}) também popula o link', async () => {
    const { error: insertError } = await service.from('webhooks_ghl').insert({
      location_id: LOCATION_ID,
      payload: oppPayload(GHL_OPP2_ID, { [CHAVE_COM_ESPACOS]: LINK }),
    });
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { data: vf, error: vfError } = await service
      .from('vendas_fechamento')
      .select('link_gravacao_call_vendas')
      .eq('oportunidade_id', opp2Id)
      .maybeSingle();
    expect(vfError).toBeNull();
    expect(vf?.link_gravacao_call_vendas).toBe(LINK);
  });
});
