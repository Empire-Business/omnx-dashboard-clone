-- RPC function to calculate average response time per SDR
-- Measures time gap between inbound messages and subsequent outbound app messages

CREATE OR REPLACE FUNCTION get_sdr_avg_response_time(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  sdr_name            TEXT,
  usuario_ghl_id      TEXT,
  avg_response_seconds INTEGER,
  response_count      INTEGER
)
LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT
      ghl_conversation_id,
      usuario_ghl_id,
      direction,
      ghl_source,
      data_comunicacao,
      LAG(direction) OVER (
        PARTITION BY ghl_conversation_id ORDER BY data_comunicacao
      ) AS prev_direction,
      LAG(data_comunicacao) OVER (
        PARTITION BY ghl_conversation_id ORDER BY data_comunicacao
      ) AS prev_ts
    FROM comunicacoes
    WHERE data_comunicacao >= p_start
      AND data_comunicacao <= p_end
      AND direction IS NOT NULL
      AND ghl_conversation_id IS NOT NULL
  ),
  responses AS (
    SELECT
      usuario_ghl_id,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts))::integer AS seconds
    FROM ordered
    WHERE direction = 'outbound'
      AND ghl_source = 'app'
      AND prev_direction = 'inbound'
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  )
  SELECT
    u.nome               AS sdr_name,
    r.usuario_ghl_id,
    ROUND(AVG(r.seconds))::integer AS avg_response_seconds,
    COUNT(*)::integer    AS response_count
  FROM responses r
  JOIN ghl_users u ON u.ghl_id = r.usuario_ghl_id
  GROUP BY r.usuario_ghl_id, u.nome;
$$;
