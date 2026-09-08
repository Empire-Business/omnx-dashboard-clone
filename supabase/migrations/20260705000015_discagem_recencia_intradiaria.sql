-- Corrige o componente "recência" do score composto: decaía ao longo de
-- 30 dias inteiros, então dois leads chegados hoje em horários diferentes
-- ficavam quase empatados (diferença de ~10 pontos no dia inteiro, num
-- score de até 1000) — deixando fatores menores (MQL, canal, fadiga)
-- decidirem a ordem em vez de "quem chegou mais recentemente".
--
-- Regra pedida pelo usuário: leads "chegou hoje" devem ser ordenados por
-- horário de chegada, com os mais recentes sempre no topo.
--
-- Fix: recência agora decai de 1000 a 0 ao longo de 24h (não mais 30 dias).
-- Lead que chegou agora = ~1000. Lead que chegou há 24h = ~0. Leads mais
-- antigos que 24h não ganham mais pontos de recência (fica 0) — competem
-- só por sinal de resposta, MQL, engajamento e fadiga, que já são os
-- sinais certos pra eles.

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
  _hoje_sp_inicio := date_trunc('day', _agora AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  _hoje_sp_fim    := _hoje_sp_inicio + INTERVAL '1 day' - INTERVAL '1 second';

  -- ── BLOCO DE LIMPEZA ─────────────────────────────────────────────────────────

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

  DELETE FROM discagem_scores ds
  USING oportunidades o
  LEFT JOIN contatos ct2 ON ct2.id = o.contato_id
  WHERE o.id = ds.oportunidade_id
    AND (
      o.status != 'open'
      OR o.pipeline_id IS NULL
      OR o.pipeline_name NOT IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
      OR ct2.workspace_id IS NULL
    );

  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o WHERE o.id = ds.oportunidade_id
  );

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

  -- ── UPSERT COM SCORE COMPOSTO 0-1000 ─────────────────────────────────────────

  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, workspace_id, escopo, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte, score_qualificacao,
    camada, numero_tentativa, canal_sugerido,
    data_retorno_combinado,
    data_entrada_lead, data_retorno_previsto,
    updated_at
  )
  SELECT
    o.id             AS oportunidade_id,
    o.contato_id     AS contato_id,
    ct2.workspace_id AS workspace_id,
    CASE WHEN o.pipeline_name = 'Recuperação' THEN 'recuperacao' ELSE 'pre_vendas' END AS escopo,

    CASE
      WHEN cam.camada = 'horario_marcado' THEN
        GREATEST(900, 1000 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - task_hoje.due_date)) / 3600)::INTEGER * 10
        ))
      ELSE
        ROUND(
          (comp.sinal_resposta      * 0.40) +
          (comp.recencia            * 0.30) +
          (comp.qualificacao_mql    * 0.15) +
          (comp.engajamento_canal   * 0.10) +
          (comp.fadiga              * 0.05)
        )
    END::INTEGER                                        AS score,

    CASE cam.camada
      WHEN 'respondeu'       THEN 'ligue_agora'
      WHEN 'horario_marcado' THEN 'ligue_agora'
      WHEN 'lead_novo'       THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                 AS estado,

    rz.razao                                            AS razao,

    CASE
      WHEN cam.camada = 'horario_marcado' THEN 'urgencia'
      WHEN comp.sinal_resposta >= GREATEST(comp.recencia, comp.qualificacao_mql, comp.engajamento_canal) THEN 'sinal_quente'
      WHEN comp.recencia >= GREATEST(comp.qualificacao_mql, comp.engajamento_canal) THEN 'urgencia'
      ELSE 'tentativas'
    END                                                 AS componente_dom,

    comp.sinal_resposta::INTEGER                        AS score_sinal,
    comp.recencia::INTEGER                              AS score_urgencia,
    comp.fadiga::INTEGER                                AS score_tentativas,
    comp.engajamento_canal::INTEGER                     AS score_fonte,
    comp.qualificacao_mql::INTEGER                      AS score_qualificacao,

    cam.camada                                          AS camada,
    COALESCE(tent14.n, 0)                               AS numero_tentativa,
    cam.canal_sugerido                                  AS canal_sugerido,

    ds_prev.data_retorno_combinado                      AS data_retorno_combinado,

    o.data_lead_recebido                                AS data_entrada_lead,
    NULL::TIMESTAMPTZ                                   AS data_retorno_previsto,

    _agora                                              AS updated_at

  FROM oportunidades o
  JOIN contatos ct2 ON ct2.id = o.contato_id
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_outbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
  ) out ON true

  LEFT JOIN LATERAL (
    SELECT o2.id
    FROM oportunidades o2
    WHERE o2.contato_id = o.contato_id
      AND o2.status = 'open'
      AND o2.pipeline_id IS NOT NULL
      AND o2.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
    ORDER BY o2.data_lead_recebido DESC NULLS LAST, o2.id DESC
    LIMIT 1
  ) opp_mais_recente ON true

  LEFT JOIN LATERAL (
    SELECT
      t.title     AS task_title,
      t.due_date  AS due_date
    FROM ghl_tasks t
    WHERE t.contato_id = o.contato_id
      AND t.completed = false
      AND (t.deleted = false OR t.deleted IS NULL)
      AND t.due_date <= _hoje_sp_fim
      AND t.due_date >= (_agora - INTERVAL '48 hours')
      AND o.id = opp_mais_recente.id
      AND (
        LOWER(t.title) LIKE '%ligar%'
        OR LOWER(t.title) LIKE '%call%'
        OR LOWER(t.title) LIKE '%chamar%'
        OR LOWER(t.title) LIKE '%respondeu%'
        OR LOWER(t.title) LIKE '%contato%'
        OR LOWER(t.title) LIKE '%retorno%'
        OR LOWER(t.title) LIKE '%marcar%'
      )
    ORDER BY t.due_date ASC
    LIMIT 1
  ) task_hoje ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.channel IN ('call', 'whatsapp', 'sms')
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) touches ON true

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

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '24 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
        THEN GREATEST(0, 1000 - GREATEST(0, ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60)::INTEGER))
        ELSE 0
      END AS sinal_resposta,

      -- Decai de 1000 (chegou agora) a 0 (chegou há 24h) — não mais 30 dias.
      -- Leads mais antigos que 24h ficam com recência = 0 e competem só por
      -- sinal de resposta, MQL, engajamento e fadiga.
      CASE
        WHEN o.data_lead_recebido IS NOT NULL
          AND o.data_lead_recebido > (_agora - INTERVAL '24 hours')
        THEN GREATEST(0, 1000 - ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 86.4)::INTEGER)
        ELSE 0
      END AS recencia,

      CASE
        WHEN ct2.tags IS NOT NULL AND lower(ct2.tags) ~ '(^|,)\s*mql\s*(,|$)'
          THEN 1000
        ELSE 300
      END AS qualificacao_mql,

      LEAST(1000, COALESCE(touches.n, 0) * 100) AS engajamento_canal,

      GREATEST(0, 1000 - COALESCE(tent14.n, 0) * 150) AS fadiga
  ) comp ON true

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
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
    AND ct2.workspace_id IS NOT NULL
    AND COALESCE(tent14.n, 0) < 7

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id             = EXCLUDED.contato_id,
    workspace_id           = EXCLUDED.workspace_id,
    escopo                 = EXCLUDED.escopo,
    score                  = EXCLUDED.score,
    estado                 = EXCLUDED.estado,
    razao                  = EXCLUDED.razao,
    componente_dom         = EXCLUDED.componente_dom,
    score_sinal            = EXCLUDED.score_sinal,
    score_urgencia         = EXCLUDED.score_urgencia,
    score_tentativas       = EXCLUDED.score_tentativas,
    score_fonte            = EXCLUDED.score_fonte,
    score_qualificacao     = EXCLUDED.score_qualificacao,
    camada                 = EXCLUDED.camada,
    numero_tentativa       = EXCLUDED.numero_tentativa,
    canal_sugerido         = EXCLUDED.canal_sugerido,
    data_retorno_combinado = COALESCE(discagem_scores.data_retorno_combinado, EXCLUDED.data_retorno_combinado),
    data_entrada_lead      = EXCLUDED.data_entrada_lead,
    data_retorno_previsto  = EXCLUDED.data_retorno_previsto,
    updated_at             = EXCLUDED.updated_at;
END;
$$;

NOTIFY pgrst, 'reload schema';
