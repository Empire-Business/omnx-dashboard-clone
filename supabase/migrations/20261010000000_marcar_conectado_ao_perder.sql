-- ============================================================================
-- Tarefa 2: "todo perdido vira conectado"
-- ----------------------------------------------------------------------------
-- Regra de negocio aprovada pelo dono em 2026-07-24:
--   Quando uma oportunidade entra em status 'lost' (Perdido) e ainda NAO tem
--   data_conectado, assume-se que houve contato — os SDRs conversam via WhatsApp
--   externo, fora do GHL, entao o GHL nao registra a conexao. Marca-se entao
--   data_conectado para que esses leads contem como "conectados" nos paineis.
--
-- Fonte da regra: pedido do Bruno (pre-venda conciliando WhatsApp + Instagram).
-- Ver decisao registrada na conversa de 2026-07-24.
--
-- IMPORTANTE:
--   * data_conectado, uma vez preenchida, NUNCA e apagada (mesma regra de
--     imutabilidade ja aplicada em extrair_dados_ghl_v2 via COALESCE).
--   * Implementacao ADITIVA e ISOLADA: trigger BEFORE em oportunidades + backfill
--     unico. NAO altera a funcao central extrair_dados_ghl_v2.
--   * O backfill altera numeros HISTORICOS de "conectados" (estimativa na data de
--     escrita: 1.548 de 3.147 oportunidades perdidas seriam preenchidas).
--   * Idempotente: so preenche onde data_conectado IS NULL. Seguro reaplicar.
--
-- Data usada para data_conectado (todas DATE):
--   COALESCE(data_perdido, data_ultima_atividade, CURRENT_DATE)
--   -> prioriza a data em que o lead foi perdido; cai para a ultima atividade;
--      por fim, a data corrente.
-- ============================================================================

BEGIN;

-- 1) Funcao do gatilho -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_conectado_ao_perder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'lost' AND NEW.data_conectado IS NULL THEN
        NEW.data_conectado := COALESCE(
            NEW.data_perdido,
            NEW.data_ultima_atividade,
            CURRENT_DATE
        );
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.marcar_conectado_ao_perder() IS
    'Regra "todo perdido vira conectado" (2026-07-24): quando a oportunidade vira '
    'lost sem data_conectado, preenche data_conectado (COALESCE data_perdido / '
    'data_ultima_atividade / hoje). So atua quando esta NULL; nunca sobrescreve.';

-- 2) Gatilho BEFORE em oportunidades -----------------------------------------
-- Dispara em INSERT e em UPDATE das colunas relevantes. A funcao central
-- extrair_dados_ghl_v2 sempre grava status/data_conectado no UPDATE, entao o
-- gatilho pega a transicao para 'lost' sem depender de webhook especifico.
DROP TRIGGER IF EXISTS trg_marcar_conectado_ao_perder ON public.oportunidades;
CREATE TRIGGER trg_marcar_conectado_ao_perder
    BEFORE INSERT OR UPDATE OF status, data_perdido, data_conectado
    ON public.oportunidades
    FOR EACH ROW
    EXECUTE FUNCTION public.marcar_conectado_ao_perder();

-- 3) Backfill unico dos perdidos historicos sem data_conectado ---------------
UPDATE public.oportunidades
SET data_conectado = COALESCE(data_perdido, data_ultima_atividade, CURRENT_DATE)
WHERE status = 'lost'
  AND data_conectado IS NULL;

COMMIT;
