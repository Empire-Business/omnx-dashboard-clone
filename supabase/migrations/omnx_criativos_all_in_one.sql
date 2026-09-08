-- Migration: Expandir notion_creatives para suportar gestão nativa de criativos
-- Descrição: Adiciona campos de conteúdo, responsáveis, gestão, teste e assets
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- 1. Tornar notion_page_id opcional (criativos nativos não têm Notion)
-- ============================================================
ALTER TABLE notion_creatives
  ALTER COLUMN notion_page_id DROP NOT NULL;

-- ============================================================
-- 2. Origem do criativo
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'notion' 
    CHECK (source IN ('notion', 'native', 'import'));

-- ============================================================
-- 3. Campos de conteúdo (copy, hook, CTA)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS copy_text TEXT,
  ADD COLUMN IF NOT EXISTS hook_text TEXT,
  ADD COLUMN IF NOT EXISTS cta_text TEXT,
  ADD COLUMN IF NOT EXISTS content_pillar TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT;

-- ============================================================
-- 4. Responsáveis e gestão
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ============================================================
-- 5. Assets (arquivo bruto = raw_asset_url)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS raw_asset_url TEXT;

-- ============================================================
-- 6. Campos de teste (complementares aos já existentes: creative_tested, test_started_at, aprovado)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS test_ended_at DATE,
  ADD COLUMN IF NOT EXISTS cpl_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS budget_spent NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS test_status TEXT DEFAULT 'nao_testado'
    CHECK (test_status IN ('nao_testado', 'em_teste', 'testado')),
  ADD COLUMN IF NOT EXISTS test_result TEXT
    CHECK (test_result IN ('aprovado', 'reprovado', 'pendente', 'retestar'));

-- ============================================================
-- 7. Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notion_creatives_source 
  ON notion_creatives(workspace_id, source);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_assigned 
  ON notion_creatives(workspace_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_test_status 
  ON notion_creatives(workspace_id, test_status);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_tags 
  ON notion_creatives USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_external_id_workspace 
  ON notion_creatives(workspace_id, external_id);

-- ============================================================
-- 8. Atualizar RLS policy para permitir UPDATE por membros do workspace
-- (já existe policy de SELECT; garantimos UPDATE para o app OMNX Criativos)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notion_creatives'
      AND policyname = 'Workspace members can update notion_creatives'
  ) THEN
    CREATE POLICY "Workspace members can update notion_creatives"
      ON notion_creatives
      FOR UPDATE
      TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
      WITH CHECK (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      );
  END IF;
END $$;

-- ============================================================
-- 9. Trigger para atualizar updated_at
-- (já existe trigger_notion_creatives_updated_at, mas garantimos)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_notion_creatives_updated_at'
      AND tgrelid = 'notion_creatives'::regclass
  ) THEN
    CREATE TRIGGER trigger_notion_creatives_updated_at
      BEFORE UPDATE ON notion_creatives
      FOR EACH ROW
      EXECUTE FUNCTION update_notion_creatives_updated_at();
  END IF;
END $$;

-- ============================================================
-- 10. Notificar PostgREST para recarregar schema
-- ============================================================
NOTIFY pgrst, 'reload schema';
-- Migration: Criar tabela de critérios de teste configuráveis por workspace
-- Descrição: Cada workspace define seus próprios critérios de aprovação/reprovação
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- TABLE: creative_test_criteria
-- Configuração de critérios de teste por workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_test_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Critérios de teste
  cpl_target NUMERIC(10,2) NOT NULL DEFAULT 70,
  budget_min NUMERIC(10,2) NOT NULL DEFAULT 50,
  budget_max NUMERIC(10,2) NOT NULL DEFAULT 100,
  window_min_days INTEGER NOT NULL DEFAULT 3,
  window_max_days INTEGER NOT NULL DEFAULT 5,
  
  -- Regras de ouro
  early_stop_threshold NUMERIC(10,2) NOT NULL DEFAULT 150,  -- CPL > X após R$ 30
  early_stop_spend NUMERIC(10,2) NOT NULL DEFAULT 30,
  no_lead_max_days INTEGER NOT NULL DEFAULT 5,
  
  -- Metas de produção por semana
  weekly_goal_reels INTEGER NOT NULL DEFAULT 4,
  weekly_goal_static INTEGER NOT NULL DEFAULT 6,
  weekly_goal_carousel INTEGER NOT NULL DEFAULT 3,
  weekly_goal_stories INTEGER NOT NULL DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  
  UNIQUE(workspace_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_creative_test_criteria_workspace 
  ON creative_test_criteria(workspace_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_creative_test_criteria_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_test_criteria_updated_at ON creative_test_criteria;
CREATE TRIGGER trigger_creative_test_criteria_updated_at
  BEFORE UPDATE ON creative_test_criteria
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_test_criteria_updated_at();

-- Seed: criar registro default para workspaces existentes que ainda não têm
INSERT INTO creative_test_criteria (workspace_id)
SELECT w.id 
FROM workspaces w
LEFT JOIN creative_test_criteria ctc ON ctc.workspace_id = w.id
WHERE ctc.id IS NULL;

-- RLS
ALTER TABLE creative_test_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Workspace members can view creative_test_criteria"
  ON creative_test_criteria FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY IF NOT EXISTS "Workspace members can update creative_test_criteria"
  ON creative_test_criteria FOR UPDATE TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY IF NOT EXISTS "Service role full access on creative_test_criteria"
  ON creative_test_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
-- Migration: Criar tabelas de testes, histórico, comentários e audit log
-- Descrição: Infraestrutura de gestão de testes e rastreabilidade
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- TABLE: creative_tests
-- Registro formal de cada teste executado
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  
  -- Período
  started_at DATE NOT NULL,
  ended_at DATE,
  
  -- Orçamento
  budget_allocated NUMERIC(10,2),
  budget_spent NUMERIC(10,2) DEFAULT 0,
  
  -- Métricas ao final do teste
  leads_meta INTEGER DEFAULT 0,
  leads_crm INTEGER DEFAULT 0,
  mql_count INTEGER DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  cpl_meta NUMERIC(10,2),
  cpl_crm NUMERIC(10,2),
  cpmql NUMERIC(10,2),
  
  -- Resultado
  result TEXT CHECK (result IN ('aprovado', 'reprovado', 'cancelado', 'pendente')),
  result_reason TEXT,
  observations TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'em_andamento' 
    CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_tests_workspace ON creative_tests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_creative ON creative_tests(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_status ON creative_tests(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_creative_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_tests_updated_at ON creative_tests;
CREATE TRIGGER trigger_creative_tests_updated_at
  BEFORE UPDATE ON creative_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_tests_updated_at();

-- ============================================================
-- TABLE: creative_test_history
-- Log detalhado de cada evento de teste
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_test_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  test_id UUID REFERENCES creative_tests(id) ON DELETE SET NULL,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'teste_iniciado', 'teste_pausado', 'teste_finalizado',
    'aprovado', 'reprovado', 'retestar', 'orcamento_atualizado',
    'cpl_atualizado', 'observacao_adicionada'
  )),
  
  event_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_test_history_creative ON creative_test_history(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_test ON creative_test_history(test_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_event ON creative_test_history(event_type);

-- ============================================================
-- TABLE: creative_comments
-- Comentários em criativos (threads com respostas)
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  parent_id UUID REFERENCES creative_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_comments_creative ON creative_comments(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_comments_parent ON creative_comments(parent_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_creative_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_comments_updated_at ON creative_comments;
CREATE TRIGGER trigger_creative_comments_updated_at
  BEFORE UPDATE ON creative_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_comments_updated_at();

-- ============================================================
-- TABLE: creative_audit_log
-- Rastreabilidade completa de alterações
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES notion_creatives(id) ON DELETE CASCADE,
  
  table_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_creative_audit_log_creative ON creative_audit_log(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_audit_log_changed_at ON creative_audit_log(changed_at DESC);

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
-- Migration: Criar view e RPC de métricas por criativo
-- Descrição: Agrega dados Meta Ads + CRM por criativo (CR-xxx)
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- VIEW: v_creative_metrics
-- Métricas agregadas por criativo (join Meta + CRM)
-- ============================================================
CREATE OR REPLACE VIEW v_creative_metrics AS
WITH meta_by_creative AS (
  SELECT
    (regexp_match(ad_name, 'CR-(\d+)'))[1] AS creative_num,
    SUM(spend) AS total_spend,
    SUM(impressions) AS total_impressions,
    SUM(clicks) AS total_clicks,
    SUM(leads) AS total_leads_meta,
    SUM(landing_page_views) AS total_lp_views,
    SUM(video_views) AS total_video_views,
    AVG(ctr) AS avg_ctr,
    AVG(cpm) AS avg_cpm
  FROM meta_ads_insights
  WHERE ad_name ~ 'CR-\d+'
  GROUP BY creative_num
),
crm_by_creative AS (
  SELECT
    (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS creative_num,
    COUNT(*) AS total_leads_crm,
    COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS total_mql,
    COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) AS total_reunioes,
    COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS total_vendas,
    COALESCE(SUM(vf.valor_faturado), 0) AS total_faturamento,
    COALESCE(SUM(vf.valor_entrada), 0) AS total_caixa
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
  WHERE c.utm_term ~ 'CR-\d+'
  GROUP BY creative_num
)
SELECT
  'CR-' || m.creative_num AS creative_code,
  nc.id AS creative_id,
  nc.workspace_id,
  nc.name AS creative_name,
  nc.external_id,
  nc.format,
  nc.profile,
  
  -- Métricas Meta
  m.total_spend,
  m.total_impressions,
  m.total_clicks,
  m.total_leads_meta,
  m.total_lp_views,
  m.total_video_views,
  m.avg_ctr,
  m.avg_cpm,
  
  -- Métricas CRM
  COALESCE(c.total_leads_crm, 0) AS leads_crm,
  COALESCE(c.total_mql, 0) AS mql_count,
  COALESCE(c.total_reunioes, 0) AS reunioes,
  COALESCE(c.total_vendas, 0) AS vendas,
  COALESCE(c.total_faturamento, 0) AS faturamento,
  COALESCE(c.total_caixa, 0) AS caixa,
  
  -- Métricas derivadas
  CASE WHEN c.total_leads_crm > 0 
    THEN m.total_spend / c.total_leads_crm 
  END AS cpl_crm,
  CASE WHEN c.total_mql > 0 
    THEN m.total_spend / c.total_mql 
  END AS cpmql,
  CASE WHEN c.total_vendas > 0 
    THEN m.total_spend / c.total_vendas 
  END AS cpv,
  CASE WHEN m.total_spend > 0 
    THEN c.total_faturamento / m.total_spend 
  END AS roas
  
FROM meta_by_creative m
LEFT JOIN crm_by_creative c ON c.creative_num = m.creative_num
LEFT JOIN notion_creatives nc ON nc.external_id = 'CR-' || m.creative_num
  AND nc.database_type = 'paid';

-- ============================================================
-- RPC: get_creative_metrics
-- Função parametrizada para consumo pelo app
-- ============================================================
CREATE OR REPLACE FUNCTION get_creative_metrics(
  p_workspace_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_creative_id UUID DEFAULT NULL
)
RETURNS TABLE (
  creative_code TEXT,
  creative_id UUID,
  creative_name TEXT,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  leads_crm BIGINT,
  mql_count BIGINT,
  cpl_crm NUMERIC,
  cpmql NUMERIC,
  vendas BIGINT,
  faturamento NUMERIC,
  roas NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
    GROUP BY cr_num
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS cr_num,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    'CR-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c ON c.cr_num = m.cr_num
  LEFT JOIN notion_creatives nc ON nc.external_id = 'CR-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$$;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
-- Migration: RLS policies para todas as tabelas novas do OMNX Criativos
-- Descrição: Garante isolamento por workspace em todas as tabelas
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- Helper: função para verificar se usuário pertence ao workspace
-- ============================================================
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- ============================================================
-- creative_tests
-- ============================================================
ALTER TABLE creative_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can view creative_tests"
  ON creative_tests FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can insert creative_tests"
  ON creative_tests FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_tests" ON creative_tests;
CREATE POLICY "Workspace members can update creative_tests"
  ON creative_tests FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_tests" ON creative_tests;
CREATE POLICY "Service role full access on creative_tests"
  ON creative_tests FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_test_history
-- ============================================================
ALTER TABLE creative_test_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_test_history" ON creative_test_history;
CREATE POLICY "Workspace members can view creative_test_history"
  ON creative_test_history FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_test_history" ON creative_test_history;
CREATE POLICY "Workspace members can insert creative_test_history"
  ON creative_test_history FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_test_history" ON creative_test_history;
CREATE POLICY "Service role full access on creative_test_history"
  ON creative_test_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_comments
-- ============================================================
ALTER TABLE creative_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can view creative_comments"
  ON creative_comments FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can insert creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can insert creative_comments"
  ON creative_comments FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can update creative_comments"
  ON creative_comments FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Workspace members can delete creative_comments" ON creative_comments;
CREATE POLICY "Workspace members can delete creative_comments"
  ON creative_comments FOR DELETE TO authenticated
  USING (is_workspace_member(workspace_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on creative_comments" ON creative_comments;
CREATE POLICY "Service role full access on creative_comments"
  ON creative_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_audit_log
-- ============================================================
ALTER TABLE creative_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_audit_log" ON creative_audit_log;
CREATE POLICY "Workspace members can view creative_audit_log"
  ON creative_audit_log FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_audit_log" ON creative_audit_log;
CREATE POLICY "Service role full access on creative_audit_log"
  ON creative_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- creative_test_criteria (RLS já criado na migration anterior,
-- mas garantimos aqui caso tenha falhado)
-- ============================================================
ALTER TABLE creative_test_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Workspace members can view creative_test_criteria"
  ON creative_test_criteria FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members can update creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Workspace members can update creative_test_criteria"
  ON creative_test_criteria FOR UPDATE TO authenticated
  USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Service role full access on creative_test_criteria" ON creative_test_criteria;
CREATE POLICY "Service role full access on creative_test_criteria"
  ON creative_test_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- GRANT permissions para service_role
-- ============================================================
GRANT ALL ON creative_tests TO service_role;
GRANT ALL ON creative_test_history TO service_role;
GRANT ALL ON creative_comments TO service_role;
GRANT ALL ON creative_audit_log TO service_role;
GRANT ALL ON creative_test_criteria TO service_role;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
