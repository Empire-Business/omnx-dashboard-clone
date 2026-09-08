-- ============================================================
-- Migration: 20260708000005
-- Substitui a trigger auto_extrair_dados_ghl para chamar
-- extrair_dados_ghl_v2 em vez de extrair_dados_ghl (v1).
--
-- PRE-REQUISITO:
--   - extrair_dados_ghl_v2 validada (migration 20260708000003)
--   - Testes comparativos demonstraram equivalencia (migration 20260708000004)
--   - ghl_field_mappings seedado para o workspace atual (migration 20260708000002)
--
-- A trigger mantem a sincronizacao de tags via sync_tags_from_webhook_target.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_extrair_dados_ghl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_contact_ghl_id TEXT;
  v_type           TEXT;
BEGIN
  v_type := NEW.payload->>'type';

  -- Passo 1: processar dados do webhook (contatos, opps) usando mapeamentos configuraveis
  PERFORM public.extrair_dados_ghl_v2(NEW.id);

  -- Passo 2: processar tasks do GHL (mantido da migration 20260511000006)
  IF v_type IN ('TaskCreate', 'TaskUpdate', 'TaskComplete', 'TaskDelete') THEN
    PERFORM public.processar_task_ghl(NEW.id);
  END IF;

  -- Passo 3: sincronizar tags do contato imediatamente
  v_contact_ghl_id := TRIM(NEW.payload->>'contact_id');
  IF v_contact_ghl_id IS NOT NULL AND v_contact_ghl_id != '' THEN
    PERFORM public.sync_tags_from_webhook_target(v_contact_ghl_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_extrair_dados_ghl() IS
'Trigger function: apos cada INSERT em webhooks_ghl, chama extrair_dados_ghl_v2(NEW.id) para processar contatos/opps usando mapeamentos por workspace, processar_task_ghl() para eventos de task, e sync_tags_from_webhook_target() para garantir que contatos.tags reflita o webhook mais recente com tags.';
