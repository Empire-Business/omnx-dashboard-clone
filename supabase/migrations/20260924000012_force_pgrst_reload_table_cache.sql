-- ============================================================
-- Migration: 20260924000012
-- Força invalidação do cache do PostgREST para a tabela
-- weekly_email_schedules após adicionar email_format.
-- ============================================================
SET search_path = public, pg_catalog;

-- Alterar o comentário da tabela força o PostgREST a recarregar o schema cache
COMMENT ON TABLE public.weekly_email_schedules IS
  'Agendamentos de e-mails de relatório. Última alteração: adicionado email_format.';

-- Também altera comentários das funções para invalidar seus caches
COMMENT ON FUNCTION public.list_weekly_email_schedules() IS
  'Lista agendamentos com email_format.';
COMMENT ON FUNCTION public.create_weekly_email_schedule(TEXT,TEXT,TEXT[],TEXT,TEXT,INTEGER,INTEGER,TIME,TEXT,TEXT[],TEXT,TEXT,BOOLEAN,BOOLEAN,TEXT,BOOLEAN,TEXT) IS
  'Cria agendamento com email_format.';
COMMENT ON FUNCTION public.update_weekly_email_schedule(UUID,TEXT,TEXT,BOOLEAN,TEXT[],TEXT,TEXT,INTEGER,INTEGER,TIME,TEXT,TEXT[],TEXT,TEXT,BOOLEAN,BOOLEAN,TEXT,BOOLEAN,TEXT) IS
  'Atualiza agendamento com email_format.';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
