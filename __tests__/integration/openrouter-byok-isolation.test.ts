/**
 * OpenRouter BYOK — teste A→B de isolamento da credencial por subconta.
 *
 * Item pendente do ROADMAP (docs/ROADMAP.md, secao "Credencial OpenRouter propria
 * por subconta", linha ~848): "Validar isolamento com teste A→B: uma subconta nao
 * consegue usar, ler ou provocar consumo da credencial de outra."
 *
 * Cenario (banco de TESTE real, via .env.test — producao NUNCA e alvo, ver
 * helpers/safe-guard.ts importado abaixo):
 *   - Workspace A (ownerA admin) TEM credencial openrouter.
 *   - Workspace B (ownerB admin) TEM credencial openrouter (outra).
 *   - Workspace C (ownerA admin) NAO TEM credencial openrouter.
 *   - memberA e member (NAO admin) de A.
 *
 * O que cada bloco prova:
 *
 *  Bloco 1 — LER (roda verde hoje):
 *   - admin ve a propria credencial openrouter no status, SEM segredo/secret_key_id;
 *   - admin de B NAO ve status de A (e vice-versa) — get_workspace_credential_status
 *     filtra por is_workspace_admin (migration 20260731000000);
 *   - member (nao-admin) nao ve nada;
 *   - RLS/GRANT: authenticated nao le a tabela nem chama get_workspace_credential_meta /
 *     get_decrypted_secret (ambas service_role-only, migration 20260816000000).
 *
 *  Bloco 2 — ESCREVER/REVOGAR cross-tenant (roda verde hoje):
 *   - ownerB NAO sobrescreve a credencial openrouter de A (42501 — a guarda
 *     is_workspace_admin roda ANTES da validacao de provider, verificado por probe);
 *   - ownerB NAO revoga a credencial de A (hoje: PGRST202, RPC ausente no banco de
 *     teste; apos aplicar 20260830000000: 42501 — ambos bloqueiam, e a credencial
 *     de A permanece intacta em qualquer um dos estagios).
 *
 *  Bloco 3 — USAR (roda verde hoje):
 *   - a resolucao e chaveada por (workspace_id, provider): meta de A != meta de B,
 *     logo o helper NUNCA entrega a chave de A para uma chamada de B;
 *   - workspace C sem chave: meta retorna NULL (o helper lanca
 *     CredentialResolutionError — fail-closed, sem fallback a env global).
 *
 *  Bloco 4 — porteiro BYOK end-to-end + telemetria (it.fails — BLOQUEADO por
 *  migrations do repo ainda NAO aplicadas no projeto de teste):
 *   - save_workspace_credential com provider 'openrouter' (migration
 *     20260828000000_enable_openrouter_workspace_byok.sql): no banco de teste a RPC
 *     ainda e a versao 20260731000000 e responde 22023 "provider invalido (use ghl,
 *     meta ou notion)". Probe em 2026-07-15 confirmou. Quando a migration for
 *     aplicada no projeto de teste, o teste passa de verdade e o `.fails` QUEBRA
 *     ("expected failure but passed") — sinal para remover o modificador.
 *   - revoke_workspace_credential (migration 20260830000000): RPC inexistente no
 *     banco de teste (PGRST202).
 *   - workspace_ai_usage_events (migration 20260831000000): tabela inexistente no
 *     banco de teste (PGRST205) — isolamento do log de consumo so pode ser provado
 *     em roundtrip depois de aplica-la.
 *
 *  Bloco 5 — estrutural (fs, sem rede, sempre verde):
 *   - as 4 edge functions de IA (bot-chat, bot-chat-synthesis, prevendas-ai,
 *     ai-ghl-mapping) resolvem a chave por workspace via helper fail-closed e NAO
 *     leem OPENROUTER_API_KEY global (varredura em todo supabase/functions);
 *   - sem chave, respondem 422 orientando o cadastro e registram telemetria
 *     'credential_unavailable' — nunca consomem a chave da agencia;
 *   - as migrations 20260828000000/3000000/3100000 definem as propriedades que o
 *     bloco 4 exercita em roundtrip.
 *
 * POR QUE o seed dos blocos 1-3 usa INSERT direto (service_role) em vez da RPC:
 * a RPC save_workspace_credential no banco de teste ainda rejeita 'openrouter'
 * (ver bloco 4). O CHECK da tabela (migration 20260723000000) ja aceita o provider,
 * entao o seed direto e valido e exercita RLS/status/meta reais. secret_key_id e
 * um UUID sintetico (sem segredo no vault): estes blocos provam isolamento de
 * LINHA e gates de EXECUTE — o roundtrip real do segredo openrouter no vault fica
 * no bloco 4 (e o mecanismo generico do vault ja e coberto para 'ghl' em
 * byok-self-service.test.ts).
 *
 * Nenhum segredo real e usado ou impresso: as "chaves" sao strings de teste
 * aleatorias por run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import '../helpers/safe-guard'; // trava anti-producao (executa na importacao)
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

const ROOT = process.cwd();
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const PROVIDER = 'openrouter';
const HOOK_TIMEOUT_MS = 180_000; // banco remoto: criacao de usuarios com retry

// Segredos de TESTE (nunca reais, nunca logados).
const ROUNDTRIP_KEY_A = 'or-test-a-' + randomUUID();
const ROUNDTRIP_KEY_A_ROTATED = 'or-test-a2-' + randomUUID();
const CROSS_TENANT_KEY = 'or-test-x-' + randomUUID();

const AI_FUNCTIONS = ['bot-chat', 'bot-chat-synthesis', 'prevendas-ai', 'ai-ghl-mapping'] as const;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Parte A — banco de teste real
// ---------------------------------------------------------------------------
describe('OpenRouter BYOK — isolamento A→B (banco de teste)', () => {
  let service: SupabaseClient;
  let ownerA: TestUser;
  let memberA: TestUser;
  let ownerB: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let wsC: TestWorkspace;
  let ownerAClient: SupabaseClient;
  let memberAClient: SupabaseClient;
  let ownerBClient: SupabaseClient;
  const secretKeyIdA = randomUUID(); // sintetico (sem vault) — ver cabecalho
  const secretKeyIdB = randomUUID();

  beforeAll(async () => {
    service = getServiceClient();

    ownerA = await createTestUser(service, uniqueEmail('orbyok-ownerA'), 'TestPassword123!');
    memberA = await createTestUser(service, uniqueEmail('orbyok-memberA'), 'TestPassword123!');
    ownerB = await createTestUser(service, uniqueEmail('orbyok-ownerB'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'WS OR-BYOK A', ownerA.id);
    wsB = await createTestWorkspace(service, 'WS OR-BYOK B', ownerB.id);
    wsC = await createTestWorkspace(service, 'WS OR-BYOK C (sem chave)', ownerA.id);

    await addWorkspaceMember(service, wsA.id, ownerA.id, 'owner', ownerA.id);
    await addWorkspaceMember(service, wsA.id, memberA.id, 'member', ownerA.id); // NAO admin
    await addWorkspaceMember(service, wsB.id, ownerB.id, 'owner', ownerB.id);
    await addWorkspaceMember(service, wsC.id, ownerA.id, 'owner', ownerA.id);

    ownerAClient = await getAuthenticatedClient(ownerA.email, ownerA.password);
    memberAClient = await getAuthenticatedClient(memberA.email, memberA.password);
    ownerBClient = await getAuthenticatedClient(ownerB.email, ownerB.password);

    // Seed das credenciais openrouter (INSERT direto — RPC ainda rejeita o
    // provider no banco de teste; ver cabecalho e bloco 4).
    const { error: eA } = await service.from('workspace_integration_credentials').insert({
      workspace_id: wsA.id,
      provider: PROVIDER,
      secret_key_id: secretKeyIdA,
      metadata: { seeded_by: 'openrouter-byok-isolation.test.ts', marker: 'A' },
    });
    if (eA) throw new Error(`seed cred openrouter A: ${eA.message}`);
    const { error: eB } = await service.from('workspace_integration_credentials').insert({
      workspace_id: wsB.id,
      provider: PROVIDER,
      secret_key_id: secretKeyIdB,
      metadata: { seeded_by: 'openrouter-byok-isolation.test.ts', marker: 'B' },
    });
    if (eB) throw new Error(`seed cred openrouter B: ${eB.message}`);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await service
      .from('workspace_integration_credentials')
      .delete()
      .in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    // Telemetria do bloco 4 (tabela pode nao existir no banco de teste — ignora erro).
    await service
      .from('workspace_ai_usage_events')
      .delete()
      .in('workspace_id', [wsA.id, wsB.id, wsC.id])
      .then(() => undefined, () => undefined);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id, wsC.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id, wsC.id]);
    await deleteTestUsers(service, [ownerA.id, memberA.id, ownerB.id]);
  }, HOOK_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // Bloco 1 — LER
  // -------------------------------------------------------------------------
  it('admin ve a propria credencial openrouter no status, SEM segredo nem secret_key_id', async () => {
    const { data, error } = await ownerAClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{
      provider: string;
      rotation_version: number;
      metadata: { marker?: string };
    }>;
    const or = rows.find((r) => r.provider === PROVIDER);
    expect(or).toBeTruthy();
    expect(or!.rotation_version).toBe(1);
    expect(or!.metadata.marker).toBe('A');
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain('secret_key_id');
    expect(raw).not.toContain(secretKeyIdA);
    expect(raw).not.toContain(secretKeyIdB);
  });

  it('A→B: admin de B NAO le o status da credencial de A (zero linhas)', async () => {
    const { data, error } = await ownerBClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id, // ownerB nao e admin de A
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it('B→A: admin de A NAO le o status da credencial de B (zero linhas)', async () => {
    const { data, error } = await ownerAClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsB.id, // ownerA nao e admin de B
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it('member (nao-admin) NAO le o status do proprio workspace', async () => {
    const { data, error } = await memberAClient.rpc('get_workspace_credential_status', {
      p_workspace_id: wsA.id,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });

  it('NEGATIVO RLS: authenticated NAO le a tabela de credenciais (nem a propria linha)', async () => {
    for (const client of [ownerAClient, ownerBClient, memberAClient]) {
      const { data, error } = await client
        .from('workspace_integration_credentials')
        .select('id, workspace_id, provider');
      // Bloqueado por GRANT (42501) OU zero linhas via RLS: ambos = nao vaza.
      const vazou = error === null && (data ?? []).length > 0;
      expect(vazou).toBe(false);
    }
  });

  it('NEGATIVO EXECUTE: authenticated NAO chama get_workspace_credential_meta (service_role-only)', async () => {
    const { data, error } = await ownerBClient.rpc('get_workspace_credential_meta', {
      p_workspace_id: wsA.id,
      p_provider: PROVIDER,
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('NEGATIVO EXECUTE: authenticated NAO chama get_decrypted_secret (service_role-only)', async () => {
    // Mesmo conhecendo o secret_key_id de A, ownerB nao decifra nada.
    const { data, error } = await ownerBClient.rpc('get_decrypted_secret', {
      p_secret_key_id: secretKeyIdA,
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Bloco 2 — ESCREVER / REVOGAR cross-tenant
  // -------------------------------------------------------------------------
  it('B→A: ownerB NAO sobrescreve a credencial openrouter de A (guarda admin precede provider)', async () => {
    const { data, error } = await ownerBClient.rpc('save_workspace_credential', {
      p_workspace_id: wsA.id, // ownerB e admin de B, nao de A
      p_provider: PROVIDER,
      p_secret: CROSS_TENANT_KEY,
      p_metadata: { marker: 'INVASAO-B' },
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501'); // forbidden: somente admin/owner do workspace

    // A credencial de A permanece intacta (mesmo ponteiro, mesma versao, mesmo metadata).
    const { data: meta, error: eMeta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: PROVIDER })
      .maybeSingle();
    expect(eMeta).toBeNull();
    const row = meta as { secret_key_id: string; rotation_version: number; metadata: { marker?: string } };
    expect(row.secret_key_id).toBe(secretKeyIdA);
    expect(row.rotation_version).toBe(1);
    expect(row.metadata.marker).toBe('A');
  });

  it('B→A: ownerB NAO revoga a credencial openrouter de A', async () => {
    const { error } = await ownerBClient.rpc('revoke_workspace_credential', {
      p_workspace_id: wsA.id,
      p_provider: PROVIDER,
    });
    // Hoje a RPC ainda nao existe no banco de teste (PGRST202 — migration
    // 20260830000000 pendente de aplicacao); apos aplica-la, o erro correto e
    // 42501 (is_workspace_admin). Ambos BLOQUEIAM a revogacao.
    expect(error).not.toBeNull();

    const { data: meta, error: eMeta } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: PROVIDER })
      .maybeSingle();
    expect(eMeta).toBeNull();
    expect(meta).not.toBeNull(); // credencial de A continua la
    expect((meta as { secret_key_id: string }).secret_key_id).toBe(secretKeyIdA);
  });

  // -------------------------------------------------------------------------
  // Bloco 3 — USAR (resolucao chaveada por workspace) + fail-closed sem chave
  // -------------------------------------------------------------------------
  it('resolucao e por (workspace, provider): meta de A != meta de B — B nunca recebe a chave de A', async () => {
    const { data: mA, error: eA } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: PROVIDER })
      .maybeSingle();
    const { data: mB, error: eB } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsB.id, p_provider: PROVIDER })
      .maybeSingle();
    expect(eA).toBeNull();
    expect(eB).toBeNull();
    expect((mA as { secret_key_id: string }).secret_key_id).toBe(secretKeyIdA);
    expect((mB as { secret_key_id: string }).secret_key_id).toBe(secretKeyIdB);
    expect((mA as { secret_key_id: string }).secret_key_id).not.toBe(
      (mB as { secret_key_id: string }).secret_key_id
    );
  });

  it('workspace C SEM chave: meta retorna NULL (helper lanca CredentialResolutionError — fail-closed)', async () => {
    const { data, error } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsC.id, p_provider: PROVIDER })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull(); // resolveWorkspaceCredential lanca; NUNCA cai em env global

    // E o proprio admin de C ve status vazio (sem provider openrouter conectado).
    const { data: status, error: eStatus } = await ownerAClient.rpc(
      'get_workspace_credential_status',
      { p_workspace_id: wsC.id }
    );
    expect(eStatus).toBeNull();
    const rows = (status ?? []) as Array<{ provider: string }>;
    expect(rows.find((r) => r.provider === PROVIDER)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Bloco 4 — porteiro BYOK end-to-end + telemetria
  // DESBLOQUEADO (2026-07-15): migrations 20260828000000 / 20260830000000 /
  // 20260831000000 aplicadas no projeto de teste — os testes abaixo rodam de
  // verdade (eram `it.fails` enquanto as migrations faltavam no banco de teste).
  // -------------------------------------------------------------------------
  it(
    'roundtrip real: admin salva chave openrouter pelo porteiro e o vault devolve exatamente ela (requer 20260828000000 no banco de teste)',
    async () => {
      // ownerA salva a chave de A pela RPC oficial (mesma RPC que a UI chama).
      const { data: v1, error: e1 } = await ownerAClient.rpc('save_workspace_credential', {
        p_workspace_id: wsA.id,
        p_provider: PROVIDER,
        p_secret: ROUNDTRIP_KEY_A,
        p_metadata: { seeded_by: 'openrouter-byok-isolation.test.ts', marker: 'A' },
      });
      expect(e1).toBeNull();
      expect(typeof v1).toBe('number'); // rotation_version, NUNCA o segredo
      expect(JSON.stringify(v1)).not.toContain(ROUNDTRIP_KEY_A);

      // O segredo foi para o vault e decifra de volta (roundtrip real).
      const { data: meta, error: eMeta } = await service
        .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: PROVIDER })
        .maybeSingle();
      expect(eMeta).toBeNull();
      const row = meta as { secret_key_id: string };
      const { data: plain, error: eDec } = await service.rpc('get_decrypted_secret', {
        p_secret_key_id: row.secret_key_id,
      });
      expect(eDec).toBeNull();
      expect(plain).toBe(ROUNDTRIP_KEY_A);

      // Rotacao: salvar de novo sobe a versao e substitui a chave.
      const { data: v2, error: e2 } = await ownerAClient.rpc('save_workspace_credential', {
        p_workspace_id: wsA.id,
        p_provider: PROVIDER,
        p_secret: ROUNDTRIP_KEY_A_ROTATED,
        p_metadata: { seeded_by: 'openrouter-byok-isolation.test.ts', marker: 'A' },
      });
      expect(e2).toBeNull();
      expect(v2).toBe((v1 as number) + 1);
      const { data: meta2 } = await service
        .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: PROVIDER })
        .maybeSingle();
      const { data: plain2 } = await service.rpc('get_decrypted_secret', {
        p_secret_key_id: (meta2 as { secret_key_id: string }).secret_key_id,
      });
      expect(plain2).toBe(ROUNDTRIP_KEY_A_ROTATED);
      expect(plain2).not.toBe(ROUNDTRIP_KEY_A);
    }
  );

  it(
    'admin revoga a PROPRIA credencial openrouter (e o segredo sai do vault) (requer 20260830000000 no banco de teste)',
    async () => {
      const { error } = await ownerBClient.rpc('revoke_workspace_credential', {
        p_workspace_id: wsB.id, // ownerB E admin de B — revogacao legitima
        p_provider: PROVIDER,
      });
      expect(error).toBeNull();

      // Meta some (fail-closed para o proximo uso) e o status nao lista mais.
      const { data: meta, error: eMeta } = await service
        .rpc('get_workspace_credential_meta', { p_workspace_id: wsB.id, p_provider: PROVIDER })
        .maybeSingle();
      expect(eMeta).toBeNull();
      expect(meta).toBeNull();
      const { data: status } = await ownerBClient.rpc('get_workspace_credential_status', {
        p_workspace_id: wsB.id,
      });
      const rows = (status ?? []) as Array<{ provider: string }>;
      expect(rows.find((r) => r.provider === PROVIDER)).toBeUndefined();
    }
  );

  it(
    'consumo/telemetria de IA nao vaza: admin le apenas os eventos do proprio workspace (requer 20260831000000 no banco de teste)',
    async () => {
      const marker = 'or-isolation-' + randomUUID().slice(0, 8);
      // Escrita e exclusivamente server-side (service_role), como em ai-telemetry.ts.
      const { error: eIns } = await service.from('workspace_ai_usage_events').insert([
        {
          workspace_id: wsA.id,
          feature: 'bot-chat',
          model: marker,
          status: 'success',
          total_tokens: 10,
        },
        {
          workspace_id: wsB.id,
          feature: 'prevendas-ai',
          model: marker,
          status: 'failure',
          error_code: 'credential_unavailable',
        },
      ]);
      expect(eIns).toBeNull();

      // ownerA (admin de A e C) le SOMENTE eventos de A/C — nunca de B.
      const { data: evA, error: eA } = await ownerAClient
        .from('workspace_ai_usage_events')
        .select('workspace_id, model')
        .eq('model', marker);
      expect(eA).toBeNull();
      expect((evA ?? []).length).toBe(1);
      expect((evA ?? [])[0].workspace_id).toBe(wsA.id);

      // ownerB le SOMENTE o evento de B.
      const { data: evB, error: eB } = await ownerBClient
        .from('workspace_ai_usage_events')
        .select('workspace_id, model')
        .eq('model', marker);
      expect(eB).toBeNull();
      expect((evB ?? []).length).toBe(1);
      expect((evB ?? [])[0].workspace_id).toBe(wsB.id);

      // member (nao-admin) nao le telemetria nenhuma.
      const { data: evM, error: eM } = await memberAClient
        .from('workspace_ai_usage_events')
        .select('workspace_id, model')
        .eq('model', marker);
      expect(eM).toBeNull();
      expect((evM ?? []).length).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Parte B — garantias estruturais (le fontes via fs, sem rede)
// ---------------------------------------------------------------------------
describe('OpenRouter BYOK — garantias estruturais nos fontes', () => {
  it.each(AI_FUNCTIONS)(
    'edge function %s resolve a chave por workspace, falha fechado (422) e registra telemetria',
    (name) => {
      const src = readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');
      expect(src).toContain('resolve-workspace-credentials');
      expect(src).toContain('resolveWorkspaceCredential');
      expect(src).toContain("'openrouter'");
      expect(src).toContain('CredentialResolutionError');
      expect(src).toContain('credential_unavailable'); // telemetria sem segredo
      expect(src).toMatch(/422/); // resposta orientando o cadastro da chave
      expect(src).toMatch(/Cadastre a chave OpenRouter desta conta/);
    }
  );

  it('NENHUMA edge function le OPENROUTER_API_KEY global (sem fallback para a chave da agencia)', () => {
    const infratores: string[] = [];
    for (const entry of readdirSync(FUNCTIONS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '_shared') continue;
      const idx = join(FUNCTIONS_DIR, entry.name, 'index.ts');
      if (!existsSync(idx)) continue;
      const src = readFileSync(idx, 'utf8');
      if (src.includes('OPENROUTER_API_KEY')) infratores.push(entry.name);
    }
    expect(infratores).toEqual([]);
  });

  it('helper de resolucao e fail-closed: sem meta => CredentialResolutionError, sem env global', () => {
    const src = read('supabase/functions/_shared/resolve-workspace-credentials.ts');
    expect(src).toContain('CredentialResolutionError');
    expect(src).toContain('no ${provider} credential for workspace'); // meta NULL => lanca
    expect(src).not.toContain('OPENROUTER_API_KEY');
    expect(src).not.toMatch(/Deno\.env\.get\(['"]OPENROUTER/);
  });

  it('telemetria registra em workspace_ai_usage_events sem segredo nem prompt', () => {
    const src = read('supabase/functions/_shared/ai-telemetry.ts');
    expect(src).toContain('workspace_ai_usage_events');
    expect(src).not.toContain('apiKey'); // payload nao carrega chave
  });

  it('migration 20260828000000 libera openrouter no porteiro COM guarda is_workspace_admin', () => {
    const sql = read(join('supabase', 'migrations', '20260828000000_enable_openrouter_workspace_byok.sql'));
    expect(sql).toContain('is_workspace_admin');
    expect(sql).toContain("'openrouter'");
    expect(sql).toContain('vault.create_secret'); // segredo so no vault
    expect(sql).toContain('42501');
  });

  it('migration 20260830000000 cria revoke COM guarda admin e delete no vault', () => {
    const sql = read(join('supabase', 'migrations', '20260830000000_revoke_workspace_credential.sql'));
    expect(sql).toContain('revoke_workspace_credential');
    expect(sql).toContain('is_workspace_admin');
    expect(sql).toContain('vault.delete_secret');
    expect(sql).toContain('42501');
  });

  it('migration 20260831000000 cria telemetria com RLS: admin le so a propria conta; escrita service_role', () => {
    const sql = read(join('supabase', 'migrations', '20260831000000_workspace_ai_usage_telemetry.sql'));
    expect(sql).toContain('workspace_ai_usage_events');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('is_workspace_admin(workspace_id)');
    expect(sql).toContain('FOR SELECT TO authenticated');
    expect(sql).toContain('FOR ALL TO service_role');
  });
});
