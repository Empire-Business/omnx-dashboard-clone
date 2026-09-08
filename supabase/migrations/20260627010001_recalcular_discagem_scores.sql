-- Função que recalcula scores dinâmicos do discador a cada 2 minutos
-- Fórmula: sinal_quente 40% + urgencia_tempo 35% + tentativas 20% + fonte 5%

CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora TIMESTAMPTZ := now();
BEGIN
  -- Remove leads que saíram dos pipelines ativos
  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o
    WHERE o.id = ds.oportunidade_id
      AND o.status = 'open'
      AND o.pipeline_id IS NOT NULL
      AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
  );

  -- Upsert dos scores para todos os leads ativos
  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte,
    updated_at
  )
  SELECT
    o.id                                                    AS oportunidade_id,
    o.contato_id                                            AS contato_id,

    -- Score final ponderado (0–100)
    LEAST(100, ROUND(
      (sig.pts * 0.40) +
      (urg.pts * 0.35) +
      (tent.pts * 0.20) +
      (fonte.pts * 0.05)
    ))::INTEGER                                             AS score,

    -- Estado baseado no score final
    CASE
      WHEN LEAST(100, ROUND(
             (sig.pts*0.40)+(urg.pts*0.35)+(tent.pts*0.20)+(fonte.pts*0.05)
           )) >= 65 THEN 'ligue_agora'
      WHEN LEAST(100, ROUND(
             (sig.pts*0.40)+(urg.pts*0.35)+(tent.pts*0.20)+(fonte.pts*0.05)
           )) >= 30 THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                     AS estado,

    -- Razão do componente dominante
    CASE
      WHEN sig.pts  >= urg.pts  AND sig.pts  >= tent.pts THEN sig.razao
      WHEN urg.pts  >= tent.pts                          THEN urg.razao
      ELSE tent.razao
    END                                                     AS razao,

    CASE
      WHEN sig.pts  >= urg.pts  AND sig.pts  >= tent.pts THEN 'sinal_quente'
      WHEN urg.pts  >= tent.pts                          THEN 'urgencia'
      ELSE 'tentativas'
    END                                                     AS componente_dom,

    sig.pts::INTEGER                                        AS score_sinal,
    urg.pts::INTEGER                                        AS score_urgencia,
    tent.pts::INTEGER                                       AS score_tentativas,
    fonte.pts::INTEGER                                      AS score_fonte,
    _agora                                                  AS updated_at

  FROM oportunidades o

  -- SINAL QUENTE (peso 40%): inbound recente via comunicacoes
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

  -- URGÊNCIA DE TEMPO (peso 35%): tempo desde data_lead_recebido
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

  -- TENTATIVAS (peso 20%): chamadas outbound nas últimas 72h
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

  -- FONTE DE TRÁFEGO (peso 5%)
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

-- Cron a cada 2 minutos
SELECT cron.schedule(
  'recalcular-discagem-scores',
  '*/2 * * * *',
  'SELECT recalcular_discagem_scores()'
);
