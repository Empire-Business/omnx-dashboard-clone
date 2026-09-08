-- ============================================================
-- Migration: Cria tabela ghl_users com todos os usuários do location
-- Motivo: Mapear usuario_ghl_id em comunicacoes para nome/papel legível
--
-- Campos:
--   ghl_id   — ID do usuário na GHL (chave de join com comunicacoes.usuario_ghl_id)
--   nome     — Nome completo
--   email    — Email
--   role_ghl — Papel na plataforma GHL (admin | user)
--   papel    — Papel no negócio (sdr | closer | gestor | sistema | NULL=indefinido)
--              Preencher manualmente ou via update posterior
--   deleted  — Se o usuário foi deletado na GHL
-- ============================================================

CREATE TABLE IF NOT EXISTS ghl_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id     TEXT        NOT NULL UNIQUE,
  nome       TEXT        NOT NULL,
  email      TEXT,
  role_ghl   TEXT,         -- 'admin' | 'user' (papel na plataforma GHL)
  papel      TEXT,         -- 'sdr' | 'closer' | 'gestor' | 'sistema' | NULL
  deleted    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ghl_users               IS 'Usuários do location GHL — usado para identificar quem enviou mensagens em comunicacoes.usuario_ghl_id';
COMMENT ON COLUMN ghl_users.ghl_id        IS 'ID do usuário na GHL. Join: comunicacoes.usuario_ghl_id = ghl_users.ghl_id';
COMMENT ON COLUMN ghl_users.role_ghl      IS 'Papel na plataforma GHL: admin | user';
COMMENT ON COLUMN ghl_users.papel         IS 'Papel no negócio: sdr | closer | gestor | sistema | NULL (indefinido)';

CREATE INDEX IF NOT EXISTS ghl_users_ghl_id_idx ON ghl_users (ghl_id);

-- ============================================================
-- Dados: todos os 29 usuários do location U8FTcw90CB5QELUnbGUu
-- Fonte: GET /users/?locationId=U8FTcw90CB5QELUnbGUu (2026-03-11)
-- ============================================================

INSERT INTO ghl_users (ghl_id, nome, email, role_ghl, papel, deleted) VALUES
  ('8yEUxnMfVCNgNdfiOBDY', 'Acessos Tinity',          'acessos@thetrinity.com.br',                     'admin', 'sistema',  false),
  ('8AEd7O8QajNdSjpP4JMx', 'Alberto Kzam',             'alberto@aliancadealtovalor.com.br',              'user',  NULL,       false),
  ('tpaBfTfUW1K7QnUGsKbo', 'Alex Matos',               'alex7dmb@gmail.com',                             'user',  NULL,       false),
  ('ermTVKEcAyKtL5Rz5L82', 'Antonio Gabriel',          'antoniogabriel@aliancadealtovalor.com.br',       'user',  NULL,       false),
  ('5lGQtGCMNJOpiEgVKTHR', 'Bruno Andrease',           'brunoandrease@gmail.com',                        'admin', 'sdr',      false),
  ('zg8m2Ylgvt4thLR6hH04', 'Bruno Guzela',             'bruno@aliancadealtovalor.com.br',                'admin', 'gestor',   false),
  ('gxivvgzzsgtzPkQkfQDu', 'Davi Louback',             'davi@exosconsultoria.com',                       'admin', NULL,       false),
  ('jchGm76ArLYrmtYcYE8v', 'Felipe Mazzola',           'fgmazzola11@gmail.com',                          'user',  NULL,       false),
  ('UCIxJ2kOp9SJKc00RviU', 'Fernanda Torres',          'Fernandatorres.digital@gmail.com',               'user',  'sdr',      false),
  ('5yqGq00rre77GtH7LTv1', 'Gildasio Brito',           'gildasio@aliancadealtovalor.com.br',             'admin', NULL,       false),
  ('39YvkBIGXJQyhM1GBIOB', 'Juliana Maia',             'julianamaia@aliancadealtovalor.com.br',          'admin', NULL,       false),
  ('Duj1wVLfBiTN8wm9rJJd', 'Juninho Dalfré',           'robertodalfre@gmail.com',                        'admin', NULL,       false),
  ('QSj8OZzn4AhSk3DZmrW3', 'Larissa Theophilo',        'larissatheophilo@aliancadealtovalor.com.br',     'user',  NULL,       false),
  ('WHMgFpXIQScSmrKHHKi9', 'Leticia Costa',            'leticiacosta@aliancadealtovalor.com.br',          'user',  NULL,       false),
  ('fmNfovWHhnE4I9VttMkw', 'Lucas Leonardo',           'lucasleonardo@aliancadealtovalor.com.br',        'user',  'sdr',      false),
  ('GijCM9qEleps3H0wN79r', 'Marcelo Tetzner',          'marceloktetzner@gmail.com',                      'user',  NULL,       false),
  ('ALfP1X2JlslmFEYWuIZV', 'Matheus Alves Webinar',    'alvesmathewsemp@gmail.com',                      'admin', NULL,       false),
  ('SuzyRRTVotJdYd39W5hF', 'Matheus Carvalho',         'matheus@zlk.com.br',                             'admin', NULL,       false),
  ('a0IcTn6qAGSTGWsEIS2r', 'Matheus Henrique',         'hac@exosconsultoria.com',                        'admin', NULL,       false),
  ('djErmIueMfG8IZfqIXGJ', 'Otávio Brantes',           'otaviobrantes@aliancadealtovalor.com.br',        'admin', NULL,       false),
  ('zBLpjpKqK7GlVJEXiKVq', 'Pedro Paracampos',         'pedro@exosconsultoria.com',                      'admin', NULL,       false),
  ('cnIgqoTq3YoyWlE7KPXU', 'PRY Moraes Webinar',       'Pry.R.Moraes@gmail.com',                         'admin', NULL,       false),
  ('bZPgtqe2K4NReB6GMEwM', 'Rinoel Marinho',           'rinoel@aliancadealtovalor.com.br',               'admin', NULL,       false),
  ('orZvYCf2bsEuJ0vMrnfM', 'Roberta Marques',          'robertampezzet2@gmail.com',                      'admin', NULL,       false),
  ('JSolLNnmi1x6eqIj7OZT', 'Robson Machado',           'ferramentas+robson@aliancadealtovalor.com.br',   'user',  NULL,       false),
  ('GCpgDOsWAbsSailBHwtk', 'Sarah Estevanovite',       'financeiro@aliancadealtovalor.com.br',           'admin', NULL,       false),
  ('rZLBlqwv8YMuQAqcAxET', 'Virendra Prem',            'virendra@aliancadealtovalor.com.br',             'user',  NULL,       false),
  ('XcVBF2fTbsk3wi0Xx2GW', 'Wagner Mafuzo',            'wagnermcloser@gmail.com',                        'user',  NULL,       false),
  ('xG1nHxlFVkEiadHXtOAE', 'Williams Batista',         'welliams@gmail.com',                             'admin', NULL,       false)
ON CONFLICT (ghl_id) DO UPDATE SET
  nome     = EXCLUDED.nome,
  email    = EXCLUDED.email,
  role_ghl = EXCLUDED.role_ghl,
  deleted  = EXCLUDED.deleted,
  updated_at = now();

-- ============================================================
-- View de conveniência: comunicacoes enriquecida com nome do remetente
-- ============================================================

CREATE OR REPLACE VIEW comunicacoes_com_remetente AS
SELECT
  c.*,
  -- Quem enviou (somente outbound tem usuario_ghl_id)
  gu.nome    AS remetente_nome,
  gu.papel   AS remetente_papel,
  gu.email   AS remetente_email,
  -- Rótulo legível de quem é o autor da mensagem
  CASE
    WHEN c.direction = 'inbound'  THEN 'lead'
    WHEN c.direction = 'outbound' AND gu.papel IS NOT NULL THEN gu.papel
    WHEN c.direction = 'outbound' AND gu.nome  IS NOT NULL THEN gu.nome
    WHEN c.direction = 'outbound' THEN 'time'
    ELSE 'desconhecido'
  END AS autor
FROM comunicacoes c
LEFT JOIN ghl_users gu ON gu.ghl_id = c.usuario_ghl_id;

COMMENT ON VIEW comunicacoes_com_remetente IS
  'comunicacoes enriquecida com nome/papel do remetente via ghl_users. '
  'Use autor para saber quem enviou: ''lead'' | ''sdr'' | ''closer'' | nome do usuário.';

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
