-- Permite que admins e owners do workspace atualizem ghl_users
-- (necessário para a página Settings/Users salvar papéis, email, etc.)
--
-- Causa raiz: a tabela só tinha política SELECT para authenticated.
-- O .update() do frontend retornava sucesso silencioso com 0 linhas afetadas.

CREATE POLICY "workspace_admins_update_ghl_users"
ON ghl_users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.is_active = true
      AND wm.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.is_active = true
      AND wm.role IN ('admin', 'owner')
  )
);
