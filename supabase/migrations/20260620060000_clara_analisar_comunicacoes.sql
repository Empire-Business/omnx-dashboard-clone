-- Análise agregada de comunicações (mensagens e ligações).
-- Retorna contagens por período, sem expor textos de mensagens ou PII em massa.
-- Visão PRODUTIVIDADE: filtra por data_comunicacao no período.

CREATE OR REPLACE FUNCTION analisar_comunicacoes(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_sdr_name TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT NULL,
  p_direction TEXT DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  total_mensagens BIGINT,
  mensagens_enviadas BIGINT,
  mensagens_recebidas BIGINT,
  ligacoes BIGINT,
  ligacoes_atendidas BIGINT,
  tempo_medio_resposta_minutos NUMERIC,
  leads_contatados BIGINT,
  mqls_contatados BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.contato_id,
      c.channel,
      c.direction,
      c.tipo,
      c.msg_status,
      c.phone_call_status,
      c.data_comunicacao,
      c.ghl_source,
      c.ghl_conversation_id,
      COALESCE(c.sdr_name, ct.owner_name) AS sdr_name,
      ct.tags
    FROM comunicacoes c
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    LEFT JOIN oportunidades o ON o.id = c.oportunidade_id
    WHERE c.data_comunicacao >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND c.data_comunicacao <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_channel IS NULL OR c.channel = p_channel)
      AND (p_direction IS NULL OR c.direction = p_direction)
      AND (
        p_sdr_name IS NULL
        OR COALESCE(c.sdr_name, '') ILIKE '%' || p_sdr_name || '%'
        OR COALESCE(ct.owner_name, '') ILIKE '%' || p_sdr_name || '%'
      )
      AND (o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT OR c.oportunidade_id IS NULL)
  ),
  conversation_pairs AS (
    SELECT
      b.sdr_name,
      b.ghl_conversation_id,
      b.data_comunicacao,
      b.direction,
      b.ghl_source,
      LAG(b.data_comunicacao) OVER (PARTITION BY b.ghl_conversation_id ORDER BY b.data_comunicacao) AS prev_ts,
      LAG(b.direction) OVER (PARTITION BY b.ghl_conversation_id ORDER BY b.data_comunicacao) AS prev_dir
    FROM base b
    WHERE b.ghl_conversation_id IS NOT NULL
  ),
  responses AS (
    SELECT
      sdr_name,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) / 60.0 AS diff_minutes
    FROM conversation_pairs
    WHERE direction = 'outbound'
      AND prev_dir = 'inbound'
      AND ghl_source = 'app'
      AND prev_ts IS NOT NULL
      AND data_comunicacao > prev_ts
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  ),
  response_times AS (
    SELECT
      CASE WHEN p_group_by = 'sdr' THEN COALESCE(sdr_name, 'Sem SDR') ELSE 'Total' END AS gkey,
      AVG(diff_minutes) AS avg_minutes
    FROM responses
    GROUP BY gkey
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'sdr' THEN COALESCE(b.sdr_name, 'Sem SDR')
        WHEN p_group_by = 'channel' THEN COALESCE(b.channel, 'Sem canal')
        WHEN p_group_by = 'direction' THEN COALESCE(b.direction, 'Sem direction')
        WHEN p_group_by = 'month' THEN TO_CHAR(b.data_comunicacao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS total_mensagens,
      COUNT(*) FILTER (WHERE b.direction = 'outbound') AS mensagens_enviadas,
      COUNT(*) FILTER (WHERE b.direction = 'inbound') AS mensagens_recebidas,
      COUNT(*) FILTER (WHERE b.channel = 'call' OR b.tipo = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (
        WHERE (b.channel = 'call' OR b.tipo = 'ligacao')
          AND COALESCE(b.phone_call_status, b.msg_status) = 'completed'
      ) AS ligacoes_atendidas,
      COUNT(DISTINCT b.contato_id) AS leads_contatados,
      COUNT(DISTINCT b.contato_id) FILTER (
        WHERE b.tags IS NOT NULL
          AND (
            b.tags::TEXT ILIKE '%"mql"%'
            OR b.tags::TEXT ILIKE '%mql%'
          )
      ) AS mqls_contatados
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey AS group_key,
    a.total_mensagens,
    a.mensagens_enviadas,
    a.mensagens_recebidas,
    a.ligacoes,
    a.ligacoes_atendidas,
    rt.avg_minutes::NUMERIC AS tempo_medio_resposta_minutos,
    a.leads_contatados,
    a.mqls_contatados
  FROM aggr a
  LEFT JOIN response_times rt
    ON (p_group_by = 'sdr' AND rt.gkey = a.gkey)
    OR (p_group_by <> 'sdr' AND rt.gkey = 'Total')
  ORDER BY
    CASE WHEN p_group_by = 'month' THEN a.gkey END ASC NULLS LAST,
    CASE WHEN p_group_by <> 'month' THEN a.total_mensagens END DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION analisar_comunicacoes(DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Retorna métricas agregadas de comunicações (mensagens e ligações) por período. '
'Não expoe textos de mensagens nem PII. '
'group_by: none | sdr | channel | direction | month.';

NOTIFY pgrst, 'reload schema';
