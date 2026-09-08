-- Migration: Create all 17 tracking module tables
-- Part of Dashboard Empire Phase 1 infrastructure
-- Reference: docs/PRD-DASHBOARD-EMPIRE.md Section 12

-- =============================================================================
-- Reusable RLS helper: create standard workspace isolation policies
-- =============================================================================

-- Helper to generate workspace-scoped RLS (called per table below)
-- We define it once and use it via DO blocks for each table.

-- =============================================================================
-- 1. utm_slugs — Slug base para geração de códigos
-- =============================================================================
CREATE TABLE utm_slugs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, slug),
    UNIQUE(workspace_id, nome)
);

CREATE INDEX idx_utm_slugs_workspace ON utm_slugs(workspace_id);

-- =============================================================================
-- 2. utm_sources — Canais de tráfego pago (com public_code)
-- =============================================================================
CREATE TABLE utm_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    slug TEXT NOT NULL,
    utm_source TEXT NOT NULL,
    public_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_source)
);

CREATE INDEX idx_utm_sources_workspace ON utm_sources(workspace_id);
CREATE INDEX idx_utm_sources_slug ON utm_sources(workspace_id, slug);

-- =============================================================================
-- 3. utm_sources_plain — Canais de tráfego orgânico (sem public_code)
-- =============================================================================
CREATE TABLE utm_sources_plain (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    slug TEXT NOT NULL,
    utm_source TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_source)
);

CREATE INDEX idx_utm_sources_plain_workspace ON utm_sources_plain(workspace_id);
CREATE INDEX idx_utm_sources_plain_slug ON utm_sources_plain(workspace_id, slug);

-- =============================================================================
-- 4. utm_campaigns — Campanhas com page_code e funis
-- =============================================================================
CREATE TABLE utm_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    utm_campaign INTEGER,
    page_code TEXT,
    funnels JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_campaign)
);

CREATE INDEX idx_utm_campaigns_workspace ON utm_campaigns(workspace_id);
CREATE INDEX idx_utm_campaigns_page_code ON utm_campaigns(workspace_id, page_code);

-- =============================================================================
-- 5. utm_mediums — Meios de veiculação
-- =============================================================================
CREATE TABLE utm_mediums (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    utm_medium INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_medium)
);

CREATE INDEX idx_utm_mediums_workspace ON utm_mediums(workspace_id);

-- =============================================================================
-- 6. utm_terms — Identificadores de criativos
-- =============================================================================
CREATE TABLE utm_terms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    utm_term INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_term)
);

CREATE INDEX idx_utm_terms_workspace ON utm_terms(workspace_id);

-- =============================================================================
-- 7. utm_objectives — Objetivos de campanha
-- =============================================================================
CREATE TABLE utm_objectives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    objective_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, objective_code)
);

CREATE INDEX idx_utm_objectives_workspace ON utm_objectives(workspace_id);

-- =============================================================================
-- 8. utm_origins — Nomes de origens agrupadas
-- =============================================================================
CREATE TABLE utm_origins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, nome)
);

CREATE INDEX idx_utm_origins_workspace ON utm_origins(workspace_id);

-- =============================================================================
-- 9. utm_source_origin_assignments — Mapeamento slug -> origem
-- =============================================================================
CREATE TABLE utm_source_origin_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    utm_source TEXT NOT NULL,
    origin_id UUID NOT NULL REFERENCES utm_origins(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_source)
);

CREATE INDEX idx_utm_source_origin_workspace ON utm_source_origin_assignments(workspace_id);
CREATE INDEX idx_utm_source_origin_origin_id ON utm_source_origin_assignments(origin_id);

-- =============================================================================
-- 10. sales_processes — Processos de vendas
-- =============================================================================
CREATE TABLE sales_processes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, nome)
);

CREATE INDEX idx_sales_processes_workspace ON sales_processes(workspace_id);

-- =============================================================================
-- 11. sales_process_assignments — Mapeamento campanha -> processo
-- =============================================================================
CREATE TABLE sales_process_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    utm_campaign_id UUID NOT NULL REFERENCES utm_campaigns(id) ON DELETE CASCADE,
    sales_process_id UUID NOT NULL REFERENCES sales_processes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, utm_campaign_id)
);

CREATE INDEX idx_sales_process_assign_workspace ON sales_process_assignments(workspace_id);
CREATE INDEX idx_sales_process_assign_campaign ON sales_process_assignments(utm_campaign_id);
CREATE INDEX idx_sales_process_assign_process ON sales_process_assignments(sales_process_id);

-- =============================================================================
-- 12. ads_campaigns — Campanhas de anúncios com código gerado
-- =============================================================================
CREATE TABLE ads_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    objective_code TEXT,
    objective_name TEXT,
    page_name TEXT,
    campaign_date DATE,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, code)
);

CREATE INDEX idx_ads_campaigns_workspace ON ads_campaigns(workspace_id);

-- =============================================================================
-- 13. ads_catalog — Catálogo completo de anúncios pagos
-- =============================================================================
CREATE TABLE ads_catalog (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    month_number INTEGER CHECK (month_number BETWEEN 1 AND 12),
    objective_name TEXT,
    objective_code TEXT,
    public_name TEXT,
    public_code TEXT,
    utm_source TEXT,
    creative_id TEXT,
    page_name TEXT,
    page_code TEXT,
    utm_campaign_number INTEGER,
    utm_medium_name TEXT,
    utm_medium_number INTEGER,
    utm_term TEXT,
    url TEXT,
    shortened_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_ads_catalog_workspace ON ads_catalog(workspace_id);
CREATE INDEX idx_ads_catalog_utm_source ON ads_catalog(workspace_id, utm_source);
CREATE INDEX idx_ads_catalog_creative ON ads_catalog(workspace_id, creative_id);

-- =============================================================================
-- 14. organic_catalog — Catálogo de conteúdo orgânico
-- =============================================================================
CREATE TABLE organic_catalog (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    profile TEXT,
    utm_source_name TEXT,
    utm_source TEXT,
    utm_campaign_name TEXT,
    utm_campaign INTEGER,
    utm_medium_name TEXT,
    utm_medium INTEGER,
    utm_term_name TEXT,
    utm_term INTEGER,
    utm_content TEXT,
    url TEXT,
    shortened_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_organic_catalog_workspace ON organic_catalog(workspace_id);
CREATE INDEX idx_organic_catalog_profile ON organic_catalog(workspace_id, profile);

-- =============================================================================
-- 15. notion_creatives — Criativos sincronizados do Notion
-- =============================================================================
CREATE TABLE notion_creatives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    notion_page_id TEXT NOT NULL,
    database_type TEXT NOT NULL CHECK (database_type IN ('paid', 'organic')),
    external_id TEXT,
    name TEXT,
    status TEXT,
    available_date DATE,
    format TEXT,
    cta_objective TEXT,
    videos_folder_url TEXT,
    final_asset_url TEXT,
    profile TEXT,
    raw_properties JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, notion_page_id)
);

CREATE INDEX idx_notion_creatives_workspace ON notion_creatives(workspace_id);
CREATE INDEX idx_notion_creatives_type ON notion_creatives(workspace_id, database_type);
CREATE INDEX idx_notion_creatives_external_id ON notion_creatives(workspace_id, external_id);
CREATE INDEX idx_notion_creatives_status ON notion_creatives(workspace_id, status);

-- =============================================================================
-- 16. notion_sync_runs — Histórico de sincronizações Notion
-- =============================================================================
CREATE TABLE notion_sync_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    database_type TEXT NOT NULL CHECK (database_type IN ('paid', 'organic')),
    request_source TEXT NOT NULL CHECK (request_source IN ('manual', 'cron')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')) DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    finished_at TIMESTAMPTZ,
    records_synced INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_notion_sync_runs_workspace ON notion_sync_runs(workspace_id);
CREATE INDEX idx_notion_sync_runs_status ON notion_sync_runs(workspace_id, status);

-- =============================================================================
-- 17. funnels — Definições dos funis
-- =============================================================================
CREATE TABLE funnels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, nome)
);

CREATE INDEX idx_funnels_workspace ON funnels(workspace_id);

-- =============================================================================
-- Apply updated_at triggers to all tables with updated_at column
-- =============================================================================
-- (Reusing the update_updated_at_column function from lead_filters migration)

CREATE TRIGGER trigger_update_utm_slugs_updated_at
    BEFORE UPDATE ON utm_slugs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_sources_updated_at
    BEFORE UPDATE ON utm_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_sources_plain_updated_at
    BEFORE UPDATE ON utm_sources_plain FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_campaigns_updated_at
    BEFORE UPDATE ON utm_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_mediums_updated_at
    BEFORE UPDATE ON utm_mediums FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_terms_updated_at
    BEFORE UPDATE ON utm_terms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_objectives_updated_at
    BEFORE UPDATE ON utm_objectives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_origins_updated_at
    BEFORE UPDATE ON utm_origins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_utm_source_origin_assignments_updated_at
    BEFORE UPDATE ON utm_source_origin_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_sales_processes_updated_at
    BEFORE UPDATE ON sales_processes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_ads_campaigns_updated_at
    BEFORE UPDATE ON ads_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_ads_catalog_updated_at
    BEFORE UPDATE ON ads_catalog FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_organic_catalog_updated_at
    BEFORE UPDATE ON organic_catalog FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_notion_creatives_updated_at
    BEFORE UPDATE ON notion_creatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_funnels_updated_at
    BEFORE UPDATE ON funnels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS for ALL 17 tracking tables
-- Standard pattern: workspace isolation via workspace_members
-- Read: any active member of the workspace
-- Write: members with appropriate role (enforced at API level, RLS ensures workspace isolation)
-- =============================================================================

-- Helper: enable RLS and create standard policies for a tracking table
-- Using DO block to avoid repetition

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'utm_slugs', 'utm_sources', 'utm_sources_plain',
        'utm_campaigns', 'utm_mediums', 'utm_terms', 'utm_objectives',
        'utm_origins', 'utm_source_origin_assignments',
        'sales_processes', 'sales_process_assignments',
        'ads_campaigns', 'ads_catalog',
        'organic_catalog',
        'notion_creatives', 'notion_sync_runs',
        'funnels'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

        -- SELECT: any active member of the workspace can read
        EXECUTE format(
            'CREATE POLICY "Workspace members can view %1$s" ON %1$I FOR SELECT TO authenticated USING (
                workspace_id IN (
                    SELECT workspace_id FROM workspace_members
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )', tbl
        );

        -- INSERT: any active member of the workspace can insert
        EXECUTE format(
            'CREATE POLICY "Workspace members can insert %1$s" ON %1$I FOR INSERT TO authenticated WITH CHECK (
                workspace_id IN (
                    SELECT workspace_id FROM workspace_members
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )', tbl
        );

        -- UPDATE: any active member of the workspace can update
        EXECUTE format(
            'CREATE POLICY "Workspace members can update %1$s" ON %1$I FOR UPDATE TO authenticated
            USING (
                workspace_id IN (
                    SELECT workspace_id FROM workspace_members
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )
            WITH CHECK (
                workspace_id IN (
                    SELECT workspace_id FROM workspace_members
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )', tbl
        );

        -- DELETE: any active member of the workspace can delete
        EXECUTE format(
            'CREATE POLICY "Workspace members can delete %1$s" ON %1$I FOR DELETE TO authenticated USING (
                workspace_id IN (
                    SELECT workspace_id FROM workspace_members
                    WHERE user_id = auth.uid() AND is_active = true
                )
            )', tbl
        );

        -- Service role full access
        EXECUTE format(
            'CREATE POLICY "Service role full access on %1$s" ON %1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl
        );
    END LOOP;
END $$;
