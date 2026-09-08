/**
 * Autenticacao do webhook-ghl — Fase 2 (fatia 6), teste PURO (node).
 *
 * Prova a extracao de locationId (formatos GHL) e a comparacao em tempo
 * constante do secret. Sem locationId nao ha tenant; secret comparado em tempo
 * constante nao vaza conteudo via timing.
 */

import { describe, it, expect } from 'vitest';
import { extractLocationId, secretsEqual } from '../supabase/functions/_shared/webhook-ghl-auth';

describe('extractLocationId — Fase 2 (fatia 6)', () => {
  it('le payload.locationId (formato mais comum)', () => {
    expect(extractLocationId({ locationId: 'LOC-1' })).toBe('LOC-1');
  });
  it('le payload.location.id (alguns eventos)', () => {
    expect(extractLocationId({ location: { id: 'LOC-2' } })).toBe('LOC-2');
  });
  it('le payload.location_id (snake_case)', () => {
    expect(extractLocationId({ location_id: 'LOC-3' })).toBe('LOC-3');
  });
  it('prioridade: locationId > location.id > location_id', () => {
    expect(extractLocationId({ locationId: 'A', location: { id: 'B' }, location_id: 'C' })).toBe('A');
    expect(extractLocationId({ location: { id: 'B' }, location_id: 'C' })).toBe('B');
  });
  it('trim + ignora vazios', () => {
    expect(extractLocationId({ locationId: '  LOC-4  ' })).toBe('LOC-4');
    expect(extractLocationId({ locationId: '   ', location_id: 'LOC-5' })).toBe('LOC-5');
  });
  it('sem locationId => null (fail-closed: sem tenant)', () => {
    expect(extractLocationId({})).toBeNull();
    expect(extractLocationId({ foo: 'bar' })).toBeNull();
    expect(extractLocationId(null)).toBeNull();
    expect(extractLocationId(undefined)).toBeNull();
    expect(extractLocationId({ locationId: 123 })).toBeNull();
  });
});

describe('secretsEqual — comparacao em tempo constante (fatia 6)', () => {
  it('iguais => true', () => {
    expect(secretsEqual('secA123', 'secA123')).toBe(true);
  });
  it('diferentes (mesmo tamanho) => false', () => {
    expect(secretsEqual('secA123', 'secX123')).toBe(false);
  });
  it('tamanhos diferentes => false', () => {
    expect(secretsEqual('curto', 'muito-mais-longo')).toBe(false);
  });
  it('vazio ou nao-string => false (nunca autentica com segredo vazio)', () => {
    expect(secretsEqual('', 'x')).toBe(false);
    expect(secretsEqual('x', '')).toBe(false);
    expect(secretsEqual(null, 'x')).toBe(false);
    expect(secretsEqual('x', undefined)).toBe(false);
    expect(secretsEqual(123, 'x')).toBe(false);
  });
});
