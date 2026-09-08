-- Restringe acesso à Clara: apenas Bruno Guzela e sandro@wtrade.com.br
-- Desabilita para todos, depois habilita apenas os dois
UPDATE ghl_users SET clara_habilitado = false WHERE auth_user_id IS NOT NULL;

UPDATE ghl_users SET clara_habilitado = true
WHERE email IN ('bruno@aliancadealtovalor.com.br', 'sandro@wtrade.com.br');
