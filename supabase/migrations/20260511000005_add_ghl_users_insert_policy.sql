-- Permite que admins e owners do workspace insiram novos membros em ghl_users
-- Necessário para adicionar manualmente SDRs/Closers que não foram importados via GHL API

DROP POLICY IF EXISTS "workspace_admins_insert_ghl_users" ON ghl_users;
CREATE POLICY "workspace_admins_insert_ghl_users"
ON ghl_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.is_active = true
      AND wm.role IN ('admin', 'owner')
  )
);
