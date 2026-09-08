-- Separação de horários: respostas (inbound) vs follow-up (outbound proativo)

ALTER TABLE sdr_ia_bots
  -- Horário de resposta (quando o lead escreve primeiro)
  ADD COLUMN IF NOT EXISTS resposta_horario_restrito BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS resposta_hora_inicio TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS resposta_hora_fim TEXT DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS resposta_dias_semana INTEGER[] DEFAULT '{2,3,4,5,6}',
  -- Horário de follow-up (mensagens proativas do bot)
  ADD COLUMN IF NOT EXISTS follow_up_hora_inicio TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS follow_up_hora_fim TEXT DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS follow_up_dias_semana INTEGER[] DEFAULT '{2,3,4,5,6}';

-- Migrar dados existentes: copiar hora_inicio/fim e dias_semana para ambos os novos campos
UPDATE sdr_ia_bots
SET
  resposta_hora_inicio = COALESCE(hora_inicio, '08:00'),
  resposta_hora_fim = COALESCE(hora_fim, '20:00'),
  resposta_dias_semana = COALESCE(dias_semana, '{2,3,4,5,6}'),
  follow_up_hora_inicio = COALESCE(hora_inicio, '08:00'),
  follow_up_hora_fim = COALESCE(hora_fim, '20:00'),
  follow_up_dias_semana = COALESCE(dias_semana, '{2,3,4,5,6}'),
  resposta_horario_restrito = true;

-- Campo para contar follow-ups enviados na conversa
ALTER TABLE sdr_ia_conversas
  ADD COLUMN IF NOT EXISTS follow_ups_enviados INTEGER DEFAULT 0;

-- Adicionar comentários para documentação
COMMENT ON COLUMN sdr_ia_bots.resposta_horario_restrito IS 'Se false, o bot responde mensagens inbound a qualquer dia/hora. Se true, respeita resposta_hora_inicio/fim e resposta_dias_semana.';
COMMENT ON COLUMN sdr_ia_bots.resposta_hora_inicio IS 'Horário mais cedo para responder mensagens inbound (quando resposta_horario_restrito=true).';
COMMENT ON COLUMN sdr_ia_bots.resposta_hora_fim IS 'Horário mais tarde para responder mensagens inbound (quando resposta_horario_restrito=true).';
COMMENT ON COLUMN sdr_ia_bots.resposta_dias_semana IS 'Dias da semana para responder inbound: 1=dom, 2=seg, ..., 7=sab.';
COMMENT ON COLUMN sdr_ia_bots.follow_up_hora_inicio IS 'Horário mais cedo para enviar follow-ups proativos.';
COMMENT ON COLUMN sdr_ia_bots.follow_up_hora_fim IS 'Horário mais tarde para enviar follow-ups proativos.';
COMMENT ON COLUMN sdr_ia_bots.follow_up_dias_semana IS 'Dias da semana para follow-up: 1=dom, 2=seg, ..., 7=sab.';
