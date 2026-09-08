-- Corrige email do dono: ferramentas@aliancadealtovalor.com.br (não bruno@)
UPDATE ghl_users SET clara_habilitado = false WHERE auth_user_id IS NOT NULL;

UPDATE ghl_users SET clara_habilitado = true
WHERE email IN ('ferramentas@aliancadealtovalor.com.br', 'sandro@wtrade.com.br');
