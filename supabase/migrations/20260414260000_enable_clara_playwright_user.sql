-- Habilitar Clara para o usuário de testes do Playwright
UPDATE workspace_members wm
SET clara_habilitado = true
FROM auth.users au
WHERE au.id = wm.user_id
  AND au.email = 'teste.playwright.audit@aliancadealtovalor.com.br';
