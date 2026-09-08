/**
 * Mapa de tabelas RLS por tipo de isolamento — Fase 0.2 (multi-tenant).
 *
 * GERADO A PARTIR DO BANCO LINKADO em 2026-07-11 (fgjbmdsucruvtpywyhhf) via
 * `supabase db query --linked` (read-only, só pg_catalog/information_schema),
 * atualizado na mesma data pela Fase 6 (fatia 2 — migration
 * 20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql) e
 * REGERADO em 2026-07-17 contra o banco de TESTE (via TEST_DB_URL) após a
 * migration 20260927000000_fix_cross_tenant_rls_p0.sql (P0 cross-tenant).
 * Universo: 127 tabelas em `public` com RLS habilitado = 99 com coluna
 * `workspace_id` + 28 sem.
 *
 * Passada desta data (2026-07-17, 83->99 com / 37->28 sem):
 *  - P0 cross-tenant (20260927000000): `ghl_tasks`, `maquina_de_conteudo`,
 *    `webhooks_ghl`, `reunioes` e `bot_context` ganharam `workspace_id` NOT
 *    NULL; `audit_log` ganhou `workspace_id` NULLABLE — mesmo padrão de
 *    `contatos`: a coluna existe, então a tabela entra na prova forte por
 *    coluna (e a policy de SELECT ainda exige workspace_id NOT NULL + admin,
 *    provada em `p0-cross-tenant-rls-fix.test.ts`). As 6 saíram de
 *    INFRA/JOIN_CRM/GLOBAL/AI para a prova forte por coluna. JOIN_CRM ficou
 *    vazia (`reunioes` era a última); a categoria permanece para tabelas
 *    futuras que isolem por JOIN.
 *  - `stevo_whatsapp_calls` JÁ tinha a coluna (Fase 6 fatia 1) — a P0 só
 *    reescreveu a policy de SELECT (antes: "membro de qualquer workspace").
 *    Continua na prova forte por coluna.
 *  - `app_config` PERMANECE global_intentional (sem coluna, por design), mas
 *    o SELECT de `anon` virou whitelist: `key IN ('supabase_anon_key')`
 *    (antes era USING (true) — qualquer chave nova é invisível para anon até
 *    entrar no whitelist). Cobertura de comportamento no teste dedicado
 *    `p0-cross-tenant-rls-fix.test.ts`.
 *  - Divergências pré-existentes encontradas na conferência (a fixture estava
 *    parada em 2026-07-11 e o banco evoluiu): `ai_analysis_sessions` e
 *    `ai_conversations` ganharam a coluna
 *    (20260829000000_isolate_clara_by_workspace) e `telegram_allowed_users`
 *    também (20260831000001_isolate_telegram_clara_workspace); 7 tabelas
 *    novas já nasceram com a coluna — `clara_workspace_settings` e
 *    `clara_settings_audit` (20260901000000), `ghl_mapping_change_alerts`
 *    (20260819000000), `meta_ads_account_daily` (20260713170448),
 *    `workspace_ai_usage_events` (20260831000000),
 *    `workspace_external_form_sources` (20260917000000) e
 *    `workspace_meta_ad_accounts` (20260705000002/20260924000000).
 *
 * Regeração anterior: 2026-07-11 (79/41 -> 83/37) pela Fase 6 (fatia 2):
 * denormalizou `workspace_id` em `meta_ads_campaigns`, `meta_ads_permalinks`,
 * `weekly_email_logs` e `weekly_email_schedules` (saíram de INFRA e entraram
 * na prova forte por coluna) — achado real ao fazer o backfill: as policies
 * de SELECT dessas 4 tabelas NÃO filtravam por linha (qualquer usuário
 * autenticado via qualquer workspace lia tudo); corrigidas na mesma migration
 * antes de expor as tabelas aqui. Também reclassificado
 * `meta_ads_region_mapping`: NÃO é gap de isolamento, é tabela de referência
 * global (UF -> região do Brasil, mesma natureza de `estado_uf_normalizacao`)
 * — movida de infra_service_role para global_intentional.
 *
 * Passada anterior (2026-07-11, 70->79): Fase 6 (fatia 1 + adicional)
 * denormalizou `workspace_id` em `oportunidades`, `comunicacoes`,
 * `vendas_fechamento` e `stevo_whatsapp_calls` (saíram de JOIN_CRM/INFRA);
 * Fase 1/2 criaram `agency_workspaces`, `outbound_webhooks`,
 * `workspace_deletion_requests` e `workspace_integration_credentials` já
 * nascendo com `workspace_id`; `ghl_api_jobs` ganhou a coluna; e as tabelas
 * de agência (`agencies`, `agency_members`, `agency_ghl_credentials`) e
 * `webhook_unresolved` são novas sem coluna `workspace_id` (isolam por
 * `agency_id` ou não têm tenant).
 *
 * COMO RE-GERAR (rodar quando o schema mudar / antes de cada fase):
 *   -- com workspace_id
 *   SELECT tablename FROM pg_tables t WHERE schemaname='public' AND rowsecurity
 *     AND EXISTS (SELECT 1 FROM information_schema.columns c
 *       WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='workspace_id')
 *     ORDER BY tablename;
 *   -- sem workspace_id
 *   ... NOT EXISTS (...) ORDER BY tablename;
 *
 * A classificação das tabelas sem coluna é refinada a cada fase de backfill.
 * Até a coluna existir, a cobertura dessas tabelas é ESTRUTURAL (assert de
 * política/categoria) e/ou por suite dedicada — não por filtro de coluna.
 */

// ---------------------------------------------------------------------------
// 99 tabelas COM coluna workspace_id — isolamento direto por coluna.
// Teste aplicado: client A faz select(...).eq('workspace_id', workspaceB.id)
// e NUNCA pode retornar > 0 linhas.
// ---------------------------------------------------------------------------
export const TABLES_WITH_WORKSPACE_ID: string[] = [
  'ads_campaigns',
  'ads_catalog',
  'agency_workspaces',
  'ai_analysis_sessions',
  'ai_conversations',
  'app_feature_role_permissions',
  'app_feature_user_overrides',
  'app_role_permissions',
  'app_user_overrides',
  'audit_log',
  'bot_context',
  'campaigns',
  'clara_settings_audit',
  'clara_workspace_settings',
  'comunicacoes',
  'contatos',
  'creative_audit_log',
  'creative_comments',
  'creative_test_criteria',
  'creative_test_history',
  'creative_tests',
  'creative_validations',
  'dashboard_user_lead_filters',
  'dashboard_user_permissions',
  'discagem_scores',
  'disparo_campos_custom',
  'disparo_campos_custom_valores',
  'disparo_tags',
  'disparos',
  'funnels',
  'ghl_api_jobs',
  'ghl_calendars',
  'ghl_discovery_runs',
  'ghl_field_mappings',
  'ghl_integration_settings',
  'ghl_mapping_change_alerts',
  'ghl_pipeline_mappings',
  'ghl_stage_mappings',
  'ghl_tasks',
  'ghl_users',
  'goal_definitions',
  'maquina_de_conteudo',
  'meta_ads_account_daily',
  'meta_ads_campaigns',
  'meta_ads_insights',
  'meta_ads_insights_breakdowns',
  'meta_ads_permalinks',
  'meta_ads_raw_insights',
  'meta_ads_sync_log',
  'metas',
  'notion_creatives',
  'notion_sync_runs',
  'oportunidades',
  'organic_catalog',
  'organic_investment_items',
  'organic_investments',
  'outbound_webhooks',
  'permission_audit_log',
  'prevendas_ai_insights',
  'reunioes',
  'sales_process_assignments',
  'sales_processes',
  'sdr_ia_config',
  'stevo_whatsapp_calls',
  'telegram_allowed_users',
  'utm_campaigns',
  'utm_mediums',
  'utm_objectives',
  'utm_origins',
  'utm_slugs',
  'utm_source_origin_assignments',
  'utm_sources',
  'utm_sources_plain',
  'utm_terms',
  'vendas_fechamento',
  'webhooks_ghl',
  'weekly_aquisicao',
  'weekly_closer',
  'weekly_cohort_audit',
  'weekly_email_logs',
  'weekly_email_schedules',
  'weekly_metas',
  'weekly_organico',
  'weekly_prevendas',
  'weekly_recuperacao',
  'weekly_reprocess_queue',
  'weekly_sdr',
  'weekly_snapshots',
  'weekly_trafego',
  'weekly_vendas',
  'whatsapp_pricing_config',
  'workspace_ai_usage_events',
  'workspace_apps',
  'workspace_deletion_requests',
  'workspace_external_form_sources',
  'workspace_integration_credentials',
  'workspace_members',
  'workspace_meta_ad_accounts',
  'workspace_settings',
];

// ---------------------------------------------------------------------------
// Categorias das 28 tabelas SEM coluna workspace_id.
// ---------------------------------------------------------------------------

/**
 * Isolamento por JOIN (resolve workspace via oportunidade/contato).
 * VAZIA desde 2026-07-17 (P0): `reunioes`, a última, ganhou coluna
 * `workspace_id` NOT NULL (migration 20260927000000). Categoria mantida para
 * tabelas futuras sem coluna que isolem por JOIN.
 */
export const JOIN_CRM_TABLES: string[] = [];

/** Filas/jobs/logs de infra — acesso normalmente via service_role. */
export const INFRA_SERVICE_ROLE_TABLES: string[] = [
  'contact_opp_sync_queue',
  'ghl_conversations_sync_log',
  'ghl_custom_field_mappings',
  'ghl_field_mapping_templates',
  'ghl_opp_reconcile_items',
  'ghl_opp_reconcile_runs',
  'meta_ads_backfill_controle',
  'meta_ads_backfill_log',
  'webhook_unresolved',
];

/**
 * Globais/intencionais — acesso cross-tenant é ESPERADO e documentado (exceção).
 * `meta_ads_region_mapping` reclassificada em 2026-07-11 (fatia 2): é
 * mapeamento estático UF -> região do Brasil, mesma natureza de
 * `estado_uf_normalizacao` — não tem dimensão de tenant, nunca teve.
 * `app_config` (2026-07-17, P0): segue global por design (sem coluna), mas o
 * SELECT de `anon` é whitelist — `key IN ('supabase_anon_key')` (migration
 * 20260927000000); qualquer chave nova fica invisível para anon até ser
 * adicionada ao whitelist.
 */
export const GLOBAL_INTENTIONAL_TABLES: string[] = [
  'aplic-acelerador',
  'app_config',
  'auth_audit_log',
  'auth_password_reset_tokens',
  'auth_rate_limits',
  'estado_uf_normalizacao',
  'meta_ads_region_mapping',
  'secrets',
  'workspaces',
];

/** Dados de IA — isolamento a ser definido na fase de IA (fora do escopo da Fase 0). */
export const AI_TABLES: string[] = [
  'ai_doc_chunks',
  'ai_doc_index_status',
  'ai_embeddings',
  'ai_messages',
];

/** Metas/OKRs — isolamento a confirmar (preliminarmente por goal/workspace). */
export const GOAL_TABLES: string[] = [
  'goal_metric_definitions',
  'goal_snapshots',
  'goal_versions',
];

/**
 * Tabelas de agência (Fase 1/3) — isolam por `agency_id`, não por `workspace_id`.
 * Um dono de agência pode legitimamente enxergar várias `agency_workspaces`, então
 * o filtro de coluna `workspace_id` não se aplica aqui. Cobertura real vem da suite
 * dedicada `agency-isolation.test.ts` / `agency-rls-functions.test.ts`, que prova
 * que agência X nunca vê `agencies`/`agency_members`/`agency_ghl_credentials` da
 * agência Y.
 */
export const AGENCY_SCOPED_TABLES: string[] = [
  'agencies',
  'agency_ghl_credentials',
  'agency_members',
];

export type NoWorkspaceCategory =
  | 'join_crm'
  | 'infra_service_role'
  | 'global_intentional'
  | 'ai'
  | 'goal'
  | 'agency_scoped';

/** Mapa tabela -> categoria, para as 28 sem coluna workspace_id. */
export const NO_WORKSPACE_ID_CATEGORY: Record<string, NoWorkspaceCategory> = {
  ...Object.fromEntries(JOIN_CRM_TABLES.map((t) => [t, 'join_crm' as const])),
  ...Object.fromEntries(INFRA_SERVICE_ROLE_TABLES.map((t) => [t, 'infra_service_role' as const])),
  ...Object.fromEntries(GLOBAL_INTENTIONAL_TABLES.map((t) => [t, 'global_intentional' as const])),
  ...Object.fromEntries(AI_TABLES.map((t) => [t, 'ai' as const])),
  ...Object.fromEntries(GOAL_TABLES.map((t) => [t, 'goal' as const])),
  ...Object.fromEntries(AGENCY_SCOPED_TABLES.map((t) => [t, 'agency_scoped' as const])),
};

/** Lista plana das 28 tabelas sem coluna workspace_id. */
export const TABLES_WITHOUT_WORKSPACE_ID: string[] = Object.keys(NO_WORKSPACE_ID_CATEGORY).sort();

/** Conjunto de alto risco com SEED real (linha em A e em B) para prova forte de leitura. */
export const SEEDED_HIGH_RISK_TABLES: string[] = ['utm_slugs', 'utm_sources', 'funnels'];
