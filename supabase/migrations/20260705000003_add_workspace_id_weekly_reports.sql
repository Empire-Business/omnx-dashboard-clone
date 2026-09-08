-- =============================================================================
-- Migration: Adiciona isolamento por workspace aos relatórios semanais
-- Data: 2026-07-05
--
-- GAP IDENTIFICADO (documentado nesta migration):
--   O compute-weekly-reports atualmente agrega dados de TODOS os workspaces
--   em um único snapshot por (week_start, report_type). Não existe, no momento,
--   uma tabela de mapeamento semana/workspace nem o snapshot é criado por workspace.
--
--   Portanto, esta migration:
--     1. Adiciona workspace_id nullable em weekly_snapshots e tabelas filhas.
--     2. Atualiza as views para expor workspace_id.
--     3. Cria policies que permitem leitura de registros legados (workspace_id IS NULL)
--        e restringe registros novos ao workspace do usuário.
--     4. Documenta a estratégia de backfill e a mudança de arquitetura necessária
--        (snapshot por workspace) para isolamento completo.
--
-- ATENÇÃO: Não popula workspace_id automaticamente porque o modelo de dados
--   ainda não associa um snapshot a um workspace específico. Alterações forçadas
--   correm risco de vazar dados ou associar métricas ao workspace errado.
-- =============================================================================

-- =============================================================================
-- 1. SCHEMA: adiciona workspace_id nullable
-- =============================================================================

ALTER TABLE weekly_snapshots
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_trafego
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_aquisicao
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_organico
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_prevendas
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_vendas
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_recuperacao
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_sdr
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_closer
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_metas
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_cohort_audit
ADD COLUMN IF NOT EXISTS workspace_id UUID;

ALTER TABLE weekly_reprocess_queue
ADD COLUMN IF NOT EXISTS workspace_id UUID;

COMMENT ON COLUMN weekly_snapshots.workspace_id IS
  'Workspace ao qual o snapshot pertence. NULL = legado agregado multi-workspace (backfill pendente).';
COMMENT ON COLUMN weekly_trafego.workspace_id IS
  'Workspace ao qual o registro pertence. Propagado do snapshot.';

-- =============================================================================
-- 2. ÍNDICES para lookup por workspace
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_workspace ON weekly_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_workspace ON weekly_trafego(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_aquisicao_workspace ON weekly_aquisicao(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_organico_workspace ON weekly_organico(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_prevendas_workspace ON weekly_prevendas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_vendas_workspace ON weekly_vendas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_recuperacao_workspace ON weekly_recuperacao(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_workspace ON weekly_sdr(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_closer_workspace ON weekly_closer(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metas_workspace ON weekly_metas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_cohort_audit_workspace ON weekly_cohort_audit(workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reprocess_queue_workspace ON weekly_reprocess_queue(workspace_id);

-- =============================================================================
-- 3. VIEWS: incluem workspace_id
-- =============================================================================

-- DROP + CREATE (não apenas REPLACE) porque workspace_id entra como 2ª coluna,
-- e Postgres não permite reordenar/inserir colunas no meio de uma view existente
-- via CREATE OR REPLACE (só permite acrescentar no final).
DROP VIEW IF EXISTS public.v_weekly_snapshots_status;

CREATE VIEW public.v_weekly_snapshots_status AS
SELECT
  s.id,
  s.workspace_id,
  s.week_start,
  s.week_end,
  s.year_week,
  s.report_type,
  s.status,
  s.data_version,
  s.computed_at,
  s.finalized_at,
  s.computation_duration_ms,
  s.records_processed,
  s.error_message,
  COALESCE(t.cnt, 0) AS trafego_records,
  COALESCE(a.cnt, 0) AS aquisicao_records,
  COALESCE(o.cnt, 0) AS organico_records,
  COALESCE(p.cnt, 0) AS prevendas_records,
  COALESCE(v.cnt, 0) AS vendas_records,
  COALESCE(r.cnt, 0) AS recuperacao_records,
  COALESCE(sd.cnt, 0) AS sdr_records,
  COALESCE(c.cnt, 0) AS closer_records,
  COALESCE(m.cnt, 0) AS metas_records,
  COALESCE(t.cnt, 0) + COALESCE(a.cnt, 0) + COALESCE(o.cnt, 0) +
    COALESCE(p.cnt, 0) + COALESCE(v.cnt, 0) + COALESCE(r.cnt, 0) +
    COALESCE(sd.cnt, 0) + COALESCE(c.cnt, 0) + COALESCE(m.cnt, 0) AS total_module_records
FROM public.weekly_snapshots s
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_trafego GROUP BY snapshot_id) t ON t.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_aquisicao GROUP BY snapshot_id) a ON a.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_organico GROUP BY snapshot_id) o ON o.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_prevendas GROUP BY snapshot_id) p ON p.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_vendas GROUP BY snapshot_id) v ON v.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_recuperacao GROUP BY snapshot_id) r ON r.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_sdr GROUP BY snapshot_id) sd ON sd.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_closer GROUP BY snapshot_id) c ON c.snapshot_id = s.id
LEFT JOIN (SELECT snapshot_id, COUNT(*) AS cnt FROM public.weekly_metas GROUP BY snapshot_id) m ON m.snapshot_id = s.id;

COMMENT ON VIEW public.v_weekly_snapshots_status IS
  'Visão geral de todos os snapshots incluindo workspace_id. Use WHERE workspace_id = ... para isolamento.';

DROP VIEW IF EXISTS public.v_weekly_dashboard;

CREATE VIEW public.v_weekly_dashboard AS
SELECT
  'trafego' AS module,
  s.workspace_id,
  s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  t.dimension, t.dimension_value, t.sub_dimension, t.sub_dimension_value,
  t.leads_count, t.mqls_count, t.conectados_count, t.agendados_count, t.reunioes_count,
  t.fechados_count, t.no_shows_count, t.negociacao_count, t.perdidos_count,
  t.faturamento_bruto, t.caixa_recebido, t.valor_entrada,
  t.meta_spend, t.meta_impressions, t.meta_clicks, t.meta_leads_actions,
  t.cpmql, t.cpv, t.roas, t.roas_caixa, t.ctr, t.ciclo_compra_dias,
  t.taxa_conexao_pct, t.taxa_agendamento_pct, t.taxa_reuniao_pct, t.taxa_conversao_pct, t.taxa_no_show_pct,
  t.extras
FROM public.weekly_snapshots s
JOIN public.weekly_trafego t ON t.snapshot_id = s.id

UNION ALL

SELECT
  'aquisicao', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  a.dimension, a.dimension_value, a.sub_dimension, a.sub_dimension_value,
  a.leads_count, a.mqls_count, a.conectados_count, a.agendados_count, a.reunioes_count,
  a.fechados_count, a.no_shows_count, a.negociacao_count, a.perdidos_count,
  a.faturamento_bruto, a.caixa_recebido, a.valor_entrada,
  a.meta_spend, a.meta_impressions, a.meta_clicks, a.meta_leads_actions,
  a.cpmql, a.cpv, a.roas, a.roas_caixa, a.ctr, a.ciclo_compra_dias,
  a.taxa_conexao_pct, a.taxa_agendamento_pct, a.taxa_reuniao_pct, a.taxa_conversao_pct, a.taxa_no_show_pct,
  a.extras
FROM public.weekly_snapshots s
JOIN public.weekly_aquisicao a ON a.snapshot_id = s.id

UNION ALL

SELECT
  'organico', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  o.dimension, o.dimension_value, o.sub_dimension, o.sub_dimension_value,
  o.leads_count, o.mqls_count, o.conectados_count, o.agendados_count, o.reunioes_count,
  o.fechados_count, o.no_shows_count, o.negociacao_count, o.perdidos_count,
  o.faturamento_bruto, o.caixa_recebido, NULL AS valor_entrada,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, NULL,
  o.taxa_conexao_pct, o.taxa_agendamento_pct, o.taxa_reuniao_pct, o.taxa_conversao_pct, o.taxa_no_show_pct,
  o.extras
FROM public.weekly_snapshots s
JOIN public.weekly_organico o ON o.snapshot_id = s.id

UNION ALL

SELECT
  'prevendas', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  p.dimension, p.dimension_value, p.sub_dimension, p.sub_dimension_value,
  p.leads_count, p.mqls_count, p.conectados_count, p.agendados_count, p.reunioes_count,
  p.fechados_count, p.no_shows_count, p.negociacao_count, p.perdidos_count,
  p.faturamento_bruto, p.caixa_recebido, NULL,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, NULL,
  p.taxa_conexao_pct, p.taxa_agendamento_pct, p.taxa_reuniao_pct, p.taxa_conversao_pct, p.taxa_no_show_pct,
  jsonb_build_object(
    'ligacoes', p.ligacoes_count, 'mensagens', p.mensagens_count,
    'pessoas_contatadas', p.pessoas_contatadas, 'leads_sem_resposta', p.leads_sem_resposta,
    'avg_response_seconds', p.avg_response_seconds, 'taxa_sem_resposta_pct', p.taxa_sem_resposta_pct
  ) || COALESCE(p.extras, '{}'::JSONB)
FROM public.weekly_snapshots s
JOIN public.weekly_prevendas p ON p.snapshot_id = s.id

UNION ALL

SELECT
  'vendas', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  v.dimension, v.dimension_value, v.sub_dimension, v.sub_dimension_value,
  v.leads_count, v.mqls_count, NULL, v.agendados_count, v.reunioes_count,
  v.fechados_count, v.no_shows_count, v.negociacao_count, v.perdidos_count,
  v.faturamento_bruto, v.caixa_recebido, v.valor_entrada,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, v.ciclo_fechamento_dias,
  NULL, NULL, NULL, v.taxa_conversao_pct, v.taxa_no_show_pct,
  jsonb_build_object(
    'ligacoes', v.ligacoes_count, 'mensagens', v.mensagens_count,
    'pessoas_contatadas', v.pessoas_contatadas, 'avg_response_seconds', v.avg_response_seconds,
    'taxa_comparecimento_pct', v.taxa_comparecimento_pct,
    'perdidos_apos_reuniao', v.perdidos_apos_reuniao, 'perdidos_sem_reuniao', v.perdidos_sem_reuniao
  ) || COALESCE(v.extras, '{}'::JSONB)
FROM public.weekly_snapshots s
JOIN public.weekly_vendas v ON v.snapshot_id = s.id

UNION ALL

SELECT
  'recuperacao', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  r.dimension, r.dimension_value, r.sub_dimension, r.sub_dimension_value,
  r.leads_count, r.mqls_count, r.conectados_count, r.agendados_count, r.reunioes_count,
  r.fechados_count, r.no_shows_count, r.negociacao_count, r.perdidos_count,
  r.faturamento_bruto, r.caixa_recebido, NULL,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, NULL,
  r.taxa_conexao_pct, r.taxa_agendamento_pct, r.taxa_reuniao_pct, r.taxa_conversao_pct, NULL,
  jsonb_build_object(
    'ligacoes', r.ligacoes_count, 'mensagens', r.mensagens_count,
    'pessoas_contatadas', r.pessoas_contatadas, 'leads_sem_resposta', r.leads_sem_resposta,
    'avg_response_seconds', r.avg_response_seconds
  ) || COALESCE(r.extras, '{}'::JSONB)
FROM public.weekly_snapshots s
JOIN public.weekly_recuperacao r ON r.snapshot_id = s.id

UNION ALL

SELECT
  'sdr', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  sd.dimension, sd.dimension_value, sd.sub_dimension, sd.sub_dimension_value,
  sd.leads_count, NULL, sd.conectados_count, sd.agendados_count, sd.reunioes_count,
  sd.fechados_count, NULL, NULL, NULL,
  sd.faturamento_bruto, sd.caixa_recebido, NULL,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, NULL,
  sd.taxa_conexao_pct, sd.taxa_agendamento_pct, NULL, sd.taxa_conversao_pct, NULL,
  jsonb_build_object(
    'ligacoes', sd.ligacoes_count, 'mensagens', sd.mensagens_count,
    'pessoas_contatadas', sd.pessoas_contatadas, 'leads_sem_resposta', sd.leads_sem_resposta,
    'avg_response_seconds', sd.avg_response_seconds, 'ultima_resposta_seconds', sd.ultima_resposta_seconds,
    'taxa_agendamento_prazo_pct', sd.taxa_agendamento_prazo_pct, 'taxa_sem_resposta_pct', sd.taxa_sem_resposta_pct,
    'agendados_no_prazo', sd.agendados_no_prazo
  ) || COALESCE(sd.extras, '{}'::JSONB)
FROM public.weekly_snapshots s
JOIN public.weekly_sdr sd ON sd.snapshot_id = s.id

UNION ALL

SELECT
  'closer', s.workspace_id, s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
  c.dimension, c.dimension_value, c.sub_dimension, c.sub_dimension_value,
  c.leads_count, c.mqls_count, NULL, c.agendados_count, c.reunioes_count,
  c.fechados_count, c.no_shows_count, c.negociacao_count, NULL,
  c.faturamento_bruto, c.caixa_recebido, NULL,
  0, 0, 0, 0,
  NULL, NULL, NULL, NULL, NULL, c.ciclo_fechamento_dias,
  NULL, NULL, NULL, c.taxa_conversao_pct, c.taxa_no_show_pct,
  jsonb_build_object(
    'ligacoes', c.ligacoes_count, 'mensagens', c.mensagens_count,
    'pessoas_contatadas', c.pessoas_contatadas, 'avg_response_seconds', c.avg_response_seconds,
    'leads_sem_resposta', c.leads_sem_resposta, 'taxa_comparecimento_pct', c.taxa_comparecimento_pct,
    'taxa_sem_resposta_pct', c.taxa_sem_resposta_pct
  ) || COALESCE(c.extras, '{}'::JSONB)
FROM public.weekly_snapshots s
JOIN public.weekly_closer c ON c.snapshot_id = s.id;

COMMENT ON VIEW public.v_weekly_dashboard IS
  'TABELA ÚNICA unificada de todos os módulos incluindo workspace_id. Use WHERE workspace_id = ... para isolamento.';

-- =============================================================================
-- 4. ROW LEVEL SECURITY: policies por workspace
-- =============================================================================

DO $$
BEGIN
  -- snapshots
  DROP POLICY IF EXISTS weekly_snapshots_select_auth ON public.weekly_snapshots;
  CREATE POLICY weekly_snapshots_select_auth ON public.weekly_snapshots FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- trafego
  DROP POLICY IF EXISTS weekly_trafego_select_auth ON public.weekly_trafego;
  CREATE POLICY weekly_trafego_select_auth ON public.weekly_trafego FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- aquisicao
  DROP POLICY IF EXISTS weekly_aquisicao_select_auth ON public.weekly_aquisicao;
  CREATE POLICY weekly_aquisicao_select_auth ON public.weekly_aquisicao FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- organico
  DROP POLICY IF EXISTS weekly_organico_select_auth ON public.weekly_organico;
  CREATE POLICY weekly_organico_select_auth ON public.weekly_organico FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- prevendas
  DROP POLICY IF EXISTS weekly_prevendas_select_auth ON public.weekly_prevendas;
  CREATE POLICY weekly_prevendas_select_auth ON public.weekly_prevendas FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- vendas
  DROP POLICY IF EXISTS weekly_vendas_select_auth ON public.weekly_vendas;
  CREATE POLICY weekly_vendas_select_auth ON public.weekly_vendas FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- recuperacao
  DROP POLICY IF EXISTS weekly_recuperacao_select_auth ON public.weekly_recuperacao;
  CREATE POLICY weekly_recuperacao_select_auth ON public.weekly_recuperacao FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- sdr
  DROP POLICY IF EXISTS weekly_sdr_select_auth ON public.weekly_sdr;
  CREATE POLICY weekly_sdr_select_auth ON public.weekly_sdr FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- closer
  DROP POLICY IF EXISTS weekly_closer_select_auth ON public.weekly_closer;
  CREATE POLICY weekly_closer_select_auth ON public.weekly_closer FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- metas
  DROP POLICY IF EXISTS weekly_metas_select_auth ON public.weekly_metas;
  CREATE POLICY weekly_metas_select_auth ON public.weekly_metas FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- audit
  DROP POLICY IF EXISTS weekly_cohort_audit_select_auth ON public.weekly_cohort_audit;
  CREATE POLICY weekly_cohort_audit_select_auth ON public.weekly_cohort_audit FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );

  -- reprocess queue
  DROP POLICY IF EXISTS weekly_reprocess_queue_select_auth ON public.weekly_reprocess_queue;
  CREATE POLICY weekly_reprocess_queue_select_auth ON public.weekly_reprocess_queue FOR SELECT
    USING (
      workspace_id IS NULL
      OR is_workspace_member(workspace_id)
    );
END $$;

-- Service role mantém acesso total em todas as tabelas weekly_*
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'weekly_snapshots', 'weekly_trafego', 'weekly_aquisicao', 'weekly_organico',
    'weekly_prevendas', 'weekly_vendas', 'weekly_recuperacao', 'weekly_sdr',
    'weekly_closer', 'weekly_metas', 'weekly_cohort_audit', 'weekly_reprocess_queue'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "service_role_all_%1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 5. GRANTS
-- =============================================================================

GRANT SELECT ON public.v_weekly_snapshots_status TO authenticated;
GRANT SELECT ON public.v_weekly_dashboard TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =============================================================================
-- 6. ESTRATÉGIA DE BACKFILL E MUDANÇA DE ARQUITETURA
-- =============================================================================

/*
PROBLEMA DE ARQUITETURA:
  Atualmente weekly_snapshots tem unicidade (week_start, report_type). Para isolar
  por workspace é necessário mudar para (workspace_id, week_start, report_type).
  Isso exige recriação da constraint e alteração da Edge Function
  compute-weekly-reports para criar um snapshot por workspace.

PASSO 1 — Alterar a constraint de unicidade do snapshot.
  ALTER TABLE weekly_snapshots DROP CONSTRAINT uq_weekly_snapshots_week_type;
  ALTER TABLE weekly_snapshots ADD CONSTRAINT uq_weekly_snapshots_workspace_week_type
      UNIQUE (workspace_id, week_start, report_type);

PASSO 2 — Popular workspace_id nos snapshots legados.
  Se o sistema ainda for single-tenant, descobrir o workspace_id padrão e aplicar:

  UPDATE weekly_snapshots SET workspace_id = '<workspace-padrao>' WHERE workspace_id IS NULL;

  Se houver múltiplos workspaces, não há como inferir corretamente sem
  reprocessar os dados de origem (oportunidades, vendas_fechamento, meta_ads_insights).

PASSO 3 — Reprocessar snapshots por workspace.
  Para cada workspace existente e cada semana:
    - Chamar compute-weekly-reports passando workspace_id no payload.
    - Isso criará snapshots isolados e recalculará as métricas filtrando dados
      do workspace nos dados de origem.

PASSO 4 — Propagar workspace_id para tabelas filhas.
  Após garantir que cada snapshot tenha workspace_id, propagar para as filhas:

  UPDATE weekly_trafego t
  SET workspace_id = s.workspace_id
  FROM weekly_snapshots s
  WHERE t.snapshot_id = s.id AND t.workspace_id IS NULL AND s.workspace_id IS NOT NULL;

  (repetir para weekly_aquisicao, weekly_organico, weekly_prevendas, weekly_vendas,
   weekly_recuperacao, weekly_sdr, weekly_closer, weekly_metas, weekly_cohort_audit)

PASSO 5 — Remover cláusula workspace_id IS NULL das policies de SELECT.
  Depois que TODO dado legado estiver preenchido, remover o OR workspace_id IS NULL
  das policies para garantir isolamento total.
*/
