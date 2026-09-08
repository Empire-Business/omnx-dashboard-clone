-- Migration: Adicionar regras de PARADA (stop conditions) ao bot SDR IA
-- Quando o lead tem determinadas tags, pipelines ou stages, o bot NÃO deve atuar

alter table sdr_ia_bots
  add column if not exists tags_bloqueio jsonb default '[]'::jsonb,
  add column if not exists pipelines_bloqueio jsonb default '[]'::jsonb,
  add column if not exists stages_bloqueio jsonb default '[]'::jsonb,
  add column if not exists stop_reason_log text default null;

comment on column sdr_ia_bots.tags_bloqueio is 'Lista de tags que bloqueiam o bot (ex: ["human-handover", "desativa-sdr-ia", "nao-ligar"]). Se o lead tiver QUALQUER uma dessas tags, o bot para.';
comment on column sdr_ia_bots.pipelines_bloqueio is 'Lista de nomes de pipeline que bloqueiam o bot (ex: ["Perdido", "Fechado", "Arquivado"]). Se o lead estiver em QUALQUER um desses pipelines, o bot para.';
comment on column sdr_ia_bots.stages_bloqueio is 'Lista de nomes de stage que bloqueiam o bot (ex: ["Agendado", "NoShow", "Perdido"]). Se o lead estiver em QUALQUER um desses stages, o bot para.';
comment on column sdr_ia_bots.stop_reason_log is 'Último motivo de parada registrado (para debug)';
