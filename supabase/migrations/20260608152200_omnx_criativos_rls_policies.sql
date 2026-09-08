-- Migration: RLS policies para todas as tabelas novas do OMNX Criativos
-- Descrição: Garante isolamento por workspace em todas as tabelas
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- Helper: função para verificar se usuário pertence ao workspace
-- ============================================================
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- ============================================================
-- creative_tests
-- ============================================================
ALTER TABLE creative_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can view creative_tests"
  ON creative_tests FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can insert creative_tests"
  ON creative_tests FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can update creative_tests"
  ON creative_tests FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_tests" ON creative_tests;
CREATE POLICY "Service role full access on creative_tests"
  ON creative_tests FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_test_history
-- ============================================================
ALTER TABLE creative_test_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_test_history" ON creative_test_history;
CREATE POLICY "Workspace members can view creative_test_history"
  ON creative_test_history FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_test_history" ON creative_test_history;
CREATE POLICY "Workspace members can insert creative_test_history"
  ON creative_test_history FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_test_history" ON creative_test_history;
CREATE POLICY "Service role full access on creative_test_history"
  ON creative_test_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_comments
-- ============================================================
ALTER TABLE creative_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can view creative_comments"
  ON creative_comments FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can insert creative_comments"
  ON creative_comments FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can update creative_comments"
  ON creative_comments FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Workspace members can delete creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can delete creative_comments"
  ON creative_comments FOR DELETE TO authenticated
  USING (is_workspace_member(workspace_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on creative_comments" ON creative_comments;
CREATE POLICY "Service role full access on creative_comments"
  ON creative_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_audit_log
-- ============================================================
ALTER TABLE creative_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_audit_log" ON creative_audit_log;
CREATE POLICY "Workspace members can view creative_audit_log"
  ON creative_audit_log FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_audit_log" ON creative_audit_log;
CREATE POLICY "Service role full access on creative_audit_log"
  ON creative_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_test_criteria (RLS já criado na migration anterior,
-- mas garantimos aqui caso tenha falhado)
-- ============================================================
ALTER TABLE creative_test_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Workspace members can view creative_test_criteria"
  ON creative_test_criteria FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Workspace members can update creative_test_criteria"
  ON creative_test_criteria FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Service role full access on creative_test_criteria"
  ON creative_test_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- GRANT permissions para service_role
-- ============================================================
GRANT ALL ON creative_tests TO service_role;
GRANT ALL ON creative_test_history TO service_role;
GRANT ALL ON creative_comments TO service_role;
GRANT ALL ON creative_audit_log TO service_role;
GRANT ALL ON creative_test_criteria TO service_role;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
