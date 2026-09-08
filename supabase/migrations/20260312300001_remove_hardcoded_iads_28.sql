-- Remove iads-28 inserted via hardcode in migration (20260312100007).
-- utm_sources should be managed via the Traqueamento UI, not via migrations.
DELETE FROM utm_sources WHERE utm_source = 'iads-28';
