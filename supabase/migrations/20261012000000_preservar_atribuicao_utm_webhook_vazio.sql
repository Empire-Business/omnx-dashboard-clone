-- =====================================================================
-- FIX CRÍTICO: webhook com UTM vazia apagava a atribuição do lead
-- =====================================================================
--
-- SINTOMA (reportado pelo gestor de tráfego em 2026-08-03):
--   Campanha "CA_AGO26_CAPTACAO_LEAD_QUENTE" (Código da Audiência, PG58 /
--   utm_campaign 58) mostrava 62 leads no gerenciador do Meta e apenas 26
--   na dash no mesmo período (30/07 a 02/08).
--
-- CAUSA RAIZ:
--   O GHL dispara webhooks de ATUALIZAÇÃO do mesmo contato alguns minutos
--   após a criação, e nesses webhooks os campos utm_* chegam como string
--   VAZIA. A função extrair_dados_ghl() grava:
--
--       utm_source = COALESCE(NULLIF(TRIM(payload->>'utm_source'), ''),
--                             NULLIF(TRIM(lastAttributionSource->>'utmSource'), ''))
--
--   ou seja: sem valor no webhook => NULL => a atribuição já gravada é
--   APAGADA. O lead continua no banco e no pipeline; ele apenas perde a
--   origem e some dos relatórios de tráfego.
--
--   Prova (contato E0aRiR1ss9TCUcX38GJm, Camila Marchi, 2026-08-03):
--     10:19:39  utm_source=iads-25  utm_campaign=58
--     10:19:46  utm_source=iads-25  utm_campaign=58
--     10:29:43  utm_source=''       utm_campaign=''   <- apagou
--
-- POR QUE UM TRIGGER E NÃO A EDIÇÃO DA FUNÇÃO:
--   extrair_dados_ghl() tem ~30 KB em produção e já divergiu do arquivo
--   versionado (drift). Reescrevê-la inteira para corrigir 5 atribuições
--   colocaria em risco todo o caminho de ingestão. O guard abaixo é
--   aditivo, cobre QUALQUER caminho de escrita (função, cron, edge
--   function, backfill) e é revertido com um único DROP TRIGGER.
--
-- REGRA APLICADA:
--   Valor novo preenchido      -> grava (re-atribuição continua funcionando,
--                                 conforme docs/CLAUDE.md "webhook é a
--                                 fonte de verdade").
--   Valor novo NULL/vazio E
--   valor antigo preenchido    -> preserva o antigo (não apaga).
--
-- REVERSÃO:
--   DROP TRIGGER IF EXISTS trg_preservar_atribuicao_contato ON public.contatos;
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.preservar_atribuicao_contato()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    -- UTM (campanha / criativo / página)
    NEW.utm_source     := COALESCE(NULLIF(TRIM(NEW.utm_source), ''),     OLD.utm_source);
    NEW.utm_medium     := COALESCE(NULLIF(TRIM(NEW.utm_medium), ''),     OLD.utm_medium);
    NEW.utm_campaign   := COALESCE(NULLIF(TRIM(NEW.utm_campaign), ''),   OLD.utm_campaign);
    NEW.utm_term       := COALESCE(NULLIF(TRIM(NEW.utm_term), ''),       OLD.utm_term);
    NEW.utm_content    := COALESCE(NULLIF(TRIM(NEW.utm_content), ''),    OLD.utm_content);
    NEW.utm_keyword    := COALESCE(NULLIF(TRIM(NEW.utm_keyword), ''),    OLD.utm_keyword);
    NEW.utm_matchtype  := COALESCE(NULLIF(TRIM(NEW.utm_matchtype), ''),  OLD.utm_matchtype);

    -- TT_* (espelho de atribuição vindo do GHL, com IDs do Meta)
    NEW.tt_source      := COALESCE(NULLIF(TRIM(NEW.tt_source), ''),      OLD.tt_source);
    NEW.tt_medium      := COALESCE(NULLIF(TRIM(NEW.tt_medium), ''),      OLD.tt_medium);
    NEW.tt_campaign    := COALESCE(NULLIF(TRIM(NEW.tt_campaign), ''),    OLD.tt_campaign);
    NEW.tt_term        := COALESCE(NULLIF(TRIM(NEW.tt_term), ''),        OLD.tt_term);
    NEW.tt_content     := COALESCE(NULLIF(TRIM(NEW.tt_content), ''),     OLD.tt_content);

    -- Identificadores de anúncio / clique
    NEW.ad_id          := COALESCE(NULLIF(TRIM(NEW.ad_id), ''),          OLD.ad_id);
    NEW.ad_name        := COALESCE(NULLIF(TRIM(NEW.ad_name), ''),        OLD.ad_name);
    NEW.ad_group_id    := COALESCE(NULLIF(TRIM(NEW.ad_group_id), ''),    OLD.ad_group_id);
    NEW.fbclid         := COALESCE(NULLIF(TRIM(NEW.fbclid), ''),         OLD.fbclid);
    NEW.gclid          := COALESCE(NULLIF(TRIM(NEW.gclid), ''),          OLD.gclid);
    NEW.gbraid         := COALESCE(NULLIF(TRIM(NEW.gbraid), ''),         OLD.gbraid);
    NEW.wbraid         := COALESCE(NULLIF(TRIM(NEW.wbraid), ''),         OLD.wbraid);
    NEW.referrer       := COALESCE(NULLIF(TRIM(NEW.referrer), ''),       OLD.referrer);
    NEW.url            := COALESCE(NULLIF(TRIM(NEW.url), ''),            OLD.url);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.preservar_atribuicao_contato() IS
'Guard de atribuição: impede que webhook GHL com utm_*/tt_* vazias apague a origem já gravada do lead. Valor novo preenchido sempre sobrescreve (re-atribuição preservada). Ver migration 20261012000000.';

DROP TRIGGER IF EXISTS trg_preservar_atribuicao_contato ON public.contatos;

CREATE TRIGGER trg_preservar_atribuicao_contato
    BEFORE UPDATE ON public.contatos
    FOR EACH ROW
    EXECUTE FUNCTION public.preservar_atribuicao_contato();
