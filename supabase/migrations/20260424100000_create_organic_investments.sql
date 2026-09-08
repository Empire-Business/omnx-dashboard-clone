-- Migration: infraestrutura de investimentos orgânicos (custos de equipe)
-- Tabela 1: organic_investment_items — define cada linha de custo (designer, social media, etc.)
-- Tabela 2: organic_investments      — entradas mensais de valor por item/período

-- ── 1. Itens de custo (definição) ────────────────────────────────────────────

CREATE TABLE organic_investment_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                       -- "Designer - Ana", "Social Media"
  category     TEXT NOT NULL DEFAULT 'other',       -- social_media | design | video | copywriter | other
  utm_source   TEXT,                                -- NULL = geral (todos os canais orgânicos)
  recurrence   TEXT NOT NULL DEFAULT 'monthly',     -- monthly | once
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT category_valid CHECK (category IN ('social_media','design','video','copywriter','other')),
  CONSTRAINT recurrence_valid CHECK (recurrence IN ('monthly','once'))
);

CREATE INDEX idx_organic_investment_items_workspace ON organic_investment_items(workspace_id);
CREATE INDEX idx_organic_investment_items_active    ON organic_investment_items(workspace_id, is_active, sort_order);

CREATE TRIGGER set_organic_investment_items_updated_at
  BEFORE UPDATE ON organic_investment_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS — padrão workspace_members
ALTER TABLE organic_investment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view organic_investment_items"
  ON organic_investment_items FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can insert organic_investment_items"
  ON organic_investment_items FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can update organic_investment_items"
  ON organic_investment_items FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can delete organic_investment_items"
  ON organic_investment_items FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

-- ── 2. Entradas mensais de valor ──────────────────────────────────────────────

CREATE TABLE organic_investments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_id      UUID REFERENCES organic_investment_items(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  -- year_month gerado automaticamente a partir de period_start (ex: "2026-04")
  year_month   TEXT GENERATED ALWAYS AS (
    EXTRACT(YEAR FROM period_start)::int::text || '-' || LPAD(EXTRACT(MONTH FROM period_start)::int::text, 2, '0')
  ) STORED,
  utm_source   TEXT,          -- NULL = geral; herdado do item mas pode sobrescrever
  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT period_valid CHECK (period_end >= period_start)
);

CREATE INDEX idx_organic_investments_workspace ON organic_investments(workspace_id);
CREATE INDEX idx_organic_investments_period    ON organic_investments(workspace_id, period_start, period_end);
CREATE INDEX idx_organic_investments_item      ON organic_investments(item_id, year_month);
CREATE UNIQUE INDEX idx_organic_investments_item_month ON organic_investments(item_id, year_month)
  WHERE item_id IS NOT NULL;  -- um registro por item por mês

CREATE TRIGGER set_organic_investments_updated_at
  BEFORE UPDATE ON organic_investments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS — padrão workspace_members
ALTER TABLE organic_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view organic_investments"
  ON organic_investments FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can insert organic_investments"
  ON organic_investments FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can update organic_investments"
  ON organic_investments FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Workspace members can delete organic_investments"
  ON organic_investments FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));
