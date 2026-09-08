-- Habilita Clara para todos os usuários que já têm acesso ao dashboard (auth_user_id preenchido)
-- Sem essa migration, o admin não consegue habilitar o próprio acesso via painel
-- pois o toggle só aparece para quem já tem auth_user_id, e o admin não tem como clicar no próprio
UPDATE ghl_users
SET clara_habilitado = true
WHERE auth_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
