/**
 * Clara Settings — roundtrip A→B de isolamento das configurações da Clara por subconta.
 *
 * Cobre a pendência do roadmap (docs/ROADMAP.md, "Painel de configuração da Clara"):
 * "Criar testes de isolamento A→B: configuração, catálogo, modelo selecionado e uso da
 * Clara de uma conta nunca podem afetar outra."
 *
 * Complementa a guarda ESTRUTURAL de `clara-workspace-isolation-structural.test.ts`
 * (que cobre bot-chat/workers) com o ROUNDTRIP real no banco de teste:
 *
 *   1. Owner da conta A salva preferências (instruções, limites, modelo) pelo mesmo
 *      caminho de escrita que a UI provoca e lê de volta autenticado.
 *   2. Conta B não lê as settings de A, não escreve nas settings de A e não vê a
 *      auditoria de A (RLS real, cliente autenticado como owner de B).
 *   3. Modelo selecionado em A não altera o de B; desabilitar a Clara em A não afeta B.
 *   4. Validação server-side do formato de modelo (CHECK no banco).
 *   5. Modelos anthropic/* e openai/* rejeitados: CHECK do banco (23514) no
 *      INSERT/UPDATE direto + rejeição server-side na edge function (guarda
 *      estrutural) — regra inegociável do AGENTS.md (custo proibido).
 *
 * ── Restrições de ambiente e do próprio repo (levantadas em 2026-07-15) ──
 *
 *  a) A edge function `clara-settings` NÃO está deployada no projeto de teste
 *     (fgjbmdsucruvtpywyhhf): POST na rota de functions do projeto responde 404
 *     "Requested function was not found" (sondado via curl, fora da suíte). O caminho da UI
 *     (eb-dash2/src/hooks/useClaraSettings.ts → supabase.functions.invoke) portanto
 *     não é exercitável no banco de teste. O salvamento aqui usa uma RÉPLICA fiel do
 *     write path da function (upsert por workspace_id + auditoria sanitizada, ver
 *     supabase/functions/clara-settings/index.ts:176-200) executada com o cliente
 *     service (setup); TODAS as asserções de isolamento usam clientes autenticados
 *     sujeitos a RLS. As validações internas da function (gate owner/admin, fallback
 *     de formato para Qwen, blocklist anthropic//openai/) são cobertas
 *     estruturalmente no bloco "guarda estrutural".
 *
 *  b) Regra do repo: testes de integração NÃO disparam HTTP para edge functions
 *     (credential-isolation.test.ts:338-350, "sem chamada externa real"). Por isso
 *     este arquivo não chama as rotas de functions — nem para sondar o deploy.
 *
 *  c) As tabelas `clara_workspace_settings` / `clara_settings_audit` EXISTEM no
 *     banco de teste: as migrations 20260901000000+ foram aplicadas ao projeto de
 *     teste (confirmado em 2026-07-15 via `supabase migration list --db-url`).
 *     O skip dinâmico permanece como rede de segurança caso o banco de teste seja
 *     recriado sem o schema — nesse caso a remediação é:
 *       supabase db push (apontando para o projeto de TESTE — nunca produção)
 *
 *  d) vitest.integration.config.ts não declara envDir/setupFiles e o vitest 4.1.10
 *     NÃO carrega o .env.test da raiz por conta própria (SUPABASE_URL chega vazia).
 *     Este arquivo carrega o arquivo de env correto ANTES de importar
 *     helpers/safe-guard, que leem process.env no momento da importação.
 *
 * O achado "modelos anthropic/* e openai/* são aceitos" (tripwire `it.fails` até
 * 2026-07-15) foi RESOLVIDO: a edge function clara-settings rejeita os dois
 * prefixos server-side ANTES de qualquer escrita e o CHECK aplicado por
 * 20260920000000_clara_settings_block_forbidden_models.sql rejeita INSERT/UPDATE
 * direto na tabela. O bloco "modelos proibidos" abaixo é a asserção permanente
 * dessa regra inegociável do AGENTS.md.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { TestContext } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TestUser, TestWorkspace } from '../helpers/supabase-test-client';

const ROOT = process.cwd();
const read = (relativePath: string): string => readFileSync(join(ROOT, relativePath), 'utf8');

// ── (d) Carregamento explícito do env de teste ──────────────────────────────
// Parser mínimo de .env (KEY=VALUE, aspas opcionais, ignora comentários/linhas
// vazias). Variáveis já presentes em process.env têm precedência sobre o arquivo.
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let value = m[2].trim();
    const quoted = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
    if (quoted) value = quoted[1];
    process.env[m[1]] = value;
  }
}

const envMode = (process.env.TEST_ENV_MODE || 'test').trim();
if (envMode !== 'test' && envMode !== 'staging') {
  throw new Error(`[clara-settings-roundtrip] TEST_ENV_MODE inválido: "${envMode}" (use test|staging).`);
}
loadEnvFile(join(ROOT, envMode === 'staging' ? '.env.staging.local' : '.env.test'));

// Trava anti-produção + helpers: importados DINAMICAMENTE, só depois do env estar
// carregado (ambos leem process.env no momento da importação). A trava aborta se
// SUPABASE_URL não for local nem o projeto declarado em TEST_PROJECT_REF.
await import('../helpers/safe-guard');
const helpers = await import('../helpers/supabase-test-client');

const SETTINGS_MIGRATION = 'supabase/migrations/20260901000000_create_clara_workspace_settings.sql';
const MODEL_MIGRATION = 'supabase/migrations/20260902000000_unlock_clara_model_selection.sql';
const FORBIDDEN_MODELS_MIGRATION = 'supabase/migrations/20260920000000_clara_settings_block_forbidden_models.sql';
const CLARA_SETTINGS_FN = 'supabase/functions/clara-settings/index.ts';

const DEFAULT_MODEL = 'qwen/qwen3.6-plus';
/** Modelo válido fora do padrão, usado para provar que A e B não se contaminam. */
const NON_DEFAULT_MODEL_A = 'meta-llama/llama-3.1-8b-instruct';
/** Modelos de providers proibidos pela regra inegociável do AGENTS.md (custo). */
const FORBIDDEN_MODELS = ['anthropic/claude-haiku-4-5', 'openai/gpt-5'] as const;

/** Payload completo, mesmo shape que a UI envia e a function persiste (normalizeSettings). */
function settingsPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    is_enabled: true,
    persistent_instructions: 'Responda sempre no tom da Conta A.',
    business_context: 'Contexto de negócio exclusivo da Conta A.',
    response_rules: 'Nunca cite a Conta B.',
    allowed_modules: ['relatorios', 'trafego'],
    allowed_tools: ['query_meta_ads'],
    analysis_depth: 'detailed',
    max_response_tokens: 1024,
    scheduled_report_instructions: 'Resumo semanal da Conta A.',
    model_id: DEFAULT_MODEL,
    ...overrides,
  };
}

describe('Clara Settings — roundtrip A→B no banco de teste', () => {
  let service: SupabaseClient;

  let ownerA: TestUser;
  let workspaceA: TestWorkspace;
  let clientA: SupabaseClient;

  let ownerB: TestUser;
  let workspaceB: TestWorkspace;
  let clientB: SupabaseClient;

  /** true quando as tabelas clara_* existem no banco de teste. */
  let schemaAvailable = false;
  let schemaProbeDetail = '';

  const SKIP_SCHEMA_REASON = () =>
    'Tabelas clara_workspace_settings/clara_settings_audit ausentes no banco de teste' +
    (schemaProbeDetail ? ` (probe: ${schemaProbeDetail})` : '') +
    '. Aplique as migrations 20260901000000+ no projeto de TESTE (supabase db push) para ativar este roundtrip.';

  /**
   * Réplica fiel do write path da edge function clara-settings (index.ts:176-200):
   * lê a versão anterior, faz upsert por workspace_id com updated_by e registra
   * auditoria sanitizada (apenas NOMES dos campos alterados). Roda com o cliente
   * service — exclusivamente como setup; as asserções usam clientes autenticados.
   */
  async function saveViaUIWritePath(
    workspaceId: string,
    settings: Record<string, unknown>,
    userId: string
  ): Promise<Record<string, unknown>> {
    const { data: previous, error: previousError } = await service
      .from('clara_workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (previousError) throw new Error(`save read: ${previousError.message}`);

    const changedFields = Object.entries(settings)
      .filter(([key, value]) => JSON.stringify(previous?.[key]) !== JSON.stringify(value))
      .map(([key]) => key);

    const { data, error } = await service
      .from('clara_workspace_settings')
      .upsert({ workspace_id: workspaceId, ...settings, updated_by: userId }, { onConflict: 'workspace_id' })
      .select('*')
      .single();
    if (error) throw new Error(`save upsert: ${error.message}`);

    if (changedFields.length > 0) {
      const { error: auditError } = await service.from('clara_settings_audit').insert({
        workspace_id: workspaceId,
        changed_by: userId,
        changed_fields: changedFields,
      });
      if (auditError) throw new Error(`save audit: ${auditError.message}`);
    }
    return data as Record<string, unknown>;
  }

  beforeAll(async () => {
    service = helpers.getServiceClient();

    ownerA = await helpers.createTestUser(service, helpers.uniqueEmail('clara-rt-ownera'), 'TestPassword123!');
    ownerB = await helpers.createTestUser(service, helpers.uniqueEmail('clara-rt-ownerb'), 'TestPassword123!');

    workspaceA = await helpers.createTestWorkspace(service, 'Clara RT - Conta A', ownerA.id);
    workspaceB = await helpers.createTestWorkspace(service, 'Clara RT - Conta B', ownerB.id);

    await helpers.addWorkspaceMember(service, workspaceA.id, ownerA.id, 'owner', ownerA.id);
    await helpers.addWorkspaceMember(service, workspaceB.id, ownerB.id, 'owner', ownerB.id);

    clientA = await helpers.getAuthenticatedClient(ownerA.email, ownerA.password);
    clientB = await helpers.getAuthenticatedClient(ownerB.email, ownerB.password);

    // Probe — schema das tabelas clara_* presente no banco de teste? (leitura
    // PostgREST comum a todas as suítes; NÃO é chamada a edge function.)
    const probe = await service.from('clara_workspace_settings').select('workspace_id').limit(1);
    schemaAvailable = !probe.error;
    if (probe.error) schemaProbeDetail = `${probe.error.code ?? 'HTTP?'} ${probe.error.message}`;
  }, 120_000);

  afterAll(async () => {
    if (!service || !workspaceA || !workspaceB) return;
    await helpers.cleanupTestData(
      service,
      schemaAvailable ? ['clara_settings_audit', 'clara_workspace_settings'] : [],
      [workspaceA.id, workspaceB.id]
    );
    await helpers.deleteTestUsers(service, [ownerA?.id, ownerB?.id].filter(Boolean) as string[]);
  }, 60_000);

  function requireSchema(ctx: TestContext): void {
    if (!schemaAvailable) ctx.skip(SKIP_SCHEMA_REASON());
  }

  it('owner da conta A salva preferências (instruções, limites, modelo) e lê de volta autenticado', async (ctx) => {
    requireSchema(ctx);

    const payload = settingsPayload();
    await saveViaUIWritePath(workspaceA.id, payload, ownerA.id);

    // Leitura pelo cliente autenticado do owner A (RLS: admins do workspace leem).
    const { data, error } = await clientA
      .from('clara_workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceA.id)
      .single();

    expect(error).toBeNull();
    expect(data.persistent_instructions).toBe(payload.persistent_instructions);
    expect(data.business_context).toBe(payload.business_context);
    expect(data.response_rules).toBe(payload.response_rules);
    expect(data.allowed_modules).toEqual(payload.allowed_modules);
    expect(data.allowed_tools).toEqual(payload.allowed_tools);
    expect(data.analysis_depth).toBe('detailed');
    expect(data.max_response_tokens).toBe(1024);
    expect(data.model_id).toBe(DEFAULT_MODEL);
    expect(data.is_enabled).toBe(true);

    // Auditoria sanitizada visível para o próprio admin (nomes de campos, sem valores).
    const { data: audit, error: auditError } = await clientA
      .from('clara_settings_audit')
      .select('changed_fields')
      .eq('workspace_id', workspaceA.id);
    expect(auditError).toBeNull();
    expect(audit.length).toBeGreaterThan(0);
    const changedFields = audit.map((row) => row.changed_fields as string[]);
    expect(changedFields.some((fields) => fields.includes('persistent_instructions'))).toBe(true);
  }, 30_000);

  it('conta B não lê as settings de A (nem filtrando, nem em varredura)', async (ctx) => {
    requireSchema(ctx);

    // Garante que A tem algo gravado (idempotente caso o 1º teste tenha rodado).
    await saveViaUIWritePath(workspaceA.id, settingsPayload(), ownerA.id);

    const filtrada = await clientB
      .from('clara_workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceA.id);
    expect(filtrada.error).toBeNull();
    expect(filtrada.data).toHaveLength(0);

    const varredura = await clientB.from('clara_workspace_settings').select('workspace_id');
    expect(varredura.error).toBeNull();
    for (const row of varredura.data) {
      expect(row.workspace_id).not.toBe(workspaceA.id);
    }
  }, 30_000);

  it('conta B não escreve nas settings de A (UPDATE/INSERT sem efeito e linha intacta)', async (ctx) => {
    requireSchema(ctx);

    await saveViaUIWritePath(workspaceA.id, settingsPayload(), ownerA.id);

    // UPDATE cruzado: não existe policy de UPDATE para authenticated. Dependendo
    // dos GRANTs aplicados ao projeto de teste, o PostgREST responde com erro
    // (42501) ou com 0 linhas afetadas (RLS filtra as linhas visíveis) — ambos
    // provam o isolamento; a prova definitiva é a linha de A intacta abaixo.
    const update = await clientB
      .from('clara_workspace_settings')
      .update({ persistent_instructions: 'INJETADO POR B', model_id: NON_DEFAULT_MODEL_A })
      .eq('workspace_id', workspaceA.id)
      .select('workspace_id');
    const updateSemEfeito = update.error !== null || (update.data ?? []).length === 0;
    expect(
      updateSemEfeito,
      `UPDATE de B em A teve efeito: ${JSON.stringify(update.data ?? update.error)}`
    ).toBe(true);

    // INSERT cruzado: sem policy de INSERT, a RLS rejeita SEMPRE (erro 42501),
    // independente dos GRANTs do ambiente.
    const insert = await clientB.from('clara_workspace_settings').insert({
      workspace_id: workspaceA.id,
      ...settingsPayload({ persistent_instructions: 'INJETADO POR B' }),
    });
    expect(insert.error).not.toBeNull();

    // Linha de A permanece exatamente como A deixou (leitura via service = setup).
    const { data } = await service
      .from('clara_workspace_settings')
      .select('persistent_instructions, model_id')
      .eq('workspace_id', workspaceA.id)
      .single();
    expect(data.persistent_instructions).toBe('Responda sempre no tom da Conta A.');
    expect(data.model_id).toBe(DEFAULT_MODEL);
  }, 30_000);

  it('conta B não vê a auditoria de A (leitura vazia e INSERT negado)', async (ctx) => {
    requireSchema(ctx);

    await saveViaUIWritePath(workspaceA.id, settingsPayload({ response_rules: 'Regra nova de A.' }), ownerA.id);

    const leitura = await clientB
      .from('clara_settings_audit')
      .select('*')
      .eq('workspace_id', workspaceA.id);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(0);

    const escrita = await clientB.from('clara_settings_audit').insert({
      workspace_id: workspaceA.id,
      changed_by: ownerB.id,
      changed_fields: ['model_id'],
    });
    expect(escrita.error).not.toBeNull();
  }, 30_000);

  it('modelo selecionado em A não altera o modelo de B (B mantém o seu/default)', async (ctx) => {
    requireSchema(ctx);

    // B grava a própria config com o modelo padrão explícito.
    await saveViaUIWritePath(workspaceB.id, settingsPayload({ model_id: DEFAULT_MODEL }), ownerB.id);

    // A troca para um modelo diferente (formato válido).
    await saveViaUIWritePath(workspaceA.id, settingsPayload({ model_id: NON_DEFAULT_MODEL_A }), ownerA.id);

    // Verdade no banco (setup): A tem o modelo novo, B continua no padrão.
    const { data: rows } = await service
      .from('clara_workspace_settings')
      .select('workspace_id, model_id')
      .in('workspace_id', [workspaceA.id, workspaceB.id]);
    const modelOf = Object.fromEntries((rows ?? []).map((r) => [r.workspace_id, r.model_id]));
    expect(modelOf[workspaceA.id]).toBe(NON_DEFAULT_MODEL_A);
    expect(modelOf[workspaceB.id]).toBe(DEFAULT_MODEL);

    // E B, autenticado, lê o próprio modelo — nunca o de A.
    const { data: ownRow, error } = await clientB
      .from('clara_workspace_settings')
      .select('model_id')
      .eq('workspace_id', workspaceB.id)
      .single();
    expect(error).toBeNull();
    expect(ownRow.model_id).toBe(DEFAULT_MODEL);
  }, 30_000);

  it('conta A desabilitando a Clara não afeta a conta B', async (ctx) => {
    requireSchema(ctx);

    await saveViaUIWritePath(workspaceB.id, settingsPayload({ is_enabled: true }), ownerB.id);
    await saveViaUIWritePath(workspaceA.id, settingsPayload({ is_enabled: false }), ownerA.id);

    const { data: rows } = await service
      .from('clara_workspace_settings')
      .select('workspace_id, is_enabled')
      .in('workspace_id', [workspaceA.id, workspaceB.id]);
    const enabledOf = Object.fromEntries((rows ?? []).map((r) => [r.workspace_id, r.is_enabled]));
    expect(enabledOf[workspaceA.id]).toBe(false);
    expect(enabledOf[workspaceB.id]).toBe(true);

    const { data: ownRow } = await clientB
      .from('clara_workspace_settings')
      .select('is_enabled')
      .eq('workspace_id', workspaceB.id)
      .single();
    expect(ownRow.is_enabled).toBe(true);
  }, 30_000);

  it('CHECK do banco rejeita formato de modelo inválido (validação server-side)', async (ctx) => {
    requireSchema(ctx);

    for (const invalid of ['QWEN/QWEN3.6-PLUS', 'modelo-sem-slash', 'modelo com espaço/x']) {
      const { error } = await service
        .from('clara_workspace_settings')
        .upsert(
          { workspace_id: workspaceA.id, ...settingsPayload({ model_id: invalid }) },
          { onConflict: 'workspace_id' }
        );
      expect(error, `model_id inválido aceito: ${invalid}`).not.toBeNull();
      expect(
        error?.code === '23514' || /violates check constraint/i.test(error?.message ?? ''),
        `esperava violação de CHECK para "${invalid}", veio: ${error?.message}`
      ).toBe(true);
    }

    // Linha de A não foi corrompida pelas tentativas inválidas.
    const { data } = await service
      .from('clara_workspace_settings')
      .select('model_id')
      .eq('workspace_id', workspaceA.id)
      .single();
    expect([DEFAULT_MODEL, NON_DEFAULT_MODEL_A]).toContain(data.model_id);
  }, 30_000);

  it('CHECK do banco rejeita modelos anthropic/* e openai/* (regra inegociável do AGENTS.md)', async (ctx) => {
    requireSchema(ctx);

    // Linha de A presente para os UPDATEs diretos. Como cada UPDATE é rejeitado
    // pelo CHECK, a linha permanece intacta entre as iterações do loop.
    await saveViaUIWritePath(workspaceA.id, settingsPayload(), ownerA.id);

    // UPDATE direto na linha existente: o CHECK de 20260920000000 rejeita (23514).
    for (const forbidden of FORBIDDEN_MODELS) {
      const update = await service
        .from('clara_workspace_settings')
        .update({ model_id: forbidden })
        .eq('workspace_id', workspaceA.id);
      expect(update.error, `UPDATE direto aceitou model_id proibido: ${forbidden}`).not.toBeNull();
      expect(
        update.error?.code === '23514' || /violates check constraint/i.test(update.error?.message ?? ''),
        `esperava violação de CHECK (23514) no UPDATE com "${forbidden}", veio: ${update.error?.message}`
      ).toBe(true);
    }

    // INSERT direto: a linha é removida antes de cada tentativa (setup) para não
    // esbarrar na PK; o CHECK é avaliado na tupla nova e rejeita sem gravar nada.
    for (const forbidden of FORBIDDEN_MODELS) {
      await service.from('clara_workspace_settings').delete().eq('workspace_id', workspaceA.id);
      const insert = await service
        .from('clara_workspace_settings')
        .insert({ workspace_id: workspaceA.id, ...settingsPayload({ model_id: forbidden }) });
      expect(insert.error, `INSERT direto aceitou model_id proibido: ${forbidden}`).not.toBeNull();
      expect(
        insert.error?.code === '23514' || /violates check constraint/i.test(insert.error?.message ?? ''),
        `esperava violação de CHECK (23514) no INSERT com "${forbidden}", veio: ${insert.error?.message}`
      ).toBe(true);
    }

    // Restaura a linha de A e prova que nenhum modelo proibido ficou gravado.
    await saveViaUIWritePath(workspaceA.id, settingsPayload(), ownerA.id);
    const { data } = await service
      .from('clara_workspace_settings')
      .select('model_id')
      .eq('workspace_id', workspaceA.id)
      .single();
    expect(data.model_id).toBe(DEFAULT_MODEL);
  }, 30_000);
});

describe('Clara Settings — guarda estrutural (independe do banco)', () => {
  it('RLS: leitura restrita a admins do workspace; nenhuma policy de escrita para authenticated', () => {
    const sql = read(SETTINGS_MIGRATION);

    expect(sql).toContain('ALTER TABLE public.clara_workspace_settings ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.clara_settings_audit ENABLE ROW LEVEL SECURITY');

    // SELECT só para owner/admin do próprio workspace (função de membership).
    expect(sql).toMatch(/CREATE POLICY "Workspace admins read Clara settings"[\s\S]*?FOR SELECT TO authenticated[\s\S]*?is_workspace_admin\(workspace_id\)/);
    expect(sql).toMatch(/CREATE POLICY "Workspace admins read Clara settings audit"[\s\S]*?FOR SELECT TO authenticated[\s\S]*?is_workspace_admin\(workspace_id\)/);

    // Escrita (INSERT/UPDATE/DELETE) nunca é concedida a authenticated: só service_role.
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)[\s\S]*?TO authenticated/);
    expect(sql).toMatch(/FOR ALL TO service_role/);

    // anon sem qualquer privilégio; authenticated só SELECT (grant de entrada — a policy filtra).
    expect(sql).toContain('REVOKE ALL ON public.clara_workspace_settings FROM anon');
    expect(sql).toContain('REVOKE ALL ON public.clara_settings_audit FROM anon');
    expect(sql).toContain('GRANT SELECT ON public.clara_workspace_settings, public.clara_settings_audit TO authenticated');
  });

  it('banco valida o formato do model_id via CHECK (provider/model em minúsculas)', () => {
    const sql = read(MODEL_MIGRATION);
    expect(sql).toContain("CHECK (model_id ~ '^[a-z0-9._-]+/[a-z0-9._-]+$')");
    // A trava fixa de Qwen foi removida de propósito (decisão 2026-07-14).
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS clara_workspace_settings_model_id_check');
  });

  it('banco bloqueia anthropic/* e openai/* no CHECK do model_id (migration 20260920000000)', () => {
    const sql = read(FORBIDDEN_MODELS_MIGRATION);

    // Recria a constraint preservando a validação de formato existente...
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS clara_workspace_settings_model_id_check');
    expect(sql).toContain("model_id ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'");
    // ...e adicionando a blocklist de providers, case-insensitive (lower()).
    expect(sql).toMatch(/lower\(model_id\) NOT LIKE 'anthropic\/%'/);
    expect(sql).toMatch(/lower\(model_id\) NOT LIKE 'openai\/%'/);
  });

  it('edge function rejeita server-side anthropic/* e openai/* ANTES de qualquer escrita', () => {
    const fn = read(CLARA_SETTINGS_FN);

    // Blocklist explícita dos providers proibidos (regra inegociável do AGENTS.md).
    expect(fn).toContain("const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']");
    // Normalização robusta: trim + case-insensitive antes da checagem de prefixo.
    expect(fn).toContain('.trim().toLowerCase()');
    expect(fn).toContain('FORBIDDEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))');
    // Erro claro orientando o admin.
    expect(fn).toContain('Modelos anthropic/* e openai/* não são permitidos por política de custo.');

    // A rejeição acontece no write path ANTES do normalizeSettings/upsert.
    const rejectIdx = fn.indexOf('if (hasForbiddenModelPrefix(settingsInput.model_id))');
    const saveIdx = fn.indexOf('const settings = normalizeSettings(settingsInput)');
    expect(rejectIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(-1);
    expect(
      rejectIdx < saveIdx,
      'rejeição de provider proibido deve preceder normalizeSettings/upsert no write path'
    ).toBe(true);
  });

  it('edge function: gate owner/admin, fallback de formato para Qwen e auditoria sanitizada', () => {
    const fn = read(CLARA_SETTINGS_FN);

    // Gate: exige membership ativo com papel owner/admin antes de qualquer ação.
    expect(fn).toContain('requireWorkspaceAdmin');
    expect(fn).toContain(".eq('is_active', true)");
    expect(fn).toContain("membership.role !== 'owner' && membership.role !== 'admin'");
    expect(fn).toContain('Apenas owner ou admin pode configurar a Clara.');

    // Formato inválido não é persistido: cai no default Qwen (DEFAULT_MODEL).
    expect(fn).toContain('const MODEL_ID_RE = /^[a-z0-9._-]+\\/[a-z0-9._-]+$/');
    expect(fn).toContain("const DEFAULT_MODEL = 'qwen/qwen3.6-plus'");
    expect(fn).toContain('MODEL_ID_RE.test(modelId) ? modelId : DEFAULT_MODEL');

    // Auditoria sanitizada: grava só os NOMES dos campos alterados, nunca valores.
    expect(fn).toContain('.map(([key]) => key)');

    // Upsert sempre escopado por workspace_id e marcando quem alterou.
    expect(fn).toContain('updated_by: user.id');
    expect(fn).toContain("onConflict: 'workspace_id'");
  });

  it('frontend só fala com a function — nunca acessa as tabelas diretamente', () => {
    const hook = read('eb-dash2/src/hooks/useClaraSettings.ts');
    const tab = read('eb-dash2/src/pages/relatorios/tabs/ConfigurarClaraTab.tsx');

    expect(hook).toContain("supabase.functions.invoke<ApiResponse>('clara-settings'");
    for (const [name, source] of [
      ['useClaraSettings.ts', hook],
      ['ConfigurarClaraTab.tsx', tab],
    ] as const) {
      expect(source, name).not.toContain(".from('clara_workspace_settings')");
      expect(source, name).not.toContain('.from("clara_workspace_settings")');
      expect(source, name).not.toContain(".from('clara_settings_audit')");
    }
  });
});
