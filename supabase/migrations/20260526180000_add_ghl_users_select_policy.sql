-- Adiciona política SELECT para ghl_users
-- Necessário para o dropdown de SDR no formulário de bots de IA
-- A tabela ghl_users não tem workspace_id, então permite SELECT para qualquer usuário autenticado
-- (dados de usuários GHL são necessários para o funcionamento do dashboard e não são sensíveis)

DROP POLICY IF EXISTS "authenticated_select_ghl_users" ON ghl_users;

CREATE POLICY "authenticated_select_ghl_users"
ON ghl_users
FOR SELECT
TO authenticated
USING (true);
