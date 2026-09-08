/**
 * Suite consolidada de isolamento de credenciais — Fase 2 (fatia 9)
 *
 * Agrega, num único lugar, as garantias que fecham a Fase 2 do plano
 * (docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md, secao 4.1 + 10.2). Cada fatia
 * ja nasceu com seu proprio teste; este arquivo e a AGREGACAO cross-fatia que
 * opera o criterio de abandono (kill-switch).
 *
 * Parte A — contra o banco de TESTE real (fgjbmdsucruvtpywyhhf, via .env.test):
 *  - NEGATIVO RLS: authenticated (mesmo owner) NAO le workspace_integration_credentials;
 *  - NEGATIVO EXECUTE: authenticated NAO chama get_workspace_credential_meta nem
 *    get_decrypted_secret (ambas service_role-only por GRANT);
 *  - isolamento A/B: a RPC retorna o metadata do workspace certo (nao cruza);
 *  - revogacao: subir rotation_version muda o "sinal" lido a cada request;
 *  - kill-switch: DELETE da linha do provider => meta retorna NULL (fail-closed);
 *  - roteamento: get_workspace_id_by_ghl_location_id retorna NULL (nao "mais antigo").
 *
 * Parte B — estrutural (le fontes/migrations via fs, sem rede):
 *  - nenhuma edge function por tenant le credencial GLOBAL de provedor (GHL/Meta/Notion)
 *    — inclusive no backfill historico da Meta;
 *  - todas as functions por tenant importam o helper resolve-workspace-credentials;
 *  - webhook-ghl autentica por ghl_integration_settings + dead-letter (sem segredo global);
 *  - fallback "workspace mais antigo" removido na migration da fatia 3;
 *  - crons de Meta/Notion/permalinks fazem loop por workspace (net.http_post por tenant);
 *  - gatilho OpenClaw filtra por workspace_id e passa pelo guard SSRF;
 *  - bot-chat no modelo obrigatorio (AGENTS.md) qwen/qwen3.6-plus;
 *  - nenhum teste de integracao dispara HTTP para edge function (sem chamada externa real).
 *
 * Honestidade (o que NAO esta aqui e onde esta coberto):
 *  - roundtrip real do segredo (vault.create_secret -> get_decrypted_secret) com chave
 *    verdadeira: coberto em outbound-webhooks-isolation.test.ts (SECRET_A/SECRET_B) e
 *    credential-rpcs.test.ts. Aqui o seed usa secret_key_id sintetico (sem FK) para
 *    provar RLS/isolamento de LINHA e o gate de EXECUTE — nao a decifracao.
 *  - propagacao do cache em <=10s: coberta no unit credential-cache.test.ts (TTL do
 *    helper Deno). Aqui provamos o "sinal" (rotation_version muda), nao o isolate Deno.
 *  - disparo real de webhook (net.http_post 2xx): fluxo do cliente, validado em
 *    staging/producao — egress de rede nao roda no vitest.
 *
 * Producao (qzesffnkqgelmtfblzkr) NUNCA e alvo: ver __tests__/helpers/safe-guard.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
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

// Segredos globais de provedor que NENHUMA function por tenant pode mais ler via env.
// Inclui o backfill historico da Meta: nao existe excecao para credencial global.
const FORBIDDEN_GLOBAL_ENVS = [
  'GHL_API_KEY',
  'GHL_LOCATION_ID',
  'META_ACCESS_TOKEN',
  'META_AD_ACCOUNT_ID',
  'META_ADS_WORKSPACE_ID',
  'NOTION_API_KEY',
] as const;
const ENV_GLOBAL_RE = new RegExp(
  `Deno\\.env\\.get\\(['"](?:${FORBIDDEN_GLOBAL_ENVS.join('|')})['"]\\)`
);

// Functions por tenant que DEVEM resolver credencial pelo helper (fonte lida como texto).
const TENANT_FUNCTIONS = [
  'sync-contact-opportunities',
  'reconcile-contact-opportunities',
  'sync-contact-tasks',
  'sync-appointment-dates',
  'sync-ghl-conversations',
  'sync-ghl-users',
  'sync-recuperacao-stages',
  'recuperacao-prefetch',
  'recuperacao-corrigir',
  'discover-ghl-config',
  'diag-ghl',
  'ghl-api-worker',
  'sync-meta-ads',
  'sync-ad-permalinks',
  'notion-creatives-sync',
  'test-workspace-credential',
  'sync-meta-ads-backfill',
] as const;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function* walkFunctionIndex(): Generator<{ name: string; path: string; src: string }> {
  for (const entry of readdirSync(FUNCTIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared') continue;
    const idx = join(FUNCTIONS_DIR, entry.name, 'index.ts');
    if (!existsSync(idx)) continue;
    yield { name: entry.name, path: idx, src: readFileSync(idx, 'utf8') };
  }
}

// ---------------------------------------------------------------------------
// Parte A — banco de teste real
// ---------------------------------------------------------------------------
describe('Fase 2 consolidada — isolamento de credenciais (banco de teste)', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let ownerClient: SupabaseClient;
  const secretA = randomUUID();
  const secretB = randomUUID();

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('f9-owner'), 'TestPassword123!');
    wsA = await createTestWorkspace(service, 'WS F9 A', owner.id);
    wsB = await createTestWorkspace(service, 'WS F9 B', owner.id);
    await addWorkspaceMember(service, wsA.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, wsB.id, owner.id, 'owner', owner.id);
    ownerClient = await getAuthenticatedClient(owner.email, owner.password);

    // Seed de credencial (secret_key_id sintetico, sem FK — prova RLS/meta/isolamento).
    const { error: eA } = await service.from('workspace_integration_credentials').insert({
      workspace_id: wsA.id,
      provider: 'ghl',
      secret_key_id: secretA,
      metadata: { location_id: 'LOC-F9-A' },
    });
    if (eA) throw new Error(`seed cred A: ${eA.message}`);
    const { error: eB } = await service.from('workspace_integration_credentials').insert({
      workspace_id: wsB.id,
      provider: 'ghl',
      secret_key_id: secretB,
      metadata: { location_id: 'LOC-F9-B' },
    });
    if (eB) throw new Error(`seed cred B: ${eB.message}`);
  });

  afterAll(async () => {
    await service
      .from('workspace_integration_credentials')
      .delete()
      .in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspace_members').delete().in('workspace_id', [wsA.id, wsB.id]);
    await service.from('workspaces').delete().in('id', [wsA.id, wsB.id]);
    await deleteTestUsers(service, [owner.id]);
  });

  it('NEGATIVO RLS: authenticated (owner) NAO le nenhuma linha de credencial', async () => {
    const { data, error } = await ownerClient
      .from('workspace_integration_credentials')
      .select('id, workspace_id, provider');
    // Bloqueado por GRANT (42501) OU zero linhas via RLS: ambos = nao vaza.
    const vazou = error === null && (data ?? []).length > 0;
    expect(vazou).toBe(false);
  });

  it('NEGATIVO EXECUTE: authenticated NAO chama get_workspace_credential_meta', async () => {
    const { data, error } = await ownerClient.rpc('get_workspace_credential_meta', {
      p_workspace_id: wsA.id,
      p_provider: 'ghl',
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('NEGATIVO EXECUTE: authenticated NAO chama get_decrypted_secret', async () => {
    const { data, error } = await ownerClient.rpc('get_decrypted_secret', {
      p_secret_key_id: secretA,
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('isolamento A/B: service_role resolve o metadata do workspace certo (nao cruza)', async () => {
    const { data: mA, error: eA } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: 'ghl' })
      .maybeSingle();
    const { data: mB, error: eB } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsB.id, p_provider: 'ghl' })
      .maybeSingle();
    expect(eA).toBeNull();
    expect(eB).toBeNull();
    expect((mA as { metadata: { location_id: string } }).metadata.location_id).toBe('LOC-F9-A');
    expect((mB as { metadata: { location_id: string } }).metadata.location_id).toBe('LOC-F9-B');
    // Prova de nao-cruzamento: a chave de cache secreta de A != de B.
    expect((mA as { secret_key_id: string }).secret_key_id).toBe(secretA);
    expect((mB as { secret_key_id: string }).secret_key_id).toBe(secretB);
  });

  it('revogacao: subir rotation_version muda o sinal lido a cada request', async () => {
    const before = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: 'ghl' })
      .maybeSingle();
    const v0 = (before.data as { rotation_version: number }).rotation_version;

    const { error: eUp } = await service
      .from('workspace_integration_credentials')
      .update({ rotation_version: v0 + 1 })
      .eq('workspace_id', wsA.id)
      .eq('provider', 'ghl');
    expect(eUp).toBeNull();

    const after = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsA.id, p_provider: 'ghl' })
      .maybeSingle();
    const v1 = (after.data as { rotation_version: number }).rotation_version;
    expect(v1).toBe(v0 + 1);
  });

  it('kill-switch: DELETE da linha do provider faz meta retornar NULL (fail-closed)', async () => {
    const { error: eDel } = await service
      .from('workspace_integration_credentials')
      .delete()
      .eq('workspace_id', wsB.id)
      .eq('provider', 'ghl');
    expect(eDel).toBeNull();

    const { data, error } = await service
      .rpc('get_workspace_credential_meta', { p_workspace_id: wsB.id, p_provider: 'ghl' })
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('roteamento: get_workspace_id_by_ghl_location_id retorna NULL (nao "mais antigo")', async () => {
    const { data, error } = await service.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: 'LOC-F9-QUE-NAO-EXISTE',
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parte B — garantias estruturais (le fontes via fs, sem rede)
// ---------------------------------------------------------------------------
describe('Fase 2 consolidada — garantias estruturais nos fontes', () => {
  it('nenhuma function por tenant le credencial GLOBAL de provedor', () => {
    const infratores: string[] = [];
    for (const fn of walkFunctionIndex()) {
      if (!ENV_GLOBAL_RE.test(fn.src)) continue;
      const rel = join(fn.name, 'index.ts');
      infratores.push(rel);
    }
    expect(infratores).toEqual([]);
  });

  it.each(TENANT_FUNCTIONS)('function por tenant importa o helper: %s', (name) => {
    const src = readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');
    expect(src).toContain('resolve-workspace-credentials');
  });

  it('webhook-ghl autentica por ghl_integration_settings + dead-letter (sem segredo global)', () => {
    const src = read('supabase/functions/webhook-ghl/index.ts');
    expect(src).toContain('ghl_integration_settings');
    expect(src).toContain('webhook_secret');
    expect(src).toContain('webhook_unresolved'); // dead-letter, nunca descarte
    expect(src).toMatch(/401/); // falha dura sem match
  });

  it('fallback "workspace mais antigo" removido na migration da fatia 3', () => {
    const sql = read('supabase/migrations/20260725000000_fase3_routing_location_uniqueness.sql');
    expect(sql).toContain('uq_ghl_integration_settings_location_active'); // unique parcial
    expect(sql).toContain('RETURN v_workspace_id'); // retorna NULL sem match
    expect(sql).not.toMatch(/ORDER BY\s+created_at/i); // fim do "mais antigo"
  });

  it.each([
    '20260728000000_fase8_meta_crons_por_workspace.sql',
    '20260729000000_fase8_notion_crons_por_workspace.sql',
    '20260730000000_fase8_permalinks_cron_por_workspace.sql',
  ])('cron por workspace em loop: %s', (file) => {
    const sql = read(join('supabase', 'migrations', file));
    expect(sql).toMatch(/SELECT\s+DISTINCT\s+workspace_id/i);
    expect(sql).toContain('workspace_integration_credentials');
    expect(sql).toContain('net.http_post'); // dispara por workspace
  });

  it('gatilho OpenClaw filtra por workspace_id e passa pelo guard SSRF', () => {
    const sql = read('supabase/migrations/20260727000000_fase7_outbound_webhooks.sql');
    expect(sql).toContain('assert_outbound_url_safe'); // deny-by-default
    expect(sql).toContain('processar_notificacao_openclaw_contrato_assinado');
    expect(sql).toMatch(/workspace_id/); // filtro explicito de tenant na trigger
  });

  it('bot-chat no modelo obrigatorio qwen/qwen3.6-plus (AGENTS.md)', () => {
    const src = read('supabase/functions/bot-chat/index.ts');
    expect(src).toContain('qwen/qwen3.6-plus');
    // A unica ocorrencia permitida de providers proibidos e a lista de bloqueio
    // (defesa residual no consumo — ver ai-model-prefix-clamp-structural.test.ts).
    const srcSemBlocklist = src.replace(
      "const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']",
      '',
    );
    expect(srcSemBlocklist).not.toMatch(/['"]anthropic\//);
    expect(srcSemBlocklist).not.toMatch(/['"]openai\//);
  });

  it('configuração da Clara permanece isolada, auditada e com modelo configurável (padrão Qwen)', () => {
    const migration = read('supabase/migrations/20260901000000_create_clara_workspace_settings.sql');
    const unlockMigration = read('supabase/migrations/20260902000000_unlock_clara_model_selection.sql');
    const settingsFn = read('supabase/functions/clara-settings/index.ts');
    const chat = read('supabase/functions/bot-chat/index.ts');

    expect(migration).toContain('workspace_id uuid PRIMARY KEY');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('is_workspace_admin(workspace_id)');
    expect(unlockMigration).toContain('DROP CONSTRAINT IF EXISTS clara_workspace_settings_model_id_check');
    expect(unlockMigration).toContain("model_id ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'");
    expect(settingsFn).toContain('requireWorkspaceAdmin');
    expect(settingsFn).toContain("'https://openrouter.ai/api/v1/models'");
    expect(settingsFn).toContain('DEFAULT_MODEL');
    expect(settingsFn).toContain('selectable: true');
    expect(chat).toContain(".from('clara_workspace_settings')");
    expect(chat).toContain('settings && !settings.is_enabled');
    expect(chat).toContain('settings.allowed_tools.includes(tool.function.name)');
  });

  it.each([
    'bot-chat/index.ts',
    'bot-chat-data/index.ts',
    'invite-user/index.ts',
    'workspace-apps/index.ts',
    'setup-ghl-integration/index.ts',
    'discover-ghl-config/index.ts',
  ])('erros internos nao sao refletidos na resposta publica: %s', (file) => {
    const src = read(join('supabase', 'functions', file));
    expect(src).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(?:\w+\.)?message/);
    expect(src).not.toMatch(/JSON\.stringify\(\{\s*error:\s*err instanceof Error/);
    expect(src).not.toMatch(/jsonResponse\(\{[^}]*error:\s*`[^`]*\$\{/s);
  });

  it('nenhum teste de integracao dispara HTTP para edge function (sem chamada externa real)', () => {
    const dir = join(ROOT, '__tests__', 'integration');
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.test.ts')) continue;
      if (f === 'credential-isolation.test.ts') continue; // o verificador nao se auto-verifica
      const src = readFileSync(join(dir, f), 'utf8');
      if (src.includes('.functions.supabase.co') || src.includes('/functions/v1/')) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
