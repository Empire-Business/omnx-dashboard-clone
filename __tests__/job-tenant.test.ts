/**
 * Extracao de tenant de job — Fase 2 (fatia 4), teste PURO (node).
 *
 * Prova a regra de prioridade e o fail-closed (null quando sem tenant). Sem isso,
 * o worker nao sabe de qual tenant e o job e cairia na chave global (anti-pattern).
 */

import { describe, it, expect } from 'vitest';
import { extractJobTenant } from '../supabase/functions/_shared/job-tenant';

describe('extractJobTenant — Fase 2 (fatia 4)', () => {
  it('workspace_id da coluna tem prioridade', () => {
    const t = extractJobTenant({
      workspace_id: 'ws-col',
      location_id: 'loc-col',
      context: { workspace_id: 'ws-ctx', location_id: 'loc-ctx' },
    });
    expect(t).toEqual({ workspaceId: 'ws-col', locationId: 'loc-col' });
  });

  it('usa location_id da coluna quando workspace_id ausente', () => {
    const t = extractJobTenant({ location_id: 'loc-col' });
    expect(t).toEqual({ workspaceId: null, locationId: 'loc-col' });
  });

  it('cai no context quando colunas ausentes', () => {
    const t = extractJobTenant({ context: { workspace_id: 'ws-ctx', location_id: 'loc-ctx' } });
    expect(t).toEqual({ workspaceId: 'ws-ctx', locationId: 'loc-ctx' });
  });

  it('context.location_id sozinho resolve (worker depois resolve location->workspace)', () => {
    const t = extractJobTenant({ context: { location_id: 'loc-ctx' } });
    expect(t).toEqual({ workspaceId: null, locationId: 'loc-ctx' });
  });

  it('string vazia/whitespace e tratada como ausente', () => {
    const t = extractJobTenant({ workspace_id: '   ', location_id: '', context: { workspace_id: 'ws-ctx' } });
    expect(t).toEqual({ workspaceId: 'ws-ctx', locationId: null });
  });

  it('FAIL-CLOSED: sem nenhum tenant (colunas nem context) => null', () => {
    expect(extractJobTenant({})).toBeNull();
    expect(extractJobTenant({ context: null })).toBeNull();
    expect(extractJobTenant({ context: {} })).toBeNull();
    expect(extractJobTenant({ workspace_id: null, location_id: null, context: { foo: 'bar' } })).toBeNull();
  });
});
