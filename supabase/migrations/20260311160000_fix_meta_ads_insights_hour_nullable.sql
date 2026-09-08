-- Correção: coluna hour tinha NOT NULL constraint implícita no banco.
-- Como o sync diário não popula hour (sem breakdown horário real da Meta API),
-- a coluna precisa aceitar NULL.
ALTER TABLE meta_ads_insights ALTER COLUMN hour DROP NOT NULL;
