/**
 * Sanidade da fixture RLS (Fase 0.2) — roda SEM Supabase (só valida o mapa de tabelas).
 *
 * Garante que o universo descoberto na regeração de 2026-07-17 — P0 cross-tenant
 * (127 tabelas = 99 com coluna workspace_id + 28 sem, ver cabeçalho da fixture)
 * está corretamente materializado em `__tests__/helpers/rls-tables.generated.ts`,
 * sem duplicatas e com categoria para cada tabela sem coluna. Se o schema mudar,
 * re-gerar a fixture (ver cabeçalho dela) e este teste volta a passar.
 */

import { describe, it, expect } from 'vitest';
import {
  TABLES_WITH_WORKSPACE_ID,
  TABLES_WITHOUT_WORKSPACE_ID,
  NO_WORKSPACE_ID_CATEGORY,
  JOIN_CRM_TABLES,
  INFRA_SERVICE_ROLE_TABLES,
  GLOBAL_INTENTIONAL_TABLES,
  AI_TABLES,
  GOAL_TABLES,
  AGENCY_SCOPED_TABLES,
} from '../helpers/rls-tables.generated';

describe('Fixture RLS — sanidade (sem DB)', () => {
  it('cobre exatamente 99 com workspace_id e 28 sem', () => {
    expect(TABLES_WITH_WORKSPACE_ID).toHaveLength(99);
    expect(TABLES_WITHOUT_WORKSPACE_ID).toHaveLength(28);
  });

  it('nao tem duplicatas nem intersecao entre os grupos', () => {
    expect(new Set(TABLES_WITH_WORKSPACE_ID).size).toBe(TABLES_WITH_WORKSPACE_ID.length);
    expect(new Set(TABLES_WITHOUT_WORKSPACE_ID).size).toBe(TABLES_WITHOUT_WORKSPACE_ID.length);
    const intersecao = TABLES_WITH_WORKSPACE_ID.filter((t) =>
      (TABLES_WITHOUT_WORKSPACE_ID as string[]).includes(t)
    );
    expect(intersecao).toHaveLength(0);
  });

  it('toda tabela sem workspace_id tem categoria registrada', () => {
    for (const t of TABLES_WITHOUT_WORKSPACE_ID) {
      expect(NO_WORKSPACE_ID_CATEGORY[t], `tabela ${t} sem categoria`).toBeDefined();
    }
  });

  it('soma das categorias das 28 fecha o total', () => {
    const soma =
      JOIN_CRM_TABLES.length +
      INFRA_SERVICE_ROLE_TABLES.length +
      GLOBAL_INTENTIONAL_TABLES.length +
      AI_TABLES.length +
      GOAL_TABLES.length +
      AGENCY_SCOPED_TABLES.length;
    expect(soma).toBe(28);
  });

  it('tabelas CRM denormalizadas na Fase 6 (fatia 1) estao na prova forte por coluna', () => {
    for (const t of ['comunicacoes', 'oportunidades', 'vendas_fechamento', 'stevo_whatsapp_calls']) {
      expect(TABLES_WITH_WORKSPACE_ID).toContain(t);
    }
  });

  it('meta_ads_campaigns/permalinks e weekly_email_* (Fase 6 fatia 2) estao na prova forte por coluna', () => {
    for (const t of ['meta_ads_campaigns', 'meta_ads_permalinks', 'weekly_email_logs', 'weekly_email_schedules']) {
      expect(TABLES_WITH_WORKSPACE_ID).toContain(t);
    }
  });

  it('meta_ads_region_mapping esta mapeada como global_intentional (referencia estatica, sem tenant)', () => {
    expect(NO_WORKSPACE_ID_CATEGORY['meta_ads_region_mapping']).toBe('global_intentional');
  });

  it('tabelas da P0 cross-tenant (20260927) entraram na prova forte por coluna', () => {
    for (const t of ['ghl_tasks', 'maquina_de_conteudo', 'webhooks_ghl', 'reunioes', 'bot_context', 'audit_log']) {
      expect(TABLES_WITH_WORKSPACE_ID).toContain(t);
    }
  });

  it('JOIN_CRM ficou vazia (reunioes, a ultima, ganhou workspace_id na P0)', () => {
    expect(JOIN_CRM_TABLES).toHaveLength(0);
    expect(NO_WORKSPACE_ID_CATEGORY['reunioes']).toBeUndefined();
  });

  it('app_config permanece global_intentional (anon virou whitelist supabase_anon_key na P0)', () => {
    expect(NO_WORKSPACE_ID_CATEGORY['app_config']).toBe('global_intentional');
  });

  it('tabelas de agencia estao mapeadas como agency_scoped', () => {
    for (const t of ['agencies', 'agency_members', 'agency_ghl_credentials']) {
      expect(NO_WORKSPACE_ID_CATEGORY[t]).toBe('agency_scoped');
    }
  });

  it('globais intencionais sensiveis estao mapeadas', () => {
    for (const t of ['workspaces', 'app_config', 'secrets']) {
      expect(NO_WORKSPACE_ID_CATEGORY[t]).toBe('global_intentional');
    }
  });
});
