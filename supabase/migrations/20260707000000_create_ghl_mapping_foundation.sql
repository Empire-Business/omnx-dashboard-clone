-- Migration: Create GHL mapping foundation for multi-account expansion
-- Phase 1: schema + RLS + default field mapping templates
-- Reference: docs/GHL-MAPEAMENTO-CAMPOS.md

-- =============================================================================
-- Table: ghl_integration_settings
-- Stores GHL API credentials and webhook configuration per workspace.
-- IMPORTANT: ghl_api_key is stored as plain text for now; it must NEVER be
-- exposed to the frontend React application.
-- =============================================================================
CREATE TABLE ghl_integration_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    ghl_api_key TEXT,
    ghl_location_id TEXT NOT NULL,
    webhook_secret TEXT,
    webhook_url TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id)
);

CREATE INDEX idx_ghl_integration_settings_workspace_id ON ghl_integration_settings(workspace_id);

-- =============================================================================
-- Table: ghl_field_mappings
-- Per-workspace mapping between logical Empire fields and concrete GHL keys.
-- =============================================================================
CREATE TABLE ghl_field_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    logical_name TEXT NOT NULL,
    ghl_field_key TEXT,
    ghl_field_id TEXT,
    field_type TEXT,
    variations JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_required BOOLEAN DEFAULT false NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, logical_name)
);

CREATE INDEX idx_ghl_field_mappings_workspace_id ON ghl_field_mappings(workspace_id);
CREATE INDEX idx_ghl_field_mappings_logical_name ON ghl_field_mappings(workspace_id, logical_name);

-- =============================================================================
-- Table: ghl_pipeline_mappings
-- Maps GHL pipelines to Empire system categories per workspace.
-- =============================================================================
CREATE TABLE ghl_pipeline_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    ghl_pipeline_id TEXT NOT NULL,
    ghl_pipeline_name TEXT,
    system_category TEXT,
    is_excluded BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, ghl_pipeline_id)
);

CREATE INDEX idx_ghl_pipeline_mappings_workspace_id ON ghl_pipeline_mappings(workspace_id);

-- =============================================================================
-- Table: ghl_stage_mappings
-- Maps GHL pipeline stages to Empire system stages per workspace.
-- =============================================================================
CREATE TABLE ghl_stage_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    ghl_pipeline_id TEXT NOT NULL,
    ghl_stage_id TEXT NOT NULL,
    ghl_stage_name TEXT,
    system_stage TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, ghl_pipeline_id, ghl_stage_id)
);

CREATE INDEX idx_ghl_stage_mappings_workspace_id ON ghl_stage_mappings(workspace_id);
CREATE INDEX idx_ghl_stage_mappings_pipeline_id ON ghl_stage_mappings(workspace_id, ghl_pipeline_id);

-- =============================================================================
-- Table: ghl_field_mapping_templates
-- Reusable default templates used to seed per-workspace field mappings.
-- =============================================================================
CREATE TABLE ghl_field_mapping_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Empire Default',
    logical_name TEXT NOT NULL,
    ghl_field_key TEXT,
    field_type TEXT,
    variations JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_required BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(name, logical_name)
);

CREATE INDEX idx_ghl_field_mapping_templates_name ON ghl_field_mapping_templates(name);

-- =============================================================================
-- Table: ghl_discovery_runs
-- Audit log of GHL discovery operations (custom fields, pipelines, etc.).
-- =============================================================================
CREATE TABLE ghl_discovery_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source TEXT,
    payload JSONB,
    status TEXT DEFAULT 'success' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_ghl_discovery_runs_workspace_id ON ghl_discovery_runs(workspace_id);
CREATE INDEX idx_ghl_discovery_runs_created_at ON ghl_discovery_runs(created_at);

-- =============================================================================
-- RLS Policies
-- SELECT: any active workspace member can read.
-- INSERT/UPDATE/DELETE: only workspace owner or admin.
-- service_role: full access.
-- =============================================================================

-- Helper expression reused in policies: user belongs to workspace and is active.
-- Defined inline to avoid dependencies on extra helper functions.

-- ghl_integration_settings
ALTER TABLE ghl_integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_integration_settings: members can read"
    ON ghl_integration_settings FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "ghl_integration_settings: owner/admin can write"
    ON ghl_integration_settings FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "ghl_integration_settings: service_role full access"
    ON ghl_integration_settings FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ghl_field_mappings
ALTER TABLE ghl_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_field_mappings: members can read"
    ON ghl_field_mappings FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "ghl_field_mappings: owner/admin can write"
    ON ghl_field_mappings FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "ghl_field_mappings: service_role full access"
    ON ghl_field_mappings FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ghl_pipeline_mappings
ALTER TABLE ghl_pipeline_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_pipeline_mappings: members can read"
    ON ghl_pipeline_mappings FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "ghl_pipeline_mappings: owner/admin can write"
    ON ghl_pipeline_mappings FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "ghl_pipeline_mappings: service_role full access"
    ON ghl_pipeline_mappings FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ghl_stage_mappings
ALTER TABLE ghl_stage_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_stage_mappings: members can read"
    ON ghl_stage_mappings FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "ghl_stage_mappings: owner/admin can write"
    ON ghl_stage_mappings FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "ghl_stage_mappings: service_role full access"
    ON ghl_stage_mappings FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ghl_discovery_runs
ALTER TABLE ghl_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_discovery_runs: members can read"
    ON ghl_discovery_runs FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "ghl_discovery_runs: owner/admin can write"
    ON ghl_discovery_runs FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "ghl_discovery_runs: service_role full access"
    ON ghl_discovery_runs FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ghl_field_mapping_templates is global (no workspace_id), read-only for users
ALTER TABLE ghl_field_mapping_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_field_mapping_templates: authenticated can read"
    ON ghl_field_mapping_templates FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "ghl_field_mapping_templates: service_role full access"
    ON ghl_field_mapping_templates FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- Seed: default Empire field mapping templates
-- Based on docs/Document_GHL.md and docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md
-- =============================================================================
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    -- Opportunity date fields
    ('Empire Default', 'data_tentativa_1', '{{opportunity.mqlcontato1}}', 'date', '["{{opportunity.mqlcontato1}}","{{opportunity.d_mqlcontato1}}"]', false),
    ('Empire Default', 'data_tentativa_2', '{{opportunity.mqlcontato2}}', 'date', '["{{opportunity.mqlcontato2}}","{{opportunity.d_mqlcontato2}}"]', false),
    ('Empire Default', 'data_tentativa_3', '{{opportunity.mqlcontato3}}', 'date', '["{{opportunity.mqlcontato3}}","{{opportunity.d_mqlcontato3}}"]', false),
    ('Empire Default', 'data_tentativa_4', '{{opportunity.mqlcontato4}}', 'date', '["{{opportunity.mqlcontato4}}","{{opportunity.d_mqlcontato4}}"]', false),
    ('Empire Default', 'data_tentativa_5', '{{opportunity.mqlcontato5}}', 'date', '["{{opportunity.mqlcontato5}}","{{opportunity.d_mqlcontato5}}"]', false),
    ('Empire Default', 'data_tentativa_6', '{{opportunity.mqlcontato6}}', 'date', '["{{opportunity.mqlcontato6}}","{{opportunity.d_mqlcontato6}}"]', false),
    ('Empire Default', 'data_tentativa_7', '{{opportunity.mqlcontato7}}', 'date', '["{{opportunity.mqlcontato7}}","{{opportunity.d_mqlcontato7}}"]', false),
    ('Empire Default', 'data_tentativa_8', '{{opportunity.mqlcontato8}}', 'date', '["{{opportunity.mqlcontato8}}","{{opportunity.d_mqlcontato8}}"]', false),
    ('Empire Default', 'data_no_show', '{{opportunity.mqlno_show}}', 'date', '["{{opportunity.mqlno_show}}","{{opportunity.sqlno_show}}","{{opportunity.d_mqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_conectado', '{{opportunity.mqlconectado}}', 'date', '["{{opportunity.mqlconectado}}","{{opportunity.d_mqlconectado}}"]', false),
    ('Empire Default', 'data_perdido', '{{opportunity.mqlperdido}}', 'date', '["{{opportunity.mqlperdido}}","{{opportunity.d_mqlperdido}}"]', false),
    ('Empire Default', 'data_qualificado', '{{opportunity.mqlqualificado}}', 'date', '["{{opportunity.mqlqualificado}}","{{opportunity.d_mqlqualificado}}"]', false),
    ('Empire Default', 'data_agendamento_reuniao', '{{opportunity.mqlreunio_marcada}}', 'date', '["{{opportunity.mqlreunio_marcada}}","{{opportunity.sqlreunio_agendada}}","{{opportunity.d_mqlreunio_marcada}}"]', false),
    ('Empire Default', 'data_pendencias_preenchimento', '{{opportunity.sqlpendencias_preenchimento}}', 'date', '["{{opportunity.sqlpendencias_preenchimento}}","{{opportunity.d__sqlpendencias_preenchimento}}"]', false),
    ('Empire Default', 'data_no_show_vendas', '{{opportunity.sqlno_show}}', 'date', '["{{opportunity.sqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_perdido_vendas', '{{opportunity.sqlperdida}}', 'date', '["{{opportunity.sqlperdida}}","{{opportunity.d_sqlperdida}}"]', false),
    ('Empire Default', 'data_agendamento_vendas', '{{opportunity.sqlreunio_agendada}}', 'date', '["{{opportunity.sqlreunio_agendada}}","{{opportunity.d_sqlreunio_agendada}}"]', false),
    ('Empire Default', 'data_realizacao_vendas', '{{opportunity.sqlreunio_realizada}}', 'date', '["{{opportunity.sqlreunio_realizada}}","{{opportunity.d_sqlreunio_realizada}}"]', false),
    ('Empire Default', 'data_negociacao', '{{opportunity.sqlnegociao}}', 'date', '["{{opportunity.sqlnegociao}}","{{opportunity.d_sqlnegociao}}"]', false),
    ('Empire Default', 'data_fechado', '{{opportunity.sqlfechada}}', 'date', '["{{opportunity.sqlfechada}}","{{opportunity.d_sqlfechada}}"]', false),
    ('Empire Default', 'data_reuniao_agendada', '{{opportunity.data_da_reunio}}', 'date', '["{{opportunity.data_da_reunio}}","{{opportunity.d_data_da_reunio}}"]', false),
    ('Empire Default', 'data_reuniao_realizada', '{{opportunity.reuniao_realizada}}', 'date', '["{{opportunity.reuniao_realizada}}","{{opportunity.data_da_reunio_realizada}}","{{opportunity.d_reuniao_realizada}}"]', false),
    ('Empire Default', 'data_auto_agendamento', '{{opportunity.mqlauto_agendamento}}', 'date', '["{{opportunity.mqlauto_agendamento}}"]', false),

    -- Opportunity text / metadata fields
    ('Empire Default', 'vendedor_closer', '{{opportunity.assignedToUsersName}}', 'opportunity_field', '["{{opportunity.assignedToUsersName}}"]', false),
    ('Empire Default', 'lost_reason', '{{opportunity.lost_reason}}', 'opportunity_field', '["{{opportunity.lost_reason}}"]', false),
    ('Empire Default', 'resumo_ia', '{{opportunity.resumo_ia}}', 'opportunity_field', '["{{opportunity.resumo_ia}}"]', false),
    ('Empire Default', 'percepcao_closer', '{{opportunity.percepo_do_closer}}', 'opportunity_field', '["{{opportunity.percepo_do_closer}}"]', false),
    ('Empire Default', 'data_ultima_atividade', '{{opportunity.ltima_atividade}}', 'date', '["{{opportunity.ltima_atividade}}"]', false),
    ('Empire Default', 'opportunity_source', '{{opportunity.source}}', 'opportunity_field', '["{{opportunity.source}}"]', false),

    -- Contact fields
    ('Empire Default', 'utm_source', 'utm_source', 'contact_field', '["utm_source"]', false),
    ('Empire Default', 'utm_medium', 'utm_medium', 'contact_field', '["utm_medium"]', false),
    ('Empire Default', 'utm_campaign', 'utm_campaign', 'contact_field', '["utm_campaign"]', false),
    ('Empire Default', 'utm_term', 'utm_term', 'contact_field', '["utm_term"]', false),
    ('Empire Default', 'utm_content', 'utm_content', 'contact_field', '["utm_content"]', false),
    ('Empire Default', 'tt_source', 'tt_source', 'contact_field', '["tt_source"]', false),
    ('Empire Default', 'tt_medium', 'tt_medium', 'contact_field', '["tt_medium"]', false),
    ('Empire Default', 'tt_campaign', 'tt_campaign', 'contact_field', '["tt_campaign"]', false),
    ('Empire Default', 'tt_term', 'tt_term', 'contact_field', '["tt_term"]', false),
    ('Empire Default', 'tt_content', 'tt_content', 'contact_field', '["tt_content"]', false)
ON CONFLICT (name, logical_name) DO NOTHING;
