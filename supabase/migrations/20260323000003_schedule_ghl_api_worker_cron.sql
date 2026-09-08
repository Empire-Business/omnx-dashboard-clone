-- ============================================================
-- Migration: Cron job para ghl-api-worker (processa fila ghl_api_jobs)
--
-- O worker roda a cada 1 minuto, pegando os próximos jobs pendentes
-- da fila ghl_api_jobs e executando-os com rate limit centralizado.
--
-- Frequência: 1 min (processa jobs urgentes em até 60s como fallback;
-- webhooks urgentes podem chamar o worker diretamente via HTTP)
-- ============================================================

-- Criar função wrapper (padrão das outras funções do projeto)
CREATE OR REPLACE FUNCTION ghl_api_worker_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/ghl-api-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{"max_jobs": 50}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

-- Remover cron existente se houver (idempotente)
SELECT cron.unschedule('ghl-api-worker-cron') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ghl-api-worker-cron'
);

-- Criar cron: a cada 1 minuto
SELECT cron.schedule(
  'ghl-api-worker-cron',
  '* * * * *',
  'SELECT ghl_api_worker_job()'
);

-- Verificação
DO $$
BEGIN
  RAISE NOTICE 'Cron ghl-api-worker-cron criado. Agenda: * * * * * (a cada 1 minuto)';
END;
$$;
