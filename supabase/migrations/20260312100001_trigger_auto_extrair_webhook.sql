-- ============================================================
-- Migration: Trigger automático para extrair dados de webhooks GHL
-- Problema: extrair_dados_ghl() nunca era chamado automaticamente.
--           Todo webhook ficava em webhooks_ghl sem ser processado.
-- Solução: trigger AFTER INSERT em webhooks_ghl que chama
--          extrair_dados_ghl(NEW.id) imediatamente.
-- Data: 2026-03-12
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_extrair_dados_ghl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM extrair_dados_ghl(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_extrair_dados_ghl ON webhooks_ghl;

CREATE TRIGGER auto_extrair_dados_ghl
AFTER INSERT ON webhooks_ghl
FOR EACH ROW EXECUTE FUNCTION trigger_extrair_dados_ghl();

COMMENT ON FUNCTION trigger_extrair_dados_ghl IS
'Trigger function: chama extrair_dados_ghl(NEW.id) após cada INSERT em webhooks_ghl.
Garante que contatos, oportunidades e vendas_fechamento sejam atualizados em tempo real.';
