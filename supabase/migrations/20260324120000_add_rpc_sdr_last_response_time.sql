-- RPC: get_sdr_last_response_time
-- Retorna o gap (em segundos) entre a última mensagem inbound de um lead
-- e a resposta outbound manual do SDR, para cada SDR no período.
-- Diferente de get_sdr_avg_response_time (que agrega tudo), aqui pegamos
-- apenas o par mais recente (ROW_NUMBER rn=1) por SDR.

CREATE OR REPLACE FUNCTION get_sdr_last_response_time(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  sdr_name              TEXT,
  usuario_ghl_id        TEXT,
  last_response_seconds INTEGER,
  last_response_at      TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT
      ghl_conversation_id,
      usuario_ghl_id,
      direction,
      ghl_source,
      data_comunicacao,
      LAG(direction)        OVER (PARTITION BY ghl_conversation_id ORDER BY data_comunicacao) AS prev_direction,
      LAG(data_comunicacao) OVER (PARTITION BY ghl_conversation_id ORDER BY data_comunicacao) AS prev_ts
    FROM comunicacoes
    WHERE data_comunicacao >= p_start
      AND data_comunicacao <= p_end
  ),
  responses AS (
    SELECT
      usuario_ghl_id,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts))::integer AS seconds,
      data_comunicacao,
      ROW_NUMBER() OVER (
        PARTITION BY usuario_ghl_id
        ORDER BY data_comunicacao DESC
      ) AS rn
    FROM ordered
    WHERE direction      = 'outbound'
      AND ghl_source     = 'app'
      AND prev_direction = 'inbound'
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  )
  SELECT
    u.nome              AS sdr_name,
    r.usuario_ghl_id,
    r.seconds           AS last_response_seconds,
    r.data_comunicacao  AS last_response_at
  FROM responses r
  JOIN ghl_users u ON u.ghl_id = r.usuario_ghl_id
  WHERE r.rn = 1;
$$;
