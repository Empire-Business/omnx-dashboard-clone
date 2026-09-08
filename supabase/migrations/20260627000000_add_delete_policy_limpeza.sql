-- Permite que admins e owners excluam oportunidades e contatos (para limpeza de leads de teste)
-- Motivo: políticas anteriores só tinham SELECT para workspace_members, bloqueando
-- silenciosamente todos os DELETEs da aba Limpeza de Leads.

CREATE POLICY "admins_delete_oportunidades"
  ON oportunidades
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = (SELECT auth.uid())
        AND wm.is_active = true
        AND wm.role IN ('admin', 'owner', 'admin_master')
    )
  );

CREATE POLICY "admins_delete_contatos"
  ON contatos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = (SELECT auth.uid())
        AND wm.is_active = true
        AND wm.role IN ('admin', 'owner', 'admin_master')
    )
  );
