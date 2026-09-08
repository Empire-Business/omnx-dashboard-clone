-- Migration: Remove a integração OpenClaw (decisão do dono — 2026-07-11)
--
-- CONTEXTO
--   O dono decidiu descontinuar a integração com o OpenClaw (webhook de notificação
--   quando um contrato é assinado). Esta migration remove todo o mecanismo de
--   disparo/retry, mas preserva:
--     1) os dados de negócio em vendas_fechamento (op_link_do_contrato_assinado,
--        data_da_assinatura_do_contrato, dados financeiros etc.) — usados no
--        LeadCard/useLeads e em relatórios, independente do OpenClaw;
--     2) a infraestrutura genérica de outbound_webhooks (public.outbound_webhooks,
--        assert_outbound_url_safe, register_outbound_webhook) — reutilizável para
--        qualquer webhook futuro, testada em outbound-webhooks-isolation.test.ts;
--     3) o trigger extrair_vendas_fechamento_do_webhook() (extração geral de dados
--        de venda a partir de qualquer webhook GHL) — NÃO é específico do OpenClaw,
--        apenas teve sua condição de guarda ampliada em 2026-03-23 para não ignorar
--        o webhook do OpenClaw quando ele ainda existia; a guarda ampliada continua
--        correta e inofensiva para qualquer webhook futuro que traga só link+data.
--
--   Mapeamento completo do que foi removido/preservado: ver
--   docs/REMOCAO-OPENCLAW.md.
--
-- ⚠️ APLICAR APENAS NO BANCO DE TESTE (fgjbmdsucruvtpywyhhf).
--   NÃO aplicar em produção (qzesffnkqgelmtfblzkr) sem autorização explícita do dono
--   — ver docs/REMOCAO-OPENCLAW.md seção "Estado em produção".

-- ============================================================================
-- 1) Desagendar o cron de retry (idempotente — só desagenda se existir)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openclaw-contrato-assinado-retry') THEN
    PERFORM cron.unschedule('openclaw-contrato-assinado-retry');
  END IF;
END;
$$;

-- ============================================================================
-- 2) Remover os triggers que disparam a notificação
-- ============================================================================
DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;
DROP TRIGGER IF EXISTS tr_zz_notify_openclaw_assinada ON public.webhooks_ghl;

-- ============================================================================
-- 3) Remover as funções específicas do mecanismo OpenClaw
-- ============================================================================
DROP FUNCTION IF EXISTS public.notify_openclaw_contrato_assinado();
DROP FUNCTION IF EXISTS public.notify_openclaw_contrato_assinado_por_stage();
DROP FUNCTION IF EXISTS public.processar_notificacao_openclaw_contrato_assinado(uuid, text, date);
DROP FUNCTION IF EXISTS public.sincronizar_status_openclaw_contrato_assinado(integer);
DROP FUNCTION IF EXISTS public.reenfileirar_openclaw_contrato_assinado_pendentes(integer);
DROP FUNCTION IF EXISTS public.processar_openclaw_contrato_assinado_job();
DROP FUNCTION IF EXISTS public.listar_openclaw_respostas_recentes(integer);

-- ============================================================================
-- 4) Remover o índice de suporte e as colunas operacionais em oportunidades
--    (puramente operacionais do mecanismo — sem uso de negócio fora dele,
--    confirmado por varredura no frontend e nas demais funções PL/pgSQL)
-- ============================================================================
DROP INDEX IF EXISTS public.idx_oportunidades_openclaw_pendentes;

ALTER TABLE public.oportunidades
  DROP COLUMN IF EXISTS openclaw_notificado_em,
  DROP COLUMN IF EXISTS openclaw_request_id,
  DROP COLUMN IF EXISTS openclaw_enfileirado_em,
  DROP COLUMN IF EXISTS openclaw_ultima_resposta_em,
  DROP COLUMN IF EXISTS openclaw_ultimo_status_code,
  DROP COLUMN IF EXISTS openclaw_ultimo_erro;

-- ============================================================================
-- 5) Remover o registro de webhook de saída do OpenClaw (dado, não schema).
--    A infraestrutura genérica outbound_webhooks/vault permanece — só a linha
--    de configuração some. O segredo correspondente no vault fica órfão (não
--    é referenciado por nenhuma linha), mas inofensivo: sem custo de manter,
--    e fora do escopo desta migration remover segredos do vault.
-- ============================================================================
DELETE FROM public.outbound_webhooks WHERE event_key = 'contrato_assinado';
