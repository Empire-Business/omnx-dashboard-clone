-- Migration: sdr_ia_crons_e_reset_janela
-- Criado em: 2026-06-01
--
-- 1. Cron do orchestrator SDR IA (a cada 2 minutos)
--    Sem isso: follow-ups nunca rodam e o dead man's switch nao verifica retries
--
-- 2. Funcao + cron de reset da janela 24h (a cada 30 minutos)
--    Sem isso: bot para de responder para sempre apos atingir max_mensagens_por_janela_24h
--
-- ⚠️ Seguranca: configure o anon key do projeto em app.settings.supabase_anon_key
--    antes de aplicar esta migration (ex.: ALTER DATABASE ... SET app.settings.supabase_anon_key = '<SEU_ANON_KEY>';)
--    NUNCA commite tokens reais neste arquivo.

-- Funcao de reset da janela 24h
CREATE OR REPLACE FUNCTION reset_sdr_ia_janela_expirada()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE sdr_ia_conversas
  SET
    janela_24h_ativa               = false,
    mensagens_ia_enviadas_na_janela = 0,
    follow_ups_enviados            = 0,
    updated_at                     = NOW()
  WHERE
    status = 'ativo'
    AND janela_24h_ativa = true
    AND (
      ultima_mensagem_inbound_at IS NULL
      OR ultima_mensagem_inbound_at < NOW() - INTERVAL '24 hours'
    );
END;
$$;

-- Cron do orchestrator (a cada 2 minutos)
SELECT cron.schedule(
  'sdr-ia-orchestrator-cron',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sdr-ia-orchestrator',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.supabase_anon_key', true), '<REMOVED: CONFIGURE_IN_ENV>')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Cron de reset da janela (a cada 30 minutos)
SELECT cron.schedule(
  'sdr-ia-reset-janela-cron',
  '*/30 * * * *',
  $$ SELECT reset_sdr_ia_janela_expirada(); $$
);
