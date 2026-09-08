-- Fix: COALESCE nos componentes do score para evitar NULL quando
-- não há comunicações recentes (sig.pts tornaria NULL sem o COALESCE)
-- ou quando contatos não tem linha correspondente (fonte.pts)
-- sig e tent já usam MAX/COUNT que retornam NULL em CASE -> ELSE 0
-- mas fonte usa SELECT puro sem FROM agregador -> pode retornar 0 rows

CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora TIMESTAMPTZ := now();
BEGIN
  -- Remove leads que saíram dos pipelines ativos do discador
  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o
    WHERE o.id = ds.oportunidade_id
      AND o.status = 'open'
      AND o.pipeline_id IS NOT NULL
      AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
  );

  -- Upsert dos scores para leads dos pipelines do discador apenas
  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte,
    updated_at
  )
  SELECT
    o.id                                                    AS oportunidade_id,
    o.contato_id                                            AS contato_id,

    LEAST(100, ROUND(
      (COALESCE(sig.pts, 0) * 0.40) +
      (COALESCE(urg.pts, 5) * 0.35) +
      (COALESCE(tent.pts, 100) * 0.20) +
      (COALESCE(fonte.pts, 50) * 0.05)
    ))::INTEGER                                             AS score,

    CASE
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+(COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 65 THEN 'ligue_agora'
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+(COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 30 THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                     AS estado,

    CASE
      WHEN COALESCE(sig.pts, 0)  >= COALESCE(urg.pts, 5)  AND COALESCE(sig.pts, 0)  >= COALESCE(tent.pts, 100) THEN sig.razao
      WHEN COALESCE(urg.pts, 5)  >= COALESCE(tent.pts, 100)                                                      THEN urg.razao
      ELSE tent.razao
    END                                                     AS razao,

    CASE
      WHEN COALESCE(sig.pts, 0)  >= COALESCE(urg.pts, 5)  AND COALESCE(sig.pts, 0)  >= COALESCE(tent.pts, 100) THEN 'sinal_quente'
      WHEN COALESCE(urg.pts, 5)  >= COALESCE(tent.pts, 100)                                                      THEN 'urgencia'
      ELSE 'tentativas'
    END                                                     AS componente_dom,

    COALESCE(sig.pts, 0)::INTEGER                           AS score_sinal,
    COALESCE(urg.pts, 5)::INTEGER                           AS score_urgencia,
    COALESCE(tent.pts, 100)::INTEGER                        AS score_tentativas,
    COALESCE(fonte.pts, 50)::INTEGER                        AS score_fonte,
    _agora                                                  AS updated_at

  FROM oportunidades o

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
               > (_agora - INTERVAL '30 minutes')                              THEN 100
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
               > (_agora - INTERVAL '2 hours')                                 THEN 70
        WHEN MAX(c.data_comunicacao) FILTER (
               WHERE c.direction = 'inbound'
                 AND c.data_comunicacao > (_agora - INTERVAL '24 hours')
             ) IS NOT NULL
          AND MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound')
               IS NULL                                                         THEN 90
        ELSE 0
      END AS pts,
      CASE
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
               > (_agora - INTERVAL '30 minutes')
          THEN 'respondeu há ' ||
               GREATEST(1, ROUND(
                 EXTRACT(EPOCH FROM (_agora -
                   MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
                 )) / 60
               ))::TEXT || ' min'
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
               > (_agora - INTERVAL '2 hours')
          THEN 'respondeu há ' ||
               ROUND(
                 EXTRACT(EPOCH FROM (_agora -
                   MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'inbound')
                 )) / 3600, 1
               )::TEXT || 'h'
        WHEN MAX(c.data_comunicacao) FILTER (
               WHERE c.direction = 'inbound'
                 AND c.data_comunicacao > (_agora - INTERVAL '24 hours')
             ) IS NOT NULL
          AND MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') IS NULL
          THEN 'mensagem sem resposta do SDR'
        ELSE 'sem sinal recente'
      END AS razao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.data_comunicacao > (_agora - INTERVAL '24 hours')
  ) sig ON true

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN o.data_lead_recebido > (_agora - INTERVAL '15 minutes') THEN 100
        WHEN o.data_lead_recebido > (_agora - INTERVAL '1 hour')     THEN 75
        WHEN o.data_lead_recebido > (_agora - INTERVAL '4 hours')    THEN 45
        WHEN o.data_lead_recebido > (_agora - INTERVAL '12 hours')   THEN 20
        ELSE 5
      END AS pts,
      CASE
        WHEN o.data_lead_recebido > (_agora - INTERVAL '15 minutes')
          THEN 'lead novo, ' ||
               GREATEST(1, ROUND(
                 EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 60
               ))::TEXT || ' min sem contato'
        WHEN o.data_lead_recebido > (_agora - INTERVAL '1 hour')
          THEN 'chegou há ' ||
               ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 60)::TEXT || ' min'
        WHEN o.data_lead_recebido > (_agora - INTERVAL '4 hours')
          THEN 'chegou há ' ||
               ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 3600, 1)::TEXT || 'h'
        WHEN o.data_lead_recebido > (_agora - INTERVAL '12 hours')
          THEN 'chegou há ' ||
               ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 3600, 1)::TEXT || 'h'
        ELSE ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 86400)::TEXT || 'd na base'
      END AS razao
  ) urg ON true

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call'
                 AND c.direction = 'outbound'
                 AND c.ghl_source = 'app'
             ) = 0  THEN 100
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call'
                 AND c.direction = 'outbound'
                 AND c.ghl_source = 'app'
             ) = 1  THEN 70
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call'
                 AND c.direction = 'outbound'
                 AND c.ghl_source = 'app'
             ) = 2  THEN 40
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call'
                 AND c.direction = 'outbound'
                 AND c.ghl_source = 'app'
             ) = 3  THEN 15
        ELSE 0
      END AS pts,
      CASE
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 0  THEN 'nenhuma tentativa ainda'
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 1  THEN '1ª tentativa — sem resposta'
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 2  THEN '2ª tentativa'
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 3  THEN '3ª tentativa — cooldown ativo'
        ELSE 'cooldown — migrar para mensagem'
      END AS razao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.data_comunicacao > (_agora - INTERVAL '72 hours')
  ) tent ON true

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN LOWER(ct.utm_source) LIKE '%meta%'
          OR LOWER(ct.utm_source) LIKE '%facebook%'
          OR LOWER(ct.utm_source) LIKE '%fb%'     THEN 80
        WHEN LOWER(ct.utm_source) LIKE '%google%' THEN 70
        ELSE 50
      END AS pts
    FROM contatos ct
    WHERE ct.id = o.contato_id
    LIMIT 1
  ) fonte ON true

  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id       = EXCLUDED.contato_id,
    score            = EXCLUDED.score,
    estado           = EXCLUDED.estado,
    razao            = EXCLUDED.razao,
    componente_dom   = EXCLUDED.componente_dom,
    score_sinal      = EXCLUDED.score_sinal,
    score_urgencia   = EXCLUDED.score_urgencia,
    score_tentativas = EXCLUDED.score_tentativas,
    score_fonte      = EXCLUDED.score_fonte,
    updated_at       = EXCLUDED.updated_at;
END;
$$;
