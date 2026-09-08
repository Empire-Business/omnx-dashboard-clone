-- Tabela de auditoria imutável para operações destrutivas
-- Sem UPDATE ou DELETE permitidos (apenas service_role via policy ALL)

CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL,
  action         TEXT         NOT NULL,
  table_name     TEXT         NOT NULL,
  record_id      TEXT         NOT NULL,
  payload_before JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table  ON audit_log(table_name, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Só admins/owners lêem
CREATE POLICY "admins_read_audit_log" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = (SELECT auth.uid())
        AND wm.is_active = true
        AND wm.role IN ('admin', 'owner', 'admin_master')
    )
  );

-- Qualquer autenticado pode inserir seus próprios registros
CREATE POLICY "authenticated_insert_audit_log" ON audit_log
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- Service role tem acesso total (para triggers e edge functions)
CREATE POLICY "service_role_full_audit_log" ON audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
