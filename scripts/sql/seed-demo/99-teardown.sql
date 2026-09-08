-- ============================================================================
-- Tenant de Demonstração — 99 · Remoção completa
-- ============================================================================
-- Apaga TODO o tenant de demonstração "Acme Educação (Demo)": dados, workspace,
-- vínculo com a agência e o usuário de acesso.
--
-- ⚠️ LEIA ANTES DE EXECUTAR
--   Este arquivo é DESTRUTIVO e IRREVERSÍVEL. Ele existe para o caso de você
--   querer recriar a demo do zero ou aposentá-la.
--
--   O UUID abaixo é o único alvo. Confirme com os olhos antes de rodar:
--     workspace .... d0000000-0000-4000-8000-000000000001  (Acme Educação (Demo))
--     usuário ...... d0000000-0000-4000-8000-000000000002  (demo@omnx.app)
--
--   Se esse UUID não for exatamente esse, PARE. Rodar isto contra o workspace
--   de um cliente apaga a operação inteira dele.
--
-- COMO RODAR COM SEGURANÇA
--   Passo 1 — ensaio (não apaga nada, só mostra o que seria apagado):
--     select * from purge_workspace_data(
--       'd0000000-0000-4000-8000-000000000001'::uuid, 'Acme Educação (Demo)', true);
--
--   Passo 2 — execução real: descomente o bloco no fim do arquivo.
--
--   A RPC `purge_workspace_data` exige o NOME do workspace como confirmação —
--   é a trava contra apagar o workspace errado por engano.
-- ============================================================================

-- ─── Passo 1: ENSAIO (seguro, não apaga nada) ───────────────────────────────
select *
from purge_workspace_data(
  'd0000000-0000-4000-8000-000000000001'::uuid,
  'Acme Educação (Demo)',
  true   -- dry_run
);


-- ─── Passo 2: EXECUÇÃO REAL — descomente conscientemente ────────────────────
--
-- select *
-- from purge_workspace_data(
--   'd0000000-0000-4000-8000-000000000001'::uuid,
--   'Acme Educação (Demo)',
--   false  -- dry_run = false → APAGA DE VERDADE
-- );
--
-- -- Sobras que a RPC de expurgo não cobre (vínculo, workspace e login):
-- delete from agency_workspaces      where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from dashboard_user_permissions where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from workspace_members      where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from workspaces             where id = 'd0000000-0000-4000-8000-000000000001';
-- delete from auth.identities        where user_id = 'd0000000-0000-4000-8000-000000000002';
-- delete from auth.users             where id = 'd0000000-0000-4000-8000-000000000002';


-- ─── Alternativa: limpar SÓ os dados, mantendo o workspace e o login ────────
-- Útil para regerar o seed com outros números sem refazer o provisionamento.
-- Rode na ordem abaixo (respeita as chaves estrangeiras):
--
-- delete from discagem_scores    where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from vendas_fechamento  where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from comunicacoes       where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from reunioes           where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from oportunidades      where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from contatos           where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- -- depois, rodar novamente 10-crm-core.sql em diante.
