-- Remover coluna created_at das tabelas contatos e oportunidades
-- Motivo: O campo created_at causava confusão com a data de criação real do contato/oportunidade
-- A data de criação real já está documentada e mapeada em outra coluna

-- Remover created_at da tabela contatos
ALTER TABLE contatos DROP COLUMN IF EXISTS created_at;

-- Remover created_at da tabela oportunidades
ALTER TABLE oportunidades DROP COLUMN IF EXISTS created_at;

-- Comentários explicativos
COMMENT ON TABLE contatos IS 'Contatos extraídos dos webhooks GHL - data de criação real vem do GHL';
COMMENT ON TABLE oportunidades IS 'Oportunidades extraídas dos webhooks GHL - data de criação real vem do GHL (date_created)';
