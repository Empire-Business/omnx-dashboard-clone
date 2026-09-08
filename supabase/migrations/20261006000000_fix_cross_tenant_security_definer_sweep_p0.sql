-- =============================================================================
-- VARREDURA SISTEMÁTICA: vazamento cross-tenant em funções SECURITY DEFINER e
-- views (mesma classe de bug já fechada 3x — RPCs CRM round2 [20261004000000],
-- RPCs Meta Ads [20261004000003] e agora Sub-app Criativos [PR #53,
-- 20261005000000, incorporada nesta migration]).
--
-- Ver docs/VARREDURA-CROSS-TENANT-COMPLETA.md para o inventário completo
-- (161 funções SECURITY DEFINER + 13 views auditadas, classificação a/b/c/d
-- e evidência de cada achado).
--
-- Achado mais grave desta rodada: o fix de round2 (20261004000002) usou o
-- padrão `auth.uid() IS NULL OR is_workspace_member(...)` para permitir que
-- chamadas de `service_role` (automação/edge functions) continuassem
-- funcionando sem sessão de usuário. O problema: `auth.uid()` TAMBÉM é NULL
-- para uma chamada com a `anon key` pública SEM QUALQUER LOGIN — não é
-- exclusivo de `service_role`. Como essas funções também têm EXECUTE
-- concedido a `anon`, qualquer visitante sem conta consegue reproduzir
-- exatamente o vazamento que o round2 disse ter fechado. Correção: trocar
-- o teste por `auth.role() = 'service_role'` (distingue o ROLE de conexão,
-- não a presença de um JWT de usuário) e revogar `anon` nessas funções.
--
-- Idempotente: CREATE OR REPLACE FUNCTION / REVOKE+GRANT são idempotentes.
-- NÃO aplicada em produção por esta sessão — branch dedicada, PR sem merge,
-- aguarda autorização do dono (regra 20b/20c do projeto).
-- =============================================================================
SET search_path = public, pg_catalog;
SET lock_timeout = '10s';
SET statement_timeout = '5min';

-- =============================================================================
-- CATEGORIA A — anti-padrão "auth.uid() IS NULL OR ..." (bypass anônimo)
-- Troca por auth.role() = 'service_role', que só é verdadeiro numa conexão
-- real de service_role (edge function com a service key), nunca para uma
-- chamada anon/authenticated sem sessão. Revoga EXECUTE de anon em todas.
-- =============================================================================

-- A1. get_lead_full — 0 callers ativos em eb-dash2/src ou supabase/functions
-- hoje, mas é o RPC mais perigoso da lista (devolve oportunidade+contato
-- completos por ID). Mantém authenticated (pode ter consumidor externo via
-- API pública documentada), fecha o anon.
CREATE OR REPLACE FUNCTION public.get_lead_full(p_opp_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_workspace_id uuid;
BEGIN
  SELECT c.workspace_id INTO v_workspace_id
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  WHERE o.id = p_opp_id;

  IF v_workspace_id IS NOT NULL
     AND auth.role() <> 'service_role'
     AND NOT public.is_workspace_member(v_workspace_id) THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(t) INTO result FROM (
    SELECT o.*,
      (SELECT row_to_json(c.*) FROM contatos c WHERE c.id = o.contato_id) AS contatos
    FROM oportunidades o WHERE o.id = p_opp_id
  ) t;
  RETURN result;
END;
$function$;

-- A2. get_opp_id_by_email
CREATE OR REPLACE FUNCTION public.get_opp_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT o.id FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE lower(c.email) = lower(p_email)
      AND (auth.role() = 'service_role' OR public.is_workspace_member(c.workspace_id))
    ORDER BY o.data_lead_recebido DESC NULLS LAST LIMIT 1;
$function$;

-- A3. buscar_lead_para_venda — caller real: supabase/functions/crm-buscar-lead
-- (service_role). Fecha o anon sem afetar o caller de produção.
CREATE OR REPLACE FUNCTION public.buscar_lead_para_venda(p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tel_digits text;
  v_tel_core   text;
  v_email      text;
  v_result     jsonb;
BEGIN
  v_tel_digits := NULLIF(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g'), '');
  v_tel_core   := CASE
                    WHEN v_tel_digits IS NOT NULL AND length(v_tel_digits) >= 8
                    THEN right(v_tel_digits, 8)
                    ELSE NULL
                  END;
  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');

  IF v_tel_core IS NULL AND v_email IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(cand), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ct.id                                                   AS contato_id,
      ct.nome                                                 AS contato_nome,
      ct.email                                                AS contato_email,
      ct.telefone                                             AS contato_telefone,
      CASE
        WHEN v_tel_core IS NOT NULL
             AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core
          THEN 'telefone'
        ELSE 'email'
      END                                                     AS match_por,
      COALESCE((
        SELECT jsonb_agg(op_row ORDER BY op_row.data_lead_recebido DESC NULLS LAST)
        FROM (
          SELECT
            op.id              AS oportunidade_id,
            op.titulo          AS titulo,
            op.pipeline_name   AS pipeline_name,
            op.status          AS status,
            op.data_lead_recebido,
            op.sdr_name        AS sdr_name,
            op.vendedor_closer AS vendedor_closer
          FROM public.oportunidades op
          WHERE op.contato_id = ct.id
        ) op_row
      ), '[]'::jsonb)                                         AS oportunidades
    FROM public.contatos ct
    WHERE
      (
        (v_tel_core IS NOT NULL
          AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core)
        OR (v_email IS NOT NULL AND lower(ct.email) = v_email)
      )
      AND (auth.role() = 'service_role' OR public.is_workspace_member(ct.workspace_id))
    LIMIT 25
  ) cand;

  RETURN v_result;
END;
$function$;

-- A4. list_weekly_email_schedules — caller real: eb-dash2 useWeeklyEmailSchedules.ts
-- (usuário autenticado no browser). Fechar o anon aqui é o que efetivamente
-- fecha o vazamento — sem isso, qualquer requisição com a anon key pública
-- listava TODOS os agendamentos de e-mail semanal de TODOS os workspaces
-- (assunto, destinatários, prompt da Clara) sem login.
CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
RETURNS SETOF weekly_email_schedules
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  WHERE auth.role() = 'service_role' OR public.is_workspace_member(s.workspace_id)
  ORDER BY s.created_at DESC;
END;
$function$;

-- A5. auditoria_sdr_ia — caller real: eb-dash2 useAuditoriaIA.ts (authenticated)
CREATE OR REPLACE FUNCTION public.auditoria_sdr_ia(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_include_tags text[] DEFAULT NULL::text[],
  p_exclude_tags text[] DEFAULT NULL::text[],
  p_include_pipelines text[] DEFAULT NULL::text[],
  p_exclude_pipelines text[] DEFAULT NULL::text[],
  p_include_utm_source text[] DEFAULT NULL::text[],
  p_exclude_utm_source text[] DEFAULT NULL::text[],
  p_include_utm_campaign text[] DEFAULT NULL::text[],
  p_exclude_utm_campaign text[] DEFAULT NULL::text[]
)
RETURNS TABLE(contato_id uuid, contato_nome text, contato_email text, contato_telefone text, contato_tags text[], opp_id uuid, sdr_humano text, tipo text, severidade text, detalhes text, ultima_interacao timestamp with time zone, msg_ia integer, msg_lead integer, channel text, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_cutoff_7d timestamptz;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  v_start_ts := timezone('America/Sao_Paulo', (p_start_date::text || ' 00:00:00')::timestamp);
  v_end_ts   := timezone('America/Sao_Paulo', (p_end_date::text || ' 23:59:59')::timestamp);
  v_cutoff_7d := timezone('America/Sao_Paulo', ((current_date - interval '7 days')::date::text || ' 00:00:00')::timestamp);

  RETURN QUERY
  WITH
  universo AS (
    SELECT DISTINCT c.contato_id
    FROM comunicacoes c
    JOIN contatos ct ON ct.id = c.contato_id
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    WHERE ct.workspace_id = p_workspace_id
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND (p_include_utm_source IS NULL OR p_include_utm_source = '{}'::text[] OR ct.utm_source = ANY(p_include_utm_source))
      AND (p_exclude_utm_source IS NULL OR p_exclude_utm_source = '{}'::text[] OR ct.utm_source IS NULL OR NOT (ct.utm_source = ANY(p_exclude_utm_source)))
      AND (p_include_utm_campaign IS NULL OR p_include_utm_campaign = '{}'::text[] OR ct.utm_campaign::text = ANY(p_include_utm_campaign))
      AND (p_exclude_utm_campaign IS NULL OR p_exclude_utm_campaign = '{}'::text[] OR ct.utm_campaign IS NULL OR NOT (ct.utm_campaign::text = ANY(p_exclude_utm_campaign)))
  ),
  contato_info AS (
    SELECT
      ct.id AS cid,
      ct.nome AS cnome,
      ct.email AS cemail,
      ct.telefone AS ctelefone,
      string_to_array(ct.tags, ',') AS ctags_arr
    FROM contatos ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.id IN (SELECT contato_id FROM universo)
      AND (
        p_include_tags IS NULL OR p_include_tags = '{}'::text[] OR
        ct.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(p_include_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
      AND (
        p_exclude_tags IS NULL OR p_exclude_tags = '{}'::text[] OR
        ct.tags IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p_exclude_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
  ),
  oportunidade_info AS (
    SELECT DISTINCT ON (o.contato_id)
      o.contato_id AS ocid,
      o.id AS oid,
      COALESCE(o.sdr_name, ct.owner_name) AS osdr
    FROM oportunidades o
    JOIN contatos ct ON ct.id = o.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND o.contato_id IN (SELECT cid FROM contato_info)
      AND (p_include_pipelines IS NULL OR p_include_pipelines = '{}'::text[] OR o.pipeline_id = ANY(p_include_pipelines))
      AND (p_exclude_pipelines IS NULL OR p_exclude_pipelines = '{}'::text[] OR NOT (o.pipeline_id = ANY(p_exclude_pipelines)))
    ORDER BY o.contato_id, o.data_lead_recebido DESC NULLS LAST
  ),
  stats AS (
    SELECT
      c.contato_id AS scid,
      COUNT(*) FILTER (WHERE ccr.autor = 'automacao' AND c.direction = 'outbound') AS qtd_ia,
      COUNT(*) FILTER (WHERE c.direction = 'inbound') AS qtd_lead,
      COUNT(*) FILTER (WHERE ccr.autor != 'automacao' AND c.direction = 'outbound') AS qtd_humano,
      MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') AS ultimo_outbound
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    GROUP BY c.contato_id
  ),
  erro_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS ecid,
      c.channel AS echannel,
      c.error_msg AS eerror,
      c.data_comunicacao AS edata
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.error_msg IS NOT NULL
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    ORDER BY c.contato_id, c.data_comunicacao DESC
  )
  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr,
    oi.oid, oi.osdr,
    'auditoria'::text, 'info'::text, NULL::text,
    s.ultimo_outbound, s.qtd_ia::int, s.qtd_lead::int,
    ei.echannel, ei.eerror
  FROM contato_info ci
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  LEFT JOIN stats s ON s.scid = ci.cid
  LEFT JOIN erro_info ei ON ei.ecid = ci.cid;
END;
$function$;

-- A6. delete_weekly_email_schedule — caller real: eb-dash2 useWeeklyEmailSchedules.ts
CREATE OR REPLACE FUNCTION public.delete_weekly_email_schedule(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.weekly_email_schedules WHERE id = p_id;

  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_workspace_admin(v_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: somente admin/owner do workspace' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.weekly_email_schedules WHERE id = p_id;
  RETURN FOUND;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_lead_full(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_opp_id_by_email(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.buscar_lead_para_venda(text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_weekly_email_schedules() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auditoria_sdr_ia(uuid, date, date, text[], text[], text[], text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_weekly_email_schedule(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lead_full(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_opp_id_by_email(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buscar_lead_para_venda(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_weekly_email_schedules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auditoria_sdr_ia(uuid, date, date, text[], text[], text[], text[], text[], text[], text[], text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_weekly_email_schedule(uuid) TO authenticated, service_role;

-- =============================================================================
-- CATEGORIA B — IDOR: recebe p_workspace_id (ou ID de recurso) mas nunca
-- valida que o CHAMADOR pertence a esse workspace/é dono do recurso.
-- =============================================================================

-- B1/B2. get_clara_campaigns_crm / get_clara_creatives_crm — filtram a query
-- corretamente por p_workspace_id, mas nunca chamam is_workspace_member: um
-- membro do workspace A podia passar o workspace_id de B e ler o dashboard
-- Clara (spend, leads, MQLs, faturamento) de B inteiro. Único caller hoje é
-- supabase/functions/_shared/report-tools.ts (service_role), mas o guard
-- entra como defesa em profundidade e a função só é chamada com o
-- workspace_id do próprio relatório sendo gerado — não quebra nada.
CREATE OR REPLACE FUNCTION public.get_clara_campaigns_crm(p_workspace_id uuid, p_week_start date, p_week_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'spend')::numeric DESC)
    INTO v_result
    FROM (
        SELECT
            COALESCE(uc.nome, 'Campanha ' || COALESCE(m.page_code, cr.page_code)) AS campanha,
            COALESCE(m.investimento, 0)::numeric AS spend,
            COALESCE(m.impressoes, 0)::bigint AS impressions,
            COALESCE(m.cliques, 0)::bigint AS clicks,
            COALESCE(m.leads_meta, 0)::bigint AS leads_meta,
            COALESCE(cr.leads_crm, 0)::bigint AS leads_crm,
            COALESCE(cr.mqls_crm, 0)::bigint AS mqls_crm,
            COALESCE(cr.agendados, 0)::bigint AS agendados,
            COALESCE(cr.reunioes, 0)::bigint AS reunioes,
            COALESCE(cr.fechamentos, 0)::bigint AS vendas,
            COALESCE(cr.faturamento, 0)::numeric AS faturamento,
            COALESCE(cr.caixa, 0)::numeric AS caixa,
            CASE WHEN COALESCE(m.leads_meta, 0) > 0
                THEN ROUND(m.investimento / m.leads_meta, 2)
            END AS cpl_meta,
            CASE WHEN COALESCE(cr.leads_crm, 0) > 0
                THEN ROUND(m.investimento / cr.leads_crm, 2)
            END AS cpl_crm,
            CASE WHEN COALESCE(cr.mqls_crm, 0) > 0
                THEN ROUND(m.investimento / cr.mqls_crm, 2)
            END AS cpmql,
            CASE WHEN COALESCE(cr.agendados, 0) > 0
                THEN ROUND(m.investimento / cr.agendados, 2)
            END AS cpagendamento,
            CASE WHEN COALESCE(cr.reunioes, 0) > 0
                THEN ROUND(m.investimento / cr.reunioes, 2)
            END AS cpreuniao,
            CASE WHEN COALESCE(cr.fechamentos, 0) > 0
                THEN ROUND(m.investimento / cr.fechamentos, 2)
            END AS cpv,
            CASE WHEN m.investimento > 0
                THEN ROUND(cr.faturamento / m.investimento, 2)
            END AS roas,
            CASE WHEN m.investimento > 0
                THEN ROUND(cr.caixa / m.investimento, 2)
            END AS roas_caixa,
            CASE WHEN COALESCE(m.impressoes, 0) > 0
                THEN ROUND((m.cliques::numeric / m.impressoes) * 100, 2)
            END AS ctr
        FROM (
            SELECT
                'PG' || (regexp_match(ad_name, 'PG(\d+)'))[1] AS page_code,
                SUM(spend) AS investimento,
                SUM(impressions) AS impressoes,
                SUM(clicks) AS cliques,
                SUM(leads) AS leads_meta
            FROM public.meta_ads_insights
            WHERE workspace_id = p_workspace_id
              AND date BETWEEN p_week_start AND p_week_end
              AND ad_name ~ 'PG(\d+)'
            GROUP BY 'PG' || (regexp_match(ad_name, 'PG(\d+)'))[1]
        ) m
        FULL OUTER JOIN (
            SELECT
                uc.page_code,
                COUNT(DISTINCT o.id)::bigint AS leads_crm,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE c.tags IS NOT NULL AND c.tags ~* '(^|,)\s*mql\s*($|,)'
                )::bigint AS mqls_crm,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE o.data_agendamento_reuniao BETWEEN p_week_start AND p_week_end
                )::bigint AS agendados,
                COUNT(DISTINCT o.id) FILTER (
                    WHERE o.data_realizacao_vendas BETWEEN p_week_start AND p_week_end
                       OR o.data_reuniao_agendada BETWEEN p_week_start AND p_week_end
                )::bigint AS reunioes,
                COUNT(DISTINCT vf.oportunidade_id) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                )::bigint AS fechamentos,
                COALESCE(SUM(vf.valor_faturado) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                ), 0)::numeric AS faturamento,
                COALESCE(SUM(vf.valor_entrada) FILTER (
                    WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                ), 0)::numeric AS caixa
            FROM public.oportunidades o
            JOIN public.contatos c ON c.id = o.contato_id AND c.workspace_id = p_workspace_id
            JOIN public.utm_campaigns uc
              ON uc.workspace_id = p_workspace_id
              AND uc.utm_campaign::TEXT = c.utm_campaign
            LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
            WHERE o.workspace_id = p_workspace_id
              AND o.data_lead_recebido >= (p_week_start::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND o.data_lead_recebido < ((p_week_end + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
              AND c.utm_campaign IS NOT NULL
              AND c.utm_campaign <> ''
              AND o.pipeline_id != 'dz9ItDIo7qnEmM2wko3E'  -- exclui Recuperação
            GROUP BY uc.page_code
        ) cr USING (page_code)
        LEFT JOIN public.utm_campaigns uc
          ON uc.workspace_id = p_workspace_id
          AND uc.page_code = COALESCE(m.page_code, cr.page_code)
        WHERE COALESCE(m.investimento, 0) > 0
        ORDER BY COALESCE(m.investimento, 0) DESC
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_clara_creatives_crm(p_workspace_id uuid, p_week_start date, p_week_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT jsonb_agg(row_to_json(t) ORDER BY (row_to_json(t)->>'spend')::numeric DESC)
    INTO v_result
    FROM (
        SELECT
            e.creative_code,
            e.creative_name,
            e.spend,
            e.impressions,
            e.clicks,
            e.leads_meta,
            e.leads_crm,
            e.mqls,
            e.agendados,
            e.reunioes,
            e.vendas,
            e.faturamento,
            e.caixa,
            e.cpl_crm,
            e.cpmql,
            CASE WHEN COALESCE(e.agendados, 0) > 0
                THEN ROUND(e.spend / e.agendados, 2)
            END AS cpagendamento,
            CASE WHEN COALESCE(e.reunioes, 0) > 0
                THEN ROUND(e.spend / e.reunioes, 2)
            END AS cpreuniao,
            e.cpv,
            e.roas,
            e.roas_caixa,
            e.ctr
        FROM (
            SELECT
                ('CR-' || j.jkey)::TEXT AS creative_code,
                COALESCE(nc.name, 'Criativo CR-' || j.jkey) AS creative_name,
                j.sum_spend AS spend,
                j.sum_impressions AS impressions,
                j.sum_clicks AS clicks,
                j.sum_leads_meta AS leads_meta,
                j.sum_leads_crm AS leads_crm,
                j.sum_mqls AS mqls,
                j.sum_agendados AS agendados,
                j.sum_reunioes AS reunioes,
                j.sum_vendas AS vendas,
                j.sum_faturamento AS faturamento,
                j.sum_caixa AS caixa,
                CASE WHEN j.sum_impressions > 0
                    THEN ROUND((j.sum_clicks::NUMERIC / j.sum_impressions) * 100, 2)
                ELSE 0 END AS ctr,
                CASE WHEN j.sum_impressions > 0
                    THEN ROUND((j.sum_spend / j.sum_impressions) * 1000, 2)
                ELSE 0 END AS cpm,
                CASE WHEN j.sum_leads_crm > 0
                    THEN ROUND(j.sum_spend / j.sum_leads_crm, 2)
                ELSE 0 END AS cpl_crm,
                CASE WHEN j.sum_mqls > 0
                    THEN ROUND(j.sum_spend / j.sum_mqls, 2)
                ELSE 0 END AS cpmql,
                CASE WHEN j.sum_vendas > 0
                    THEN ROUND(j.sum_spend / j.sum_vendas, 2)
                ELSE 0 END AS cpv,
                CASE WHEN j.sum_spend > 0
                    THEN ROUND(j.sum_faturamento / j.sum_spend, 2)
                ELSE 0 END AS roas,
                CASE WHEN j.sum_spend > 0
                    THEN ROUND(j.sum_caixa / j.sum_spend, 2)
                ELSE 0 END AS roas_caixa
            FROM (
                SELECT
                    ak.jkey,
                    COALESCE(ma.sum_spend, 0) AS sum_spend,
                    COALESCE(ma.sum_impressions, 0) AS sum_impressions,
                    COALESCE(ma.sum_clicks, 0) AS sum_clicks,
                    COALESCE(ma.sum_leads_meta, 0) AS sum_leads_meta,
                    COALESCE(ca.sum_leads_crm, 0) AS sum_leads_crm,
                    COALESCE(ca.sum_mqls, 0) AS sum_mqls,
                    COALESCE(ca.sum_agendados, 0) AS sum_agendados,
                    COALESCE(ca.sum_reunioes, 0) AS sum_reunioes,
                    COALESCE(ca.sum_vendas, 0) AS sum_vendas,
                    COALESCE(ca.sum_faturamento, 0) AS sum_faturamento,
                    COALESCE(ca.sum_caixa, 0) AS sum_caixa
                FROM (
                    SELECT meta_key AS jkey FROM (
                        SELECT (regexp_match(ad_name, 'CR-(\d+)'))[1] AS meta_key
                        FROM public.meta_ads_insights
                        WHERE workspace_id = p_workspace_id
                          AND date BETWEEN p_week_start AND p_week_end
                          AND ad_name ~ 'CR-(\d+)'
                    ) m1
                    UNION
                    SELECT crm_key AS jkey FROM (
                        SELECT (regexp_match(utm_term, 'CR-(\d+)'))[1] AS crm_key
                        FROM public.contatos
                        WHERE workspace_id = p_workspace_id
                          AND utm_term IS NOT NULL
                          AND utm_term ~ 'CR-(\d+)'
                    ) c1
                ) ak
                LEFT JOIN (
                    SELECT
                        (regexp_match(ad_name, 'CR-(\d+)'))[1] AS meta_key,
                        SUM(spend) AS sum_spend,
                        SUM(impressions)::BIGINT AS sum_impressions,
                        SUM(clicks)::BIGINT AS sum_clicks,
                        SUM(leads)::BIGINT AS sum_leads_meta
                    FROM public.meta_ads_insights
                    WHERE workspace_id = p_workspace_id
                      AND date BETWEEN p_week_start AND p_week_end
                      AND ad_name ~ 'CR-(\d+)'
                    GROUP BY (regexp_match(ad_name, 'CR-(\d+)'))[1]
                ) ma ON ma.meta_key = ak.jkey
                LEFT JOIN (
                    SELECT
                        (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS crm_key,
                        COUNT(DISTINCT o.id)::BIGINT AS sum_leads_crm,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE c.tags IS NOT NULL AND c.tags::TEXT ILIKE '%MQL%'
                        )::BIGINT AS sum_mqls,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE o.data_agendamento_reuniao BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_agendados,
                        COUNT(DISTINCT o.id) FILTER (
                            WHERE o.data_realizacao_vendas BETWEEN p_week_start AND p_week_end
                               OR o.data_reuniao_agendada BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_reunioes,
                        COUNT(DISTINCT vf.oportunidade_id) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        )::BIGINT AS sum_vendas,
                        SUM(COALESCE(vf.valor_faturado, 0)) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        ) AS sum_faturamento,
                        SUM(COALESCE(vf.valor_entrada, 0)) FILTER (
                            WHERE vf.data_pagamento_entrada BETWEEN p_week_start AND p_week_end
                        ) AS sum_caixa
                    FROM public.oportunidades o
                    JOIN public.contatos c ON c.id = o.contato_id AND c.workspace_id = p_workspace_id
                    LEFT JOIN public.vendas_fechamento vf ON vf.oportunidade_id = o.id
                    WHERE o.workspace_id = p_workspace_id
                      AND o.data_lead_recebido >= (p_week_start::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
                      AND o.data_lead_recebido < ((p_week_end + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
                      AND c.utm_term IS NOT NULL
                      AND c.utm_term ~ 'CR-(\d+)'
                      AND o.pipeline_id IS DISTINCT FROM 'dz9ItDIo7qnEmM2wko3E'::TEXT
                    GROUP BY (regexp_match(c.utm_term, 'CR-(\d+)'))[1]
                ) ca ON ca.crm_key = ak.jkey
            ) j
            LEFT JOIN public.notion_creatives nc
              ON nc.external_id = 'CR-' || j.jkey
              AND nc.workspace_id = p_workspace_id
              AND nc.database_type = 'paid'
        ) e
        WHERE e.spend > 0
    ) t;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_clara_creatives_crm(uuid, date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_campaigns_crm(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clara_creatives_crm(uuid, date, date) TO authenticated, service_role;

-- B3. buscar_reengajamento — caller real: eb-dash2 useDiscagemScore.ts
-- (authenticated). Filtra por ct.workspace_id = p_workspace_id mas NUNCA
-- valida que o chamador pertence a esse workspace — IDOR puro.
CREATE OR REPLACE FUNCTION public.buscar_reengajamento(p_workspace_id uuid, p_sdr_name text DEFAULT NULL::text, p_limit integer DEFAULT 10)
RETURNS TABLE(oportunidade_id uuid, contato_id uuid, nome text, telefone text, ghl_id text, ultima_mensagem text, data_ultima_mensagem timestamp with time zone, contexto text, utm_source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.contato_id,
    ct.nome::TEXT,
    ct.telefone::TEXT,
    ct.ghl_id::TEXT,
    last_msg.body::TEXT,
    last_msg.data_comunicacao,
    CASE
      WHEN last_msg.body IS NOT NULL
        THEN 'Respondeu há '
             || ROUND(EXTRACT(EPOCH FROM (now() - last_msg.data_comunicacao)) / 86400)::TEXT
             || 'd: "' || LEFT(last_msg.body, 80) || '"'
      ELSE 'Entrou via ' || COALESCE(ct.utm_source, 'fonte desconhecida') || ' — nunca respondeu'
    END::TEXT AS contexto,
    ct.utm_source::TEXT
  FROM oportunidades o
  JOIN contatos ct ON ct.id = o.contato_id
  LEFT JOIN LATERAL (
    SELECT c.body, c.data_comunicacao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
      AND c.data_comunicacao > (now() - INTERVAL '60 days')
    ORDER BY c.data_comunicacao DESC
    LIMIT 1
  ) last_msg ON true
  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Auto Agendamento')
    AND ct.workspace_id = p_workspace_id
    AND (p_sdr_name IS NULL OR o.sdr_name = p_sdr_name)
    AND (
      NOT EXISTS (SELECT 1 FROM discagem_scores ds WHERE ds.oportunidade_id = o.id)
      OR EXISTS (
        SELECT 1 FROM discagem_scores ds
        WHERE ds.oportunidade_id = o.id
          AND ds.numero_tentativa >= 6
          AND ds.camada = 'cadencia'
      )
    )
    AND last_msg.data_comunicacao IS NOT NULL
    AND last_msg.data_comunicacao < (now() - INTERVAL '3 days')
  ORDER BY last_msg.data_comunicacao DESC
  LIMIT p_limit;
END;
$function$;

-- B4/B5. update_weekly_email_schedule (2 assinaturas) — caller real:
-- eb-dash2 useWeeklyEmailSchedules.ts (authenticated). NENHUMA validação de
-- posse: qualquer usuário autenticado podia atualizar o agendamento de
-- QUALQUER workspace por UUID (incluindo trocar recipient_emails para
-- exfiltrar o relatório semanal de outro tenant).
CREATE OR REPLACE FUNCTION public.update_weekly_email_schedule(
  p_id uuid,
  p_name text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean,
  p_modules text[] DEFAULT NULL::text[],
  p_report_type text DEFAULT NULL::text,
  p_frequency text DEFAULT NULL::text,
  p_day_of_week integer DEFAULT NULL::integer,
  p_day_of_month integer DEFAULT NULL::integer,
  p_time_of_day time without time zone DEFAULT NULL::time without time zone,
  p_subject text DEFAULT NULL::text,
  p_recipient_emails text[] DEFAULT NULL::text[],
  p_reply_to text DEFAULT NULL::text,
  p_template_key text DEFAULT NULL::text,
  p_include_comparative boolean DEFAULT NULL::boolean,
  p_include_trends boolean DEFAULT NULL::boolean,
  p_clara_prompt text DEFAULT NULL::text,
  p_use_clara_summary boolean DEFAULT NULL::boolean,
  p_email_format text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_schedule public.weekly_email_schedules%ROWTYPE;
  v_next_run TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_schedule FROM public.weekly_email_schedules WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(v_schedule.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: agendamento pertence a outro workspace' USING ERRCODE = '42501';
  END IF;

  IF p_frequency IS NOT NULL OR p_day_of_week IS NOT NULL OR p_day_of_month IS NOT NULL OR p_time_of_day IS NOT NULL THEN
    v_next_run := public.calculate_next_run_at(
      COALESCE(p_frequency, v_schedule.frequency),
      COALESCE(p_day_of_week, v_schedule.day_of_week),
      COALESCE(p_day_of_month, v_schedule.day_of_month),
      COALESCE(p_time_of_day, v_schedule.time_of_day),
      'America/Sao_Paulo',
      NOW()
    );
  END IF;

  UPDATE public.weekly_email_schedules
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    is_active = COALESCE(p_is_active, is_active),
    modules = COALESCE(p_modules, modules),
    report_type = COALESCE(p_report_type, report_type),
    frequency = COALESCE(p_frequency, frequency),
    day_of_week = COALESCE(p_day_of_week, day_of_week),
    day_of_month = COALESCE(p_day_of_month, day_of_month),
    time_of_day = COALESCE(p_time_of_day, time_of_day),
    next_run_at = COALESCE(v_next_run, next_run_at),
    subject = COALESCE(p_subject, subject),
    recipient_emails = COALESCE(p_recipient_emails, recipient_emails),
    reply_to = COALESCE(p_reply_to, reply_to),
    template_key = COALESCE(p_template_key, template_key),
    include_comparative = COALESCE(p_include_comparative, include_comparative),
    include_trends = COALESCE(p_include_trends, include_trends),
    clara_prompt = COALESCE(p_clara_prompt, clara_prompt),
    use_clara_summary = COALESCE(p_use_clara_summary, use_clara_summary),
    email_format = COALESCE(p_email_format, email_format)
  WHERE id = p_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_weekly_email_schedule(
  p_id uuid,
  p_name text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean,
  p_modules text[] DEFAULT NULL::text[],
  p_report_type text DEFAULT NULL::text,
  p_frequency text DEFAULT NULL::text,
  p_day_of_week integer DEFAULT NULL::integer,
  p_day_of_month integer DEFAULT NULL::integer,
  p_time_of_day time without time zone DEFAULT NULL::time without time zone,
  p_subject text DEFAULT NULL::text,
  p_recipient_emails text[] DEFAULT NULL::text[],
  p_reply_to text DEFAULT NULL::text,
  p_template_key text DEFAULT NULL::text,
  p_include_comparative boolean DEFAULT NULL::boolean,
  p_include_trends boolean DEFAULT NULL::boolean,
  p_clara_prompt text DEFAULT NULL::text,
  p_use_clara_summary boolean DEFAULT NULL::boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_schedule public.weekly_email_schedules%ROWTYPE;
  v_next_run TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_schedule FROM public.weekly_email_schedules WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(v_schedule.workspace_id) THEN
    RAISE EXCEPTION 'forbidden: agendamento pertence a outro workspace' USING ERRCODE = '42501';
  END IF;

  IF p_frequency IS NOT NULL OR p_day_of_week IS NOT NULL OR p_day_of_month IS NOT NULL OR p_time_of_day IS NOT NULL THEN
    v_next_run := public.calculate_next_run_at(
      COALESCE(p_frequency, v_schedule.frequency),
      COALESCE(p_day_of_week, v_schedule.day_of_week),
      COALESCE(p_day_of_month, v_schedule.day_of_month),
      COALESCE(p_time_of_day, v_schedule.time_of_day),
      'America/Sao_Paulo',
      NOW()
    );
  END IF;

  UPDATE public.weekly_email_schedules
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    is_active = COALESCE(p_is_active, is_active),
    modules = COALESCE(p_modules, modules),
    report_type = COALESCE(p_report_type, report_type),
    frequency = COALESCE(p_frequency, frequency),
    day_of_week = COALESCE(p_day_of_week, day_of_week),
    day_of_month = COALESCE(p_day_of_month, day_of_month),
    time_of_day = COALESCE(p_time_of_day, time_of_day),
    next_run_at = COALESCE(v_next_run, next_run_at),
    subject = COALESCE(p_subject, subject),
    recipient_emails = COALESCE(p_recipient_emails, recipient_emails),
    reply_to = COALESCE(p_reply_to, reply_to),
    template_key = COALESCE(p_template_key, template_key),
    include_comparative = COALESCE(p_include_comparative, include_comparative),
    include_trends = COALESCE(p_include_trends, include_trends),
    clara_prompt = COALESCE(p_clara_prompt, clara_prompt),
    use_clara_summary = COALESCE(p_use_clara_summary, use_clara_summary)
  WHERE id = p_id;

  RETURN true;
END;
$function$;

-- B6. send_weekly_report_test — grava um log 'pending' para p_schedule_id
-- sem checar posse: qualquer autenticado podia inserir um registro de teste
-- em weekly_email_logs atribuído a um agendamento de OUTRO workspace.
CREATE OR REPLACE FUNCTION public.send_weekly_report_test(p_schedule_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.weekly_email_schedules
  WHERE id = p_schedule_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'agendamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: agendamento pertence a outro workspace' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.weekly_email_logs (
    schedule_id,
    workspace_id,
    status,
    error_message
  )
  VALUES (
    p_schedule_id,
    v_workspace_id,
    'pending',
    'Teste agendado pelo usuário. O envio real é feito pela edge function send-weekly-report-email.'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.buscar_reengajamento(uuid, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_weekly_email_schedule(uuid, text, text, boolean, text[], text, text, integer, integer, time, text, text[], text, text, boolean, boolean, text, boolean, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_weekly_email_schedule(uuid, text, text, boolean, text[], text, text, integer, integer, time, text, text[], text, text, boolean, boolean, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_weekly_report_test(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_reengajamento(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_weekly_email_schedule(uuid, text, text, boolean, text[], text, text, integer, integer, time, text, text[], text, text, boolean, boolean, text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_weekly_email_schedule(uuid, text, text, boolean, text[], text, text, integer, integer, time, text, text[], text, text, boolean, boolean, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_weekly_report_test(uuid) TO authenticated, service_role;

-- =============================================================================
-- CATEGORIA C — sub-app Criativos "novo" (workspace-aware, mas o join com o
-- CRM não é filtrado por workspace_id). Incorpora o fix do get_creative_metrics
-- já escrito na PR #53 (branch docs/auditoria-criativos, migration
-- 20261005000000, ainda não mergeada) para consolidar numa única migration
-- e estende o mesmo padrão para get_campaign_creatives/get_campaign_summary/
-- get_objectives, que têm o mesmo bug e não foram cobertas por aquela PR.
-- =============================================================================

-- C1. get_creative_metrics (4 args) — idêntica à correção da PR #53.
CREATE OR REPLACE FUNCTION public.get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.workspace_id = p_workspace_id
      AND mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

-- C2. get_creative_metrics (10 args, chamada pelo frontend em useCriativos.ts)
CREATE OR REPLACE FUNCTION public.get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid,
  p_campaign_names text[] DEFAULT NULL::text[],
  p_adset_names text[] DEFAULT NULL::text[],
  p_ad_names text[] DEFAULT NULL::text[],
  p_channels text[] DEFAULT NULL::text[],
  p_funil_tags text[] DEFAULT NULL::text[],
  p_cp_tags text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign_codes text[];
  v_funil_codes text[];
  v_cp_codes text[];
  v_channel_public_codes text[];
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);

  IF p_campaign_names IS NOT NULL AND array_length(p_campaign_names, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_campaign_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_campaign_names);
  END IF;

  IF p_funil_tags IS NOT NULL AND array_length(p_funil_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_funil_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(uc.funnels) AS f WHERE f = ANY(p_funil_tags)
      );
  END IF;

  IF p_cp_tags IS NOT NULL AND array_length(p_cp_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_cp_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_cp_tags);
  END IF;

  IF p_channels IS NOT NULL AND array_length(p_channels, 1) > 0 THEN
    SELECT array_agg(DISTINCT us.public_code)
    INTO v_channel_public_codes
    FROM utm_sources us
    WHERE us.workspace_id = p_workspace_id
      AND us.utm_source = ANY(p_channels)
      AND us.public_code IS NOT NULL;
  END IF;

  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.workspace_id = p_workspace_id
      AND mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
      AND (p_campaign_names IS NULL OR array_length(p_campaign_names, 1) IS NULL OR mai.campaign_name = ANY(p_campaign_names))
      AND (p_adset_names IS NULL OR array_length(p_adset_names, 1) IS NULL OR mai.adset_name = ANY(p_adset_names))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR mai.ad_name = ANY(p_ad_names)
        OR ((regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] || '-' || (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2]) = ANY(p_ad_names)
      )
      AND (
        v_channel_public_codes IS NULL OR array_length(v_channel_public_codes, 1) IS NULL
        OR mai.ad_name ~ ANY(v_channel_public_codes)
      )
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
      AND (p_channels IS NULL OR array_length(p_channels, 1) IS NULL OR c.utm_source = ANY(p_channels))
      AND (v_campaign_codes IS NULL OR array_length(v_campaign_codes, 1) IS NULL OR c.utm_campaign = ANY(v_campaign_codes))
      AND (v_funil_codes IS NULL OR array_length(v_funil_codes, 1) IS NULL OR c.utm_campaign = ANY(v_funil_codes))
      AND (v_cp_codes IS NULL OR array_length(v_cp_codes, 1) IS NULL OR c.utm_campaign = ANY(v_cp_codes))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR c.utm_term = ANY(p_ad_names)
      )
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[]) TO authenticated, service_role;

-- v_creative_metrics: código morto (sem caller em eb-dash2/src nem
-- supabase/functions), mesmo bug estrutural nas CTEs, exposta a anon
-- (bypassa RLS por ser owned by postgres/BYPASSRLS). Revoga acesso.
REVOKE SELECT ON public.v_creative_metrics FROM anon, authenticated, PUBLIC;

-- C3. get_campaign_creatives — meta_ads_insights já é filtrado (via
-- ws_accounts/notion_creatives), mas o crm_by_cr (oportunidades/contatos)
-- não tem NENHUM filtro de workspace — mesma classe do C1/C2.
CREATE OR REPLACE FUNCTION public.get_campaign_creatives(p_workspace_id uuid, p_start_date date, p_end_date date, p_meta_campaign_id text DEFAULT NULL::text, p_local_campaign_id uuid DEFAULT NULL::uuid, p_objective text DEFAULT NULL::text)
RETURNS TABLE(creative_code text, creative_id uuid, creative_name text, spend numeric, impressions bigint, clicks bigint, leads_meta bigint, leads_crm bigint, vendas bigint, faturamento numeric, cpl_crm numeric, roas numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  ),
  local_crs AS (
    SELECT nc.external_id AS cr_code
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.external_id ~ 'CR-\d+'
      AND (
        (p_local_campaign_id IS NOT NULL AND nc.campaign_id = p_local_campaign_id)
        OR (p_objective IS NOT NULL AND nc.cta_objective = p_objective)
      )
  ),
  scoped_ads AS (
    SELECT
      mai.*,
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
      AND (
        (p_meta_campaign_id IS NOT NULL
          AND mai.campaign_id::text = p_meta_campaign_id
          AND mai.account_id IN (SELECT account_id FROM ws_accounts))
        OR
        ((p_local_campaign_id IS NOT NULL OR p_objective IS NOT NULL)
          AND ('CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1])
              IN (SELECT cr_code FROM local_crs))
      )
  ),
  meta_by_cr AS (
    SELECT
      s.cr_num,
      SUM(s.spend) AS spend,
      SUM(s.impressions) AS impressions,
      SUM(s.clicks) AS clicks,
      SUM(s.leads) AS leads_meta
    FROM scoped_ads s
    GROUP BY s.cr_num
  ),
  crm_by_cr AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS cr_num,
      COUNT(*) AS leads_crm,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS vendas,
      COALESCE(SUM(vf.valor_faturado), 0) AS faturamento
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    'CR-' || m.cr_num,
    nc.id,
    nc.name,
    COALESCE(m.spend, 0),
    COALESCE(m.impressions, 0)::bigint,
    COALESCE(m.clicks, 0)::bigint,
    COALESCE(m.leads_meta, 0)::bigint,
    COALESCE(cr.leads_crm, 0)::bigint,
    COALESCE(cr.vendas, 0)::bigint,
    COALESCE(cr.faturamento, 0),
    CASE WHEN cr.leads_crm > 0 THEN ROUND(m.spend / cr.leads_crm, 2) END,
    CASE WHEN m.spend > 0 THEN ROUND(cr.faturamento / m.spend, 2) END
  FROM meta_by_cr m
  LEFT JOIN crm_by_cr cr ON cr.cr_num = m.cr_num
  LEFT JOIN notion_creatives nc
    ON nc.external_id = 'CR-' || m.cr_num
   AND nc.workspace_id = p_workspace_id
  ORDER BY COALESCE(m.spend, 0) DESC;
END;
$function$;

-- C4. get_campaign_summary — mesmo bug no crm_agg.
CREATE OR REPLACE FUNCTION public.get_campaign_summary(p_workspace_id uuid, p_start_date date, p_end_date date, p_meta_campaign_id text DEFAULT NULL::text, p_local_campaign_id uuid DEFAULT NULL::uuid, p_objective text DEFAULT NULL::text)
RETURNS TABLE(spend numeric, impressions bigint, clicks bigint, reach bigint, leads_meta bigint, lp_views bigint, avg_ctr numeric, avg_cpm numeric, avg_cpc numeric, leads_crm bigint, mql_count bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric, cpl_crm numeric, cpmql numeric, cpv numeric, roas numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  ),
  local_crs AS (
    SELECT nc.external_id AS cr_code
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.external_id ~ 'CR-\d+'
      AND (
        (p_local_campaign_id IS NOT NULL AND nc.campaign_id = p_local_campaign_id)
        OR (p_objective IS NOT NULL AND nc.cta_objective = p_objective)
      )
  ),
  scoped_ads AS (
    SELECT
      mai.*,
      'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_code
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND (
        (p_meta_campaign_id IS NOT NULL
          AND mai.campaign_id::text = p_meta_campaign_id
          AND mai.account_id IN (SELECT account_id FROM ws_accounts))
        OR
        ((p_local_campaign_id IS NOT NULL OR p_objective IS NOT NULL)
          AND mai.ad_name ~ 'CR-\d+'
          AND ('CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1])
              IN (SELECT cr_code FROM local_crs))
      )
  ),
  meta_agg AS (
    SELECT
      COALESCE(SUM(s.spend), 0) AS spend,
      COALESCE(SUM(s.impressions), 0) AS impressions,
      COALESCE(SUM(s.clicks), 0) AS clicks,
      COALESCE(SUM(s.reach), 0) AS reach,
      COALESCE(SUM(s.leads), 0) AS leads_meta,
      COALESCE(SUM(s.landing_page_views), 0) AS lp_views,
      AVG(s.ctr) AS avg_ctr,
      AVG(s.cpm) AS avg_cpm,
      AVG(s.cpc) AS avg_cpc
    FROM scoped_ads s
  ),
  cr_set AS (
    SELECT DISTINCT s.cr_code FROM scoped_ads s WHERE s.cr_code IS NOT NULL
  ),
  crm_agg AS (
    SELECT
      COUNT(*) AS leads_crm,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mql_count,
      COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) AS reunioes,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS vendas,
      COALESCE(SUM(vf.valor_faturado), 0) AS faturamento,
      COALESCE(SUM(vf.valor_entrada), 0) AS caixa
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE c.workspace_id = p_workspace_id
      AND o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
      AND ('CR-' || (regexp_match(c.utm_term, 'CR-(\d+)'))[1])
          IN (SELECT cr_code FROM cr_set)
  )
  SELECT
    m.spend,
    m.impressions::bigint,
    m.clicks::bigint,
    m.reach::bigint,
    m.leads_meta::bigint,
    m.lp_views::bigint,
    ROUND(m.avg_ctr::numeric, 2),
    ROUND(m.avg_cpm::numeric, 2),
    ROUND(m.avg_cpc::numeric, 2),
    cr.leads_crm::bigint,
    cr.mql_count::bigint,
    cr.reunioes::bigint,
    cr.vendas::bigint,
    cr.faturamento,
    cr.caixa,
    CASE WHEN cr.leads_crm > 0 THEN ROUND(m.spend / cr.leads_crm, 2) END,
    CASE WHEN cr.mql_count > 0 THEN ROUND(m.spend / cr.mql_count, 2) END,
    CASE WHEN cr.vendas > 0 THEN ROUND(m.spend / cr.vendas, 2) END,
    CASE WHEN m.spend > 0 THEN ROUND(cr.faturamento / m.spend, 2) END
  FROM meta_agg m CROSS JOIN crm_agg cr;
END;
$function$;

-- C5. get_objectives — o CTE `meta` (meta_ads_insights) não tinha NENHUM
-- filtro de workspace; só o `cr_obj` (notion_creatives) era escopado. Como
-- o join é feito por número de criativo (cr_num), spend de outro workspace
-- com criativo de mesmo número contaminava o resultado.
CREATE OR REPLACE FUNCTION public.get_objectives(p_workspace_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE(objective text, total_spend numeric, total_impressions bigint, total_clicks bigint, leads_meta bigint, avg_ctr numeric, creative_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cr_obj AS (
    SELECT
      (regexp_match(nc.external_id, 'CR-(\d+)'))[1] AS cr_num,
      nc.cta_objective AS objective
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.cta_objective IS NOT NULL
      AND nc.external_id ~ 'CR-\d+'
  ),
  meta AS (
    SELECT
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks,
      SUM(mai.leads) AS leads,
      AVG(mai.ctr) AS ctr
    FROM meta_ads_insights mai
    WHERE mai.workspace_id = p_workspace_id
      AND mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    o.objective,
    COALESCE(SUM(m.spend), 0),
    COALESCE(SUM(m.impressions), 0)::bigint,
    COALESCE(SUM(m.clicks), 0)::bigint,
    COALESCE(SUM(m.leads), 0)::bigint,
    ROUND(AVG(m.ctr)::numeric, 2),
    COUNT(DISTINCT o.cr_num)::bigint
  FROM cr_obj o
  LEFT JOIN meta m ON m.cr_num = o.cr_num
  GROUP BY o.objective
  ORDER BY 2 DESC;
END;
$function$;

-- =============================================================================
-- CATEGORIA D — funções legadas do evento "ev-jun-26"/"PG33", zero-workspace-
-- aware, ZERO callers em eb-dash2/src ou supabase/functions hoje (grep
-- exaustivo). Não fazem sentido retrofitar workspace_id (nenhum caller real
-- passaria o parâmetro); a correção correta é fechar o acesso via PostgREST
-- por completo, já que são endpoints RPC públicos sem qualquer consumidor
-- interno — mantém as funções (histórico/auditoria pontual via service_role),
-- mas ninguém mais consegue chamá-las com a anon/authenticated key pública.
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.ganhou_ingresso() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_compradores_do_criativo(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_compras_evento() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_email_utm_source_map() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leads_do_criativo(text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leads_do_publico(text, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_origens() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_publicos_do_criativo(text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ranking_criativos(text, text, text[]) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_todos_leads_evento() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_utm_slugs_trafego() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.leads_pipeline_sem_compra() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ganhou_ingresso() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compradores_do_criativo(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compras_evento() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_email_utm_source_map() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leads_do_criativo(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leads_do_publico(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_origens() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_publicos_do_criativo(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ranking_criativos(text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_todos_leads_evento() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_utm_slugs_trafego() TO service_role;
GRANT EXECUTE ON FUNCTION public.leads_pipeline_sem_compra() TO service_role;

-- =============================================================================
-- CATEGORIA E — helpers de cron/worker/onboarding com EXECUTE concedido a
-- anon/authenticated sem necessidade: todos os callers reais em
-- supabase/functions usam SUPABASE_SERVICE_ROLE_KEY (confirmado por grep).
-- Nenhum destes é chamado pelo frontend. Fecha o acesso via PostgREST.
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.mark_weekly_reprocess_queue_processed(uuid, date, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_workspace_apps_and_permissions(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_tags_from_webhook_batch(integer, integer, boolean) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_tags_from_webhook_target(text, uuid, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_jobs() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_runs(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_weekly_reprocess_queue_processed(uuid, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.setup_workspace_apps_and_permissions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_tags_from_webhook_batch(integer, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_tags_from_webhook_target(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_runs(integer) TO service_role;

-- =============================================================================
-- CATEGORIA F — oráculo de enumeração: get_user_workspace_ids/
-- get_user_admin_workspace_ids/get_user_owner_workspace_ids(p_user_id) não
-- checam p_user_id = auth.uid(), permitindo que qualquer autenticado
-- descubra a quais workspaces QUALQUER OUTRO usuário pertence (por UUID) —
-- e get_user_auth_events(p_user_id) expõe IP/ação/data de login de QUALQUER
-- usuário (PII, LGPD). Zero callers internos (nenhuma outra função SQL as
-- referencia, verificado via prosrc) e zero callers em eb-dash2/src ou
-- supabase/functions — fecha totalmente.
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_admin_workspace_ids(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_owner_workspace_ids(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_auth_events(uuid, integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_admin_workspace_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_owner_workspace_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_auth_events(uuid, integer) TO service_role;

-- =============================================================================
-- VIEW — ai_conversation_stats: sem security_invoker (owner=postgres,
-- BYPASSRLS), agrega ai_conversations/ai_messages sem nenhum filtro de
-- workspace_id ou user_id, exposta a anon+authenticated. As tabelas base já
-- têm RLS correta (own-user + workspace); ligar security_invoker é
-- suficiente e é o MESMO padrão já usado no round2 (20261004000002) para
-- v_creative_metrics/v_disparo_metricas/etc — mudança estritamente aditiva
-- de restrição, nunca abre acesso que não existia.
-- =============================================================================
ALTER VIEW public.ai_conversation_stats SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
RESET statement_timeout;
