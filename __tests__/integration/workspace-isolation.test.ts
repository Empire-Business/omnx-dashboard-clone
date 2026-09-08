/**
 * Workspace Isolation Tests (AC-002) — Fase 0.2 (cobertura ampliada)
 *
 * CRÍTICO: prova que as políticas RLS isolam dados entre workspaces. Nenhum usuário
 * pode ver dados de outro tenant. Duas camadas de prova:
 *
 *  1) FORTE (com seed real): insere linha em A e em B e afirma que A só vê a sua
 *     (utm_slugs, utm_sources, funnels) + INSERT/UPDATE/DELETE cruzado bloqueado.
 *
 *  2) AMPLA (filtro explícito): para TODAS as 99 tabelas com coluna `workspace_id`,
 *     A pede `select('workspace_id').eq('workspace_id', workspaceB.id)` e NUNCA pode
 *     receber > 0 linhas. "permission denied" (tabela sem GRANT para authenticated)
 *     é tratado como acesso negado — ainda mais seguro — e registrado como skip.
 *
 *  3) ESTRUTURAL (28 sem coluna): tabelas sem `workspace_id` não podem usar o filtro
 *     de coluna; registramos a categoria (join_crm / infra_service_role /
 *     global_intentional / ai / goal / agency_scoped) e a cobertura real vem de
 *     política por função/join (JOIN_CRM), service_role (INFRA), exceção intencional
 *     (GLOBAL) ou suite dedicada de agência (AGENCY_SCOPED — ver agency-isolation.test.ts).
 *
 * Ref: docs/PLANO-MULTI-TENANT-AGENCY.md (seção 4.1), docs/ROADMAP-MULTI-TENANT.md (0.2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
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
import {
  TABLES_WITH_WORKSPACE_ID,
  TABLES_WITHOUT_WORKSPACE_ID,
  NO_WORKSPACE_ID_CATEGORY,
  GLOBAL_INTENTIONAL_TABLES,
  SEEDED_HIGH_RISK_TABLES,
} from '../helpers/rls-tables.generated';
import type { SupabaseClient } from '@supabase/supabase-js';

const isPermissionDenied = (err: { message?: string; code?: string } | null | undefined): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('permission denied') || err.code === '42501' || err.code === 'PGRST301';
};

describe('Workspace Isolation (AC-002) — Fase 0.2', () => {
  let service: SupabaseClient;

  let userA: TestUser;
  let workspaceA: TestWorkspace;
  let clientA: SupabaseClient;

  let userB: TestUser;
  let workspaceB: TestWorkspace;
  let clientB: SupabaseClient;

  const CLEANUP_TABLES = [
    'utm_slugs',
    'utm_sources',
    'utm_sources_plain',
    'utm_campaigns',
    'utm_mediums',
    'utm_terms',
    'utm_objectives',
    'utm_origins',
    'funnels',
    'sales_processes',
    'ads_campaigns',
  ];

  beforeAll(async () => {
    service = getServiceClient();

    userA = await createTestUser(service, uniqueEmail('test-usera-isolation'), 'TestPassword123!');
    userB = await createTestUser(service, uniqueEmail('test-userb-isolation'), 'TestPassword123!');

    workspaceA = await createTestWorkspace(service, 'Workspace A - Isolation Test', userA.id);
    workspaceB = await createTestWorkspace(service, 'Workspace B - Isolation Test', userB.id);

    await addWorkspaceMember(service, workspaceA.id, userA.id, 'owner', userA.id);
    await addWorkspaceMember(service, workspaceB.id, userB.id, 'owner', userB.id);

    // Seed real (prova FORTE) nas tabelas de alto risco com schema mínimo conhecido.
    await insertTestData(service, 'utm_slugs', [
      { workspace_id: workspaceA.id, nome: 'User A Slug', slug: 'usera-slug' },
    ]);
    await insertTestData(service, 'utm_slugs', [
      { workspace_id: workspaceB.id, nome: 'User B Slug', slug: 'userb-slug' },
    ]);
    await insertTestData(service, 'utm_sources', [
      { workspace_id: workspaceA.id, nome: 'A Source', slug: 'asrc-slug', utm_source: 'asrc-1', public_code: 'PA1' },
    ]);
    await insertTestData(service, 'utm_sources', [
      { workspace_id: workspaceB.id, nome: 'B Source', slug: 'bsrc-slug', utm_source: 'bsrc-1', public_code: 'PB1' },
    ]);
    await insertTestData(service, 'funnels', [{ workspace_id: workspaceA.id, nome: 'Funnel A' }]);
    await insertTestData(service, 'funnels', [{ workspace_id: workspaceB.id, nome: 'Funnel B' }]);

    clientA = await getAuthenticatedClient(userA.email, userA.password);
    clientB = await getAuthenticatedClient(userB.email, userB.password);
  });

  afterAll(async () => {
    await cleanupTestData(service, CLEANUP_TABLES, [workspaceA.id, workspaceB.id]);
    await deleteTestUsers(service, [userA.id, userB.id]);
  });

  // ---- Prova FORTE (com seed) ----

  it('User A sees only their own utm_slugs', async () => {
    const { data, error } = await clientA.from('utm_slugs').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].slug).toBe('usera-slug');
  });

  it('User B sees only their own utm_slugs', async () => {
    const { data, error } = await clientB.from('utm_slugs').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].slug).toBe('userb-slug');
  });

  it('User A sees only their own utm_sources', async () => {
    const { data, error } = await clientA.from('utm_sources').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].utm_source).toBe('asrc-1');
  });

  it('User A sees only their own funnels', async () => {
    const { data, error } = await clientA.from('funnels').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].nome).toBe('Funnel A');
  });

  // ---- Escrita cruzada bloqueada (prova FORTE) ----

  it('User A cannot insert data into workspace B', async () => {
    const { error } = await clientA.from('utm_slugs').insert({
      workspace_id: workspaceB.id,
      nome: 'Malicious Insert',
      slug: 'malicious-slug',
    });
    if (!error) {
      const { data } = await service
        .from('utm_slugs')
        .select('*')
        .eq('workspace_id', workspaceB.id)
        .eq('slug', 'malicious-slug');
      expect(data).toHaveLength(0);
    } else {
      expect(error).toBeDefined();
    }
  });

  it('User A cannot update data in workspace B', async () => {
    await clientA.from('utm_slugs').update({ nome: 'Hacked Name' }).eq('workspace_id', workspaceB.id);
    const { data } = await service
      .from('utm_slugs')
      .select('nome')
      .eq('workspace_id', workspaceB.id)
      .eq('slug', 'userb-slug')
      .single();
    expect(data!.nome).toBe('User B Slug');
  });

  it('User A cannot delete data from workspace B', async () => {
    await clientA.from('utm_slugs').delete().eq('workspace_id', workspaceB.id);
    const { data } = await service.from('utm_slugs').select('*').eq('workspace_id', workspaceB.id);
    expect(data!.length).toBeGreaterThan(0);
  });

  // ---- Tabelas de governança (membros / permissões / filtros / workspaces) ----

  it('User A cannot see workspace B members', async () => {
    const { data, error } = await clientA
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('User A cannot see User B permissions', async () => {
    const { data, error } = await clientA
      .from('dashboard_user_permissions')
      .select('*')
      .eq('workspace_id', workspaceB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('User A cannot see User B lead filters', async () => {
    const { data, error } = await clientA
      .from('dashboard_user_lead_filters')
      .select('*')
      .eq('workspace_id', workspaceB.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('User A can only see their own workspace', async () => {
    const { data, error } = await clientA.from('workspaces').select('*');
    expect(error).toBeNull();
    const ids = data!.map((w: { id: string }) => w.id);
    expect(ids).toContain(workspaceA.id);
    expect(ids).not.toContain(workspaceB.id);
  });

  // ---- Prova AMPLA: filtro explícito em TODAS as 83 com workspace_id ----

  describe('Leitura cross-tenant — 99 tabelas com workspace_id', () => {
    it.each(TABLES_WITH_WORKSPACE_ID)(
      'A nao ve linhas de B em "%s" (filtro explicito por workspace_id)',
      async (table: string) => {
        const { data, error } = await clientA
          .from(table)
          .select('workspace_id')
          .eq('workspace_id', workspaceB.id)
          .limit(1);

        // Acesso negado por GRANT = seguro (tabela nem exposta ao role authenticated).
        if (isPermissionDenied(error)) return;

        // Qualquer outro erro é inesperado e deve falhar para investigarmos.
        expect(error, `erro inesperado em ${table}: ${JSON.stringify(error)}`).toBeNull();

        // REGRA CRITICA: nunca pode retornar linha do workspace B para o usuario A.
        expect(data, `VAZAMENTO cross-tenant em ${table}`).toHaveLength(0);
      }
    );
  });

  // ---- Prova ESTRUTURAL: 37 sem coluna workspace_id ----

  describe('Tabelas sem coluna workspace_id (28) — cobertura estrutural', () => {
    it.each(TABLES_WITHOUT_WORKSPACE_ID)(
      '"%s" tem categoria de isolamento registrada',
      (table: string) => {
        const cat = NO_WORKSPACE_ID_CATEGORY[table];
        expect(cat, `tabela ${table} sem categoria — classifique em rls-tables.generated.ts`).toBeDefined();
        // Excecoes intencionais (acesso global esperado) precisam estar na lista de globais.
        if (cat === 'global_intentional') {
          expect(GLOBAL_INTENTIONAL_TABLES).toContain(table);
        }
      }
    );
  });

  // ---- Conjunto com seed real e subconjunto esperado da prova forte ----

  it('tabelas com seed real estao dentro das 99 com workspace_id', () => {
    for (const t of SEEDED_HIGH_RISK_TABLES) {
      expect(TABLES_WITH_WORKSPACE_ID).toContain(t);
    }
  });
});
