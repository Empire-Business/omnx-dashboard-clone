-- ============================================================================
-- Seed de privilegios (GRANTs) para o AMBIENTE DE TESTE de isolamento.
-- Projeto alvo: SOMENTE o projeto de TESTE (hoje fgjbmdsucruvtpywyhhf).
-- NUNCA aplicar em producao.
-- ============================================================================
--
-- Por que existe:
--   O schema de teste e reproduzido a partir de um dump de producao gerado com
--   `--no-owner --no-privileges`, e NENHUMA migration do repo declara GRANTs
--   (verificado em 2026-07-09: 0 linhas "grant" em supabase/migrations).
--   Em producao esses GRANTs existem (criados pelo template do Supabase / fora
--   das migrations). Sem eles, o role `authenticated` recebe 42501 em qualquer
--   SELECT — mesmo sendo dono do dado.
--
-- Por que e seguro:
--   GRANT so permite que a query CHEGUE a tabela. A policy de RLS
--   (USING / WITH CHECK) continua decidindo linha a linha. Sem policy
--   permissiva, `authenticated` com GRANT ainda ve 0 linhas / nao consegue
--   escrever. Isto replica o que producao ja tem e NAO afrouxa RLS.
--
-- Como aplicar (psql apontando para o projeto de TESTE):
--   psql "$TEST_DB_URL" -v ON_ERROR_STOP=0 -f __tests__/fixtures/test-db-grants.sql
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Recarrega o schema cache do PostgREST (projetos remotos).
NOTIFY pgrst, 'reload schema';
