-- Score composto do discador, com pesos derivados de análise real de conversão.
--
-- Análise feita em 2026-07-05 sobre 122 vendas pagas (vendas_fechamento.data_pagamento_entrada)
-- vs. universo de ~6.000 contatos que passaram por pré-vendas/vendas:
--
--   Sinal              | Compradores | Não-compradores | Leitura
--   --------------------|-------------|-------------------|------------------------------
--   Respondeu (inbound) | 58.8%       | 41.7%             | sinal mais forte, de longe
--   Msgs inbound (média)| 16.1        | 2.9               | 5.5x mais engajamento
--   Tempo até 1º contato| 5.5d (med.) | 19.9d (med.)      | resposta rápida importa muito
--   Tag MQL             | 43.4%       | 34.6%             | sinal real, mas moderado
--   Tentativas de call  | 4.35        | 5.44              | mais ligação NÃO fecha venda
--   Contato humano total| 16.7        | 8.0               | WhatsApp/SMS > ligação pura
--
-- Pesos aprovados: sinal de resposta 40%, recência/velocidade 30%, qualificação MQL 15%,
-- engajamento por canal certo 10%, fadiga de tentativas 5% (penalidade).
--
-- `camada` continua existindo para fins de exibição (ícone/cor do card), mas deixa de
-- limitar o `score` a faixas fixas por camada — o composto abaixo é único e contínuo
-- para todos os leads, exceto `horario_marcado` (task GHL agendada), que é tratado como
-- compromisso operacional e mantém prioridade máxima independente da qualidade do lead.

-- =============================================================================
-- Nova coluna: score_qualificacao (sub-componente MQL, para auditoria/debug do score)
-- =============================================================================
ALTER TABLE discagem_scores
    ADD COLUMN IF NOT EXISTS score_qualificacao INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN discagem_scores.score_sinal IS 'Sub-score 0-1000: sinal de resposta (peso 40%)';
COMMENT ON COLUMN discagem_scores.score_urgencia IS 'Sub-score 0-1000: recência/velocidade desde data_lead_recebido (peso 30%)';
COMMENT ON COLUMN discagem_scores.score_qualificacao IS 'Sub-score 0-1000: qualificação MQL (peso 15%)';
COMMENT ON COLUMN discagem_scores.score_fonte IS 'Sub-score 0-1000: engajamento por canal certo — touches humanos recentes (peso 10%)';
COMMENT ON COLUMN discagem_scores.score_tentativas IS 'Sub-score 0-1000: inverso de fadiga — decai com tentativas de call (peso 5%)';

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

  -- ── BLOCO DE LIMPEZA (inalterado) ───────────────────────────────────────────

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
      OR o.pipeline_name NOT IN ('Pré-Vendas MQL', 'Auto Agendamento')
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
    oportunidade_id, contato_id, workspace_id, score,
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

    -- horario_marcado é compromisso operacional (task GHL agendada) — prioridade máxima
    -- independente da qualidade do lead, decaindo levemente se atrasado.
    -- Demais camadas usam o composto: 40% resposta + 30% recência + 15% MQL + 10% canal + 5% fadiga.
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
    ORDER BY t.due_date ASC
    LIMIT 1
  ) task_hoje ON true

  -- Tentativas de call outbound humano nos últimos 14 dias (fadiga)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  -- Touches humanos totais (call+whatsapp+sms) nos últimos 14 dias (engajamento por canal)
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.channel IN ('call', 'whatsapp', 'sms')
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) touches ON true

  -- Camada (para exibição — ícone/cor do card, não limita mais o score)
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

  -- Componentes do score composto (0-1000 cada, combinados com pesos fixos acima)
  LEFT JOIN LATERAL (
    SELECT
      -- 40% — sinal de resposta: decai 1pt/min desde o último inbound não respondido, zera em 24h
      CASE
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '24 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
        THEN GREATEST(0, 1000 - GREATEST(0, ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60)::INTEGER))
        ELSE 0
      END AS sinal_resposta,

      -- 30% — recência/velocidade: decai suavemente desde data_lead_recebido ao longo de 30 dias
      GREATEST(0, 1000 - GREATEST(0,
        ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 2592)::INTEGER
      )) AS recencia,

      -- 15% — qualificação MQL: tag presente = 1000, ausente = 300 (baseline observado: 34,6% convertem sem tag)
      CASE
        WHEN ct2.tags IS NOT NULL AND lower(ct2.tags) ~ '(^|,)\s*mql\s*(,|$)'
          THEN 1000
        ELSE 300
      END AS qualificacao_mql,

      -- 10% — engajamento por canal certo: touches humanos recentes (call+wpp+sms), capado em 10 touches
      LEAST(1000, COALESCE(touches.n, 0) * 100) AS engajamento_canal,

      -- 5% (penalidade) — fadiga: decai com tentativas de call puro nos últimos 14 dias
      GREATEST(0, 1000 - COALESCE(tent14.n, 0) * 150) AS fadiga
  ) comp ON true

  -- Razão em linguagem humana (exibida no card)
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
    AND ct2.workspace_id IS NOT NULL
    AND COALESCE(tent14.n, 0) < 7

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id             = EXCLUDED.contato_id,
    workspace_id           = EXCLUDED.workspace_id,
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
