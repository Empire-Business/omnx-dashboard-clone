/**
 * "Campos extras" — captura passiva de campos GHL sem correspondência no
 * vocabulário fixo do Empire (2026-07-14, docs/GHL-CAMPOS-EXTRAS.md).
 *
 * Achado real do burn-in: apply_ghl_field_mappings() já era 100%
 * data-driven (aceita qualquer logical_name), mas extrair_dados_ghl_v2()
 * só extraía uma lista FIXA de mapped->>'chave' — qualquer logical_name
 * mapeado com o prefixo "extra." era descartado em silêncio.
 *
 * Este teste prova, contra o banco real:
 *  - um campo mapeado com logical_name = 'extra.contact_<slug>' aparece em
 *    contatos.custom_fields (chave sem o prefixo);
 *  - um segundo webhook atualiza custom_fields (não é write-once);
 *  - um campo mapeado normalmente (fora do prefixo extra.) continua indo
 *    para a coluna fixa de sempre, nunca para custom_fields — nenhuma
 *    regressão no fluxo existente.
 *  - extract_ghl_extra_fields() isolada: ignora chaves sem o prefixo,
 *    remove o prefixo corretamente, retorna {} para mapped vazio/nulo.
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

const LOCATION_ID = `LOC-EXTRA-${Date.now().toString(36)}`;
const GHL_CONTACT_ID = `contact-extra-${Date.now().toString(36)}`;

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    contact_id: GHL_CONTACT_ID,
    locationId: LOCATION_ID,
    email: 'campo-extra@example.com',
    full_name: 'Campo Extra Teste',
    ...overrides,
  };
}

describe('campos extras: extrair_dados_ghl_v2 popula contatos.custom_fields', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let ws: TestWorkspace;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('extra-owner'), 'TestPassword123!');
    ws = await createTestWorkspace(service, 'WS Campos Extras', owner.id);
    await addWorkspaceMember(service, ws.id, owner.id, 'owner', owner.id);

    const { error: settingsError } = await service.from('ghl_integration_settings').insert({
      workspace_id: ws.id,
      ghl_location_id: LOCATION_ID,
      webhook_secret: 'secret-teste-extra',
      is_active: true,
    });
    if (settingsError) throw new Error(`seed ghl_integration_settings: ${settingsError.message}`);

    const { error: mappingError } = await service.from('ghl_field_mappings').upsert(
      [
        {
          workspace_id: ws.id,
          logical_name: 'extra.contact_signo',
          ghl_field_key: '{{ contact.signo }}',
          field_type: 'text',
          variations: ['{{contact.signo}}'],
          enabled: true,
        },
        {
          // Mapeamento normal (fora do prefixo extra.) — prova de que o
          // comportamento existente não regride.
          workspace_id: ws.id,
          logical_name: 'full_name',
          ghl_field_key: 'full_name',
          field_type: 'text',
          variations: ['full_name'],
          enabled: true,
        },
      ],
      { onConflict: 'workspace_id,logical_name' }
    );
    if (mappingError) throw new Error(`seed ghl_field_mappings: ${mappingError.message}`);
  });

  afterAll(async () => {
    await service.from('contatos').delete().eq('ghl_id', GHL_CONTACT_ID);
    await service.from('webhooks_ghl').delete().eq('location_id', LOCATION_ID);
    await service.from('ghl_field_mappings').delete().eq('workspace_id', ws.id);
    await service.from('ghl_integration_settings').delete().eq('workspace_id', ws.id);
    await service.from('workspace_members').delete().eq('workspace_id', ws.id);
    await service.from('workspaces').delete().eq('id', ws.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('extract_ghl_extra_fields: extrai só as chaves extra.*, removendo o prefixo', async () => {
    const { data, error } = await service.rpc('extract_ghl_extra_fields', {
      p_mapped: { 'extra.contact_signo': 'Áries', full_name: 'Fulano', 'extra.opportunity_x': '42' },
    });
    expect(error).toBeNull();
    expect(data).toEqual({ contact_signo: 'Áries', opportunity_x: '42' });
  });

  it('extract_ghl_extra_fields: mapped vazio/nulo retorna {}', async () => {
    const { data: dataEmpty, error: errEmpty } = await service.rpc('extract_ghl_extra_fields', {
      p_mapped: {},
    });
    expect(errEmpty).toBeNull();
    expect(dataEmpty).toEqual({});

    const { data: dataNull, error: errNull } = await service.rpc('extract_ghl_extra_fields', {
      p_mapped: null,
    });
    expect(errNull).toBeNull();
    expect(dataNull).toEqual({});
  });

  it('webhook com campo extra mapeado popula contatos.custom_fields (INSERT) e o mapeamento normal continua na coluna fixa', async () => {
    const { data: webhook, error: insertError } = await service
      .from('webhooks_ghl')
      .insert({
        location_id: LOCATION_ID,
        payload: basePayload({ customData: { '{{contact.signo}}': 'Áries' } }),
      })
      .select('id')
      .single();
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { error: rpcError } = await service.rpc('extrair_dados_ghl_v2', {
      p_webhook_id: webhook!.id,
    });
    expect(rpcError).toBeNull();

    const { data: contato, error: contatoError } = await service
      .from('contatos')
      .select('nome, custom_fields')
      .eq('ghl_id', GHL_CONTACT_ID)
      .single();
    expect(contatoError).toBeNull();
    expect(contato?.nome).toBe('Campo Extra Teste'); // mapeamento normal (full_name) intacto
    expect(contato?.custom_fields).toEqual({ contact_signo: 'Áries' });
  });

  it('segundo webhook atualiza custom_fields (UPDATE, não é write-once)', async () => {
    const { data: webhook, error: insertError } = await service
      .from('webhooks_ghl')
      .insert({
        location_id: LOCATION_ID,
        payload: basePayload({ customData: { '{{contact.signo}}': 'Touro' } }),
      })
      .select('id')
      .single();
    if (insertError) throw new Error(`insert webhook: ${insertError.message}`);

    const { error: rpcError } = await service.rpc('extrair_dados_ghl_v2', {
      p_webhook_id: webhook!.id,
    });
    expect(rpcError).toBeNull();

    const { data: contato, error: contatoError } = await service
      .from('contatos')
      .select('custom_fields')
      .eq('ghl_id', GHL_CONTACT_ID)
      .single();
    expect(contatoError).toBeNull();
    expect(contato?.custom_fields).toEqual({ contact_signo: 'Touro' });
  });
});
