-- Corrige creative_tests_status_check: a constraint viva em produção só
-- aceitava valores em inglês ('running', 'completed', 'cancelled', 'paused'),
-- mas TODO o código do app (useCreativeTests.ts, TestesTab.tsx) sempre usou
-- valores em português ('em_andamento', 'concluido', 'cancelado') — o
-- mesmo padrão do resto do projeto.
--
-- Achado testando "Iniciar Teste" via Playwright (2026-07-05): o insert
-- falhava com "new row for relation creative_tests violates check
-- constraint creative_tests_status_check" (23514) — ou seja, essa
-- funcionalidade nunca funcionou de fato em produção, mesmo depois de
-- corrigir o bug de nome de tabela (notion_creativos -> notion_creatives)
-- em useCreativeTests.ts. A constraint em si tinha ficado fora de
-- sincronia com o código em algum momento (nenhuma migration no repo
-- define os valores em inglês — mudança feita fora do fluxo de migrations).
--
-- As 2 linhas existentes com status='running' são artefatos de teste de
-- outra sessão de debug ("codex-status-probe"/"Codex probe AB"), sem
-- atividade real — migradas pra 'cancelado'.

-- Constraint precisa ser trocada ANTES do UPDATE — a constraint antiga
-- (só inglês) bloquearia até a atualização pros valores em português.
ALTER TABLE creative_tests DROP CONSTRAINT IF EXISTS creative_tests_status_check;
ALTER TABLE creative_tests ADD CONSTRAINT creative_tests_status_check
    CHECK (status IN ('em_andamento', 'concluido', 'cancelado', 'running', 'completed', 'cancelled', 'paused'));

UPDATE creative_tests SET status = 'cancelado' WHERE status NOT IN ('em_andamento', 'concluido', 'cancelado');

-- Depois de migrar os dados, restringe de vez só aos valores em português
-- (os em inglês eram drift, nunca usados pelo código do app).
ALTER TABLE creative_tests DROP CONSTRAINT creative_tests_status_check;
ALTER TABLE creative_tests ADD CONSTRAINT creative_tests_status_check
    CHECK (status IN ('em_andamento', 'concluido', 'cancelado'));

NOTIFY pgrst, 'reload schema';
