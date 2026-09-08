-- Migration: Adicionar link_gravacao_call à oportunidades
-- Campo GHL: {{opportunity.op_link_da_gravacao_da_call_de_vendas}}
-- Usado na aba "Reuniões" do módulo Vendas.
--
-- ⚠️ ANTES DE APLICAR: verificar o nome exato da chave no payload GHL:
--   SELECT DISTINCT jsonb_object_keys(payload->'customData') AS key
--   FROM webhooks_ghl
--   WHERE payload->'customData' ? 'alguma_chave_com_gravacao'
--   LIMIT 20;
--
-- Ou buscar o campo diretamente:
--   SELECT DISTINCT payload->'customData'->>'{{opportunity.op_link_da_gravacao_da_call_de_vendas}}'
--   FROM webhooks_ghl
--   WHERE payload->'customData'->>'{{opportunity.op_link_da_gravacao_da_call_de_vendas}}' IS NOT NULL
--   LIMIT 5;

-- 1. Adicionar coluna
ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS link_gravacao_call TEXT;

COMMENT ON COLUMN oportunidades.link_gravacao_call IS
  'Link da gravação da call de vendas. Extraído do campo {{opportunity.op_link_da_gravacao_da_call_de_vendas}} do GHL.';

-- 2. Atualizar função extrair_dados_ghl para capturar o campo
-- (Substituir a função completa ou usar a versão mais recente como base)
-- A extração segue o mesmo padrão de outros campos customData:
--
--   v_link_gravacao := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_da_gravacao_da_call_de_vendas}}'), '');
--
-- E no INSERT/UPDATE de oportunidades:
--   link_gravacao_call = COALESCE(v_link_gravacao, o.link_gravacao_call)
--
-- ATENÇÃO: Esta migration apenas cria a coluna.
-- A extração via trigger será feita em migration separada após confirmar o nome da chave no GHL.
-- Para backfill, executar:
--   UPDATE oportunidades o
--   SET link_gravacao_call = sub.link
--   FROM (
--     SELECT
--       payload->>'opportunity_id' AS ghl_id,
--       NULLIF(TRIM(payload->'customData'->>'{{opportunity.op_link_da_gravacao_da_call_de_vendas}}'), '') AS link
--     FROM webhooks_ghl
--     WHERE NULLIF(TRIM(payload->'customData'->>'{{opportunity.op_link_da_gravacao_da_call_de_vendas}}'), '') IS NOT NULL
--   ) sub
--   JOIN contatos c ON c.ghl_id = sub.ghl_id -- ajustar join conforme estrutura real
--   WHERE o.link_gravacao_call IS NULL;
