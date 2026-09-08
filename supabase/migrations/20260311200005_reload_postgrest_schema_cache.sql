-- Trigger PostgREST schema cache reload
-- Necessário após adicionar novas colunas para que a API REST as reconheça
NOTIFY pgrst, 'reload schema';
