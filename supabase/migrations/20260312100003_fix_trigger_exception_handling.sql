-- ============================================================
-- Migration: Fix trigger — exception handling resiliente
-- Problema: se extrair_dados_ghl() lançar exceção, toda a
--           transação de INSERT em webhooks_ghl faz rollback,
--           perdendo o webhook silenciosamente.
-- Solução: bloco EXCEPTION aninhado captura o erro e emite
--          WARNING sem reverter o INSERT do webhook.
-- Data: 2026-03-12
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_extrair_dados_ghl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM extrair_dados_ghl(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'extrair_dados_ghl failed for webhook %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_extrair_dados_ghl IS
'Trigger function: chama extrair_dados_ghl(NEW.id) após cada INSERT em webhooks_ghl.
Falhas na extração emitem WARNING mas NÃO revertem o INSERT do webhook.
Garante que nenhum payload seja perdido por erro de extração.';
