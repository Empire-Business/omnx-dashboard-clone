-- Migration: remove crons órfãos que apontam para edge functions inexistentes
--
-- CONTEXTO
--   Achados registrados como tarefas separadas durante o item 1 do plano de
--   segurança pós-Fase 3 (docs/SEGURANCA-CRON-CALLER-GUARD.md): 4 jobs em
--   cron.job chamavam net.http_post/net.http_get contra edge functions que não
--   existem mais em supabase/functions/ (404 silencioso a cada execução, sem
--   risco de segurança prático, mas dívida técnica/ruído operacional):
--
--     reconcile-vendas-fechamento-cron -> /functions/v1/reconcile-vendas-fechamento
--     stevo-process-att1               -> /functions/v1/stevo-calls-sync?...instance=att1
--     stevo-process-att2               -> /functions/v1/stevo-calls-sync?...instance=att2
--     stevo-process-att3               -> /functions/v1/stevo-calls-sync?...instance=att3
--
--   O dono confirmou que nenhuma dessas integrações (reconciliação antiga de
--   vendas_fechamento; discador WhatsApp "Stevo") está mais em uso. Nenhuma
--   function correspondente existe no repositório para recriar.
--
-- O QUE ESTA MIGRATION FAZ
--   cron.unschedule() dos 4 jobs. Idempotente (WHERE EXISTS antes de
--   unschedule, mesmo padrão usado em todas as migrations de reschedule deste
--   projeto) — não falha se algum já tiver sido removido manualmente.

SELECT cron.unschedule('reconcile-vendas-fechamento-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-vendas-fechamento-cron');

SELECT cron.unschedule('stevo-process-att1')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att1');

SELECT cron.unschedule('stevo-process-att2')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att2');

SELECT cron.unschedule('stevo-process-att3')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att3');
