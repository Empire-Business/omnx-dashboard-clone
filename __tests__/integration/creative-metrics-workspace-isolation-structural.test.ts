/**
 * get_creative_metrics / v_creative_metrics — prova estrutural do fix P0 de
 * isolamento por workspace (docs/AUDITORIA-CRIATIVOS.md, achado Eixo 1/3).
 *
 * Bug original: as duas assinaturas de get_creative_metrics (SECURITY DEFINER)
 * chamavam raise_unless_workspace_member(p_workspace_id) — que só valida o
 * CALLER — mas as CTEs internas (meta_agg sobre meta_ads_insights; crm_agg
 * sobre oportunidades/contatos/vendas_fechamento) agrupavam só pelo número
 * extraído de "CR-xxx"/"AN-xxx" via regex, SEM FILTRO de workspace_id. O
 * filtro só aparecia no LEFT JOIN final com notion_creatives — os totais já
 * vinham contaminados de todos os workspaces antes desse join. Como
 * generate-creative-code numera sequencialmente POR WORKSPACE, todo
 * workspace novo recomeça em "CR-1"/"AN-1" — colisão de código entre
 * tenants é provável, não hipotética.
 *
 * v_creative_metrics (view legada) tinha o mesmo bug estrutural E estava com
 * SELECT liberado para `anon`, contornando RLS por ser owned by postgres
 * (BYPASSRLS).
 *
 * Esta suíte não chama o banco remoto — ela lê o SQL fonte da migration de
 * correção e prova, por regex, que os dois `SELECT`s sensíveis (meta_agg e
 * crm_agg) agora carregam o filtro de workspace_id, e que os grants
 * perigosos foram revogados. Migration: 20261005000000_fix_creative_metrics_cross_tenant_p0.sql
 * (não aplicada em produção nesta sessão — pendente de autorização do dono).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

const fixMigration = () =>
  read('supabase/migrations/20261005000000_fix_creative_metrics_cross_tenant_p0.sql');

/** Extrai o corpo de cada `CREATE OR REPLACE FUNCTION ... get_creative_metrics(...) ... $function$ ... $function$;` */
function extractFunctionBodies(sql: string): string[] {
  const bodies: string[] = [];
  const re = /CREATE OR REPLACE FUNCTION public\.get_creative_metrics\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    bodies.push(m[1]);
  }
  return bodies;
}

describe('get_creative_metrics / v_creative_metrics — isolamento por workspace (fix P0)', () => {
  it('a migration de fix existe e define as duas assinaturas de get_creative_metrics', () => {
    const sql = fixMigration();
    const bodies = extractFunctionBodies(sql);
    expect(bodies).toHaveLength(2);
  });

  it('meta_agg (meta_ads_insights) filtra por workspace_id nas duas assinaturas', () => {
    const bodies = extractFunctionBodies(fixMigration());
    for (const [i, body] of bodies.entries()) {
      const metaAggMatch = body.match(/meta_agg AS \(([\s\S]*?)\),\s*\n\s*crm_agg/);
      expect(metaAggMatch, `assinatura #${i + 1} deve ter CTE meta_agg`).not.toBeNull();
      const metaAggSql = metaAggMatch![1];
      expect(metaAggSql, `assinatura #${i + 1} — meta_agg`).toMatch(
        /mai\.workspace_id\s*=\s*p_workspace_id/,
      );
    }
  });

  it('crm_agg (oportunidades/contatos/vendas_fechamento) filtra por workspace_id nas duas assinaturas', () => {
    const bodies = extractFunctionBodies(fixMigration());
    for (const [i, body] of bodies.entries()) {
      const crmAggMatch = body.match(/crm_agg AS \(([\s\S]*?)\)\s*\n\s*SELECT/);
      expect(crmAggMatch, `assinatura #${i + 1} deve ter CTE crm_agg`).not.toBeNull();
      const crmAggSql = crmAggMatch![1];
      expect(crmAggSql, `assinatura #${i + 1} — crm_agg`).toMatch(
        /c\.workspace_id\s*=\s*p_workspace_id/,
      );
    }
  });

  it('continua validando que o caller pertence ao workspace (guard original preservado)', () => {
    const bodies = extractFunctionBodies(fixMigration());
    for (const body of bodies) {
      expect(body).toContain('raise_unless_workspace_member(p_workspace_id)');
    }
  });

  it('revoga EXECUTE de anon/PUBLIC nas duas assinaturas e mantém authenticated', () => {
    const sql = fixMigration();
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_creative_metrics\(uuid, date, date, uuid\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_creative_metrics\(uuid, date, date, uuid, text\[\], text\[\], text\[\], text\[\], text\[\], text\[\]\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_creative_metrics\(uuid, date, date, uuid\) TO authenticated;/,
    );
  });

  it('revoga SELECT de anon/authenticated em v_creative_metrics (view legada bypassava RLS)', () => {
    const sql = fixMigration();
    expect(sql).toMatch(
      /REVOKE SELECT ON public\.v_creative_metrics FROM anon, authenticated, PUBLIC;/,
    );
  });

  it('regressão: falha se alguém reintroduzir a versão sem filtro de workspace_id (guarda anti-regressão)', () => {
    const bodies = extractFunctionBodies(fixMigration());
    for (const body of bodies) {
      // A CTE meta_agg não pode voltar a filtrar SOMENTE por ad_name/date, sem workspace.
      const metaAggMatch = body.match(/meta_agg AS \(([\s\S]*?)\),\s*\n\s*crm_agg/);
      const metaAggSql = metaAggMatch![1];
      const whereMatch = metaAggSql.match(/WHERE([\s\S]*?)GROUP BY/);
      expect(whereMatch).not.toBeNull();
      expect(whereMatch![1]).toContain('workspace_id');
    }
  });
});
