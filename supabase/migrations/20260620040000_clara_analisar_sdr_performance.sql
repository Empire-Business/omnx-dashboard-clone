-- Performance de SDRs cohort e produtividade

CREATE OR REPLACE FUNCTION analisar_sdr_performance(
  p_start_date DATE,
  p_end_date DATE,
  p_mode TEXT DEFAULT 'cohort',
  p_sdr_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  sdr TEXT,
  leads BIGINT,
  mqls BIGINT,
  conectados BIGINT,
  agendados BIGINT,
  reunioes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_mode = 'cohort' THEN
    RETURN QUERY
    WITH official_sdrs AS (
      SELECT nome FROM ghl_users
      WHERE papeis @> '["sdr"]'::jsonb AND deleted = false
    ),
    base AS (
      SELECT
        COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr_name_raw,
        o.data_conectado,
        o.data_agendamento_reuniao,
        o.data_realizacao_vendas,
        c.tags
      FROM oportunidades o
      JOIN contatos c ON c.id = o.contato_id
      WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
        AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
        AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
        AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
    )
    SELECT
      b.sdr_name_raw AS sdr,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
      COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
      COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes
    FROM base b
    WHERE EXISTS (SELECT 1 FROM official_sdrs os WHERE os.nome = b.sdr_name_raw)
       OR p_sdr_name IS NOT NULL
    GROUP BY b.sdr_name_raw
    ORDER BY leads DESC;
  ELSE
    RETURN QUERY
    WITH official_sdrs AS (
      SELECT nome FROM ghl_users
      WHERE papeis @> '["sdr"]'::jsonb AND deleted = false
    ),
    base AS (
      SELECT
        COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr_name_raw,
        o.data_conectado,
        o.data_agendamento_reuniao,
        o.data_realizacao_vendas
      FROM oportunidades o
      JOIN contatos c ON c.id = o.contato_id
      WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
        AND o.data_lead_recebido >= ((p_start_date::DATE - INTERVAL '2 years')::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
        AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
    )
    SELECT
      b.sdr_name_raw AS sdr,
      COUNT(*) AS leads,
      0::BIGINT AS mqls,
      COUNT(*) FILTER (WHERE b.data_conectado >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_conectado <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_agendamento_reuniao <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS agendados,
      COUNT(*) FILTER (WHERE b.data_realizacao_vendas >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_realizacao_vendas <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS reunioes
    FROM base b
    WHERE EXISTS (SELECT 1 FROM official_sdrs os WHERE os.nome = b.sdr_name_raw)
       OR p_sdr_name IS NOT NULL
    GROUP BY b.sdr_name_raw
    ORDER BY leads DESC;
  END IF;
END;
$$;

COMMENT ON FUNCTION analisar_sdr_performance(DATE, DATE, TEXT, TEXT) IS
'Retorna performance de SDRs. Modo cohort por data_lead_recebido; produtividade por data do evento.';
