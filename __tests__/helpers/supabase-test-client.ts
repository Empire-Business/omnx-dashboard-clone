/**
 * Supabase Test Client Helpers
 *
 * Creates authenticated Supabase clients for testing workspace isolation,
 * permissions, and lead filters. Uses the Supabase service role for setup
 * and per-user clients for assertions.
 *
 * IMPORTANT: These helpers require a running Supabase instance (local or remote).
 * Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.test file.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---- Environment ----

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// ---- Clients ----

/** Service-role client — bypasses RLS. Use only for test setup/teardown. */
export function getServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client — subject to RLS. Use for unauthenticated access tests. */
export function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create an authenticated client acting as a specific user. */
export async function getAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return client;
}

// ---- Test Data Factories ----

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface TestWorkspace {
  id: string;
  name: string;
  owner_id: string;
}

/**
 * Erro transiente de rate limit do Supabase Auth (admin.createUser). Reconhecido
 * pelo status HTTP (429) OU pelo texto da mensagem — o supabase-js nem sempre
 * preenche `status` para erros da Admin API.
 */
function isRateLimitError(error: { status?: number; message?: string } | null): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate limit|too many requests/i.test(error.message ?? '');
}

/** Espera com jitter (evita que todos os retries de arquivos diferentes caiam juntos). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a test user via the admin API, com retry+backoff para o rate limit do
 * Supabase Auth (Fase 0/2026-07-11 — fix de flakiness da suite). A causa raiz
 * (dezenas de arquivos criando usuários ao mesmo tempo) é resolvida serializando
 * os arquivos no vitest.integration.config.ts (`fileParallelism: false`); este
 * retry é defesa em profundidade contra rate limit que ainda pode ocorrer mesmo
 * serializado (limite por IP/projeto medido por janela de tempo, não só por
 * concorrência).
 */
export async function createTestUser(
  service: SupabaseClient,
  email: string,
  password: string
): Promise<TestUser> {
  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 1000;

  let lastError: { status?: number; message?: string } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (!error) return { id: data.user.id, email, password };

    lastError = error;
    if (!isRateLimitError(error) || attempt === MAX_ATTEMPTS) break;

    const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
    await sleep(delay);
  }

  throw new Error(`Failed to create user ${email}: ${lastError?.message}`);
}

/**
 * Gera email único por run (Fase 0.4) — evita colisão entre runs e contorna
 * resquício de usuários órfãos no Auth (que fazem `admin.createUser` falhar com
 * "Database error checking email" para emails reutilizados).
 */
export function uniqueEmail(local: string): string {
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${local}-${runId}@example.com`;
}

/** Create a test workspace owned by the given user. */
export async function createTestWorkspace(
  service: SupabaseClient,
  name: string,
  ownerId: string
): Promise<TestWorkspace> {
  const { data, error } = await service
    .from('workspaces')
    .insert({ name, owner_id: ownerId })
    .select('id, name, owner_id')
    .single();
  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  return data as TestWorkspace;
}

/** Add a member to a workspace. */
export async function addWorkspaceMember(
  service: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  invitedBy: string
): Promise<void> {
  const { error } = await service.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: userId,
    role,
    invited_by: invitedBy,
    joined_at: new Date().toISOString(),
    is_active: true,
  });
  if (error) throw new Error(`Failed to add member: ${error.message}`);
}

/** Grant module permission to a user within a workspace. */
export async function grantPermission(
  service: SupabaseClient,
  workspaceId: string,
  userId: string,
  moduleKey: string,
  canView: boolean,
  canEdit: boolean,
  grantedBy: string
): Promise<void> {
  const { error } = await service.from('dashboard_user_permissions').insert({
    workspace_id: workspaceId,
    user_id: userId,
    module_key: moduleKey,
    can_view: canView,
    can_edit: canEdit,
    granted_by: grantedBy,
  });
  if (error) throw new Error(`Failed to grant permission: ${error.message}`);
}

/** Set a lead filter for a user within a workspace. */
export async function setLeadFilter(
  service: SupabaseClient,
  workspaceId: string,
  userId: string,
  filterName: string,
  logic: 'AND' | 'OR',
  rules: Array<{
    table: string;
    field: string;
    operator: string;
    value: unknown;
  }>,
  createdBy: string
): Promise<void> {
  const { error } = await service.from('dashboard_user_lead_filters').insert({
    workspace_id: workspaceId,
    user_id: userId,
    filter_name: filterName,
    logic,
    rules,
    is_active: true,
    created_by: createdBy,
  });
  if (error) throw new Error(`Failed to set lead filter: ${error.message}`);
}

/** Insert test data into a table within a workspace. */
export async function insertTestData(
  service: SupabaseClient,
  table: string,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const { error } = await service.from(table).insert(rows);
  if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
}

// ---- Cleanup ----

/** Remove all test data created during a test run. Call in afterAll. */
export async function cleanupTestData(
  service: SupabaseClient,
  tables: string[],
  workspaceIds: string[]
): Promise<void> {
  for (const table of tables) {
    await service.from(table).delete().in('workspace_id', workspaceIds);
  }
  // Remove workspace members
  await service.from('workspace_members').delete().in('workspace_id', workspaceIds);
  // Remove permissions
  await service.from('dashboard_user_permissions').delete().in('workspace_id', workspaceIds);
  // Remove lead filters
  await service.from('dashboard_user_lead_filters').delete().in('workspace_id', workspaceIds);
  // Remove workspaces
  await service.from('workspaces').delete().in('id', workspaceIds);
}

/** Delete test users by ID. Call in afterAll. */
export async function deleteTestUsers(
  service: SupabaseClient,
  userIds: string[]
): Promise<void> {
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id);
  }
}
