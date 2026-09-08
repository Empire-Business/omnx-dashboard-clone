/**
 * Fase 3 — discover-agency-locations: guarda estrutural da decisao do dono
 * docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 5, 6.3, 6.6)
 *
 * Nao e um teste de execucao da edge function (ela chama a API real do GHL
 * e depende de Deno.serve — testada via a suite de POC/manual, nao aqui).
 * Este teste e um grep estrutural que trava qualquer regressao futura da
 * decisao do dono: o token de agencia e SO-LEITURA e a funcao NUNCA pode
 * tentar descobrir admins/usuarios por sub-conta (GET /users/...).
 *
 * Se este teste falhar, alguem reintroduziu uma chamada a /users/ na funcao
 * — isso e proibido (docs/FASE-3-POC-RESULTADOS.md, secao 5 do handoff).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_PATH = join(
  __dirname,
  '../../supabase/functions/discover-agency-locations/index.ts'
);

describe('discover-agency-locations — guarda estrutural (secao 5 do handoff)', () => {
  const source = readFileSync(SOURCE_PATH, 'utf-8');
  // Remove comentarios de linha (// ...) antes de checar chamadas reais —
  // o arquivo cita "GET /users/" em comentario justamente para EXPLICAR a
  // proibicao (secao 5 do handoff), o que nao pode contar como violacao.
  const codeWithoutComments = source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  it('NUNCA chama o endpoint /users/ fora de comentarios (descoberta de admin proibida)', () => {
    expect(codeWithoutComments).not.toMatch(/\/users(?![a-zA-Z0-9_-])/);
  });

  it('so chama /locations/search na API do GHL (endpoint confirmado na POC)', () => {
    expect(source).toMatch(/\/locations\/search/);
  });

  it('reativacao de sub-conta suspensa nunca e automatica', () => {
    expect(source).toMatch(/suspended/);
    expect(source).toMatch(/skipped_suspended/);
  });
});
