-- Redesign: score contínuo sensível ao tempo + auto-remoção por call + sem botão Retorno
--
-- Mudanças em relação à migration anterior (20260628030000):
-- 1. Auto-remoção: leads com call outbound hoje são removidos da fila automaticamente
-- 2. Score contínuo: calculado por camada + tempo do evento (decai/cresce com o tempo)
-- 3. horario_marcado = APENAS tasks GHL vencidas (sem data_retorno_combinado, sem appointment)
-- 4. Razões mais simples e diretas para exibição no card

CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora          TIMESTAMPTZ := now();
  _hoje_sp_inicio TIMESTAMPTZ;
  _hoje_sp_fim    TIMESTAMPTZ;
BEGIN
  -- Início e fim do dia em São Paulo (UTC-3)
  _hoje_sp_inicio := date_trunc('day', _agora AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  _hoje_sp_fim    := _hoje_sp_inicio + INTERVAL '1 day' - INTERVAL '1 second';

  -- ── BLOCO DE LIMPEZA ─────────────────────────────────────────────────────────

  -- 1. Remove leads que já tiveram call outbound hoje (auto-remoção da fila do dia)
  --    SDR ligou → GHL registra em comunicacoes → próximo cron remove o lead
  DELETE FROM discagem_scores ds
  WHERE EXISTS (
    SELECT 1 FROM comunicacoes c
    WHERE c.contato_id = ds.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao >= _hoje_sp_inicio
      AND c.data_comunicacao <= _hoje_sp_fim
  );

  -- 2. Remove leads fora dos pipelines ativos ou com status fechado
  DELETE FROM discagem_scores ds
  USING oportunidades o
  WHERE o.id = ds.oportunidade_id
    AND (
      o.status != 'open'
      OR o.pipeline_id IS NULL
      OR o.pipeline_name NOT IN ('Pré-Vendas MQL', 'Auto Agendamento')
    );

  -- 3. Remove entradas órfãs
  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o WHERE o.id = ds.oportunidade_id
  );

  -- 4. Remove quem estourou 7 tentativas em 14 dias
  DELETE FROM discagem_scores ds
  WHERE (
    SELECT COUNT(*)
    FROM comunicacoes c
    WHERE c.contato_id = ds.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) >= 7;

  -- ── UPSERT COM SCORE CONTÍNUO ─────────────────────────────────────────────────

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
    o.id            AS oportunidade_id,
    o.contato_id    AS contato_id,

    -- Score contínuo sensível ao tempo, derivado da camada
    -- Garante que leads urgentes nunca percam posição para leads de cadência
    CASE cam.camada
      WHEN 'respondeu' THEN
        -- Decai 0.5pt/minuto desde o inbound (floor 60)
        GREATEST(60, 100 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60)::INTEGER / 2
        ))
      WHEN 'horario_marcado' THEN
        -- Task vencida: 85 base, +1 por hora de atraso (cap 99)
        LEAST(99, 85 + GREATEST(0,
          FLOOR(EXTRACT(EPOCH FROM (_agora - task_hoje.due_date)) / 3600)::INTEGER
        ))
      WHEN 'lead_novo' THEN
        -- Decai ~0.25pt/minuto desde data_lead_recebido (floor 40)
        GREATEST(40, 95 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 240)::INTEGER
        ))
      ELSE
        -- Cadência: score baixo baseado em tentativas (0-30)
        GREATEST(0, 30 - (COALESCE(tent14.n, 0) * 5))
    END::INTEGER                                        AS score,

    CASE
      WHEN cam.camada IN ('respondeu', 'horario_marcado') THEN 'ligue_agora'
      WHEN cam.camada = 'lead_novo'                       THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                 AS estado,

    rz.razao                                            AS razao,

    CASE cam.camada
      WHEN 'respondeu'       THEN 'sinal_quente'
      WHEN 'horario_marcado' THEN 'urgencia'
      WHEN 'lead_novo'       THEN 'urgencia'
      ELSE                        'tentativas'
    END                                                 AS componente_dom,

    -- Campos de score legados (mantidos para compatibilidade, sem uso na UI nova)
    0::INTEGER                                          AS score_sinal,
    0::INTEGER                                          AS score_urgencia,
    COALESCE(tent14.n, 0)::INTEGER                      AS score_tentativas,
    0::INTEGER                                          AS score_fonte,

    cam.camada                                          AS camada,
    COALESCE(tent14.n, 0)                               AS numero_tentativa,
    cam.canal_sugerido                                  AS canal_sugerido,

    -- Preserva data_retorno_combinado existente (coluna mantida mas sem uso ativo)
    ds_prev.data_retorno_combinado                      AS data_retorno_combinado,

    o.data_lead_recebido                                AS data_entrada_lead,
    NULL::TIMESTAMPTZ                                   AS data_retorno_previsto,

    _agora                                              AS updated_at

  FROM oportunidades o
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

  -- Último inbound (para detectar "respondeu")
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  -- Último outbound (para verificar se SDR respondeu depois do inbound)
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_outbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
  ) out ON true

  -- Task GHL pendente/vencida com keyword de ligação
  -- Inclui tarefas atrasadas de dias anteriores (due_date <= fim do dia de hoje)
  LEFT JOIN LATERAL (
    SELECT
      t.title     AS task_title,
      t.due_date  AS due_date
    FROM ghl_tasks t
    WHERE t.contato_id = o.contato_id
      AND t.completed = false
      AND (t.deleted = false OR t.deleted IS NULL)
      AND t.due_date <= _hoje_sp_fim
      AND (
        LOWER(t.title) LIKE '%ligar%'
        OR LOWER(t.title) LIKE '%call%'
        OR LOWER(t.title) LIKE '%chamar%'
        OR LOWER(t.title) LIKE '%respondeu%'
        OR LOWER(t.title) LIKE '%contato%'
        OR LOWER(t.title) LIKE '%retorno%'
        OR LOWER(t.title) LIKE '%marcar%'
      )
    ORDER BY t.due_date ASC  -- mais antiga primeiro (prioriza atrasadas)
    LIMIT 1
  ) task_hoje ON true

  -- Tentativas totais nos últimos 14 dias
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  -- Camada de prioridade
  -- horario_marcado = APENAS tasks GHL vencidas (sem data_retorno_combinado)
  -- respondeu       = inbound nas últimas 4h sem resposta do SDR depois
  -- lead_novo       = criado hoje no horário SP
  -- cadencia        = todos os outros
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN task_hoje.task_title IS NOT NULL
          THEN 'horario_marcado'
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '4 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
          THEN 'respondeu'
        WHEN o.data_lead_recebido IS NOT NULL
          AND o.data_lead_recebido >= _hoje_sp_inicio
          AND o.data_lead_recebido <= _hoje_sp_fim
          THEN 'lead_novo'
        ELSE 'cadencia'
      END AS camada,
      CASE
        WHEN COALESCE(tent14.n, 0) <= 2 THEN 'call'
        WHEN COALESCE(tent14.n, 0) <= 4 THEN 'whatsapp'
        ELSE 'sms'
      END AS canal_sugerido
  ) cam ON true

  -- Razão em linguagem humana (exibida diretamente no card)
  LEFT JOIN LATERAL (
    SELECT CASE cam.camada
      WHEN 'horario_marcado' THEN
        task_hoje.task_title

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
        CASE
          WHEN COALESCE(tent14.n, 0) = 0
            THEN 'Novo hoje'
          ELSE 'Novo hoje · ' || tent14.n::TEXT || 'x tentativa'
        END

      ELSE
        CASE cam.canal_sugerido
          WHEN 'call'     THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — ligue agora'
          WHEN 'whatsapp' THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — mande WhatsApp'
          ELSE                 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — encerramento'
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
