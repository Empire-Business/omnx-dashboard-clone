-- Migration: 20260326100000
-- Adiciona coluna last_appointment_sync_at em oportunidades
-- Usada pela edge function sync-appointment-dates para rastrear quando
-- o último sync de appointments foi feito para cada oportunidade.

ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS last_appointment_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN oportunidades.last_appointment_sync_at IS
  'Timestamp do último sync bem-sucedido de appointments via API GHL (sync-appointment-dates). '
  'NULL = nunca sincronizado.';
