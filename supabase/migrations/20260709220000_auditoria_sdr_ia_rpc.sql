-- Migration: auditoria_sdr_ia RPC
-- Cria função PostgreSQL para agregar os problemas do painel SDR IA no servidor,
-- eliminando a necessidade de carregar dezenas de milhares de comunicações no
-- frontend e reduzindo o tempo de carregamento do painel.
--
-- A classificação de "mensagem da IA" usa a mesma regra da view
-- comunicacoes_com_remetente: direction='outbound' AND autor='automacao'.
-- A tag [CP] SDR IA NÃO é mais critério de entrada — é apenas um filtro opcional.

CREATE OR REPLACE FUNCTION auditoria_sdr_ia(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_include_tags text[] DEFAULT NULL,
  p_exclude_tags text[] DEFAULT NULL,
  p_include_pipelines text[] DEFAULT NULL,
  p_exclude_pipelines text[] DEFAULT NULL,
  p_include_utm_source text[] DEFAULT NULL,
  p_exclude_utm_source text[] DEFAULT NULL,
  p_include_utm_campaign text[] DEFAULT NULL,
  p_exclude_utm_campaign text[] DEFAULT NULL
)
RETURNS TABLE(
  contato_id uuid,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  contato_tags text[],
  opp_id uuid,
  sdr_humano text,
  tipo text,
  severidade text,
  detalhes text,
  ultima_interacao timestamptz,
  msg_ia integer,
  msg_lead integer,
  channel text,
  error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_cutoff_7d timestamptz;
BEGIN
  -- Converte datas para intervalo em BRT (America/Sao_Paulo)
  v_start_ts := timezone('America/Sao_Paulo', (p_start_date::text || ' 00:00:00')::timestamp);
  v_end_ts   := timezone('America/Sao_Paulo', (p_end_date::text || ' 23:59:59')::timestamp);
  v_cutoff_7d := timezone('America/Sao_Paulo', ((current_date - interval '7 days')::date::text || ' 00:00:00')::timestamp);

  RETURN QUERY
  WITH
  -- Universo: contatos do workspace que receberam mensagem outbound da IA no período.
  -- Filtros de UTM source/campaign são aplicados aqui (server-side).
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
      AND (p_include_utm_source IS NULL OR ct.utm_source = ANY(p_include_utm_source))
      AND (p_exclude_utm_source IS NULL OR ct.utm_source IS NULL OR NOT (ct.utm_source = ANY(p_exclude_utm_source)))
      AND (p_include_utm_campaign IS NULL OR ct.utm_campaign::text = ANY(p_include_utm_campaign))
      AND (p_exclude_utm_campaign IS NULL OR ct.utm_campaign IS NULL OR NOT (ct.utm_campaign::text = ANY(p_exclude_utm_campaign)))
  ),
  -- Dados dos contatos no universo
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
      -- Filtro de tags (CSV): incluir/excluir
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
  -- Oportunidade mais recente por contato (apenas uma), respeitando filtros de pipeline
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
  -- Estatísticas de mensagens por contato no período
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
  -- Última mensagem de automação com erro por contato
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
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.msg_status = 'failed'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    ORDER BY c.contato_id, c.data_comunicacao DESC
  ),
  -- Mensagens rápidas (spam): diferença < 10min entre mensagens de automação consecutivas
  spam_calc AS (
    SELECT
      c.contato_id AS spcid,
      COUNT(*) FILTER (WHERE diff_seg < 600) AS qtd_rapidas_10min,
      COUNT(*) FILTER (WHERE diff_seg < 300) AS qtd_rapidas_5min,
      MAX(c.data_comunicacao) AS ultima_data
    FROM (
      SELECT
        c.contato_id,
        c.data_comunicacao,
        EXTRACT(EPOCH FROM (c.data_comunicacao - LAG(c.data_comunicacao) OVER (PARTITION BY c.contato_id ORDER BY c.data_comunicacao))) AS diff_seg
      FROM comunicacoes c
      JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
      JOIN contatos ct ON ct.id = c.contato_id
      WHERE ct.workspace_id = p_workspace_id
        AND c.contato_id IN (SELECT cid FROM contato_info)
        AND ccr.autor = 'automacao'
        AND c.direction = 'outbound'
        AND c.data_comunicacao >= v_start_ts
        AND c.data_comunicacao <= v_end_ts
    ) c
    GROUP BY c.contato_id
  ),
  -- Horário inadequado: mensagens de automação entre 22h e 08h (BRT)
  horario_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS hcid,
      EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao))::int AS hora_sp,
      c.data_comunicacao AS hdata,
      c.channel AS hchannel
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao)) NOT BETWEEN 8 AND 21
    ORDER BY c.contato_id, c.data_comunicacao DESC
  )
  -- 1) Sem follow-up: último outbound (IA ou humano) há mais de 7 dias
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'sem_followup'::text,
    CASE WHEN s.ultimo_outbound < timezone('America/Sao_Paulo', ((current_date - interval '14 days') || ' 00:00:00')::timestamp) THEN 'alta' ELSE 'media' END,
    ('Último contato há ' || GREATEST(1, (extract(epoch from (now() - s.ultimo_outbound))/86400)::int) || ' dias (IA + humano)')::text,
    s.ultimo_outbound,
    NULL::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.ultimo_outbound < v_cutoff_7d

  UNION ALL

  -- 2) Erro de entrega
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'erro_entrega'::text,
    CASE
      WHEN lower(ei.eerror) LIKE '%invalid%' OR lower(ei.eerror) LIKE '%block%' OR lower(ei.eerror) LIKE '%unavailable%'
      THEN 'alta' ELSE 'media'
    END,
    ('Mensagem não entregue via ' || COALESCE(ei.echannel, '?') || ': ' || COALESCE(ei.eerror, 'Erro desconhecido'))::text,
    ei.edata,
    NULL::integer,
    NULL::integer,
    ei.echannel,
    ei.eerror
  FROM contato_info ci
  JOIN erro_info ei ON ei.ecid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  -- 3) Spam / excesso
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'spam'::text,
    CASE WHEN sp.qtd_rapidas_5min > 5 THEN 'alta' ELSE 'media' END,
    (sp.qtd_rapidas_10min || ' mensagens rápidas (em <10min)')::text,
    sp.ultima_data,
    s.qtd_ia::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN spam_calc sp ON sp.spcid = ci.cid
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE sp.qtd_rapidas_10min > 5

  UNION ALL

  -- 4) Horário inadequado
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'horario_inadequado'::text,
    CASE WHEN hi.hora_sp >= 0 AND hi.hora_sp < 6 THEN 'media' ELSE 'baixa' END,
    ('Mensagem enviada às ' || hi.hora_sp || ':00 (fora do horário comercial 08:00-22:00)')::text,
    hi.hdata,
    NULL::integer,
    NULL::integer,
    hi.hchannel,
    NULL::text
  FROM contato_info ci
  JOIN horario_info hi ON hi.hcid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  -- 5) Conversa unilateral
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'conversa_unilateral'::text,
    CASE WHEN s.qtd_ia > 5 THEN 'media' ELSE 'baixa' END,
    (s.qtd_ia || ' mensagens da IA, 0 respostas do lead')::text,
    v_end_ts,
    s.qtd_ia::integer,
    0,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 3 AND s.qtd_lead = 0

  UNION ALL

  -- 6) Conflito IA / humano
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'conflito_humano'::text,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      AND EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      THEN 'alta' ELSE 'media'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      AND EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      THEN 'Mensagens de IA e humano no mesmo dia'
      ELSE 'Lead recebeu mensagens de IA e humano'
    END::text,
    COALESCE(
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c
       JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor != 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts),
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c
       JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor = 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts)
    ),
    NULL::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 0 AND s.qtd_humano > 0;
END;
$$;
