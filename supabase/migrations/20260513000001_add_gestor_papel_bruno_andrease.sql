-- Adiciona papel 'gestor' a Bruno Andrease (brunoandrease@gmail.com)
-- Motivo: Bruno é gestor de SDRs e deve ver todos os SDRs nas abas de pré-vendas
-- sem o filtro automático que aplica apenas o próprio nome do SDR.
UPDATE ghl_users
SET papeis = array_append(papeis, 'gestor')
WHERE email = 'brunoandrease@gmail.com'
  AND NOT ('gestor' = ANY(papeis));
