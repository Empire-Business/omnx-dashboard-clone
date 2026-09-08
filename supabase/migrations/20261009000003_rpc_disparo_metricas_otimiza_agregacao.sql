-- Migration: otimização real de rpc_disparo_metricas
--
-- Medido em produção (2026-07-22, workspace com 11.326 contatos):
--   view v_disparo_metricas (antiga):        ~5.2s
--   rpc versão 000001 (OR com bind param):   timeout (57014)
--   rpc versão 000002 (COALESCE infinity):   ~7.5s — abaixo do timeout, mas
--                                            lenta demais pro carregamento
--                                            inicial do dashboard
--
-- Reescrita da agregação para cortar trabalho redundante:
--   ANTES: trigger_contatos (4.2k) × tags não-trigger (5) × contato_tem_tag
--          por combinação (~21k chamadas de string_to_array/trim) + um segundo
--          join na tabela contatos para reler tags.
--   DEPOIS: unnest das tags de cada contato UMA vez (contato_hits) com hash
--           join nas tags do disparo; o segundo join em contatos some porque
--           trigger_contatos já carrega c.tags.
--
-- A forma final (colunas, tipos, RLS via SECURITY INVOKER) é idêntica.

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
        c.tags,
        c.updated_at AS tagged_at
    FROM tags_por_disparo tpd
    JOIN contatos c ON c.workspace_id = tpd.workspace_id
    WHERE tpd.significado = 'trigger'
      AND contato_tem_tag(c.tags, tpd.tag)
      AND c.updated_at >= COALESCE(p_from, '-infinity'::timestamptz)
      AND c.updated_at <  COALESCE(p_to,   'infinity'::timestamptz)
),
contato_hits AS (
    -- Para cada contato do trigger, quais significados (respondeu/parou/etc.)
    -- ele tem — um unnest por contato, hash join nas tags do disparo.
    SELECT DISTINCT
        tc.disparo_id,
        tc.contato_id,
        tpd.significado
    FROM trigger_contatos tc
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(tc.tags, ''), ',')) AS raw(tag)
    JOIN tags_por_disparo tpd
      ON tpd.disparo_id = tc.disparo_id
     AND tpd.workspace_id = tc.workspace_id
     AND tpd.significado <> 'trigger'
     AND tpd.tag = lower(btrim(raw.tag))
),
metricas AS (
    SELECT
        tc.disparo_id,
        tc.workspace_id,
        COUNT(DISTINCT tc.contato_id) AS trigger_count,
        COUNT(DISTINCT CASE WHEN ch.significado = 'respondeu'     THEN tc.contato_id END) AS respondeu_count,
        COUNT(DISTINCT CASE WHEN ch.significado = 'parou'         THEN tc.contato_id END) AS parou_count,
        COUNT(DISTINCT CASE WHEN ch.significado = 'erro'          THEN tc.contato_id END) AS erro_count,
        COUNT(DISTINCT CASE WHEN ch.significado = 'nao_respondeu' THEN tc.contato_id END) AS nao_respondeu_count,
        COUNT(DISTINCT CASE WHEN ch.significado = 'converteu'     THEN tc.contato_id END) AS converteu_count,
        MIN(tc.tagged_at) AS primeiro_trigger,
        MAX(tc.tagged_at) AS ultimo_trigger
    FROM trigger_contatos tc
    LEFT JOIN contato_hits ch
      ON ch.disparo_id = tc.disparo_id
     AND ch.contato_id = tc.contato_id
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

NOTIFY pgrst, 'reload schema';
