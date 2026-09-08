-- Contadores operacionais para detectar defasagem entre GHL e banco por contato.
-- `total_oportunidades_db` pode ser backfillado localmente na migration.
-- `total_oportunidades_ghl` depende da reconciliação noturna via API GHL.

ALTER TABLE contatos
ADD COLUMN IF NOT EXISTS total_oportunidades_ghl INTEGER,
ADD COLUMN IF NOT EXISTS total_oportunidades_db INTEGER;

COMMENT ON COLUMN contatos.total_oportunidades_ghl IS
'Quantidade de oportunidades que a API do GHL informou para o contato na última reconciliação write.';

COMMENT ON COLUMN contatos.total_oportunidades_db IS
'Quantidade de oportunidades encontradas no banco para o contato na última reconciliação write. Backfill inicial feito via SQL local.';

UPDATE contatos c
SET total_oportunidades_db = COALESCE((
  SELECT COUNT(*)
  FROM oportunidades o
  WHERE o.contato_id = c.id
), 0);
