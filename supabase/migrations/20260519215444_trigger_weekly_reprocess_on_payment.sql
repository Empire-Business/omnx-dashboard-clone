-- Migration: Trigger para reprocessamento cohort quando pagamento é confirmado
-- Data: 2026-05-19
-- Objetivo: Ao preencher data_pagamento_entrada em vendas_fechamento,
--           enfileira a semana cohort correspondente para reprocessamento.
--           Evita duplicados via ON CONFLICT na constraint uq_weekly_reprocess_queue.

-- =============================================================================
-- 1. FUNÇÃO DO TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_weekly_reprocess_on_payment_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_lead TIMESTAMPTZ;
  v_week_start DATE;
BEGIN
  -- Só executa quando data_pagamento_entrada foi preenchida (não nula)
  -- e o registro tem oportunidade associada
  IF NEW.data_pagamento_entrada IS NOT NULL AND NEW.oportunidade_id IS NOT NULL THEN
    -- Busca data_lead_recebido da oportunidade associada
    SELECT o.data_lead_recebido
    INTO v_data_lead
    FROM public.oportunidades o
    WHERE o.id = NEW.oportunidade_id;

    -- Se encontrou data_lead_recebido, calcula a segunda-feira da semana
    IF v_data_lead IS NOT NULL THEN
      v_week_start := v_data_lead::date - ((EXTRACT(DOW FROM v_data_lead::date)::int + 6) % 7);

      -- Insere na fila de reprocessamento (evita duplicados)
      INSERT INTO public.weekly_reprocess_queue (week_start, report_type, reason, priority)
      VALUES (v_week_start, 'cohort', 'new_payment', 10)
      ON CONFLICT (week_start, report_type, reason) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. TRIGGER
-- =============================================================================

DROP TRIGGER IF EXISTS tr_weekly_reprocess_on_payment ON public.vendas_fechamento;
CREATE TRIGGER tr_weekly_reprocess_on_payment
  AFTER INSERT OR UPDATE OF data_pagamento_entrada ON public.vendas_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_weekly_reprocess_on_payment_fn();

-- =============================================================================
-- 3. VERIFICAÇÃO
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Trigger tr_weekly_reprocess_on_payment criado ===';
  RAISE NOTICE 'Tabela: vendas_fechamento';
  RAISE NOTICE 'Evento: INSERT ou UPDATE de data_pagamento_entrada';
  RAISE NOTICE 'Ação: insere na weekly_reprocess_queue (cohort, new_payment, priority=10)';
END;
$$;
