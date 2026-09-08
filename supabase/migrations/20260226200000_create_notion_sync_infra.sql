-- Migration: Create Notion Sync Infrastructure
-- Description: Tables for syncing creatives from Notion databases
-- Date: 2026-02-26

-- ============================================================
-- TABLE: notion_creatives
-- Stores synced creatives from Notion (both paid and organic)
-- ============================================================

CREATE TABLE IF NOT EXISTS notion_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Notion identifiers
  notion_page_id TEXT NOT NULL,              -- Internal Notion page ID (used for upsert)
  external_id TEXT,                          -- User-visible ID from Notion (ex: CR-188)
  
  -- Creative data (fields from Notion database)
  name TEXT,                                 -- Nome (title)
  status TEXT,                               -- Status (status)
  available_date DATE,                       -- Concluído (date) - start date only
  format TEXT,                               -- Formato (multi_select) - first item only
  cta_objective TEXT,                        -- Objetivo CTA (multi_select) - first item only
  videos_folder_url TEXT,                    -- Pasta dos videos (url)
  final_asset_url TEXT,                      -- Arquivo final (url)
  profile TEXT,                              -- Perfil (select) - single select
  
  -- Metadata
  database_type TEXT NOT NULL CHECK (database_type IN ('paid', 'organic')),
  notion_database_id TEXT,                   -- Which Notion database this came from
  
  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(workspace_id, notion_page_id)       -- One creative per Notion page per workspace
);

-- Indexes for notion_creatives
CREATE INDEX IF NOT EXISTS idx_notion_creatives_workspace ON notion_creatives(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_external_id ON notion_creatives(external_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_database_type ON notion_creatives(database_type);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_profile ON notion_creatives(profile);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_status ON notion_creatives(status);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_synced_at ON notion_creatives(synced_at DESC);

-- Enable RLS
ALTER TABLE notion_creatives ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view creatives from their workspace
DROP POLICY IF EXISTS "Users can view notion_creatives from their workspace" ON notion_creatives;
CREATE POLICY "Users can view notion_creatives from their workspace"
  ON notion_creatives FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- RLS Policy: Only service role can insert/update (Edge Function)
DROP POLICY IF EXISTS "Service role can manage notion_creatives" ON notion_creatives;
CREATE POLICY "Service role can manage notion_creatives"
  ON notion_creatives FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TABLE: notion_sync_runs
-- Log of sync executions for monitoring and debugging
-- ============================================================

CREATE TABLE IF NOT EXISTS notion_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Run parameters
  database_type TEXT NOT NULL CHECK (database_type IN ('paid', 'organic')),
  notion_database_id TEXT,                   -- Which Notion database was synced
  request_source TEXT NOT NULL CHECK (request_source IN ('manual', 'cron')),
  
  -- Filter parameters (optional)
  start_date DATE,                           -- Filter: Concluído >= start_date
  end_date DATE,                             -- Filter: Concluído <= end_date
  
  -- Run status
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  records_fetched INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Indexes for notion_sync_runs
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_workspace ON notion_sync_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_database_type ON notion_sync_runs(database_type);
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_status ON notion_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_started_at ON notion_sync_runs(started_at DESC);

-- Enable RLS
ALTER TABLE notion_sync_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view sync runs from their workspace
DROP POLICY IF EXISTS "Users can view notion_sync_runs from their workspace" ON notion_sync_runs;
CREATE POLICY "Users can view notion_sync_runs from their workspace"
  ON notion_sync_runs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- RLS Policy: Only service role can insert/update (Edge Function)
DROP POLICY IF EXISTS "Service role can manage notion_sync_runs" ON notion_sync_runs;
CREATE POLICY "Service role can manage notion_sync_runs"
  ON notion_sync_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- FUNCTION: update_updated_at_timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_notion_creatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_notion_creatives_updated_at ON notion_creatives;
CREATE TRIGGER trigger_notion_creatives_updated_at
  BEFORE UPDATE ON notion_creatives
  FOR EACH ROW
  EXECUTE FUNCTION update_notion_creatives_updated_at();

-- ============================================================
-- GRANT permissions
-- ============================================================
GRANT ALL ON notion_creatives TO service_role;
GRANT ALL ON notion_sync_runs TO service_role;
