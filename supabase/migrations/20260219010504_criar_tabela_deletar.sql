-- Criar tabela DELETAR (teste de conexão MCP)
CREATE TABLE IF NOT EXISTS DELETAR (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text,
    criado_em timestamptz DEFAULT now()
);

-- Comentário na tabela
COMMENT ON TABLE DELETAR IS 'Tabela de teste criada via MCP - pode ser deletada';
