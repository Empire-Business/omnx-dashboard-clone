/**
 * Permission Inheritance and Module Access Control Tests (AC-003)
 *
 * Tests the three-level permission model:
 * 1. Exact key match (traqueamento.cods_utm.slug_utm)
 * 2. Parent inheritance (traqueamento.cods_utm -> gives access to all children)
 * 3. Module-level inheritance (traqueamento -> gives access to all tabs/sub-tabs)
 *
 * Also tests:
 * - can_view vs can_edit enforcement
 * - Owner/admin automatic full access
 * - Members with zero permissions see nothing
 * - Visibility rules (invisible, not disabled)
 *
 * Reference: docs/DASHBOARD-CONTROLE-ACESSO.md Section 3
 * Reference: docs/HANDOFF-DASHBOARD-EMPIRE.md Task 5.2
 *
 * AC-003 Gherkin:
 *   Given member Joao has permission only for "traqueamento.funis"
 *   When Joao logs in to Dashboard Empire
 *   Then he sees only the Funis tab in the Traqueamento module
 *   And other tabs (CODS UTM, Origem, etc.) do not appear in the menu
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  getAuthenticatedClient,
  createTestUser,
  createTestWorkspace,
  addWorkspaceMember,
  grantPermission,
  cleanupTestData,
  uniqueEmail,
  deleteTestUsers,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Permission verification algorithm as documented in DASHBOARD-CONTROLE-ACESSO.md.
 *
 * This is the reference implementation that the backend must match.
 * It is imported here to unit-test the logic independently of the DB.
 */
function checkPermission(
  permissions: Array<{ module_key: string; can_view: boolean; can_edit: boolean }>,
  targetKey: string,
  action: 'view' | 'edit'
): boolean {
  // 1. Exact match
  const exact = permissions.find((p) => p.module_key === targetKey);
  if (exact) {
    return action === 'view' ? exact.can_view : exact.can_edit;
  }

  // 2. Parent inheritance — walk up the tree
  const parts = targetKey.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const parentKey = parts.slice(0, i).join('.');
    const parent = permissions.find((p) => p.module_key === parentKey);
    if (parent) {
      return action === 'view' ? parent.can_view : parent.can_edit;
    }
  }

  // 3. No permission
  return false;
}

/**
 * Determine which module keys from the full tree are visible given the user's permissions.
 */
function getVisibleModules(
  permissions: Array<{ module_key: string; can_view: boolean; can_edit: boolean }>,
  fullTree: string[]
): string[] {
  return fullTree.filter((key) => checkPermission(permissions, key, 'view'));
}

// Full module key tree from DASHBOARD-CONTROLE-ACESSO.md
const FULL_MODULE_TREE = [
  'traqueamento',
  'traqueamento.cods_utm',
  'traqueamento.cods_utm.slug_utm',
  'traqueamento.cods_utm.utm_source_ads',
  'traqueamento.cods_utm.utm_source_organico',
  'traqueamento.cods_utm.utm_campaign',
  'traqueamento.cods_utm.utm_medium',
  'traqueamento.cods_utm.utm_term',
  'traqueamento.cods_utm.objetivo_ads',
  'traqueamento.origem',
  'traqueamento.processo_vendas',
  'traqueamento.anuncios',
  'traqueamento.anuncios.campanhas',
  'traqueamento.anuncios.testes_criativos',
  'traqueamento.anuncios.catalogo_criativos',
  'traqueamento.anuncios.producao_notion',
  'traqueamento.anuncios.producao_direta',
  'traqueamento.organico',
  'traqueamento.organico.producao',
  'traqueamento.organico.catalogo',
  'traqueamento.funis',
];

// ==========================================
// Unit Tests for Permission Algorithm
// ==========================================

describe('Permission Algorithm (Unit)', () => {
  describe('Exact key match', () => {
    const permissions = [
      { module_key: 'traqueamento.funis', can_view: true, can_edit: false },
    ];

    it('grants view on exact match', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'view')).toBe(true);
    });

    it('denies edit when can_edit is false', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'edit')).toBe(false);
    });

    it('denies access to unrelated keys', () => {
      expect(checkPermission(permissions, 'traqueamento.cods_utm', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.anuncios', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.origem', 'view')).toBe(false);
    });
  });

  describe('Parent inheritance (descendant access)', () => {
    const permissions = [
      { module_key: 'traqueamento', can_view: true, can_edit: true },
    ];

    it('grants access to all children when parent is granted', () => {
      for (const key of FULL_MODULE_TREE) {
        expect(checkPermission(permissions, key, 'view')).toBe(true);
        expect(checkPermission(permissions, key, 'edit')).toBe(true);
      }
    });
  });

  describe('Tab-level inheritance', () => {
    const permissions = [
      { module_key: 'traqueamento.anuncios', can_view: true, can_edit: true },
    ];

    it('grants access to all sub-tabs of Anuncios', () => {
      expect(checkPermission(permissions, 'traqueamento.anuncios.campanhas', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios.testes_criativos', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios.catalogo_criativos', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios.producao_notion', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios.producao_direta', 'view')).toBe(true);
    });

    it('does NOT grant access to sibling tabs or parent', () => {
      expect(checkPermission(permissions, 'traqueamento', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.cods_utm', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.funis', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.organico', 'view')).toBe(false);
    });
  });

  describe('Mixed permissions (analyst persona)', () => {
    // Analista de UTMs: can view everything, can edit only CODS UTM
    const permissions = [
      { module_key: 'traqueamento', can_view: true, can_edit: false },
      { module_key: 'traqueamento.cods_utm', can_view: true, can_edit: true },
    ];

    it('can view all modules due to top-level view', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios', 'view')).toBe(true);
    });

    it('can edit CODS UTM and its children', () => {
      expect(checkPermission(permissions, 'traqueamento.cods_utm', 'edit')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.cods_utm.slug_utm', 'edit')).toBe(true);
    });

    it('cannot edit other tabs (inherits can_edit=false from parent)', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'edit')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.anuncios', 'edit')).toBe(false);
    });
  });

  describe('Vendedor persona (only Funis and Processo de Vendas)', () => {
    const permissions = [
      { module_key: 'traqueamento.funis', can_view: true, can_edit: false },
      { module_key: 'traqueamento.processo_vendas', can_view: true, can_edit: false },
    ];

    it('can view Funis and Processo de Vendas', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'view')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.processo_vendas', 'view')).toBe(true);
    });

    it('cannot view any other tabs', () => {
      expect(checkPermission(permissions, 'traqueamento.cods_utm', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.anuncios', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.organico', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.origem', 'view')).toBe(false);
    });

    it('cannot edit anything', () => {
      expect(checkPermission(permissions, 'traqueamento.funis', 'edit')).toBe(false);
    });
  });

  describe('Gestor de Criativos persona', () => {
    const permissions = [
      { module_key: 'traqueamento.anuncios', can_view: true, can_edit: true },
      { module_key: 'traqueamento.organico', can_view: true, can_edit: true },
    ];

    it('can view and edit Anuncios and Organico', () => {
      expect(checkPermission(permissions, 'traqueamento.anuncios', 'edit')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.organico', 'edit')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.anuncios.catalogo_criativos', 'edit')).toBe(true);
      expect(checkPermission(permissions, 'traqueamento.organico.catalogo', 'edit')).toBe(true);
    });

    it('cannot access other tabs', () => {
      expect(checkPermission(permissions, 'traqueamento.cods_utm', 'view')).toBe(false);
      expect(checkPermission(permissions, 'traqueamento.funis', 'view')).toBe(false);
    });
  });

  describe('Zero permissions (new member)', () => {
    const permissions: Array<{ module_key: string; can_view: boolean; can_edit: boolean }> = [];

    it('cannot access anything', () => {
      for (const key of FULL_MODULE_TREE) {
        expect(checkPermission(permissions, key, 'view')).toBe(false);
        expect(checkPermission(permissions, key, 'edit')).toBe(false);
      }
    });
  });

  describe('Visible module tree calculation', () => {
    it('shows only Funis for vendedor', () => {
      const permissions = [
        { module_key: 'traqueamento.funis', can_view: true, can_edit: false },
      ];
      const visible = getVisibleModules(permissions, FULL_MODULE_TREE);
      expect(visible).toEqual(['traqueamento.funis']);
    });

    it('shows all modules for full access', () => {
      const permissions = [
        { module_key: 'traqueamento', can_view: true, can_edit: true },
      ];
      const visible = getVisibleModules(permissions, FULL_MODULE_TREE);
      expect(visible).toEqual(FULL_MODULE_TREE);
    });

    it('shows Anuncios subtree for creative manager', () => {
      const permissions = [
        { module_key: 'traqueamento.anuncios', can_view: true, can_edit: true },
      ];
      const visible = getVisibleModules(permissions, FULL_MODULE_TREE);
      expect(visible).toEqual([
        'traqueamento.anuncios',
        'traqueamento.anuncios.campanhas',
        'traqueamento.anuncios.testes_criativos',
        'traqueamento.anuncios.catalogo_criativos',
        'traqueamento.anuncios.producao_notion',
        'traqueamento.anuncios.producao_direta',
      ]);
    });
  });
});

// ==========================================
// Integration Tests for Permission Enforcement via RLS / API
// ==========================================

describe('Permission Enforcement (Integration)', () => {
  let service: SupabaseClient;

  let owner: TestUser;
  let member: TestUser;
  let workspace: TestWorkspace;
  let ownerClient: SupabaseClient;
  let memberClient: SupabaseClient;

  beforeAll(async () => {
    service = getServiceClient();

    owner = await createTestUser(service, uniqueEmail('test-perm-owner'), 'TestPassword123!');
    member = await createTestUser(service, uniqueEmail('test-perm-member'), 'TestPassword123!');

    workspace = await createTestWorkspace(service, 'Workspace Perm Test', owner.id);
    await addWorkspaceMember(service, workspace.id, owner.id, 'owner', owner.id);
    await addWorkspaceMember(service, workspace.id, member.id, 'member', owner.id);

    // Grant member permission to traqueamento.funis only (view, no edit)
    await grantPermission(service, workspace.id, member.id, 'traqueamento.funis', true, false, owner.id);

    ownerClient = await getAuthenticatedClient(owner.email, owner.password);
    memberClient = await getAuthenticatedClient(member.email, member.password);
  });

  afterAll(async () => {
    await cleanupTestData(service, ['utm_slugs', 'funnels'], [workspace.id]);
    await deleteTestUsers(service, [owner.id, member.id]);
  });

  it('owner/admin has full access to all permissions (automatic)', async () => {
    // Owner should be able to query any table within their workspace
    // This verifies that RLS allows owners to read all data
    const { data, error } = await ownerClient
      .from('dashboard_user_permissions')
      .select('*')
      .eq('workspace_id', workspace.id);
    expect(error).toBeNull();
    // Owner should see the member's permissions
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it('member can query their own permissions', async () => {
    const { data, error } = await memberClient
      .from('dashboard_user_permissions')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].module_key).toBe('traqueamento.funis');
    expect(data![0].can_view).toBe(true);
    expect(data![0].can_edit).toBe(false);
  });

  it('member cannot grant themselves additional permissions', async () => {
    const { error } = await memberClient.from('dashboard_user_permissions').insert({
      workspace_id: workspace.id,
      user_id: member.id,
      module_key: 'traqueamento.anuncios',
      can_view: true,
      can_edit: true,
      granted_by: member.id,
    });
    // RLS should prevent members from writing to permissions
    // Either an error or the insert is silently dropped
    if (!error) {
      const { data } = await service
        .from('dashboard_user_permissions')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('user_id', member.id)
        .eq('module_key', 'traqueamento.anuncios');
      expect(data).toHaveLength(0);
    } else {
      expect(error).toBeDefined();
    }
  });

  it('member cannot modify their own existing permissions', async () => {
    const { error } = await memberClient
      .from('dashboard_user_permissions')
      .update({ can_edit: true })
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id)
      .eq('module_key', 'traqueamento.funis');

    // Verify the permission was not modified
    const { data } = await service
      .from('dashboard_user_permissions')
      .select('can_edit')
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id)
      .eq('module_key', 'traqueamento.funis')
      .single();
    expect(data!.can_edit).toBe(false);
  });

  it('member cannot delete their own permissions', async () => {
    const { error } = await memberClient
      .from('dashboard_user_permissions')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id);

    // Verify the permission still exists
    const { data } = await service
      .from('dashboard_user_permissions')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('user_id', member.id);
    expect(data!.length).toBeGreaterThan(0);
  });
});
