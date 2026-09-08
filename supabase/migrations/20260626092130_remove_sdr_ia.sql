-- Migration: Remove funcionalidade SDR IA
-- Remove tabelas, funções, crons, RLS e objetos relacionados ao módulo SDR IA.

-- =============================================================================
-- Crons
-- =============================================================================
SELECT cron.unschedule('sdr-ia-orchestrator-cron');
SELECT cron.unschedule('sdr-ia-reset-janela-cron');

-- =============================================================================
-- Funções dedicadas
-- =============================================================================
DROP FUNCTION IF EXISTS reset_sdr_ia_janela_expirada();
DROP FUNCTION IF EXISTS analisar_sdr_ia(DATE, DATE, TEXT, TEXT, TEXT);

-- =============================================================================
-- Políticas RLS (são dropadas automaticamente com as tabelas, mas deixamos
-- explícitas caso alguma tabela precise ser removida manualmente)
-- =============================================================================
DROP POLICY IF EXISTS "workspace_members_select_bots" ON sdr_ia_bots;
DROP POLICY IF EXISTS "workspace_admins_insert_bots" ON sdr_ia_bots;
DROP POLICY IF EXISTS "workspace_admins_update_bots" ON sdr_ia_bots;
DROP POLICY IF EXISTS "workspace_admins_delete_bots" ON sdr_ia_bots;
DROP POLICY IF EXISTS "service_role_full_access_bots" ON sdr_ia_bots;

DROP POLICY IF EXISTS "workspace_members_select_logs" ON sdr_ia_logs;
DROP POLICY IF EXISTS "service_role_insert_logs" ON sdr_ia_logs;
DROP POLICY IF EXISTS "service_role_full_access_logs" ON sdr_ia_logs;

DROP POLICY IF EXISTS "workspace_members_select_conversas" ON sdr_ia_conversas;
DROP POLICY IF EXISTS "service_role_full_access_conversas" ON sdr_ia_conversas;

DROP POLICY IF EXISTS "workspace_members_select_templates" ON sdr_ia_templates;
DROP POLICY IF EXISTS "workspace_admins_insert_templates" ON sdr_ia_templates;
DROP POLICY IF EXISTS "workspace_admins_update_templates" ON sdr_ia_templates;
DROP POLICY IF EXISTS "workspace_admins_delete_templates" ON sdr_ia_templates;
DROP POLICY IF EXISTS "service_role_full_access_templates" ON sdr_ia_templates;

-- =============================================================================
-- Tabelas (ordem respeitando chaves estrangeiras)
-- =============================================================================
DROP TABLE IF EXISTS sdr_ia_logs;
DROP TABLE IF EXISTS sdr_ia_conversas;
DROP TABLE IF EXISTS sdr_ia_templates;
DROP TABLE IF EXISTS sdr_ia_bots;
