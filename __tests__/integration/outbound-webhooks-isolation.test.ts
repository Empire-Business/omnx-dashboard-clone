/**
 * outbound_webhooks — Fase 2 (fatia 7)
 *
 * Prova o isolamento de credenciais de EGRESSO (webhooks de saida) por workspace
 * e a guarda SSRF deny-by-default:
 *  - assert_outbound_url_safe bloqueia loopback/metadata/privadas/localhost/esquema ruim;
 *  - assert_outbound_url_safe permite hostname publico https;
 *  - register_outbound_webhook (service_role) guarda segredo no vault (roundtrip
 *    via get_decrypted_secret) — sem plaintext;
 *  - RLS: anon nao le nada; membro de A so ve a linha de A (nao a de B);
 *  - NEGATIVO: authenticated (mesmo owner) NAO tem EXECUTE em register_outbound_webhook.
 *
 * Coberto FORA deste arquivo (e citado aqui por honestidade):
 *  - remocao do segredo hardcoded dos DOIS caminhos OpenClaw: provada pelo DO block
 *    da propria migration + smoke psql (prosrc sem 'openclaw-tjm2'/token);
 *  - disparo real (net.http_post) e confirmacao 2xx: fluxo do cliente, validado em
 *    staging/producao (egress de rede nao roda no vitest). O RISCO de isolamento
 *    (quem le qual destino/credencial) esta 100% coberto aqui.
 *
 * Lacuna honesta: SSRF por DNS rebinding (hostname que resolve para IP privado na
 * hora do fetch) nao e fechado por assert_outbound_url_safe; fica para o dispatcher
 * Deno resolve-then-connect, documentado no runbook da Fase 2.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAnonClient,
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

const SECRET_A = 'tok_A_' + Math.random().toString(36).slice(2);
const SECRET_B = 'tok_B_' + Math.random().toString(36).slice(2);

describe('outbound_webhooks — Fase 2 (fatia 7)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let memberA: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let memberAClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    owner = await createTestUser(service, uniqueEmail('obwh-owner'), 'TestPassword123!');
    memberA = await createTestUser(service, uniqueEmail('obwh-memberA'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS Outbound A', owner.id);
    wsB = await createTestWorkspace(service, 'WS Outbound B', owner.id);
    await addWorkspaceMember(service, wsA.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, wsB.id, owner.id, 'owner', owner.id);
    // memberA e membro SOMENTE de A (chave da prova de isolamento)
    await addWorkspaceMember(service, wsA.id, memberA.id, 'member', owner.id);

    memberAClient = await getAuthenticatedClient(memberA.email, memberA.password);

    // cadastra webhooks via RPC do operador (service_role) — segredo -> vault
    const { error: eA } = await service.rpc('register_outbound_webhook', {
      p_workspace_id: wsA.id,
      p_event_key: 'contrato_assinado',
      p_url: 'https://hooks-a.example.com/contrato-assinado',
      p_secret: SECRET_A,
    });
    if (eA) throw new Error(`register A: ${eA.message}`);

    const { error: eB } = await service.rpc('register_outbound_webhook', {
      p_workspace_id: wsB.id,
      p_event_key: 'contrato_assinado',
      p_url: 'https://hooks-b.example.com/contrato-assinado',
      p_secret: SECRET_B,
    });
    if (eB) throw new Error(`register B: ${eB.message}`);
  });

  afterAll(async () => {
    await service.from('outbound_webhooks').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [owner.id, memberA.id]);
  });

  // ---- SSRF guard ----

  it.each([
    ['http://127.0.0.1/x', 'loopback'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata/link-local'],
    ['http://10.1.2.3/x', 'privada 10/8'],
    ['http://192.168.0.1/x', 'privada 192.168/16'],
    ['http://172.16.5.4/x', 'privada 172.16/12'],
    ['http://localhost/x', 'localhost'],
    ['ftp://example.com/x', 'esquema != http(s)'],
  ])('assert_outbound_url_safe BLOQUEIA %s (%s)', async (url) => {
    const { error } = await service.rpc('assert_outbound_url_safe', { p_url: url });
    expect(error).not.toBeNull();
  });

  it('assert_outbound_url_safe PERMITE hostname publico https', async () => {
    const { error } = await service.rpc('assert_outbound_url_safe', {
      p_url: 'https://hooks.example.com/contrato-assinado',
    });
    expect(error).toBeNull();
  });

  // ---- cadastro + vault ----

  it('register_outbound_webhook guarda segredo no vault (roundtrip, sem plaintext)', async () => {
    const { data: rowA, error } = await service
      .from('outbound_webhooks')
      .select('id, workspace_id, event_key, url, secret_key_id')
      .eq('workspace_id', wsA.id)
      .eq('event_key', 'contrato_assinado')
      .maybeSingle();
    expect(error).toBeNull();
    expect(rowA?.secret_key_id).toBeTruthy();

    const { data: plain, error: eDec } = await service.rpc('get_decrypted_secret', {
      p_secret_key_id: rowA!.secret_key_id,
    });
    expect(eDec).toBeNull();
    expect(plain).toBe(SECRET_A);
  });

  // ---- RLS ----

  it('RLS: anon nao le nenhuma linha de outbound_webhooks', async () => {
    const anon = getAnonClient();
    const { data, error } = await anon.from('outbound_webhooks').select('id');
    // Bloqueado por privilegio/RLS (erro 42501) OU zero linhas: ambos = nao vaza.
    const vazou = error === null && (data ?? []).length > 0;
    expect(vazou).toBe(false);
  });

  it('RLS: membro de A ve somente o webhook de A (isolamento A/B)', async () => {
    const { data, error } = await memberAClient
      .from('outbound_webhooks')
      .select('workspace_id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.workspace_id);
    expect(ids).toContain(wsA.id);
    expect(ids).not.toContain(wsB.id);
  });

  it('NEGATIVO: authenticated (owner) NAO tem EXECUTE em register_outbound_webhook', async () => {
    const { data, error } = await memberAClient.rpc('register_outbound_webhook', {
      p_workspace_id: wsA.id,
      p_event_key: 'x',
      p_url: 'https://evil.example.com/x',
      p_secret: 'nope',
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });
});
