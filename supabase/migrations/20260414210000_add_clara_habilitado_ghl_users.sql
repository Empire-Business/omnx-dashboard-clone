-- Adiciona controle de acesso à Clara por usuário de dashboard
-- clara_habilitado: admin habilita/desabilita a IA por usuário no painel Settings > Usuários
-- Default false — novo usuário não tem acesso automático

ALTER TABLE ghl_users ADD COLUMN IF NOT EXISTS clara_habilitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ghl_users.clara_habilitado IS
  'Se true, o usuário autenticado (auth_user_id) pode usar a Clara no dashboard. '
  'Default false — deve ser habilitado manualmente por admin em Settings > Usuários.';

-- A política SELECT existente já cobre leitura por authenticated.
-- A política UPDATE existente já cobre escrita por admins/owners.
-- Nenhuma nova política é necessária.

NOTIFY pgrst, 'reload schema';
