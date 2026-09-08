-- ============================================================
-- Migration: Trigger para disparar sync-opp-dates ao inserir
--
-- Quando uma nova oportunidade chega via webhook com:
--   - data_lead_recebido = NULL
--   - ghl_opportunity_id = NOT NULL
--
-- Dispara a função sync_opp_dates_job() IMEDIATAMENTE.
--
-- Complementa o cron de 10 minutos com trigger síncrono:
--   - Cron: fallback para oportunidades que chegaram enquanto o
--     trigger estava desativado ou para retry automático
--   - Trigger: dispara imediatamente quando webhook chega
--
-- Rate limit: trigger executa uma vez por INSERT. Se houver
-- muitos inserts simultâneos, a função interna trata rate limit
-- da API GHL automaticamente.
-- ============================================================

-- Função trigger que dispara o sync quando oportunidade
-- nova chega com data_lead_recebido vazia
CREATE OR REPLACE FUNCTION trigger_sync_opp_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só dispara se é INSERT com data_lead_recebido NULL e ghl_opportunity_id preenchido
  IF TG_OP = 'INSERT'
     AND NEW.data_lead_recebido IS NULL
     AND NEW.ghl_opportunity_id IS NOT NULL
  THEN
    -- Dispara sync_opp_dates_job() assincronamente (non-blocking)
    -- A função interna trata rate limit da API GHL
    PERFORM sync_opp_dates_job();
  END IF;

  RETURN NEW;
END;
$$;

-- Remover trigger anterior se existir (idempotente)
DROP TRIGGER IF EXISTS tr_sync_opp_dates_on_insert ON oportunidades;

-- Criar trigger: AFTER INSERT na tabela oportunidades
CREATE TRIGGER tr_sync_opp_dates_on_insert
AFTER INSERT ON oportunidades
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_opp_dates();

-- Verificação
DO $$
BEGIN
  RAISE NOTICE 'Trigger sync-opp-dates criado. Dispara ao inserir oportunidade com data_lead_recebido NULL.';
END;
$$;
