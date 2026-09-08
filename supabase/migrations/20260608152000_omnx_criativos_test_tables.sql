-- Migration: Criar tabelas de testes, histórico, comentários e audit log
-- Descrição: Infraestrutura de gestão de testes e rastreabilidade
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- TABLE: creative_tests
-- Registro formal de cada teste executado
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  
  -- Período
  started_at DATE NOT NULL,
  ended_at DATE,
  
  -- Orçamento
  budget_allocated NUMERIC(10,2),
  budget_spent NUMERIC(10,2) DEFAULT 0,
  
  -- Métricas ao final do teste
  leads_meta INTEGER DEFAULT 0,
  leads_crm INTEGER DEFAULT 0,
  mql_count INTEGER DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  cpl_meta NUMERIC(10,2),
  cpl_crm NUMERIC(10,2),
  cpmql NUMERIC(10,2),
  
  -- Resultado
  result TEXT CHECK (result IN ('aprovado', 'reprovado', 'cancelado', 'pendente')),
  result_reason TEXT,
  observations TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'em_andamento' 
    CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_tests_workspace ON creative_tests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_creative ON creative_tests(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_status ON creative_tests(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_creative_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_tests_updated_at ON creative_tests;
CREATE TRIGGER trigger_creative_tests_updated_at
  BEFORE UPDATE ON creative_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_tests_updated_at();

-- ============================================================
-- TABLE: creative_test_history
-- Log detalhado de cada evento de teste
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_test_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  test_id UUID REFERENCES creative_tests(id) ON DELETE SET NULL,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'teste_iniciado', 'teste_pausado', 'teste_finalizado',
    'aprovado', 'reprovado', 'retestar', 'orcamento_atualizado',
    'cpl_atualizado', 'observacao_adicionada'
  )),
  
  event_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_test_history_creative ON creative_test_history(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_test ON creative_test_history(test_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_event ON creative_test_history(event_type);

-- ============================================================
-- TABLE: creative_comments
-- Comentários em criativos (threads com respostas)
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  parent_id UUID REFERENCES creative_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_comments_creative ON creative_comments(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_comments_parent ON creative_comments(parent_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_creative_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_comments_updated_at ON creative_comments;
CREATE TRIGGER trigger_creative_comments_updated_at
  BEFORE UPDATE ON creative_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_comments_updated_at();

-- ============================================================
-- TABLE: creative_audit_log
-- Rastreabilidade completa de alterações
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  
  table_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_creative_audit_log_creative ON creative_audit_log(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_audit_log_changed_at ON creative_audit_log(changed_at DESC);

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
