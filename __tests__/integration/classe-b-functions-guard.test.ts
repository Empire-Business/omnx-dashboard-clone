/**
 * Guard estrutural — functions classe B (administrativas/manuais, fail-closed)
 * docs/HANDOFF-MULTI-TENANT-2026-07-11.md (achado da auditoria da Fase 3, item 2)
 *
 * ACHADO: recuperacao-corrigir, recuperacao-prefetch, sync-recuperacao-stages e
 * diag-ghl são edge functions administrativas/de diagnóstico — chamadas
 * manualmente pelo operador (curl direto), sem UI e sem cron — mas não tinham
 * NENHUM guard além do `verify_jwt` padrão do Supabase (que aceita a anon key).
 * `reconcile-contact-opportunities` também é classe B, mas já ganhou o guard no
 * item 1 (é também uma das 20 functions de cron) — coberta aqui só para fechar
 * a lista completa das 5.
 *
 * Este teste é PURAMENTE ESTRUTURAL (grep nas fontes via fs, sem rede/Deno).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const FUNCTIONS_DIR = join(__dirname, '../../supabase/functions');

const CLASSE_B_FUNCTIONS = [
  'recuperacao-corrigir',
  'recuperacao-prefetch',
  'sync-recuperacao-stages',
  'reconcile-contact-opportunities',
  'diag-ghl',
];

describe('classe-b-functions-guard — as 5 functions administrativas exigem service_role', () => {
  for (const fn of CLASSE_B_FUNCTIONS) {
    it(`${fn}: index.ts existe, importa e usa o guard fail-closed`, () => {
      const path = join(FUNCTIONS_DIR, fn, 'index.ts');
      expect(existsSync(path), `${fn}/index.ts deveria existir`).toBe(true);

      const source = readFileSync(path, 'utf-8');
      expect(
        /from ['"]\.\.\/_shared\/require-service-role\.ts['"]/.test(source),
        `${fn} deveria importar require-service-role.ts`,
      ).toBe(true);
      expect(
        /requireServiceRoleCaller\(req/.test(source),
        `${fn} deveria chamar requireServiceRoleCaller(req)`,
      ).toBe(true);
    });
  }
});
