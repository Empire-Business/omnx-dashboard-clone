-- Alterar timezone para Brasil (America/Sao_Paulo)
-- Todos os horários serão armazenados no horário de Brasília

-- Criar função que retorna horário de Brasília
CREATE OR REPLACE FUNCTION now_brasil()
RETURNS timestamptz AS $$
BEGIN
    RETURN timezone('America/Sao_Paulo', now());
END;
$$ LANGUAGE plpgsql;

-- Alterar tabela para usar horário de Brasília
ALTER TABLE webhooks_ghl 
    ALTER COLUMN created_at SET DEFAULT timezone('America/Sao_Paulo', now());

-- Comentário explicativo
COMMENT ON TABLE webhooks_ghl IS 'Armazena webhooks recebidos do GoHighLevel (GHL) - Horário: America/Sao_Paulo (Brasil)';
