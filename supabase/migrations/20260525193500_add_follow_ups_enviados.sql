-- Adiciona contador de follow-ups na conversa
ALTER TABLE sdr_ia_conversas
  ADD COLUMN IF NOT EXISTS follow_ups_enviados INTEGER DEFAULT 0;
