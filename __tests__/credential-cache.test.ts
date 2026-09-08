/**
 * credential-cache — Fase 2 (fatia 2) — teste PURO (sem banco, roda em node).
 *
 * Prova a logica de cache do plano v3 secao 5.3:
 *  - chave inclui rotation_version (rotacao/revogacao muda a chave = invalida);
 *  - entry valida antes do TTL e invalida no/apos o TTL;
 *  - TTL declarado <= 10s (SLA de revogacao, 5.3.2).
 *
 * Importa o modulo puro `supabase/functions/_shared/credential-cache.ts`
 * (sem imports Deno/esm), por isso roda no vitest da raiz (node).
 */

import { describe, it, expect } from 'vitest';
import {
  makeCredentialCacheKey,
  isCacheEntryValid,
  CREDENTIAL_CACHE_TTL_MS,
} from '../supabase/functions/_shared/credential-cache';

describe('credential-cache (Fase 2 — plano 5.3)', () => {
  it('chave inclui workspace, provider e rotation_version', () => {
    expect(makeCredentialCacheKey('ws1', 'ghl', 1)).toBe('ws1:ghl:1');
  });

  it('rotation_version diferente => chave diferente (invalidacao por rotacao)', () => {
    expect(makeCredentialCacheKey('ws1', 'ghl', 1)).not.toBe(
      makeCredentialCacheKey('ws1', 'ghl', 2)
    );
  });

  it('workspace/provider diferentes => chaves diferentes (isolamento entre tenants)', () => {
    expect(makeCredentialCacheKey('wsA', 'ghl', 1)).not.toBe(
      makeCredentialCacheKey('wsB', 'ghl', 1)
    );
    expect(makeCredentialCacheKey('ws1', 'ghl', 1)).not.toBe(
      makeCredentialCacheKey('ws1', 'meta', 1)
    );
  });

  it('entry valida antes do TTL e invalida no/apos o TTL', () => {
    const now = 1_000_000;
    const entry = { apiKey: 'k', expiresAt: now + CREDENTIAL_CACHE_TTL_MS };
    expect(isCacheEntryValid(entry, now)).toBe(true);
    expect(isCacheEntryValid(entry, now + CREDENTIAL_CACHE_TTL_MS - 1)).toBe(true);
    expect(isCacheEntryValid(entry, now + CREDENTIAL_CACHE_TTL_MS)).toBe(false);
    expect(isCacheEntryValid(entry, now + CREDENTIAL_CACHE_TTL_MS + 1)).toBe(false);
  });

  it('entry undefined e invalida', () => {
    expect(isCacheEntryValid(undefined, Date.now())).toBe(false);
  });

  it('TTL declarado e <= 10s (SLA de revogacao)', () => {
    expect(CREDENTIAL_CACHE_TTL_MS).toBeLessThanOrEqual(10_000);
  });
});
