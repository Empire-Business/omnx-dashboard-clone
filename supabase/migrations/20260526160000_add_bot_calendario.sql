-- Migration: Adiciona calendário de agendamento ao bot (MVP v1)
-- A IA oferece o link de agendamento ao lead em vez de agendar automaticamente.

ALTER TABLE public.sdr_ia_bots
  ADD COLUMN IF NOT EXISTS calendario_link TEXT,
  ADD COLUMN IF NOT EXISTS calendario_nome TEXT DEFAULT 'Call de Diagnóstico';

COMMENT ON COLUMN public.sdr_ia_bots.calendario_link IS
  'URL do calendário de agendamento (ex: link do booking widget da GHL). Se preenchido, a IA pode oferecer este link ao lead.';

COMMENT ON COLUMN public.sdr_ia_bots.calendario_nome IS
  'Nome amigável do calendário que a IA usa ao oferecer (ex: "Call de Diagnóstico", "Discovery Call").';
