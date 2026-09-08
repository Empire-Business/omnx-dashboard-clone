/**
 * Notion creatives por workspace — Fase 2 (fatia 8)
 *
 * Prova, sem rede, que notion-creatives-sync deixou de ser single-tenant:
 *  - NAO usa mais NOTION_API_KEY global (nem const nem Bearer);
 *  - NAO escolhe mais "o primeiro workspace" (from("workspaces").limit(1));
 *  - resolve o token POR workspace via resolveWorkspaceCredential(..., 'notion');
 *  - exige workspace_id (fail-closed 400);
 *  - os crons percorrem workspace_integration_credentials (provider 'notion') e
 *    disparam UMA chamada por workspace, com no-op quando nao ha credencial.
 *
 * Lacuna honesta: a chamada real a Notion API e a gravacao dos criativos nao rodam
 * no vitest (egress de rede). O RISCO de isolamento (qual token/banco pertence a
 * qual workspace, e se ha vazamento entre clientes) esta coberto por inspecao
 * estatica + gate de tipos (deno comparativo, rodado fora daqui).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FN = 'supabase/functions/notion-creatives-sync/index.ts';
const MIG = 'supabase/migrations/20260729000000_fase8_notion_crons_por_workspace.sql';

describe('Notion creatives por workspace — Fase 2 (fatia 8)', () => {
  it('notion-creatives-sync nao usa NOTION_API_KEY global', () => {
    const src = read(FN);
    expect(src).not.toMatch(/const\s+NOTION_API_KEY\b/);
    expect(src).not.toMatch(/Bearer\s+\$\{NOTION_API_KEY\}/);
  });

  it('notion-creatives-sync nao escolhe mais o "primeiro workspace"', () => {
    const src = read(FN);
    expect(src).not.toMatch(/from\(\s*["']workspaces["']\s*\)/);
  });

  it('notion-creatives-sync resolve token por workspace (provider notion)', () => {
    const src = read(FN);
    expect(src).toMatch(/resolveWorkspaceCredential\(/);
    expect(src).toMatch(/"notion"/);
  });

  it('notion-creatives-sync exige workspace_id (fail-closed 400)', () => {
    const src = read(FN);
    expect(src).toMatch(/body\.workspace_id/);
    expect(src).toMatch(/status:\s*400/);
  });

  it('crons Notion percorrem workspaces com credencial notion (loop por tenant)', () => {
    const sql = read(MIG);
    expect(sql).toMatch(/workspace_integration_credentials/);
    expect(sql).toMatch(/provider\s*=\s*'notion'/);
    expect(sql).toMatch(/notion_sync_paid_creatives_job/);
    expect(sql).toMatch(/notion_sync_organic_creatives_job/);
    expect(sql).toMatch(/no-op/i);
  });
});
