-- Migration: Reset do last_appointment_sync_at para forçar reprocessamento
-- Objetivo: popular agendamento_origem (IA vs humano) nas oportunidades que
-- já têm data de agendamento, mas ainda não foram sincronizadas com a versão
-- nova da edge function sync-appointment-dates.
--
-- A edge function roda a cada 5 minutos via cron e vai reprocessar essas
-- oportunidades gradualmente, preenchendo agendamento_origem e metadados.

UPDATE public.oportunidades
SET last_appointment_sync_at = NULL
WHERE (
  data_agendamento_reuniao IS NOT NULL
  OR data_agendamento_vendas IS NOT NULL
  OR data_reuniao_agendada IS NOT NULL
)
AND (pipeline_id IS NULL OR pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L');
