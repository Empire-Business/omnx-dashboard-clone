-- =============================================================================
-- ghl_users: unicidade por (workspace_id, ghl_id) em vez de ghl_id global
-- =============================================================================
--
-- PROBLEMA
-- --------
-- A tabela tinha UNIQUE (ghl_id). Um mesmo usuario do GHL pode ter acesso a
-- MAIS DE UM location (uma sub-conta de teste e a conta real, por exemplo) e,
-- nesse caso, aparece na listagem de usuarios dos dois locations.
--
-- Com unicidade global, so cabia UMA linha para esse usuario. O sync de cada
-- workspace entao "puxava" a linha para si (UPDATE ... SET workspace_id = ...),
-- e o time real da conta de producao migrava para o workspace de teste.
--
-- Observado em producao em 2026-08-25: os 10 usuarios reais estavam no
-- workspace "Burn-in Interno" e os 31 do workspace real ficaram deleted = true,
-- zerando o contador "Ligacoes hoje" do painel de Discagem e o seletor de SDR.
--
-- CORRECAO
-- --------
-- Unicidade passa a ser por (workspace_id, ghl_id): o mesmo usuario GHL pode
-- existir uma vez em cada workspace, com papeis proprios em cada um.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- =============================================================================

-- 1. Indice novo por (workspace_id, ghl_id).
--    Linhas com workspace_id NULL nao sao cobertas por UNIQUE em Postgres —
--    por isso o indice parcial exige workspace_id preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS ghl_users_workspace_ghl_id_key
  ON public.ghl_users (workspace_id, ghl_id)
  WHERE workspace_id IS NOT NULL;

-- 2. Remove a unicidade global, que era a causa do roubo de linha entre contas.
ALTER TABLE public.ghl_users
  DROP CONSTRAINT IF EXISTS ghl_users_ghl_id_key;

COMMENT ON INDEX public.ghl_users_workspace_ghl_id_key IS
  'Unicidade por conta. Substitui UNIQUE(ghl_id) global, que fazia o sync de um workspace roubar o usuario de outro quando a mesma pessoa tinha acesso aos dois locations do GHL.';
