-- Permite que owners e admins do workspace visualizem as submissoes
-- de formulario da tabela aplic-acelerador (single-tenant, sem workspace_id).
-- A tabela continua sem policies publicas — apenas admins autenticados
-- tem acesso de leitura.

CREATE POLICY "Workspace admins read form submissions"
  ON public."aplic-acelerador"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND is_active = true
  ));

COMMENT ON POLICY "Workspace admins read form submissions" ON public."aplic-acelerador" IS
  'Owner/admin de qualquer workspace ativo pode visualizar submissoes do formulario. Single-tenant: todas as linhas pertencem a unica instancia.';
