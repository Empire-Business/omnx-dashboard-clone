-- Adiciona appointment_status: status REAL do appointment de referência no GHL.
--
-- Contexto: o painel de agendamentos tinha uma categoria "Sem status" para
-- agendamentos passados sem data_realizacao_vendas/data_no_show. Diagnóstico
-- direto na API do GHL mostrou que esses agendamentos TÊM status — na amostra:
-- 20 'confirmed', 5 'cancelled', 2 'noshow', 1 'new', 1 'showed'. O sync só
-- lia showed/noshow, então confirmed/new/cancelled caíam no limbo.
--
-- Esta coluna guarda o status exato que o GHL retorna (showed, completed,
-- noshow, confirmed, new, cancelled, invalid, rescheduled). É FATO, não
-- inferência. O painel usa para categorizar cada agendamento numa categoria
-- clara (Realizada / No-show / Cancelada / A acontecer / Aguardando desfecho),
-- fechando a conta sem deixar ninguém "sem status" e sem inventar desfecho.

ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS appointment_status text;

CREATE INDEX IF NOT EXISTS idx_oportunidades_appointment_status
  ON oportunidades (appointment_status);

COMMENT ON COLUMN oportunidades.appointment_status IS
  'Status real do appointment de referência no GHL (showed/completed/noshow/confirmed/new/cancelled/invalid/rescheduled). Fato do GHL; usado para categorizar agendamentos sem deixar "sem status".';
