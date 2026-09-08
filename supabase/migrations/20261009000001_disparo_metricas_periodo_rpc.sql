-- Migration: RPC de métricas de disparos (Campanhas WhatsApp) com filtro de período
--
-- O dashboard de disparos ganhou filtros (data, status, tipo de mensagem,
-- busca). Status/tipo/busca são filtrados client-side, mas o filtro de
-- PERÍODO precisa agir na agregação: só entra na contagem o contato cuja tag
-- de trigger foi aplicada dentro da janela. View não aceita parâmetro, então
-- a mesma query de v_disparo_metricas vira função com p_from/p_to.
--
-- Mesma limitação documentada em 20260705000018: a "data do trigger" é
-- contatos.updated_at (melhor aproximação disponível — sync_tags_from_latest_webhook
-- atualiza o contato quando as tags mudam). Se o contato tiver outra mudança
-- de tag depois do disparo, a data reflete a mudança mais recente. Ver
-- docs/MUDANCAS.md.
--
-- Semântica do filtro: p_from inclusivo, p_to exclusivo
-- (p_from <= tagged_at < p_to). NULL = sem limite naquele lado.
-- Com os dois NULL o resultado é idêntico ao de v_disparo_metricas.
--
-- Segurança: SECURITY INVOKER — a RLS de disparos/disparo_tags/contatos/
-- whatsapp_pricing_config já restringe ao workspace do chamador (invariante
-- global #4, docs/UML.md). EXECUTE revogado de anon/PUBLIC (invariante #2).

SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.rpc_disparo_metricas(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  disparo_id uuid,
  workspace_id uuid,
  disparo_nome text,
  descricao text,
  cor text,
  is_active boolean,
  tipo_mensagem text,
  trigger_count bigint,
  respondeu_count bigint,
  parou_count bigint,
  erro_count bigint,
  nao_respondeu_count bigint,
  converteu_count bigint,
  taxa_resposta_pct numeric,
  taxa_parou_pct numeric,
  taxa_erro_pct numeric,
  taxa_conversao_pct numeric,
  preco_unitario numeric,
  custo_estimado numeric,
  primeiro_trigger timestamptz,
  ultimo_trigger timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
WITH tags_por_disparo AS (
    SELECT
        d.id AS disparo_id,
        d.workspace_id,
        d.nome AS disparo_nome,
        d.cor,
        d.is_active,
        dt.significado,
        lower(trim(dt.tag)) AS tag
    FROM disparos d
    JOIN disparo_tags dt ON dt.disparo_id = d.id AND dt.workspace_id = d.workspace_id
),
trigger_contatos AS (
    SELECT
        tpd.disparo_id,
        tpd.workspace_id,
        c.id AS contato_id,
        c.updated_at AS tagged_at
    FROM tags_por_disparo tpd
    JOIN contatos c ON c.workspace_id = tpd.workspace_id
    WHERE tpd.significado = 'trigger'
      AND contato_tem_tag(c.tags, tpd.tag)
      AND (p_from IS NULL OR c.updated_at >= p_from)
      AND (p_to IS NULL OR c.updated_at < p_to)
),
metricas AS (
    SELECT
        tc.disparo_id,
        tc.workspace_id,
        COUNT(DISTINCT tc.contato_id) AS trigger_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'respondeu'   AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'parou'       AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS parou_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'erro'        AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS erro_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'nao_respondeu' AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS nao_respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'converteu'   AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS converteu_count,
        MIN(tc.tagged_at) AS primeiro_trigger,
        MAX(tc.tagged_at) AS ultimo_trigger
    FROM trigger_contatos tc
    LEFT JOIN tags_por_disparo tpd
      ON tpd.disparo_id = tc.disparo_id
     AND tpd.workspace_id = tc.workspace_id
     AND tpd.significado <> 'trigger'
    LEFT JOIN contatos c
      ON c.id = tc.contato_id
     AND c.workspace_id = tc.workspace_id
    GROUP BY tc.disparo_id, tc.workspace_id
)
SELECT
    d.id AS disparo_id,
    d.workspace_id,
    d.nome AS disparo_nome,
    d.descricao,
    d.cor,
    d.is_active,
    d.tipo_mensagem,
    COALESCE(m.trigger_count, 0) AS trigger_count,
    COALESCE(m.respondeu_count, 0) AS respondeu_count,
    COALESCE(m.parou_count, 0) AS parou_count,
    COALESCE(m.erro_count, 0) AS erro_count,
    COALESCE(m.nao_respondeu_count, 0) AS nao_respondeu_count,
    COALESCE(m.converteu_count, 0) AS converteu_count,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.respondeu_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_resposta_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.parou_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_parou_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.erro_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_erro_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.converteu_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_conversao_pct,
    CASE WHEN d.tipo_mensagem = 'utility' THEN COALESCE(wpc.preco_utility, 0) ELSE COALESCE(wpc.preco_marketing, 0) END AS preco_unitario,
    COALESCE(m.trigger_count, 0) * CASE WHEN d.tipo_mensagem = 'utility' THEN COALESCE(wpc.preco_utility, 0) ELSE COALESCE(wpc.preco_marketing, 0) END AS custo_estimado,
    m.primeiro_trigger,
    m.ultimo_trigger
FROM disparos d
LEFT JOIN metricas m ON m.disparo_id = d.id AND m.workspace_id = d.workspace_id
LEFT JOIN whatsapp_pricing_config wpc ON wpc.workspace_id = d.workspace_id
$function$;

COMMENT ON FUNCTION public.rpc_disparo_metricas(timestamptz, timestamptz) IS
    'Métricas de disparos (Campanhas WhatsApp) com filtro opcional de período sobre a data de aplicação da tag de trigger (p_from inclusivo, p_to exclusivo). NULLs = sem filtro (equivale a v_disparo_metricas).';

REVOKE ALL ON FUNCTION public.rpc_disparo_metricas(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_disparo_metricas(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_disparo_metricas(timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
