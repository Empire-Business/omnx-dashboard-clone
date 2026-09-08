/**
 * Meta Ads multi-conta — Fase 15 (fatia 2): contrato D2 de save_workspace_credential
 *
 * Design: docs/FASE-15-MULTI-CONTA-META.md (item D2 + entregas 4.2).
 * Roda contra o banco de TESTE (ver __tests__/ENV-SETUP.md); produção NUNCA é
 * alvo (trava em helpers/safe-guard.ts).
 *
 * Pré-requisito: a migration 20260926000000_fase15_meta_multi_conta.sql aplicada
 * no banco de teste (CREATE OR REPLACE da função — sem ela a suíte falha, pois o
 * comportamento D2 ainda não existe lá).
 *
 * Cenários (item 4.2 do design doc):
 *   1. save com ad_account_ids (lista) normaliza (trim/prefixo/dedup), grava os
 *      DOIS formatos no metadata e sincroniza workspace_meta_ad_accounts;
 *   2. legado singular (ad_account_id) normaliza para lista de 1;
 *   3. merge defensivo: save só-token (sem nenhuma das chaves) preserva a lista
 *      no metadata e NÃO toca a tabela;
 *   4. remoção de conta da lista desativa (is_active=false) e libera a conta
 *      para outro workspace; conta ativa em outro workspace é recusada com erro
 *      amigável ANTES do índice único estourar;
 *   5. NEGATIVO: member (não-admin) é recusado (42501) e nada é sincronizado;
 *   6. NEGATIVO: formato inválido é recusado (22023) sem gravar nada.
 *
 * Account ids são únicos por run (só dígitos após "act_", para casar com a
 * validação ^act_[0-9]+$ da função) — evita colisão com runs anteriores no
 * banco de teste compartilhado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../helpers/safe-guard';
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

const HOOK_TIMEOUT_MS = 180_000;
const SECRET = () => 'tok_meta_' + Math.random().toString(36).slice(2);

// Ids de conta únicos por run, sempre no formato final act_<dígitos>.
let seq = 0;
function uniqueAccountDigits(): string {
  seq += 1;
  return `${Date.now()}${seq}`;
}
function uniqueAccountId(): string {
  return `act_${uniqueAccountDigits()}`;
}

type CredMeta = {
  secret_key_id: string;
  rotation_version: number;
  metadata: { ad_account_ids?: string[]; ad_account_id?: string } | null;
};

async function getMetaCredential(service: SupabaseClient, workspaceId: string): Promise<CredMeta | null> {
  const { data, error } = await service
    .rpc('get_workspace_credential_meta', { p_workspace_id: workspaceId, p_provider: 'meta' })
    .maybeSingle();
  expect(error).toBeNull();
  return (data as CredMeta | null) ?? null;
}

async function getAccountRows(
  service: SupabaseClient,
  workspaceId: string
): Promise<Array<{ account_id: string; is_active: boolean }>> {
  const { data, error } = await service
    .from('workspace_meta_ad_accounts')
    .select('account_id, is_active')
    .eq('workspace_id', workspaceId)
    .order('account_id');
  expect(error).toBeNull();
  return data ?? [];
}

/**
 * Filtra as linhas do workspace pelas contas do cenário atual. Necessário porque
 * wsA/wsB são compartilhados entre os testes do arquivo e um save com lista
 * DESATIVA as contas ausentes — sem o filtro, um teste enxergaria as contas
 * (inativas) deixadas pelos testes anteriores.
 */
function rowsFor(
  rows: Array<{ account_id: string; is_active: boolean }>,
  accountIds: string[]
): Array<{ account_id: string; is_active: boolean }> {
  return rows.filter((r) => accountIds.includes(r.account_id));
}

describe('Meta Ads multi-conta — Fase 15 (D2)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let memberA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let ownerAClient: SupabaseClient;
  let memberAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('f15-ownerA'), 'TestPassword123!');
    memberA = await createTestUser(service, uniqueEmail('f15-memberA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('f15-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS Fase15 Meta A', ownerA.id);
    wsB = await createTestWorkspace(service, 'WS Fase15 Meta B', ownerB.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsA.id, memberA.id, 'member', ownerA.id); // member NÃO é admin
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);

    ownerAClient = await getAuthenticatedClient(ownerA.email, ownerA.password);
    memberAClient = await getAuthenticatedClient(memberA.email, memberA.password);
    ownerBClient = await getAuthenticatedClient(ownerB.email, ownerB.password);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await service.from('workspace_meta_ad_accounts').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_integration_credentials').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [ownerA.id, memberA.id, ownerB.id]);
  }, HOOK_TIMEOUT_MS);

  it('save com lista normaliza (trim/prefixo/dedup), grava os dois formatos e sincroniza a tabela', async () => {
    const acc1 = uniqueAccountId();
    const digits2 = uniqueAccountDigits(); // sem prefixo: a função deve adicionar "act_"
    const acc2 = `act_${digits2}`;

    const { data, error } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [`  ${acc1}  `, digits2, acc1, ''] }, // trim, prefixo, dedup, vazio fora
    });
    expect(error).toBeNull();
    expect(data).toBe(1); // rotation_version inicial

    const cred = await getMetaCredential(service, wsA.id);
    expect(cred?.metadata?.ad_account_ids).toEqual([acc1, acc2]); // ordem preservada
    expect(cred?.metadata?.ad_account_id).toBe(acc1); // singular = primeiro (compat legado)

    const rows = rowsFor(await getAccountRows(service, wsA.id), [acc1, acc2]);
    expect(rows).toEqual([
      { account_id: acc1, is_active: true },
      { account_id: acc2, is_active: true },
    ]);
  });

  it('legado singular (ad_account_id) normaliza para lista de 1 e sincroniza a tabela', async () => {
    const digits = uniqueAccountDigits(); // número puro também é aceito no singular
    const acc = `act_${digits}`;

    const { data, error } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsB.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_id: digits },
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const cred = await getMetaCredential(service, wsB.id);
    expect(cred?.metadata?.ad_account_ids).toEqual([acc]);
    expect(cred?.metadata?.ad_account_id).toBe(acc);

    const rows = await getAccountRows(service, wsB.id);
    expect(rows).toEqual([{ account_id: acc, is_active: true }]);
  });

  it('merge defensivo: save só-token preserva a lista no metadata e não toca a tabela', async () => {
    const acc1 = uniqueAccountId();
    const acc2 = uniqueAccountId();

    const { data: v1, error: e1 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc1, acc2] },
    });
    expect(e1).toBeNull();

    // Troca só o token: metadata sem nenhuma das duas chaves.
    const { data: v2, error: e2 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: {},
    });
    expect(e2).toBeNull();
    expect(v2).toBe((v1 as number) + 1); // rotacionou (versão exata depende dos saves anteriores em wsA)

    const cred = await getMetaCredential(service, wsA.id);
    expect(cred?.rotation_version).toBe(v2);
    expect(cred?.metadata?.ad_account_ids).toEqual([acc1, acc2]); // lista NÃO foi apagada por omissão
    expect(cred?.metadata?.ad_account_id).toBe(acc1);

    const rows = rowsFor(await getAccountRows(service, wsA.id), [acc1, acc2]);
    expect(rows).toEqual([
      { account_id: acc1, is_active: true },
      { account_id: acc2, is_active: true },
    ]);
  });

  it('remoção da lista desativa a conta e a libera para outro workspace', async () => {
    const acc1 = uniqueAccountId();
    const acc2 = uniqueAccountId();

    const { error: e1 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc1, acc2] },
    });
    expect(e1).toBeNull();

    // wsA remove acc2 da lista.
    const { error: e2 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc1] },
    });
    expect(e2).toBeNull();

    const rowsA = rowsFor(await getAccountRows(service, wsA.id), [acc1, acc2]);
    expect(rowsA).toEqual([
      { account_id: acc1, is_active: true },
      { account_id: acc2, is_active: false }, // desativada, não apagada (histórico preservado)
    ]);

    // Conta livre: wsB conecta acc2 sem conflito.
    const { error: e3 } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsB.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc2] },
    });
    expect(e3).toBeNull();

    const rowsB = await getAccountRows(service, wsB.id);
    expect(rowsB).toContainEqual({ account_id: acc2, is_active: true });
  });

  it('conta ativa em outro workspace é recusada com erro amigável (antes do índice único)', async () => {
    const acc = uniqueAccountId();

    const { error: e1 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc] },
    });
    expect(e1).toBeNull();

    const { data, error } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsB.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc] },
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/outro workspace/i);
    expect(data).toBeNull();

    // Transação abortou por completo: wsB NÃO ficou com a conta nem a ativou para si.
    const rowsB = await getAccountRows(service, wsB.id);
    expect(rowsB.find((r) => r.account_id === acc)).toBeUndefined();

    // E a conta continua ativa somente em wsA.
    const rowsA = await getAccountRows(service, wsA.id);
    expect(rowsA).toContainEqual({ account_id: acc, is_active: true });
  });

  it('NEGATIVO: member (não-admin) é recusado e nada é sincronizado', async () => {
    const acc = uniqueAccountId();

    const { data, error } = await memberAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: [acc] },
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/forbidden|admin/i);
    expect(data).toBeNull();

    const rowsA = await getAccountRows(service, wsA.id);
    expect(rowsA.find((r) => r.account_id === acc)).toBeUndefined();
  });

  it('NEGATIVO: formato inválido é recusado (22023) sem gravar nada', async () => {
    // Entrada fora de ^act_[0-9]+$
    const { error: eBad1 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: ['act_abc'] },
    });
    expect(eBad1).not.toBeNull();
    expect(eBad1?.message).toMatch(/invalido/i);

    // Singular legado inválido
    const { error: eBad2 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_id: 'conta-xyz' },
    });
    expect(eBad2).not.toBeNull();
    expect(eBad2?.message).toMatch(/invalido/i);

    // ad_account_ids que não é array
    const { error: eBad3 } = await ownerAClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: 'meta',
      p_secret: SECRET(),
      p_metadata: { ad_account_ids: 'act_123' },
    });
    expect(eBad3).not.toBeNull();
    expect(eBad3?.message).toMatch(/array/i);
  });
});
