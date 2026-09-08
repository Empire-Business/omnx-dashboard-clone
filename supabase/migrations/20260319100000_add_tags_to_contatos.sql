-- Migration: adicionar coluna tags em contatos
-- Tags do contato no GHL (ex: "mql,[fn] aplicação,[cp] campanha")
-- Armazenadas como texto separado por vírgula
-- Preenchidas via edge function sync-contact-tags (GET /contacts/{ghl_id})

ALTER TABLE contatos ADD COLUMN IF NOT EXISTS tags TEXT;
