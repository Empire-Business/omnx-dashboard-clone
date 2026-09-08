-- ============================================================================
-- Oportunidade presa ao contato antigo quando o GHL mescla dois contatos
-- ----------------------------------------------------------------------------
-- SINTOMA (relato do dono, 2026-08-05/06): o painel de discagem mostrava o lead
-- "Thiago Cassini" com 0 ligacoes e o botao "abrir no CRM" nao funcionava.
--
-- CAUSA REAL: no GHL, dois contatos com o MESMO telefone foram mesclados e a
-- oportunidade migrou para o contato vencedor. O webhook seguinte chegou com o
-- mesmo `payload->>'id'` (oportunidade) e um `contact_id` DIFERENTE.
-- O PASSO 2b de `extrair_dados_ghl`/`_v2` atualiza dezenas de colunas da
-- oportunidade, mas NAO atualiza `contato_id` — entao a oportunidade fica presa
-- para sempre ao contato em que nasceu (o perdedor da mescla, que nem existe
-- mais no GHL). Dai os tres sintomas de uma vez:
--   * o painel lista a oportunidade e exibe o contato errado;
--   * o historico (ligacoes/mensagens) esta no contato certo -> "0 ligacoes";
--   * o link do CRM usa o `ghl_id` perdedor -> nao abre.
--
-- FREQUENCIA MEDIDA (30 dias, producao): 9.099 oportunidades comparadas contra
-- o `contact_id` do ultimo webhook, 1 divergente. Raro, mas apaga o lead do
-- radar do SDR quando acontece.
--
-- ESCOLHA DE IMPLEMENTACAO: passo aditivo em trigger proprio, em vez de
-- reescrever as ~350 linhas de `extrair_dados_ghl_v2`. O nome comeca com `zz_`
-- de proposito: triggers AFTER INSERT disparam em ordem alfabetica, e este
-- precisa rodar DEPOIS de `auto_extrair_dados_ghl` (que e quem cria o contato
-- vencedor e a oportunidade).
--
-- Idempotente: pode rodar quantas vezes for (modo so-producao).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reatribuir_oportunidade_ao_contato_do_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opp_ghl_id     TEXT := NULLIF(TRIM(NEW.payload->>'id'), '');
    v_contact_ghl_id TEXT := NULLIF(TRIM(NEW.payload->>'contact_id'), '');
    v_contato_id     UUID;
BEGIN
    -- Webhook sem oportunidade ou sem contato nao diz nada sobre vinculo.
    IF v_opp_ghl_id IS NULL OR v_contact_ghl_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Contato SEMPRE resolvido dentro do workspace do proprio webhook.
    -- Sem isso, um `ghl_id` repetido entre contas apontaria a oportunidade de
    -- um cliente para o contato de outro (vazamento cross-tenant).
    SELECT c.id INTO v_contato_id
    FROM public.contatos c
    WHERE c.ghl_id = v_contact_ghl_id
      AND c.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
    LIMIT 1;

    -- Contato ainda nao materializado: nao inventa vinculo. O proximo webhook
    -- da mesma oportunidade corrige.
    IF v_contato_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.oportunidades o
       SET contato_id = v_contato_id
     WHERE o.ghl_opportunity_id = v_opp_ghl_id
       AND o.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
       AND o.contato_id IS DISTINCT FROM v_contato_id;

    -- A fila de discagem guarda o `contato_id` denormalizado: sem atualizar
    -- aqui, o SDR continuaria vendo o contato errado ate o proximo recalculo.
    UPDATE public.discagem_scores d
       SET contato_id = v_contato_id
      FROM public.oportunidades o
     WHERE o.ghl_opportunity_id = v_opp_ghl_id
       AND d.oportunidade_id = o.id
       AND d.contato_id IS DISTINCT FROM v_contato_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reatribuir_oportunidade_ao_contato_do_webhook() IS
'Repara o vinculo oportunidade->contato quando o GHL mescla contatos duplicados. O PASSO 2b de extrair_dados_ghl nao atualiza contato_id; sem este passo a oportunidade fica presa ao contato perdedor da mescla e o lead some do painel de discagem.';

DROP TRIGGER IF EXISTS zz_reatribuir_oportunidade_contato ON public.webhooks_ghl;
CREATE TRIGGER zz_reatribuir_oportunidade_contato
    AFTER INSERT ON public.webhooks_ghl
    FOR EACH ROW
    EXECUTE FUNCTION public.reatribuir_oportunidade_ao_contato_do_webhook();

-- ============================================================================
-- BACKFILL — corrige o que ja esta divergente hoje
-- ----------------------------------------------------------------------------
-- Janela de 30 dias: e o alcance em que os webhooks ainda descrevem o vinculo
-- atual com confianca. Varredura completa da tabela (352 mil linhas) estouraria
-- o statement_timeout sem ganho real.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._backup_oportunidades_contato_20260806 AS
SELECT o.id, o.ghl_opportunity_id, o.contato_id, o.workspace_id, NOW() AS backup_em
FROM public.oportunidades o
WHERE FALSE;

WITH ultimo_webhook AS (
    SELECT DISTINCT ON (TRIM(w.payload->>'id'))
           TRIM(w.payload->>'id')   AS opp_ghl_id,
           TRIM(w.payload->>'contact_id') AS contact_ghl_id,
           w.workspace_id
    FROM public.webhooks_ghl w
    WHERE w.created_at >= NOW() - INTERVAL '30 days'
      AND NULLIF(TRIM(w.payload->>'id'), '') IS NOT NULL
      AND NULLIF(TRIM(w.payload->>'contact_id'), '') IS NOT NULL
    ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
),
divergentes AS (
    SELECT o.id AS opp_id, o.ghl_opportunity_id, o.contato_id AS contato_antigo,
           c_novo.id AS contato_novo, o.workspace_id
    FROM ultimo_webhook uw
    JOIN public.oportunidades o
      ON o.ghl_opportunity_id = uw.opp_ghl_id
     AND o.workspace_id IS NOT DISTINCT FROM uw.workspace_id
    JOIN public.contatos c_novo
      ON c_novo.ghl_id = uw.contact_ghl_id
     AND c_novo.workspace_id IS NOT DISTINCT FROM uw.workspace_id
    WHERE o.contato_id IS DISTINCT FROM c_novo.id
),
backup AS (
    INSERT INTO public._backup_oportunidades_contato_20260806
        (id, ghl_opportunity_id, contato_id, workspace_id, backup_em)
    SELECT d.opp_id, d.ghl_opportunity_id, d.contato_antigo, d.workspace_id, NOW()
    FROM divergentes d
    WHERE NOT EXISTS (
        SELECT 1 FROM public._backup_oportunidades_contato_20260806 b
        WHERE b.id = d.opp_id
    )
    RETURNING 1
),
corrige_opp AS (
    UPDATE public.oportunidades o
       SET contato_id = d.contato_novo
      FROM divergentes d
     WHERE o.id = d.opp_id
    RETURNING o.id
)
UPDATE public.discagem_scores ds
   SET contato_id = d.contato_novo
  FROM divergentes d
 WHERE ds.oportunidade_id = d.opp_id
   AND ds.contato_id IS DISTINCT FROM d.contato_novo;
