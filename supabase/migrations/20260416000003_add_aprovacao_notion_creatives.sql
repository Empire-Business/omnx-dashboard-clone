-- Adiciona colunas de aprovação na tabela notion_creatives
-- aprovado: null = não avaliado | true = aprovado | false = reprovado
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS aprovado BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_avaliacao TIMESTAMPTZ DEFAULT NULL;
