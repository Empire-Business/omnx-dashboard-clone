/**
 * P0 cross-tenant (migration 20260927000000_fix_cross_tenant_rls_p0.sql) — prova
 * com seed real A/B de que os 8 vazamentos confirmados em produção (auditoria de
 * 2026-07-17 em pg_policies) estão fechados:
 *
 *   tabela                  | política ao vivo ANTES da P0
 *   ------------------------|----------------------------------------------
 *   ghl_tasks               | SELECT USING (true) p/ authenticated
 *   maquina_de_conteudo     | SELECT USING (true) p/ authenticated (PII Hotmart)
 *   stevo_whatsapp_calls    | membro de QUALQUER workspace lia
 *   webhooks_ghl            | admin de QUALQUER workspace lia payloads brutos
 *   reunioes                | membro de QUALQUER workspace lia
 *   audit_log               | admin de QUALQUER workspace lia tudo
 *   bot_context             | membro lia / admin ESCREVIA cross-tenant
 *   app_config              | SELECT USING (true) p/ ANON
 *
 * O que este arquivo prova (owner do workspace A vs owner e member do workspace B):
 *
 *  1) LEITURA — nas 6 tabelas com policy nova `is_workspace_member(workspace_id)`
 *     (ghl_tasks, maquina_de_conteudo, webhooks_ghl, reunioes, bot_context,
 *     stevo_whatsapp_calls): B não vê a linha de A (por id e por workspace_id)
 *     e A continua vendo a própria linha (a policy nova não quebrou a leitura
 *     legítima — sem esse positivo, "B não lê" passaria até com RLS negando tudo).
 *
 *  2) ESCRITA — bot_context exige `is_workspace_admin(workspace_id)` no WITH
 *     CHECK: owner/admin de B não insere em A e member comum de B não insere
 *     nem em B. audit_log exige `workspace_id NOT NULL + is_workspace_member`:
 *     member de B não insere com workspace_id de A, e INSERT autenticado sem
 *     workspace_id é negado. ghl_tasks / maquina_de_conteudo / webhooks_ghl /
 *     reunioes / stevo_whatsapp_calls NÃO têm policy de INSERT para
 *     authenticated (escrita é service_role-only): o teste fixa que qualquer
 *     INSERT autenticado com workspace_id alheio é negado (defesa em
 *     profundidade — antes da P0 não havia nem coluna para filtrar).
 *
 *  3) audit_log (coluna NULLABLE, mesmo padrão de `contatos`): admin de B não
 *     lê a linha de A; a linha operacional com workspace_id NULL (escrita por
 *     service_role) é invisível para authenticated; admin de A lê a de A.
 *
 *  4) app_config — ANON (sem auth) lê `supabase_anon_key` (whitelist) mas NÃO
 *     lê `segredo_teste` (seedada via service_role): fim do USING (true).
 *
 *  5) TRIGGERS BEFORE INSERT — ghl_tasks/reunioes sem workspace_id resolvem
 *     pelo contato_id (contato de A => workspace_id de A). webhooks_ghl sem
 *     workspace_id e com location_id desconhecida FALHA (fail-closed: location
 *     desconhecida nunca é atribuída a tenant algum — NOT NULL rejeita).
 *
 * Ref: supabase/migrations/20260927000000_fix_cross_tenant_rls_p0.sql
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAnonClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  insertTestData,
  cleanupTestData,
  uniqueEmail,
  deleteTestUsers,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('P0 cross-tenant RLS fix (migration 20260927) — seed real A/B', () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;

  let userA: TestUser;
  let userB: TestUser; // owner/admin de B
  let userBMember: TestUser; // member comum de B
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientBMember: SupabaseClient;

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** Tabelas que ganharam (ou tiveram reescrita) a policy SELECT is_workspace_member. */
  const MEMBER_READ_TABLES = [
    'ghl_tasks',
    'maquina_de_conteudo',
    'webhooks_ghl',
    'reunioes',
    'bot_context',
    'stevo_whatsapp_calls',
  ];

  /** Sem policy de INSERT para authenticated — escrita é service_role-only. */
  const SERVICE_ONLY_WRITE_TABLES = [
    'ghl_tasks',
    'maquina_de_conteudo',
    'webhooks_ghl',
    'reunioes',
    'stevo_whatsapp_calls',
  ];

  let contatoAId: string;
  let contatoBId: string;
  const seedIds: Record<string, string> = {}; // tabela -> valor da PK da linha seedada em A
  let auditNullId: string;

  /** PK por tabela (bot_context tem PK `key`, nao `id`). */
  const PK_COLUMN: Record<string, string> = { bot_context: 'key' };
  const pkCol = (table: string): string => PK_COLUMN[table] ?? 'id';

  beforeAll(async () => {
    service = getServiceClient();
    anon = getAnonClient();

    userA = await createTestUser(service, uniqueEmail('test-p0-usera'), 'TestPassword123!');
    userB = await createTestUser(service, uniqueEmail('test-p0-userb'), 'TestPassword123!');
    userBMember = await createTestUser(service, uniqueEmail('test-p0-userbmem'), 'TestPassword123!');

    wsA = await createTestWorkspace(service, 'P0 - Workspace A', userA.id);
    wsB = await createTestWorkspace(service, 'P0 - Workspace B', userB.id);

    await addWorkspaceMember(service, wsA.id, userA.id, 'owner', userA.id);
    await addWorkspaceMember(service, wsB.id, userB.id, 'owner', userB.id);
    await addWorkspaceMember(service, wsB.id, userBMember.id, 'member', userB.id);

    // Contatos (FK + insumo dos triggers de ghl_tasks/reunioes).
    const { data: contatoA, error: eContA } = await service
      .from('contatos')
      .insert({ ghl_id: `p0-ctt-a-${runId}`, nome: 'Contato P0 A', workspace_id: wsA.id })
      .select('id')
      .single();
    if (eContA) throw new Error(`seed contato A: ${eContA.message}`);
    contatoAId = contatoA.id;

    const { data: contatoB, error: eContB } = await service
      .from('contatos')
      .insert({ ghl_id: `p0-ctt-b-${runId}`, nome: 'Contato P0 B', workspace_id: wsB.id })
      .select('id')
      .single();
    if (eContB) throw new Error(`seed contato B: ${eContB.message}`);
    contatoBId = contatoB.id;

    // Seed real em A nas 6 tabelas member-read (schema mínimo NOT NULL conferido
    // no banco de teste em 2026-07-17).
    const seedsA: Array<[string, Record<string, unknown>]> = [
      ['ghl_tasks', { ghl_task_id: `p0-task-${runId}`, contato_id: contatoAId, workspace_id: wsA.id }],
      ['maquina_de_conteudo', { workspace_id: wsA.id }],
      ['webhooks_ghl', { workspace_id: wsA.id }],
      ['reunioes', { contato_id: contatoAId, workspace_id: wsA.id }],
      ['bot_context', { key: `p0-ctx-${runId}`, title: 'Contexto P0 A', content: 'conteudo A', workspace_id: wsA.id }],
      ['stevo_whatsapp_calls', { call_id: `p0-call-${runId}`, workspace_id: wsA.id }],
    ];
    for (const [table, row] of seedsA) {
      const { data, error } = await service.from(table).insert(row).select(pkCol(table)).single();
      if (error) throw new Error(`seed ${table}: ${error.message}`);
      seedIds[table] = data[pkCol(table)] as string;
    }

    // audit_log: linha de A + linha operacional sem workspace (padrão service_role).
    const { data: auditA, error: eAuditA } = await service
      .from('audit_log')
      .insert({ user_id: userA.id, action: 'p0_test', table_name: 'p0_test', record_id: 'linha-a', workspace_id: wsA.id })
      .select('id')
      .single();
    if (eAuditA) throw new Error(`seed audit_log A: ${eAuditA.message}`);
    seedIds['audit_log'] = auditA.id as string;

    const { data: auditNull, error: eAuditNull } = await service
      .from('audit_log')
      .insert({ user_id: userA.id, action: 'p0_test_null', table_name: 'p0_test', record_id: 'linha-null' })
      .select('id')
      .single();
    if (eAuditNull) throw new Error(`seed audit_log NULL: ${eAuditNull.message}`);
    auditNullId = auditNull.id as string;

    // app_config: chave pública (whitelist) + chave que NUNCA pode vazar para anon.
    await insertTestData(service, 'app_config', [
      { key: 'supabase_anon_key', value: `anon-publica-${runId}` },
      { key: 'segredo_teste', value: `segredo-${runId}` },
    ]);

    clientA = await getAuthenticatedClient(userA.email, userA.password);
    clientB = await getAuthenticatedClient(userB.email, userB.password);
    clientBMember = await getAuthenticatedClient(userBMember.email, userBMember.password);
  });

  afterAll(async () => {
    // audit_log e app_config não saem por workspace_id (linha NULL / sem coluna) — por id/key.
    await service.from('audit_log').delete().in('id', [seedIds['audit_log'], auditNullId]);
    await service.from('app_config').delete().in('key', ['supabase_anon_key', 'segredo_teste']);
    await cleanupTestData(
      service,
      [
        'ghl_tasks',
        'reunioes',
        'webhooks_ghl',
        'maquina_de_conteudo',
        'bot_context',
        'stevo_whatsapp_calls',
        'contatos',
      ],
      [wsA.id, wsB.id]
    );
    await deleteTestUsers(service, [userA.id, userB.id, userBMember.id]);
  });

  // ---- 1) Leitura cross-tenant (SELECT is_workspace_member) ----

  describe('leitura — B nao ve A, A ve a propria linha', () => {
    it.each(MEMBER_READ_TABLES)('B nao ve linha de A em "%s" (por PK nem por workspace_id)', async (table) => {
      const byId = await clientB.from(table).select(pkCol(table)).eq(pkCol(table), seedIds[table]);
      expect(byId.error).toBeNull();
      expect(byId.data, `VAZAMENTO em ${table}: B leu a linha de A por PK`).toHaveLength(0);

      const byWs = await clientB.from(table).select(pkCol(table)).eq('workspace_id', wsA.id);
      expect(byWs.error).toBeNull();
      expect(byWs.data, `VAZAMENTO em ${table}: B leu linhas do workspace A`).toHaveLength(0);
    });

    it.each(MEMBER_READ_TABLES)('A ve a propria linha em "%s" (leitura legitima preservada)', async (table) => {
      const { data, error } = await clientA.from(table).select(pkCol(table)).eq(pkCol(table), seedIds[table]);
      expect(error).toBeNull();
      expect(data, `${table}: A deveria ler a propria linha`).toHaveLength(1);
    });
  });

  // ---- 2) Escrita cross-tenant ----

  describe('escrita — bot_context admin-only, audit_log member+NOT NULL, demais service-only', () => {
    it('bot_context: owner/admin de B NAO insere em A (WITH CHECK is_workspace_admin)', async () => {
      const { error } = await clientB.from('bot_context').insert({
        key: `p0-atk-${runId}`,
        title: 'ataque',
        content: 'ataque',
        workspace_id: wsA.id,
      });
      expect(error, 'admin de B conseguiu escrever em bot_context de A').not.toBeNull();
    });

    it('bot_context: member comum de B NAO insere nem em B (policy exige admin)', async () => {
      const { error } = await clientBMember.from('bot_context').insert({
        key: `p0-mem-${runId}`,
        title: 'member',
        content: 'member',
        workspace_id: wsB.id,
      });
      expect(error, 'member comum conseguiu escrever em bot_context').not.toBeNull();
    });

    it('audit_log: member de B NAO insere com workspace_id de A', async () => {
      const { error } = await clientBMember.from('audit_log').insert({
        user_id: userBMember.id,
        action: 'p0_attack',
        table_name: 'p0_attack',
        record_id: 'atk',
        workspace_id: wsA.id,
      });
      expect(error, 'member de B conseguiu gravar audit_log em A').not.toBeNull();
    });

    it('audit_log: INSERT autenticado sem workspace_id e negado (WITH CHECK NOT NULL)', async () => {
      const { error } = await clientA.from('audit_log').insert({
        user_id: userA.id,
        action: 'p0_attack',
        table_name: 'p0_attack',
        record_id: 'atk-null',
      });
      expect(error, 'INSERT autenticado sem workspace_id passou em audit_log').not.toBeNull();
    });

    it.each(SERVICE_ONLY_WRITE_TABLES)(
      'INSERT autenticado em "%s" com workspace_id de A e negado (sem policy de INSERT — service-only)',
      async (table) => {
        const row: Record<string, unknown> = { workspace_id: wsA.id };
        if (table === 'ghl_tasks') row.ghl_task_id = `p0-atk-task-${runId}`;
        if (table === 'reunioes') row.contato_id = contatoBId;
        if (table === 'stevo_whatsapp_calls') row.call_id = `p0-atk-call-${runId}`;
        const { error } = await clientB.from(table).insert(row);
        expect(error, `${table}: INSERT autenticado deveria ser negado (service-only)`).not.toBeNull();
      }
    );
  });

  // ---- 3) audit_log (coluna nullable, SELECT admin-only) ----

  describe('audit_log — SELECT so admin do proprio workspace, NULL invisivel', () => {
    it('admin de B nao le a linha de A', async () => {
      const { data, error } = await clientB.from('audit_log').select('id').eq('id', seedIds['audit_log']);
      expect(error).toBeNull();
      expect(data, 'VAZAMENTO: admin de B leu audit_log de A').toHaveLength(0);
    });

    it('linha com workspace_id NULL e invisivel para authenticated', async () => {
      const { data, error } = await clientA.from('audit_log').select('id').eq('id', auditNullId);
      expect(error).toBeNull();
      expect(data, 'linha operacional (workspace_id NULL) vazou para authenticated').toHaveLength(0);
    });

    it('admin de A le a propria linha (leitura legitima preservada)', async () => {
      const { data, error } = await clientA.from('audit_log').select('id').eq('id', seedIds['audit_log']);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });

  // ---- 4) app_config — anon so le chaves publicas (whitelist) ----

  describe('app_config — anon whitelist key IN (supabase_anon_key)', () => {
    it('anon le supabase_anon_key (chave publica por design)', async () => {
      const { data, error } = await anon.from('app_config').select('key').eq('key', 'supabase_anon_key');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('anon NAO le segredo_teste (fim do USING (true))', async () => {
      const { data, error } = await anon.from('app_config').select('key').eq('key', 'segredo_teste');
      expect(error).toBeNull();
      expect(data, 'VAZAMENTO: anon leu chave fora do whitelist').toHaveLength(0);
    });

    it('anon sem filtro so enxerga o whitelist', async () => {
      const { data, error } = await anon.from('app_config').select('key');
      expect(error).toBeNull();
      const keys = (data ?? []).map((r: { key: string }) => r.key);
      expect(keys).toContain('supabase_anon_key');
      expect(keys).not.toContain('segredo_teste');
    });
  });

  // ---- 5) Triggers BEFORE INSERT de workspace_id ----

  describe('triggers set_workspace_id_* (gap pra frente)', () => {
    it('ghl_tasks sem workspace_id resolve pelo contato_id (contato de A => A)', async () => {
      const { data, error } = await service
        .from('ghl_tasks')
        .insert({ ghl_task_id: `p0-trg-task-${runId}`, contato_id: contatoAId })
        .select('workspace_id')
        .single();
      expect(error).toBeNull();
      expect(data!.workspace_id).toBe(wsA.id);
    });

    it('reunioes sem workspace_id resolve pelo contato_id (contato de A => A)', async () => {
      const { data, error } = await service
        .from('reunioes')
        .insert({ contato_id: contatoAId })
        .select('workspace_id')
        .single();
      expect(error).toBeNull();
      expect(data!.workspace_id).toBe(wsA.id);
    });

    it('webhooks_ghl sem workspace_id e location desconhecida FALHA (fail-closed, NOT NULL rejeita)', async () => {
      const { error } = await service
        .from('webhooks_ghl')
        .insert({ location_id: `loc-inexistente-${runId}` });
      expect(error, 'location desconhecida foi aceita em webhooks_ghl (deveria ser fail-closed)').not.toBeNull();
    });
  });
});
