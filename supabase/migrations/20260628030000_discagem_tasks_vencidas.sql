-- Fix: incluir tarefas GHL VENCIDAS (não apenas de hoje)
--
-- Sistema antigo (useDiscagem.ts) usava .lte('due_date', todaySpEnd) — ou seja,
-- qualquer tarefa com due_date <= fim do dia de hoje (incluindo tarefas atrasadas).
-- Sistema novo limitava a due_date >= hoje_inicio AND <= hoje_fim (só tarefas de hoje).
-- Resultado: tarefas como "LIGAR DIA 02", "Ligar 10h manhã 18/05" sumiam da fila.

CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora      TIMESTAMPTZ := now();
  _hoje_sp_inicio TIMESTAMPTZ;
  _hoje_sp_fim    TIMESTAMPTZ;
BEGIN
  -- Início e fim do dia em São Paulo (UTC-3)
  _hoje_sp_inicio := date_trunc('day', _agora AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  _hoje_sp_fim    := _hoje_sp_inicio + INTERVAL '1 day' - INTERVAL '1 second';

  -- Remove leads fora dos pipelines ou com status fechado
  DELETE FROM discagem_scores ds
  USING oportunidades o
  WHERE o.id = ds.oportunidade_id
    AND (
      o.status != 'open'
      OR o.pipeline_id IS NULL
      OR o.pipeline_name NOT IN ('Pré-Vendas MQL', 'Auto Agendamento')
    );

  -- Remove entradas órfãs
  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o WHERE o.id = ds.oportunidade_id
  );

  -- Remove quem estourou 7 tentativas em 14 dias
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

    LEAST(100, ROUND(
      (COALESCE(sig.pts, 0)    * 0.40) +
      (COALESCE(urg.pts, 5)    * 0.35) +
      (COALESCE(tent.pts, 100) * 0.20) +
      (COALESCE(fonte.pts, 50) * 0.05)
    ))::INTEGER                                                 AS score,

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
      WHEN COALESCE(sig.pts,0) >= COALESCE(urg.pts,5) AND COALESCE(sig.pts,0) >= COALESCE(tent.pts,100) THEN 'sinal_quente'
      WHEN COALESCE(urg.pts,5) >= COALESCE(tent.pts,100)                                                 THEN 'urgencia'
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

    o.data_lead_recebido                                        AS data_entrada_lead,
    COALESCE(
      ds_prev.data_retorno_combinado,
      o.data_reuniao_agendada_ts
    )                                                           AS data_retorno_previsto,

    _agora                                                      AS updated_at

  FROM oportunidades o
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

  -- Sinal quente: inbound recente nas últimas 24h
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

  -- Urgência: tempo desde a entrada do lead
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

  -- Tentativas nas últimas 72h (score)
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

  -- Fonte do lead (UTM)
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

  -- Último inbound (para detectar "respondeu")
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  -- Último outbound (para verificar se SDR já respondeu depois do inbound)
  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_outbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
  ) out ON true

  -- Task GHL pendente/vencida (qualquer task com due_date <= fim do dia de hoje)
  -- IGUAL ao sistema antigo: .lte('due_date', todaySpEnd) + filtro por palavra-chave
  LEFT JOIN LATERAL (
    SELECT t.title AS task_title
    FROM ghl_tasks t
    WHERE t.contato_id = o.contato_id
      AND t.completed = false
      AND (t.deleted = false OR t.deleted IS NULL)
      AND t.due_date <= _hoje_sp_fim  -- ← vencida OU de hoje (não só hoje)
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

  -- Camada de prioridade
  -- Ordem: horario_marcado > respondeu > lead_novo (CRIADO HOJE) > cadencia
  LEFT JOIN LATERAL (
    SELECT
      CASE
        -- Retorno combinado manual ou appointment GHL na janela ativa
        WHEN ds_prev.data_retorno_combinado IS NOT NULL
          AND ds_prev.data_retorno_combinado
              BETWEEN (_agora - INTERVAL '30 minutes') AND (_agora + INTERVAL '60 minutes')
          THEN 'horario_marcado'
        WHEN o.data_reuniao_agendada_ts IS NOT NULL
          AND o.data_reuniao_agendada_ts
              BETWEEN (_agora - INTERVAL '30 minutes') AND (_agora + INTERVAL '60 minutes')
          THEN 'horario_marcado'
        -- Task GHL pendente/vencida = horario_marcado
        WHEN task_hoje.task_title IS NOT NULL
          THEN 'horario_marcado'
        -- Respondeu: inbound nas últimas 4h SEM resposta do SDR depois disso
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '4 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
          THEN 'respondeu'
        -- Novo hoje: criado hoje no horário de SP (independente de tentativas)
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

  -- Razão em linguagem humana
  LEFT JOIN LATERAL (
    SELECT CASE cam.camada
      WHEN 'horario_marcado' THEN
        CASE
          WHEN task_hoje.task_title IS NOT NULL
            THEN task_hoje.task_title
          WHEN COALESCE(ds_prev.data_retorno_combinado, o.data_reuniao_agendada_ts) <= (_agora + INTERVAL '5 minutes')
            THEN 'Retorno combinado — agora'
          ELSE 'Retorno '
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
               || 'h — aguarda retorno'
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
