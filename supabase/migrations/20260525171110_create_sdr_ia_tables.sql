-- Migration: Create SDR IA tables
-- App separado de SDR IA — configuração de bots, logs, conversas e templates
-- Reference: docs/SDR-IA-ARQUITETURA.md

-- =============================================================================
-- Table: sdr_ia_bots
-- =============================================================================
CREATE TABLE sdr_ia_bots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  ativo           BOOLEAN DEFAULT true,

  -- Identidade da IA
  nome_persona    TEXT NOT NULL DEFAULT 'Assistente',
  assinatura      TEXT,

  -- Prompt (TEXT no PostgreSQL é ilimitado)
  system_prompt   TEXT NOT NULL,

  -- Modelo OpenRouter
  modelo_id       TEXT NOT NULL DEFAULT 'qwen/qwen3.6-plus',
  temperatura     NUMERIC(3,2) DEFAULT 0.7,
  max_tokens      INT DEFAULT 4096,

  -- Ativação
  tags_ativacao   TEXT[] DEFAULT '{}',
  ativar_todos    BOOLEAN DEFAULT false,

  -- Horário de funcionamento
  hora_inicio     TIME DEFAULT '08:00',
  hora_fim        TIME DEFAULT '20:00',
  dias_semana     INT[] DEFAULT '{2,3,4,5,6}', -- 1=domingo, 2=segunda...

  -- Comportamento
  tempo_minimo_entre_mensagens_min INT DEFAULT 30,
  max_mensagens_por_janela_24h     INT DEFAULT 5,

  -- Follow-up automático
  follow_up_ativo BOOLEAN DEFAULT true,
  follow_up_delay_min INT DEFAULT 240,
  follow_up_maximo INT DEFAULT 2,

  -- Modo seguro
  modo_simulacao  BOOLEAN DEFAULT true,

  -- Dados contextuais a incluir no prompt
  incluir_historico_mensagens      BOOLEAN DEFAULT true,
  incluir_dados_oportunidade       BOOLEAN DEFAULT true,
  incluir_dados_contato            BOOLEAN DEFAULT true,
  incluir_nome_sdr                 BOOLEAN DEFAULT true,
  incluir_nome_closer              BOOLEAN DEFAULT true,

  -- Metadados
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sdr_ia_bots_workspace ON sdr_ia_bots(workspace_id);
CREATE INDEX idx_sdr_ia_bots_ativo ON sdr_ia_bots(ativo);

-- =============================================================================
-- Table: sdr_ia_logs
-- =============================================================================
CREATE TABLE sdr_ia_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID NOT NULL REFERENCES sdr_ia_bots(id),
  contato_id      UUID REFERENCES contatos(id),
  oportunidade_id UUID REFERENCES oportunidades(id),

  tipo            TEXT NOT NULL CHECK (tipo IN ('decisao', 'envio', 'erro', 'simulacao', 'follow_up', 'tag_adicionada', 'observacao_adicionada')),

  -- Contexto enviado à IA
  contexto        JSONB DEFAULT '{}',
  system_prompt   TEXT,
  mensagens_historico JSONB DEFAULT '[]',

  -- Resposta da IA
  resposta_ia     TEXT,
  resposta_ia_tokens INT,

  -- Decisão tomada
  acao_tomada     TEXT,
  mensagem_enviada TEXT,

  -- Motivo/justificativa
  motivo          TEXT,

  -- Meta dados
  modelo_usado    TEXT,
  latencia_ms     INT,
  custo_estimado  NUMERIC(10,6),

  -- Status do envio
  enviado         BOOLEAN DEFAULT false,
  ghl_job_id      BIGINT REFERENCES ghl_api_jobs(id),
  erro            TEXT,

  workspace_id    UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sdr_ia_logs_bot ON sdr_ia_logs(bot_id, created_at DESC);
CREATE INDEX idx_sdr_ia_logs_contato ON sdr_ia_logs(contato_id, created_at DESC);
CREATE INDEX idx_sdr_ia_logs_tipo ON sdr_ia_logs(tipo, created_at DESC);
CREATE INDEX idx_sdr_ia_logs_workspace ON sdr_ia_logs(workspace_id, created_at DESC);

-- =============================================================================
-- Table: sdr_ia_conversas
-- =============================================================================
CREATE TABLE sdr_ia_conversas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id      UUID NOT NULL REFERENCES contatos(id),
  bot_id          UUID NOT NULL REFERENCES sdr_ia_bots(id),

  -- Estado da janela
  janela_24h_ativa BOOLEAN DEFAULT false,
  ultima_mensagem_inbound_at TIMESTAMPTZ,
  ultima_mensagem_outbound_at TIMESTAMPTZ,

  -- Contadores
  mensagens_ia_enviadas_na_janela INT DEFAULT 0,
  mensagens_lead_na_janela INT DEFAULT 0,

  -- Follow-up
  follow_up_count INT DEFAULT 0,
  proximo_follow_up_at TIMESTAMPTZ,

  -- Status
  status          TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'encerrado', 'transferido_humano')),
  motivo_pausa    TEXT,

  -- Contexto acumulado
  contexto_resumo TEXT,

  workspace_id    UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contato_id, bot_id)
);

CREATE INDEX idx_sdr_ia_conversas_workspace ON sdr_ia_conversas(workspace_id);
CREATE INDEX idx_sdr_ia_conversas_status ON sdr_ia_conversas(status);
CREATE INDEX idx_sdr_ia_conversas_janela ON sdr_ia_conversas(janela_24h_ativa, proximo_follow_up_at);

-- =============================================================================
-- Table: sdr_ia_templates
-- =============================================================================
CREATE TABLE sdr_ia_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id          UUID REFERENCES sdr_ia_bots(id),
  nome            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('marketing', 'utility', 'authentication')),
  linguagem       TEXT DEFAULT 'pt_BR',
  corpo           TEXT NOT NULL,
  variaveis       JSONB DEFAULT '[]',

  -- Uso
  usado_para_iniciar BOOLEAN DEFAULT false,
  usado_para_responder BOOLEAN DEFAULT false,

  ativo           BOOLEAN DEFAULT true,
  workspace_id    UUID NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);

CREATE INDEX idx_sdr_ia_templates_workspace ON sdr_ia_templates(workspace_id);

-- =============================================================================
-- RLS: sdr_ia_bots
-- =============================================================================
ALTER TABLE sdr_ia_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_bots"
  ON sdr_ia_bots FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_admins_insert_bots"
  ON sdr_ia_bots FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_update_bots"
  ON sdr_ia_bots FOR UPDATE
  TO authenticated
  USING (is_workspace_admin(workspace_id))
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_delete_bots"
  ON sdr_ia_bots FOR DELETE
  TO authenticated
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "service_role_full_access_bots"
  ON sdr_ia_bots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: sdr_ia_logs
-- =============================================================================
ALTER TABLE sdr_ia_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_logs"
  ON sdr_ia_logs FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY "service_role_insert_logs"
  ON sdr_ia_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_logs"
  ON sdr_ia_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: sdr_ia_conversas
-- =============================================================================
ALTER TABLE sdr_ia_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_conversas"
  ON sdr_ia_conversas FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY "service_role_full_access_conversas"
  ON sdr_ia_conversas FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: sdr_ia_templates
-- =============================================================================
ALTER TABLE sdr_ia_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_templates"
  ON sdr_ia_templates FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_admins_insert_templates"
  ON sdr_ia_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_update_templates"
  ON sdr_ia_templates FOR UPDATE
  TO authenticated
  USING (is_workspace_admin(workspace_id))
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_delete_templates"
  ON sdr_ia_templates FOR DELETE
  TO authenticated
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "service_role_full_access_templates"
  ON sdr_ia_templates FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
