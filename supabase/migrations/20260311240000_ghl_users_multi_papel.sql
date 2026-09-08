-- ============================================================
-- Migration: Substitui papel TEXT por papeis TEXT[] em ghl_users
-- Adiciona auth_user_id para vincular usuário GHL ao auth.users
-- Atualiza view comunicacoes_com_remetente
--
-- Motivo: suporte a multi-papel (sdr+closer) e link com acesso ao dashboard
-- ============================================================

-- 1. Adicionar coluna papeis
ALTER TABLE ghl_users ADD COLUMN IF NOT EXISTS papeis TEXT[] NOT NULL DEFAULT '{}';

-- 2. Migrar dados de papel → papeis
--    sdr_closer vira {sdr,closer}, demais viram array unitário, NULL vira {}
UPDATE ghl_users SET papeis =
  CASE papel
    WHEN 'sdr_closer'   THEN ARRAY['sdr','closer']
    WHEN NULL           THEN ARRAY[]::TEXT[]
    ELSE                     ARRAY[papel]
  END
WHERE TRUE;

-- 3. Adicionar auth_user_id (nullable — só quem tem acesso ao sistema)
ALTER TABLE ghl_users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ghl_users_auth_user_id_idx ON ghl_users (auth_user_id);

-- 4. Dropar view dependente antes de remover coluna papel
DROP VIEW IF EXISTS comunicacoes_com_remetente;

-- Remover coluna papel (agora substituída por papeis)
ALTER TABLE ghl_users DROP COLUMN IF EXISTS papel;

-- 5. Atualizar view comunicacoes_com_remetente para usar papeis[]
CREATE OR REPLACE VIEW comunicacoes_com_remetente AS
SELECT
  c.*,
  gu.nome          AS remetente_nome,
  gu.papeis        AS remetente_papeis,
  gu.email         AS remetente_email,
  -- Rótulo legível do autor
  CASE
    WHEN c.direction = 'inbound'                                    THEN 'lead'
    WHEN c.direction = 'outbound' AND gu.papeis IS NOT NULL
         AND array_length(gu.papeis, 1) > 0                         THEN gu.papeis[1]
    WHEN c.direction = 'outbound' AND gu.nome  IS NOT NULL          THEN gu.nome
    WHEN c.direction = 'outbound'                                    THEN 'time'
    ELSE 'desconhecido'
  END AS autor
FROM comunicacoes c
LEFT JOIN ghl_users gu ON gu.ghl_id = c.usuario_ghl_id;

COMMENT ON VIEW comunicacoes_com_remetente IS
  'comunicacoes com nome/papeis do remetente. '
  'Campo autor: ''lead'' | papeis[1] do usuário GHL | nome | ''time'' | ''desconhecido''.';

COMMENT ON COLUMN ghl_users.papeis      IS 'Papéis no negócio: sdr | closer | social_seller | gestor | sistema (array, multi-papel)';
COMMENT ON COLUMN ghl_users.auth_user_id IS 'UUID do auth.users se este usuário GHL tem acesso ao dashboard';

NOTIFY pgrst, 'reload schema';
