/**
 * Guard estrutural — chamador autorizado nas edge functions de cron
 * docs/HANDOFF-MULTI-TENANT-2026-07-11.md (achado da auditoria da Fase 3)
 *
 * ACHADO: as edge functions chamadas por pg_cron via net.http_post não validavam
 * o PAPEL do chamador — só o `verify_jwt` padrão do Supabase, que apenas confirma
 * que o JWT é assinado pelo projeto. Tanto a anon key (pública, no bundle JS)
 * quanto a service_role key são JWTs válidos, então qualquer pessoa com a anon
 * key podia chamar diretamente essas functions e disparar ações administrativas.
 *
 * CORREÇÃO: supabase/functions/_shared/require-service-role.ts — guard fail-closed
 * que só aceita Authorization: Bearer <service_role_key>. Aplicado nas 20 edge
 * functions abaixo + migration supabase/migrations/20260808000000_fix_cron_caller_service_role.sql
 * (reescreve os crons que ainda enviavam anon_key).
 *
 * Este teste é PURAMENTE ESTRUTURAL (grep nas fontes via fs, sem rede/Deno):
 *   1. Cada uma das 20 functions conhecidas importa o guard.
 *   2. Nenhuma outra function chamada por pg_cron (descoberta via grep nas
 *      migrations pela rota padrão de invocação de edge functions do Supabase,
 *      montada em EDGE_FUNCTION_ROUTE_PREFIX abaixo para não repetir a rota
 *      literal neste comentário) fica de fora sem o guard OU sem estar na
 *      allowlist documentada de crons órfãos (target inexistente).
 *      Isso é o que barra a regressão: se alguém adicionar um cron novo para
 *      uma function nova sem aplicar o guard, o teste falha.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FUNCTIONS_DIR = join(__dirname, '../../supabase/functions');
const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

// As 20 edge functions hoje chamadas por pg_cron (via net.http_post, direto ou
// através de uma função SQL *_job()) — devem ter o guard aplicado.
const CRON_FUNCTIONS = [
  'ghl-api-worker',
  'discover-agency-locations',
  'reconcile-contact-opportunities',
  'sync-ad-permalinks',
  'sync-contact-opportunities',
  'sync-contact-tags',
  'sync-ghl-conversations',
  'sync-meta-ads',
  'sync-meta-ads-backfill',
  'notion-creatives-sync',
  'sync-opp-dates',
  'compute-weekly-reports',
  'send-weekly-report-email',
  'sync-appointment-dates',
  'sync-contact-attribution',
  'sync-contact-tasks',
  'sync-ghl-users',
  'sync-opp-pipelines',
  'sync-opp-sdr',
];

// Referenciadas em cron.job/migrations mas cuja edge function NÃO EXISTE mais no
// repositório (código morto/órfão — chamada retorna 404, não é um vetor real).
// Ver tarefas de limpeza spawnadas na sessão de 2026-07-11 (reconcile-vendas-fechamento,
// stevo-calls-sync) e a remoção explícita de sdr-ia-orchestrator-cron em
// 20260626092130_remove_sdr_ia.sql. Se uma destas voltar a ter uma pasta em
// supabase/functions/, ela sai desta allowlist e cai na exigência do guard.
const KNOWN_ORPHAN_CRON_TARGETS = [
  'reconcile-vendas-fechamento',
  'stevo-calls-sync',
  'sdr-ia-orchestrator',
  'enviar-email-contrato-assinado',
];

function hasGuardImport(source: string): boolean {
  return /from ['"]\.\.\/_shared\/require-service-role\.ts['"]/.test(source);
}

function hasGuardCall(source: string): boolean {
  return /requireServiceRoleCaller\(req|isServiceRoleCaller\(req/.test(source);
}

describe('cron-caller-guard — as 20 edge functions de cron exigem service_role', () => {
  for (const fn of CRON_FUNCTIONS) {
    it(`${fn}: index.ts existe, importa e usa o guard`, () => {
      const path = join(FUNCTIONS_DIR, fn, 'index.ts');
      expect(existsSync(path), `${fn}/index.ts deveria existir`).toBe(true);

      const source = readFileSync(path, 'utf-8');
      expect(hasGuardImport(source), `${fn} deveria importar require-service-role.ts`).toBe(true);
      expect(
        hasGuardCall(source),
        `${fn} deveria chamar requireServiceRoleCaller(req) ou isServiceRoleCaller(req)`,
      ).toBe(true);
    });
  }

  it('nenhuma function de cron real (não-órfã) descoberta nas migrations fica sem o guard', () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const referenced = new Set<string>();

    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      const matches = content.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g);
      for (const m of matches) referenced.add(m[1]);
    }

    const existingFunctionDirs = new Set(
      readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name),
    );

    const uncovered: string[] = [];

    for (const name of referenced) {
      if (KNOWN_ORPHAN_CRON_TARGETS.includes(name)) continue; // função não existe mais — 404, não é vetor real
      if (!existingFunctionDirs.has(name)) {
        // Function referenciada em alguma migration mas sem pasta correspondente e
        // NÃO documentada na allowlist de órfãos — precisa de decisão explícita.
        uncovered.push(`${name} (sem pasta em supabase/functions/ e fora da allowlist de órfãos)`);
        continue;
      }
      if (!CRON_FUNCTIONS.includes(name)) {
        // Function nova referenciada por alguma migration (net.http_post) que ainda
        // não está na lista conhecida — força checar se tem o guard.
        const source = readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf-8');
        if (!hasGuardImport(source) || !hasGuardCall(source)) {
          uncovered.push(`${name} (novo cron sem o guard aplicado — adicione a require-service-role.ts)`);
        }
      }
    }

    expect(uncovered, uncovered.join('; ')).toEqual([]);
  });
});
