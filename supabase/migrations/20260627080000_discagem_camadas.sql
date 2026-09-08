-- Discagem em 4 camadas + reengajamento
--
-- Reorganiza a fila do discador em camadas de prioridade absoluta:
--   1. horario_marcado → SDR marcou retorno ("me ligue às X") e a hora chegou
--   2. respondeu       → lead mandou mensagem inbound há menos de 2h
--   3. lead_novo       → lead recém-chegado (<30min) e ainda sem tentativa
--   4. cadencia        → todos os demais, com canal sugerido por nº de tentativas
--
-- O score ponderado continua existindo, mas agora apenas SUB-ORDENA dentro de
-- cada camada — nunca promove um lead para a camada de cima.
--
-- data_retorno_combinado é preenchido MANUALMENTE pelo SDR via UI. O cron nunca
-- sobrescreve esse campo: apenas o lê para detectar a camada horario_marcado.

-- 1. Novas colunas em discagem_scores ----------------------------------------
ALTER TABLE discagem_scores
  ADD COLUMN IF NOT EXISTS camada TEXT NOT NULL DEFAULT 'cadencia'
    CHECK (camada IN ('horario_marcado', 'respondeu', 'lead_novo', 'cadencia')),
  ADD COLUMN IF NOT EXISTS numero_tentativa INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canal_sugerido TEXT NOT NULL DEFAULT 'call'
    CHECK (canal_sugerido IN ('call', 'whatsapp', 'sms')),
  ADD COLUMN IF NOT EXISTS data_retorno_combinado TIMESTAMPTZ DEFAULT NULL;

-- 2. Índice para ordenar a fila por camada e score --------------------------
CREATE INDEX IF NOT EXISTS idx_discagem_scores_camada
  ON discagem_scores(camada, score DESC);

-- 3. Reescreve recalcular_discagem_scores() com as 4 camadas -----------------
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
  -- OU que já estouraram o teto de 7 tentativas em 14 dias
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

  -- Upsert dos scores para leads dos pipelines do discador apenas
  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte,
    camada, numero_tentativa, canal_sugerido, data_retorno_combinado,
    updated_at
  )
  SELECT
    o.id                                                    AS oportunidade_id,
    o.contato_id                                            AS contato_id,

    -- Score ponderado (0–100) — sub-ordena DENTRO da camada
    LEAST(100, ROUND(
      (COALESCE(sig.pts, 0)   * 0.40) +
      (COALESCE(urg.pts, 5)   * 0.35) +
      (COALESCE(tent.pts, 100)* 0.20) +
      (COALESCE(fonte.pts, 50)* 0.05)
    ))::INTEGER                                             AS score,

    -- Estado legado mantido por compatibilidade (threshold sobre o score)
    CASE
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+(COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 65 THEN 'ligue_agora'
      WHEN LEAST(100, ROUND(
             (COALESCE(sig.pts,0)*0.40)+(COALESCE(urg.pts,5)*0.35)+(COALESCE(tent.pts,100)*0.20)+(COALESCE(fonte.pts,50)*0.05)
           )) >= 30 THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                     AS estado,

    -- Razão em linguagem humana, ditada pela camada
    rz.razao                                                AS razao,

    -- Componente dominante do score (diagnóstico interno)
    CASE
      WHEN COALESCE(sig.pts, 0)  >= COALESCE(urg.pts, 5)  AND COALESCE(sig.pts, 0)  >= COALESCE(tent.pts, 100) THEN 'sinal_quente'
      WHEN COALESCE(urg.pts, 5)  >= COALESCE(tent.pts, 100)                                                      THEN 'urgencia'
      ELSE 'tentativas'
    END                                                     AS componente_dom,

    COALESCE(sig.pts, 0)::INTEGER                           AS score_sinal,
    COALESCE(urg.pts, 5)::INTEGER                           AS score_urgencia,
    COALESCE(tent.pts, 100)::INTEGER                        AS score_tentativas,
    COALESCE(fonte.pts, 50)::INTEGER                        AS score_fonte,

    cam.camada                                              AS camada,
    COALESCE(tent14.n, 0)                                   AS numero_tentativa,
    cam.canal_sugerido                                      AS canal_sugerido,
    ds_prev.data_retorno_combinado                          AS data_retorno_combinado,
    _agora                                                  AS updated_at

  FROM oportunidades o

  -- Linha existente: preserva data_retorno_combinado e alimenta camada horario_marcado
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

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
      END AS pts
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
      END AS pts
  ) urg ON true

  -- TENTATIVAS (peso 20%): chamadas outbound nas últimas 72h (componente de score)
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 0  THEN 100
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 1  THEN 70
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 2  THEN 40
        WHEN COUNT(*) FILTER (
               WHERE c.channel = 'call' AND c.direction = 'outbound' AND c.ghl_source = 'app'
             ) = 3  THEN 15
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

  -- NÚMERO DE TENTATIVAS (14 dias): define camada/canal e o teto de cadência
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  -- ÚLTIMA MENSAGEM INBOUND (qualquer data): detecta camada respondeu
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  -- CAMADA + CANAL SUGERIDO
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN ds_prev.data_retorno_combinado IS NOT NULL
          AND ds_prev.data_retorno_combinado
              BETWEEN (_agora - INTERVAL '30 minutes') AND (_agora + INTERVAL '60 minutes')
          THEN 'horario_marcado'
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '2 hours')
          THEN 'respondeu'
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
          WHEN ds_prev.data_retorno_combinado <= (_agora + INTERVAL '5 minutes')
            THEN 'Retorno combinado para agora'
          ELSE 'Retorno combinado para '
               || to_char(ds_prev.data_retorno_combinado AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
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
    -- 7+ tentativas saem da fila (encerramento)
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
    -- nunca sobrescrever o retorno combinado definido manualmente pelo SDR
    data_retorno_combinado = COALESCE(discagem_scores.data_retorno_combinado, EXCLUDED.data_retorno_combinado),
    updated_at             = EXCLUDED.updated_at;
END;
$$;

-- 4. buscar_reengajamento() — fallback quando a fila de discagem esvazia -----
CREATE OR REPLACE FUNCTION buscar_reengajamento(
  p_sdr_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  oportunidade_id UUID,
  contato_id UUID,
  nome TEXT,
  telefone TEXT,
  ghl_id TEXT,
  ultima_mensagem TEXT,
  data_ultima_mensagem TIMESTAMPTZ,
  contexto TEXT,
  utm_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  -- última mensagem inbound nos últimos 60 dias
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
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
    AND (p_sdr_name IS NULL OR o.sdr_name = p_sdr_name)
    -- não está na fila ativa (ou está com 6+ tentativas em cadência)
    AND (
      NOT EXISTS (SELECT 1 FROM discagem_scores ds WHERE ds.oportunidade_id = o.id)
      OR EXISTS (
        SELECT 1 FROM discagem_scores ds
        WHERE ds.oportunidade_id = o.id
          AND ds.numero_tentativa >= 6
          AND ds.camada = 'cadencia'
      )
    )
    -- sinal de inbound recente, mas já esfriado (> 3 dias, <= 60 dias)
    AND last_msg.data_comunicacao IS NOT NULL
    AND last_msg.data_comunicacao < (now() - INTERVAL '3 days')
  ORDER BY last_msg.data_comunicacao DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION buscar_reengajamento(TEXT, INTEGER) TO authenticated;
