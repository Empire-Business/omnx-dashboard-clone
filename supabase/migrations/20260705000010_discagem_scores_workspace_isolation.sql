-- Isolamento de workspace no discador de pré-vendas.
--
-- Problema: discagem_scores nunca teve workspace_id. A policy de leitura liberava
-- qualquer membro ativo de QUALQUER workspace ver a fila inteira (nomes, telefones,
-- contexto de conversa) de todos os workspaces. recalcular_discagem_scores() e
-- buscar_reengajamento() também não filtravam por workspace — vazamento cross-tenant
-- real, não apenas teórico, já que oportunidades não tem workspace_id direto
-- (só via contatos.workspace_id) e nenhuma das duas funções fazia esse join.
--
-- Correção: adiciona workspace_id em discagem_scores (derivado de contatos),
-- restringe a policy de leitura e faz as duas funções propagarem/filtrarem
-- por workspace_id.

-- =============================================================================
-- 1. Coluna workspace_id
-- =============================================================================
ALTER TABLE discagem_scores
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_discagem_scores_workspace ON discagem_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_workspace_score ON discagem_scores(workspace_id, score DESC);

-- =============================================================================
-- 2. Backfill — deriva workspace_id via contatos.workspace_id
-- =============================================================================
UPDATE discagem_scores ds
SET workspace_id = c.workspace_id
FROM contatos c
WHERE c.id = ds.contato_id
  AND ds.workspace_id IS NULL
  AND c.workspace_id IS NOT NULL;

-- Linhas órfãs (contato sem workspace_id ou sem contato) — removidas.
-- O próximo cron (a cada 2 min) as recria corretamente se ainda forem válidas.
DELETE FROM discagem_scores WHERE workspace_id IS NULL;

-- =============================================================================
-- 3. RLS — restringe leitura ao workspace do membro
-- =============================================================================
DROP POLICY IF EXISTS "workspace_members_read_discagem_scores" ON discagem_scores;

CREATE POLICY "workspace_members_read_discagem_scores" ON discagem_scores
  FOR SELECT USING (
    workspace_id IS NOT NULL AND is_workspace_member(workspace_id)
  );

-- Policy de service_role já existe (service_role_full_discagem_scores) — mantida.

-- =============================================================================
-- 4. recalcular_discagem_scores() — propaga workspace_id via contatos
-- =============================================================================
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

  -- 2. Remove leads fora dos pipelines ativos, status fechado ou sem workspace_id
  --    resolvível (contato sem workspace_id — não deveria acontecer, mas defensivo)
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

  -- ── UPSERT COM SCORE 0-1000 ───────────────────────────────────────────────────

  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, workspace_id, score,
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
    ct2.workspace_id AS workspace_id,

    -- Score 0-1000 completamente contínuo, sem floors por camada.
    -- Ranges naturais:
    --   respondeu:       0–1000  (decai 1pt/min; 0 min=1000, 24h=0)
    --   horario_marcado: 830–950 (base 950, -5pt/h de atraso; nunca abaixo de lead_novo antigo)
    --   lead_novo:       0–900   (decai ~0.5pt/min; 0 min=900, 12h=540, 24h=180)
    --   cadencia:        0–80    (nunca conflita com leads ativos)
    CASE cam.camada
      WHEN 'respondeu' THEN
        GREATEST(0, 1000 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60)::INTEGER
        ))
      WHEN 'horario_marcado' THEN
        GREATEST(0, 950 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - task_hoje.due_date)) / 3600)::INTEGER * 5
        ))
      WHEN 'lead_novo' THEN
        GREATEST(0, 900 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 120)::INTEGER
        ))
      ELSE
        GREATEST(0, 80 - (COALESCE(tent14.n, 0) * 15))
    END::INTEGER                                        AS score,

    CASE cam.camada
      WHEN 'respondeu'       THEN 'ligue_agora'
      WHEN 'horario_marcado' THEN 'ligue_agora'
      WHEN 'lead_novo'       THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                 AS estado,

    rz.razao                                            AS razao,

    CASE cam.camada
      WHEN 'respondeu'       THEN 'sinal_quente'
      WHEN 'horario_marcado' THEN 'urgencia'
      WHEN 'lead_novo'       THEN 'urgencia'
      ELSE                        'tentativas'
    END                                                 AS componente_dom,

    0::INTEGER                                          AS score_sinal,
    0::INTEGER                                          AS score_urgencia,
    COALESCE(tent14.n, 0)::INTEGER                      AS score_tentativas,
    0::INTEGER                                          AS score_fonte,

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
    ORDER BY t.due_date ASC
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

  -- Camada de prioridade (sem mudança na lógica de detecção)
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
    camada                 = EXCLUDED.camada,
    numero_tentativa       = EXCLUDED.numero_tentativa,
    canal_sugerido         = EXCLUDED.canal_sugerido,
    data_retorno_combinado = COALESCE(discagem_scores.data_retorno_combinado, EXCLUDED.data_retorno_combinado),
    data_entrada_lead      = EXCLUDED.data_entrada_lead,
    data_retorno_previsto  = EXCLUDED.data_retorno_previsto,
    updated_at             = EXCLUDED.updated_at;
END;
$$;

-- =============================================================================
-- 5. buscar_reengajamento() — assinatura ganha p_workspace_id (obrigatório)
-- =============================================================================
DROP FUNCTION IF EXISTS buscar_reengajamento(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION buscar_reengajamento(
  p_workspace_id UUID,
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
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Auto Agendamento')
    AND ct.workspace_id = p_workspace_id
    AND (p_sdr_name IS NULL OR o.sdr_name = p_sdr_name)
    AND (
      NOT EXISTS (SELECT 1 FROM discagem_scores ds WHERE ds.oportunidade_id = o.id)
      OR EXISTS (
        SELECT 1 FROM discagem_scores ds
        WHERE ds.oportunidade_id = o.id
          AND ds.numero_tentativa >= 6
          AND ds.camada = 'cadencia'
      )
    )
    AND last_msg.data_comunicacao IS NOT NULL
    AND last_msg.data_comunicacao < (now() - INTERVAL '3 days')
  ORDER BY last_msg.data_comunicacao DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION buscar_reengajamento(UUID, TEXT, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
