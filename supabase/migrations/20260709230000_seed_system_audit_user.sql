-- Migration: usuário técnico "sistema" para auditoria de permissões
--
-- Contexto:
-- Os triggers de auditoria (audit_app_feature_user_overrides e similares,
-- ver 20260706160000_add_permission_audit_triggers.sql) usam
-- COALESCE(granted_by, auth.uid()) e fazem fallback para o UUID fixo
-- '00000000-0000-0000-0000-000000000000' quando a operação NÃO tem usuário
-- autenticado (manutenção via CLI / service role / edge function).
--
-- Como a FK permission_audit_log_performed_by_fkey aponta para auth.users(id),
-- qualquer escrita feita fora do contexto de um usuário logado falhava com:
--   ERROR: insert or update on table "permission_audit_log" violates foreign key
--   constraint "permission_audit_log_performed_by_fkey"
-- porque o UUID '00000000-...' não existia em auth.users.
--
-- Solução:
-- Criar um usuário técnico "sistema" com esse UUID fixo. Assim:
--   - operações pela UI (usuário logado) seguem registradas com o autor humano;
--   - operações via CLI/service role ficam registradas como "sistema",
--     com a FK satisfeita e a auditoria preservada (nada anônimo).
--
-- Segurança do usuário sistema:
--   - encrypted_password NULL e email_confirmed_at NULL -> não consegue logar;
--   - não é inserido em workspace_members -> sem acesso a nenhum app/dado;
--   - existe apenas como "ator" de auditoria.

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  is_sso_user,
  is_anonymous,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'system@empire.local',
  NULL,
  NULL,
  false,
  false,
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Sistema (auditoria de permissoes)","is_system":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
