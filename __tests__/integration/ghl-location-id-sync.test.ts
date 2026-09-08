/**
 * Sincronização location_id GHL — consolidação da UX de conexão (2026-07-14)
 *
 * Achado: workspace_integration_credentials.metadata.location_id (BYOK/Vault,
 * usado para chamar a API do GHL) e ghl_integration_settings.ghl_location_id
 * (usado para rotear webhook recebido) eram escritos em duas telas diferentes,
 * sem nenhuma sincronia — um workspace podia ficar com um preenchido e o outro
 * não, sem aviso real na UI.
 *
 * save_workspace_credential agora sincroniza os dois na mesma transação
 * quando provider='ghl' e metadata.location_id vem preenchido. Provas:
 *  - salvar credencial GHL com location_id -> ghl_integration_settings recebe
 *    o mesmo location_id (linha criada se não existia);
 *  - rotacionar a credencial com location_id diferente -> atualiza
 *    ghl_integration_settings (não duplica linha, mesma workspace_id);
 *  - salvar sem location_id no metadata -> não mexe em ghl_integration_settings
 *    (não sobrescreve com NULL, coluna é NOT NULL);
 *  - dois workspaces não podem ficar com o MESMO location_id ativo ao mesmo
 *    tempo -> a credencial inteira falha (nem o Vault grava), erro claro;
 *  - provider='meta' nunca toca ghl_integration_settings.
 *
 * Produção (qzesffnkqgelmtfblzkr) NUNCA é alvo: ver helpers/safe-guard.ts.
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

function uniqueLocationId(tag: string): string {
  return `LOC_${tag}_${Math.random().toString(36).slice(2, 10)}`;
}

describe('save_workspace_credential — sincroniza ghl_integration_settings.ghl_location_id', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let ownerAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('ghlsync-ownerA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('ghlsync-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS GhlSync A', ownerA.id);
    wsB = await createTestWorkspace(service, 'WS GhlSync B', ownerB.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    ownerAClient = await getAuthenticatedClient(ownerA.email, ownerA.password);
    ownerBClient = await getAuthenticatedClient(ownerB.email, ownerB.password);
  });

  afterAll(async () => {
    await service.from('ghl_integration_settings').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_integration_credentials').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [ownerA.id, ownerB.id]);
  });

  it('salvar credencial GHL com location_id cria a linha em ghl_integration_settings', async () => {
    const loc = uniqueLocationId('create');
    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: 'tok_' + Math.random().toString(36).slice(2),
      p_metadata: { location_id: loc },
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const { data: settings, error: eSettings } = await service
      .from('ghl_integration_settings')
      .select('ghl_location_id')
      .eq('workspace_id', wsA.id)
      .maybeSingle();
    expect(eSettings).toBeNull();
    expect(settings?.ghl_location_id).toBe(loc);
  });

  it('rotacionar com location_id diferente atualiza a mesma linha (não duplica)', async () => {
    const loc2 = uniqueLocationId('rotate');
    const { error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: 'tok_' + Math.random().toString(36).slice(2),
      p_metadata: { location_id: loc2 },
    });
    expect(error).toBeNull();

    const { data: rows, error: eRows } = await service
      .from('ghl_integration_settings')
      .select('ghl_location_id')
      .eq('workspace_id', wsA.id);
    expect(eRows).toBeNull();
    expect(rows?.length).toBe(1); // não duplicou
    expect(rows?.[0]?.ghl_location_id).toBe(loc2); // atualizou para o novo
  });

  it('salvar sem location_id no metadata não mexe em ghl_integration_settings', async () => {
    const { data: before } = await service
      .from('ghl_integration_settings')
      .select('ghl_location_id')
      .eq('workspace_id', wsA.id)
      .maybeSingle();

    const { error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: 'tok_' + Math.random().toString(36).slice(2),
      p_metadata: {},
    });
    expect(error).toBeNull();

    const { data: after } = await service
      .from('ghl_integration_settings')
      .select('ghl_location_id')
      .eq('workspace_id', wsA.id)
      .maybeSingle();
    expect(after?.ghl_location_id).toBe(before?.ghl_location_id); // inalterado
  });

  it('provider=meta nunca toca ghl_integration_settings', async () => {
    const { error } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsB.id,
      p_provider: 'meta',
      p_secret: 'tok_' + Math.random().toString(36).slice(2),
      p_metadata: { ad_account_id: 'act_123', location_id: uniqueLocationId('meta-noop') },
    });
    expect(error).toBeNull();

    const { data: settings } = await service
      .from('ghl_integration_settings')
      .select('id')
      .eq('workspace_id', wsB.id)
      .maybeSingle();
    expect(settings).toBeNull(); // nada criado para meta
  });

  it('NEGATIVO: location_id já ativo em outro workspace recusa a credencial inteira (nem o Vault grava)', async () => {
    const sharedLoc = uniqueLocationId('conflict');

    // wsB conecta primeiro com sharedLoc.
    const { error: eB } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsB.id,
      p_provider: 'ghl',
      p_secret: 'tok_wsB_' + Math.random().toString(36).slice(2),
      p_metadata: { location_id: sharedLoc },
    });
    expect(eB).toBeNull();

    // wsA tenta conectar com o MESMO location_id -> deve falhar por completo.
    const { data: statusBefore } = await service.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    const versionBefore = (statusBefore ?? []).find((r: { provider: string }) => r.provider === 'ghl');

    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
      p_secret: 'tok_wsA_conflict_' + Math.random().toString(36).slice(2),
      p_metadata: { location_id: sharedLoc },
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // A credencial de wsA NÃO deve ter sido rotacionada (transação abortou por completo).
    const { data: statusAfter } = await service.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    const versionAfter = (statusAfter ?? []).find((r: { provider: string }) => r.provider === 'ghl');
    expect(versionAfter?.rotation_version).toBe(versionBefore?.rotation_version);

    // wsB continua com o location_id dele, intacto.
    const { data: settingsB } = await service
      .from('ghl_integration_settings')
      .select('ghl_location_id')
      .eq('workspace_id', wsB.id)
      .maybeSingle();
    expect(settingsB?.ghl_location_id).toBe(sharedLoc);
  });
});
