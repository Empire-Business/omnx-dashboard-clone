-- Integração GHL appointments → fila de discagem (camada horario_marcado automática)
--
-- Problema anterior: sync-appointment-dates guardava só a data (DATE) do appointment,
-- jogando fora o horário. Agora sincronizamos o timestamp completo em data_reuniao_agendada_ts.
-- O motor de discagem usa esse campo para detectar automaticamente a camada horario_marcado
-- sem precisar de input manual do SDR.
--
-- Também adicionamos campos de diagnóstico ao discagem_scores para o card exibir
-- horários exatos (entrada do lead e retorno previsto).

-- 1. Coluna de timestamp completo do appointment GHL em oportunidades
ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS data_reuniao_agendada_ts TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_oportunidades_reuniao_ts
  ON oportunidades(data_reuniao_agendada_ts)
  WHERE data_reuniao_agendada_ts IS NOT NULL;

-- 2. Campos de exibição no card de discagem
ALTER TABLE discagem_scores
  ADD COLUMN IF NOT EXISTS data_entrada_lead TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_retorno_previsto TIMESTAMPTZ DEFAULT NULL;

-- 3. Reescreve recalcular_discagem_scores() com detecção automática via GHL
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
  -- OU com 7+ tentativas (encerramento de cadência)
  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
          SELECT 1 FROM oportunidades o
          WHERE o.id = ds.oportunidade_id
            AND o.status = 'open'
            AND o.pipeline_id IS NOT NULL
            AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
        )
     OR (
          SELECT COUNT(*)
          FROM comunicacoes c
          WHERE c.contato_id = ds.contato_id
            AND c.channel = 'call'
            AND c.direction = 'outbound'
            AND c.ghl_source = 'app'
            AND c.data_comunicacao > (_agora - INTERVAL '14 days')
        ) >= 7;

  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte,
    camada, numero_tentativa, canal_sugerido,
    data_retorno_combinado,
    data_entrada_lead, data_retorno_previsto,
    updated_at
  )
  SELECT
    o.id                                                        AS oportunidade_id,
    o.contato_id                                                AS contato_id,

    -- Score ponderado (0–100) — sub-ordena dentro da camada
    LEAST(100, ROUND(
      (COALESCE(sig.pts, 0)    * 0.40) +
      (COALESCE(urg.pts, 5)    * 0.35) +
      (COALESCE(tent.pts, 100) * 0.20) +
      (COALESCE(fonte.pts, 50) * 0.05)
    ))::INTEGER                                                 AS score,

    -- Estado legado por compatibilidade
    CASE
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+
             (COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 65 THEN 'ligue_agora'
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+
             (COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 30 THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                         AS estado,

    rz.razao                                                    AS razao,

    CASE
      WHEN COALESCE(sig.pts,0)   >= COALESCE(urg.pts,5)  AND COALESCE(sig.pts,0)   >= COALESCE(tent.pts,100) THEN 'sinal_quente'
      WHEN COALESCE(urg.pts,5)   >= COALESCE(tent.pts,100)                                                    THEN 'urgencia'
      ELSE 'tentativas'
    END                                                         AS componente_dom,

    COALESCE(sig.pts, 0)::INTEGER                               AS score_sinal,
    COALESCE(urg.pts, 5)::INTEGER                               AS score_urgencia,
    COALESCE(tent.pts, 100)::INTEGER                            AS score_tentativas,
    COALESCE(fonte.pts, 50)::INTEGER                            AS score_fonte,

    cam.camada                                                  AS camada,
    COALESCE(tent14.n, 0)                                       AS numero_tentativa,
    cam.canal_sugerido                                          AS canal_sugerido,
    ds_prev.data_retorno_combinado                              AS data_retorno_combinado,

    -- Horários exatos para exibir no card
    o.data_lead_recebido                                        AS data_entrada_lead,
    COALESCE(
      ds_prev.data_retorno_combinado,   -- override manual do SDR
      o.data_reuniao_agendada_ts        -- appointment GHL sincronizado
    )                                                           AS data_retorno_previsto,

    _agora                                                      AS updated_at

  FROM oportunidades o

  -- Linha existente: preserva data_retorno_combinado manual
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

  -- SINAL QUENTE (peso 40%): última mensagem inbound recente
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
          AND MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') IS NULL THEN 90
        ELSE 0
      END AS pts
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.data_comunicacao > (_agora - INTERVAL '24 hours')
  ) sig ON true

  -- URGÊNCIA DE TEMPO (peso 35%)
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN o.data_lead_recebido > (_agora - INTERVAL '15 minutes') THEN 100
        WHEN o.data_lead_recebido > (_agora - INTERVAL '1 hour')     THEN 75
        WHEN o.data_lead_recebido > (_agora - INTERVAL '4 hours')    THEN 45
        WHEN o.data_lead_recebido > (_agora - INTERVAL '12 hours')   THEN 20
        ELSE 5
      END AS pts
  ) urg ON true

  -- TENTATIVAS (peso 20%): calls outbound 72h
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 0 THEN 100
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 1 THEN 70
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 2 THEN 40
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 3 THEN 15
        ELSE 0
      END AS pts
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

  -- TOTAL DE TENTATIVAS (14 dias) — define canal e camada cadencia
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  -- ÚLTIMA MENSAGEM INBOUND (sem limite de tempo) — detecta camada respondeu
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  -- CAMADA + CANAL SUGERIDO
  -- horario_marcado: override manual SDR OU appointment GHL dentro da janela de ±30min/+60min
  LEFT JOIN LATERAL (
    SELECT
      CASE
        -- Override manual tem prioridade
        WHEN ds_prev.data_retorno_combinado IS NOT NULL
          AND ds_prev.data_retorno_combinado
              BETWEEN (_agora - INTERVAL '30 minutes') AND (_agora + INTERVAL '60 minutes')
          THEN 'horario_marcado'
        -- Appointment GHL sincronizado automaticamente
        WHEN o.data_reuniao_agendada_ts IS NOT NULL
          AND o.data_reuniao_agendada_ts
              BETWEEN (_agora - INTERVAL '30 minutes') AND (_agora + INTERVAL '60 minutes')
          THEN 'horario_marcado'
        -- Respondeu recentemente
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '2 hours')
          THEN 'respondeu'
        -- Lead novo sem tentativas
        WHEN o.data_lead_recebido > (_agora - INTERVAL '30 minutes')
          AND COALESCE(tent14.n, 0) = 0
          THEN 'lead_novo'
        ELSE 'cadencia'
      END AS camada,
      CASE
        WHEN COALESCE(tent14.n, 0) <= 2 THEN 'call'
        WHEN COALESCE(tent14.n, 0) <= 4 THEN 'whatsapp'
        ELSE 'sms'
      END AS canal_sugerido
  ) cam ON true

  -- RAZÃO (linguagem humana) por camada
  LEFT JOIN LATERAL (
    SELECT CASE cam.camada
      WHEN 'horario_marcado' THEN
        CASE
          WHEN COALESCE(ds_prev.data_retorno_combinado, o.data_reuniao_agendada_ts) <= (_agora + INTERVAL '5 minutes')
            THEN 'Retorno combinado para agora'
          ELSE 'Retorno combinado para '
               || to_char(
                    COALESCE(ds_prev.data_retorno_combinado, o.data_reuniao_agendada_ts)
                    AT TIME ZONE 'America/Sao_Paulo',
                    'DD/MM às HH24:MI'
                  )
        END
      WHEN 'respondeu' THEN
        CASE
          WHEN inb.last_inbound > (_agora - INTERVAL '30 minutes')
            THEN 'Respondeu há '
                 || GREATEST(1, ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60))::TEXT
                 || ' min'
          ELSE 'Respondeu há '
               || ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 3600, 1)::TEXT
               || 'h'
        END
      WHEN 'lead_novo' THEN
        'Lead novo — ligue agora ('
        || GREATEST(1, ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 60))::TEXT
        || ' min)'
      ELSE -- cadencia
        CASE cam.canal_sugerido
          WHEN 'call'     THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — ligue agora'
          WHEN 'whatsapp' THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — mande WhatsApp'
          ELSE                 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — mande mensagem de encerramento'
        END
    END AS razao
  ) rz ON true

  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
    AND COALESCE(tent14.n, 0) < 7

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id             = EXCLUDED.contato_id,
    score                  = EXCLUDED.score,
    estado                 = EXCLUDED.estado,
    razao                  = EXCLUDED.razao,
    componente_dom         = EXCLUDED.componente_dom,
    score_sinal            = EXCLUDED.score_sinal,
    score_urgencia         = EXCLUDED.score_urgencia,
    score_tentativas       = EXCLUDED.score_tentativas,
    score_fonte            = EXCLUDED.score_fonte,
    camada                 = EXCLUDED.camada,
    numero_tentativa       = EXCLUDED.numero_tentativa,
    canal_sugerido         = EXCLUDED.canal_sugerido,
    data_retorno_combinado = COALESCE(discagem_scores.data_retorno_combinado, EXCLUDED.data_retorno_combinado),
    data_entrada_lead      = EXCLUDED.data_entrada_lead,
    data_retorno_previsto  = EXCLUDED.data_retorno_previsto,
    updated_at             = EXCLUDED.updated_at;
END;
$$;
