-- Migration: Cron job para sincronizar pipeline_id=NULL via sync-opp-pipelines
-- Data: 2026-03-21
-- Problema: Oportunidades que chegam sem pipeline_id ficam invisíveis nos painéis
-- Solução: A cada 10 minutos, buscar dados da API GHL e preencher campos faltantes

-- Nota: pg_cron deve estar habilitado via Supabase dashboard
-- (já está habilitado por padrão em novos projetos)

-- Criar novo job: executar a cada 10 minutos
-- Formato: '*/10 * * * *' (cron format)
-- Chama via HTTP POST para a edge function
-- Usando anon key para acesso público à edge function
SELECT cron.schedule(
  'sync-opp-pipelines-cron',
  '*/10 * * * *',
  $$
    SELECT
      net.http_post(
        url := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
        ),
        body := jsonb_build_object('batch_size', 100)
      ) AS request_id;
  $$
);

-- Log das execuções (opcional — comentado por padrão)
-- SELECT * FROM cron.job;
