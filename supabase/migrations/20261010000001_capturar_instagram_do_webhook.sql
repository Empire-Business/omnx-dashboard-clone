-- ============================================================================
-- Captura do @ do Instagram vindo do GHL
-- ----------------------------------------------------------------------------
-- Contexto (2026-07-24): a pergunta "Qual é o seu @ do instagram?" CHEGA nos
-- webhooks do GHL (chave crua no payload, valor tipo "@fulano"), mas a extração
-- (extrair_dados_ghl_v2) NUNCA grava contatos.print_instagram, e o mapeamento
-- configuravel (apply_ghl_field_mappings) esta quebrado para esse campo. Por
-- isso print_instagram estava 100% vazio apesar do dado existir.
--
-- Correcao ISOLADA e ADITIVA (nao mexe na funcao central de 340 linhas):
--   Gatilho AFTER INSERT em webhooks_ghl que, quando o payload carrega a chave
--   do Instagram, grava o @ no contato correspondente (match por ghl_id).
--
-- Regras:
--   * NAO altera webhooks_ghl.payload (imutavel) — so escreve na tabela derivada
--     contatos.
--   * WHEN guard: so dispara em webhooks que tem a chave -> custo ~zero nos demais.
--   * Latest-wins: o @ mais novo prevalece (o lead pode corrigir o @). Ignora
--     lixo curto (ex.: "@" sozinho) exigindo >= 2 caracteres.
--   * Se o contato ainda nao existir (extracao e assincrona via cron), e no-op;
--     webhooks seguintes do mesmo lead preenchem. Leads ativos convergem.
--
-- OBS: o backfill historico (preencher quem ja tem @ nos webhooks antigos) NAO
--   esta aqui — exige varredura pesada em webhooks_ghl e deve rodar numa janela
--   com o banco menos carregado (ver recomendacao de otimizar os crons pesados
--   sync_tags_from_latest_webhook / recalcular_discagem_scores).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.capturar_instagram_do_webhook()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_ghl_id text := NULLIF(btrim(NEW.payload->>'contact_id'), '');
    v_ig     text := NULLIF(btrim(NEW.payload->>'Qual é o seu @ do instagram?'), '');
BEGIN
    IF v_ghl_id IS NOT NULL AND v_ig IS NOT NULL AND length(v_ig) >= 2 THEN
        UPDATE public.contatos
        SET print_instagram = v_ig,
            updated_at = now()
        WHERE ghl_id = v_ghl_id
          AND coalesce(btrim(print_instagram), '') IS DISTINCT FROM v_ig;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.capturar_instagram_do_webhook() IS
    'Captura "Qual é o seu @ do instagram?" do payload do GHL e grava em '
    'contatos.print_instagram (match por ghl_id). Latest-wins, ignora valores '
    'com menos de 2 caracteres. Adicionado em 2026-07-24.';

DROP TRIGGER IF EXISTS trg_capturar_instagram_do_webhook ON public.webhooks_ghl;
CREATE TRIGGER trg_capturar_instagram_do_webhook
    AFTER INSERT ON public.webhooks_ghl
    FOR EACH ROW
    WHEN (NEW.payload ? 'Qual é o seu @ do instagram?')
    EXECUTE FUNCTION public.capturar_instagram_do_webhook();

COMMIT;

-- ----------------------------------------------------------------------------
-- BACKFILL (rodar manualmente numa janela de baixa carga; fill/latest-wins):
--
-- WITH ig AS (
--   SELECT DISTINCT ON (payload->>'contact_id')
--          payload->>'contact_id' AS ghl_id,
--          btrim(payload->>'Qual é o seu @ do instagram?') AS ig
--   FROM webhooks_ghl
--   WHERE payload ? 'Qual é o seu @ do instagram?'
--     AND btrim(coalesce(payload->>'Qual é o seu @ do instagram?','')) <> ''
--     AND coalesce(payload->>'contact_id','') <> ''
--   ORDER BY payload->>'contact_id', created_at DESC
-- )
-- UPDATE contatos c SET print_instagram = ig.ig
-- FROM ig
-- WHERE c.ghl_id = ig.ghl_id
--   AND coalesce(btrim(c.print_instagram),'') = '';
-- ----------------------------------------------------------------------------
