-- Migration: índice parcial em oportunidades.sdr_name + trigger de reprocessamento
--
-- 1. ÍNDICE PARCIAL
--    O cron sync-opp-sdr consulta WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL.
--    Índice parcial garante que essa query seja O(pendentes) e não O(total).
--
-- 2. TRIGGER DE REPROCESSAMENTO
--    Quando contatos.owner_name muda via webhook (novo SDR atribuído no GHL),
--    todas as oportunidades daquele contato têm sdr_name resetado para NULL.
--    Isso sinaliza ao cron que deve re-chamar a API de followers para cada opp —
--    garantindo que cada oportunidade reflita o SDR correto independentemente.
--
--    Design intencional: o trigger usa UPDATE simples (sem pg_net / net.http_post).
--    Triggers row-level não devem fazer I/O externo — o cron cuida do reprocessamento.

-- --------------------------------------------------------
-- 1. Índice parcial para busca de opps sem SDR
-- --------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_oportunidades_sdr_name_null
  ON oportunidades (id)
  WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL;

-- --------------------------------------------------------
-- 2. Função + trigger: reset sdr_name quando owner_name do contato muda
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_sdr_name_on_owner_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só atua quando owner_name realmente mudou (IS DISTINCT FROM trata NULL corretamente)
  IF OLD.owner_name IS DISTINCT FROM NEW.owner_name THEN
    UPDATE oportunidades
    SET sdr_name = NULL
    WHERE contato_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_sdr_name_on_owner_change ON contatos;

CREATE TRIGGER trg_reset_sdr_name_on_owner_change
AFTER UPDATE OF owner_name ON contatos
FOR EACH ROW
EXECUTE FUNCTION reset_sdr_name_on_owner_change();

-- Verificação
DO $$
BEGIN
  RAISE NOTICE '=== sdr_name: índice + trigger criados ===';
  RAISE NOTICE 'Índice:  idx_oportunidades_sdr_name_null (parcial: sdr_name IS NULL)';
  RAISE NOTICE 'Trigger: trg_reset_sdr_name_on_owner_change em contatos.owner_name';
END;
$$;
