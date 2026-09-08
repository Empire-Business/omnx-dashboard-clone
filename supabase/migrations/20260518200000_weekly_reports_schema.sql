-- Migration: Schema de Relatórios Semanais — Tabelas Tipadas por Módulo + Central
-- Data: 2026-05-18
-- Objetivo: Substituir o modelo EAV por tabelas tipadas com uma central weekly_snapshots,
--           mantendo uma view unificada v_weekly_dashboard para leitura simples.

-- =============================================================================
-- 0. FUNÇÃO AUXILIAR
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. TABELA CENTRAL: weekly_snapshots (catálogo mestre)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_snapshots (
  id                      BIGSERIAL PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Identificação da semana comercial (segunda → domingo, BRT)
  week_start              DATE NOT NULL,
  week_end                DATE NOT NULL GENERATED ALWAYS AS (week_start + 6) STORED,
  year_week               TEXT NOT NULL,

  -- Tipo de snapshot
  report_type             TEXT NOT NULL CHECK (report_type IN ('cohort', 'produtividade')),

  -- Status do processamento
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'computing', 'completed', 'failed', 'finalized')),

  -- Metadados de computação
  computed_at             TIMESTAMPTZ,
  finalized_at            TIMESTAMPTZ,
  computation_duration_ms INTEGER,
  records_processed       INTEGER,
  error_message           TEXT,

  -- Controle de versão
  data_version            INTEGER NOT NULL DEFAULT 1,

  -- Único: uma semana + tipo = um snapshot
  CONSTRAINT uq_weekly_snapshots_week_type UNIQUE (week_start, report_type)
);

COMMENT ON TABLE public.weekly_snapshots IS
  'Catálogo central de todos os snapshots semanais. Cada semana comercial (segunda→domingo) gera 2 snapshots: cohort e produtividade. As tabelas por módulo referenciam este ID.';
COMMENT ON COLUMN public.weekly_snapshots.week_start IS 'Segunda-feira da semana comercial (DATE). Identificador temporal.';
COMMENT ON COLUMN public.weekly_snapshots.report_type IS 'cohort = métricas filtradas por data_lead_recebido (mutável). produtividade = métricas filtradas por data do evento (imutável após fechamento).';
COMMENT ON COLUMN public.weekly_snapshots.status IS 'pending→computing→completed | failed. finalized = semana antiga trancada.';
COMMENT ON COLUMN public.weekly_snapshots.data_version IS 'Incrementado a cada reprocessamento do mesmo snapshot (especialmente cohort).';

-- Trigger updated_at
DROP TRIGGER IF EXISTS tr_weekly_snapshots_updated_at ON public.weekly_snapshots;
CREATE TRIGGER tr_weekly_snapshots_updated_at
  BEFORE UPDATE ON public.weekly_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. TABELAS POR MÓDULO (tipadas, FK para weekly_snapshots)
-- =============================================================================

-- -------------------------------
-- 2.1 Módulo TRÁFEGO
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_trafego (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,

  -- Volume
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,

  -- Financeiro
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_entrada     NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Meta Ads
  meta_spend        NUMERIC(18,2) NOT NULL DEFAULT 0,
  meta_impressions  INTEGER NOT NULL DEFAULT 0,
  meta_clicks       INTEGER NOT NULL DEFAULT 0,
  meta_leads_actions INTEGER NOT NULL DEFAULT 0,

  -- Derivadas
  cpmql             NUMERIC(18,2),
  cpv               NUMERIC(18,2),
  roas              NUMERIC(18,4),
  roas_caixa        NUMERIC(18,4),
  ctr               NUMERIC(18,4),
  ciclo_compra_dias NUMERIC(18,2),
  taxa_conexao_pct      NUMERIC(18,2),
  taxa_agendamento_pct  NUMERIC(18,2),
  taxa_reuniao_pct      NUMERIC(18,2),
  taxa_conversao_pct    NUMERIC(18,2),
  taxa_no_show_pct      NUMERIC(18,2),

  -- Extensibilidade
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,

  CONSTRAINT uq_weekly_trafego_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_trafego IS 'Métricas semanais do módulo Tráfego. FK para weekly_snapshots.';

-- -------------------------------
-- 2.2 Módulo AQUISIÇÃO
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_aquisicao (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_entrada     NUMERIC(18,2) NOT NULL DEFAULT 0,
  meta_spend        NUMERIC(18,2) NOT NULL DEFAULT 0,
  meta_impressions  INTEGER NOT NULL DEFAULT 0,
  meta_clicks       INTEGER NOT NULL DEFAULT 0,
  meta_leads_actions INTEGER NOT NULL DEFAULT 0,
  cpmql             NUMERIC(18,2),
  cpv               NUMERIC(18,2),
  roas              NUMERIC(18,4),
  roas_caixa        NUMERIC(18,4),
  ctr               NUMERIC(18,4),
  ciclo_compra_dias NUMERIC(18,2),
  taxa_conexao_pct      NUMERIC(18,2),
  taxa_agendamento_pct  NUMERIC(18,2),
  taxa_reuniao_pct      NUMERIC(18,2),
  taxa_conversao_pct    NUMERIC(18,2),
  taxa_no_show_pct      NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_aquisicao_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_aquisicao IS 'Métricas semanais do módulo Aquisição. FK para weekly_snapshots.';

-- -------------------------------
-- 2.3 Módulo ORGÂNICO
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_organico (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  taxa_conexao_pct      NUMERIC(18,2),
  taxa_agendamento_pct  NUMERIC(18,2),
  taxa_reuniao_pct      NUMERIC(18,2),
  taxa_conversao_pct    NUMERIC(18,2),
  taxa_no_show_pct      NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_organico_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_organico IS 'Métricas semanais do módulo Orgânico (sem investimento Meta). FK para weekly_snapshots.';

-- -------------------------------
-- 2.4 Módulo PRÉ-VENDAS
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_prevendas (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  ligacoes_count        INTEGER NOT NULL DEFAULT 0,
  mensagens_count       INTEGER NOT NULL DEFAULT 0,
  pessoas_contatadas    INTEGER NOT NULL DEFAULT 0,
  leads_sem_resposta    INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds  INTEGER,
  taxa_conexao_pct      NUMERIC(18,2),
  taxa_agendamento_pct  NUMERIC(18,2),
  taxa_reuniao_pct      NUMERIC(18,2),
  taxa_conversao_pct    NUMERIC(18,2),
  taxa_no_show_pct      NUMERIC(18,2),
  taxa_sem_resposta_pct NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_prevendas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_prevendas IS 'Métricas semanais do módulo Pré-Vendas. FK para weekly_snapshots.';


-- -------------------------------
-- 2.5 Módulo VENDAS
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_vendas (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,
  perdidos_apos_reuniao INTEGER NOT NULL DEFAULT 0,
  perdidos_sem_reuniao  INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_entrada     NUMERIC(18,2) NOT NULL DEFAULT 0,
  ligacoes_count        INTEGER NOT NULL DEFAULT 0,
  mensagens_count       INTEGER NOT NULL DEFAULT 0,
  pessoas_contatadas    INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds  INTEGER,
  taxa_conversao_pct    NUMERIC(18,2),
  taxa_no_show_pct      NUMERIC(18,2),
  taxa_comparecimento_pct NUMERIC(18,2),
  ciclo_fechamento_dias NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_vendas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_vendas IS 'Métricas semanais do módulo Vendas (closers). FK para weekly_snapshots.';

-- -------------------------------
-- 2.6 Módulo RECUPERAÇÃO
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_recuperacao (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  perdidos_count    INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  ligacoes_count        INTEGER NOT NULL DEFAULT 0,
  mensagens_count       INTEGER NOT NULL DEFAULT 0,
  pessoas_contatadas    INTEGER NOT NULL DEFAULT 0,
  leads_sem_resposta    INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds  INTEGER,
  taxa_conexao_pct      NUMERIC(18,2),
  taxa_agendamento_pct  NUMERIC(18,2),
  taxa_reuniao_pct      NUMERIC(18,2),
  taxa_conversao_pct    NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_recuperacao_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_recuperacao IS 'Métricas semanais do módulo Recuperação. FK para weekly_snapshots.';

-- -------------------------------
-- 2.7 Módulo SDR
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_sdr (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  conectados_count  INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  agendados_no_prazo INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  ligacoes_count        INTEGER NOT NULL DEFAULT 0,
  mensagens_count       INTEGER NOT NULL DEFAULT 0,
  pessoas_contatadas    INTEGER NOT NULL DEFAULT 0,
  leads_sem_resposta    INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds  INTEGER,
  ultima_resposta_seconds INTEGER,
  taxa_conexao_pct          NUMERIC(18,2),
  taxa_agendamento_pct      NUMERIC(18,2),
  taxa_agendamento_prazo_pct NUMERIC(18,2),
  taxa_conversao_pct        NUMERIC(18,2),
  taxa_sem_resposta_pct     NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_sdr_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_sdr IS 'Métricas semanais do módulo SDR. FK para weekly_snapshots.';

-- -------------------------------
-- 2.8 Módulo CLOSER
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_closer (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  leads_count       INTEGER NOT NULL DEFAULT 0,
  mqls_count        INTEGER NOT NULL DEFAULT 0,
  agendados_count   INTEGER NOT NULL DEFAULT 0,
  reunioes_count    INTEGER NOT NULL DEFAULT 0,
  fechados_count    INTEGER NOT NULL DEFAULT 0,
  no_shows_count    INTEGER NOT NULL DEFAULT 0,
  negociacao_count  INTEGER NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC(18,2) NOT NULL DEFAULT 0,
  caixa_recebido    NUMERIC(18,2) NOT NULL DEFAULT 0,
  ligacoes_count        INTEGER NOT NULL DEFAULT 0,
  mensagens_count       INTEGER NOT NULL DEFAULT 0,
  pessoas_contatadas    INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds  INTEGER,
  leads_sem_resposta    INTEGER NOT NULL DEFAULT 0,
  taxa_conversao_pct      NUMERIC(18,2),
  taxa_no_show_pct        NUMERIC(18,2),
  taxa_comparecimento_pct NUMERIC(18,2),
  taxa_sem_resposta_pct   NUMERIC(18,2),
  ciclo_fechamento_dias   NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_closer_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_closer IS 'Métricas semanais do módulo Closer. FK para weekly_snapshots.';

-- -------------------------------
-- 2.9 Módulo METAS
-- -------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_metas (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dimension         TEXT NOT NULL DEFAULT 'todos',
  dimension_value   TEXT NOT NULL DEFAULT 'todos',
  sub_dimension     TEXT DEFAULT NULL,
  sub_dimension_value TEXT DEFAULT NULL,
  meta_mql_target         INTEGER,
  meta_cpmql_target       NUMERIC(18,2),
  meta_spend_target       NUMERIC(18,2),
  meta_vendas_target      INTEGER,
  realizado_mql           INTEGER NOT NULL DEFAULT 0,
  realizado_spend         NUMERIC(18,2) NOT NULL DEFAULT 0,
  realizado_vendas        INTEGER NOT NULL DEFAULT 0,
  realizado_faturamento   NUMERIC(18,2) NOT NULL DEFAULT 0,
  realizado_caixa         NUMERIC(18,2) NOT NULL DEFAULT 0,
  realizado_cpmql         NUMERIC(18,2),
  pct_atingido_mql        NUMERIC(18,2),
  pct_atingido_vendas     NUMERIC(18,2),
  pct_atingido_spend      NUMERIC(18,2),
  ideal_dia_mql           NUMERIC(18,2),
  ideal_dia_vendas        NUMERIC(18,2),
  extras            JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT uq_weekly_metas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
);
COMMENT ON TABLE public.weekly_metas IS 'Métricas semanais do módulo Metas (target vs realizado). FK para weekly_snapshots.';


-- =============================================================================
-- 3. AUDIT TRAIL: weekly_cohort_audit
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_cohort_audit (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_id       BIGINT NOT NULL REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE,
  module            TEXT NOT NULL,
  metric            TEXT NOT NULL,
  dimension         TEXT DEFAULT 'todos',
  dimension_value   TEXT DEFAULT 'todos',
  old_value         NUMERIC,
  new_value         NUMERIC,
  delta             NUMERIC GENERATED ALWAYS AS (new_value - COALESCE(old_value, 0)) STORED,
  reason            TEXT NOT NULL,
  trigger_event     TEXT,
  trigger_record_id TEXT,
  changed_by        UUID DEFAULT auth.uid()
);

COMMENT ON TABLE public.weekly_cohort_audit IS
  'Audit trail de mudanças em snapshots cohort. Permite explicar por que um número mudou.';

-- =============================================================================
-- 4. FILA DE REPROCESSAMENTO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_reprocess_queue (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  week_start        DATE NOT NULL,
  report_type       TEXT NOT NULL CHECK (report_type IN ('cohort', 'produtividade')),
  reason            TEXT NOT NULL,
  priority          INTEGER NOT NULL DEFAULT 0,
  attempts          INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  CONSTRAINT uq_weekly_reprocess_queue UNIQUE (week_start, report_type, reason)
);

COMMENT ON TABLE public.weekly_reprocess_queue IS
  'Fila de reprocessamento. Quando uma venda nova afeta uma semana cohort antiga, a semana entra aqui.';

-- =============================================================================
-- 5. VIEWS (para o desavisado entender facilmente)
-- =============================================================================

-- 5.1 v_weekly_snapshots_status — visão geral do status
CREATE OR REPLACE VIEW public.v_weekly_snapshots_status AS
SELECT
  s.id,
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
  'Visão geral de todos os snapshots. Mostra quantos registros cada módulo tem por snapshot.';

-- 5.2 v_weekly_dashboard — TABELA ÚNICA unificada (UNION ALL)
CREATE OR REPLACE VIEW public.v_weekly_dashboard AS
SELECT
  'trafego' AS module,
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
  'aquisicao', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'organico', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'prevendas', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'vendas', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'recuperacao', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'sdr', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'closer', s.week_start, s.week_end, s.year_week, s.report_type, s.status, s.data_version, s.computed_at,
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
  'TABELA ÚNICA unificada de todos os módulos. Use SELECT * FROM v_weekly_dashboard WHERE week_start = ''2026-05-11'' AND module = ''trafego''. Métricas específicas de cada módulo estão dentro do JSONB extras.';


-- =============================================================================
-- 6. ÍNDICES
-- =============================================================================

-- Central
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_week_type ON public.weekly_snapshots(week_start DESC, report_type);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_status ON public.weekly_snapshots(status, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_year_week ON public.weekly_snapshots(year_week);

-- Módulos (lookup por snapshot + dimensão)
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_snapshot ON public.weekly_trafego(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_dim ON public.weekly_trafego(dimension, dimension_value);
CREATE INDEX IF NOT EXISTS idx_weekly_aquisicao_snapshot ON public.weekly_aquisicao(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_organico_snapshot ON public.weekly_organico(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_prevendas_snapshot ON public.weekly_prevendas(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_vendas_snapshot ON public.weekly_vendas(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_recuperacao_snapshot ON public.weekly_recuperacao(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_snapshot ON public.weekly_sdr(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_closer_snapshot ON public.weekly_closer(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metas_snapshot ON public.weekly_metas(snapshot_id);

-- Audit e fila
CREATE INDEX IF NOT EXISTS idx_weekly_cohort_audit_snapshot ON public.weekly_cohort_audit(snapshot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reprocess_pending ON public.weekly_reprocess_queue(processed_at, priority DESC, created_at)
  WHERE processed_at IS NULL;

-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_trafego ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_aquisicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_organico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_prevendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_recuperacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_sdr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_closer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_cohort_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reprocess_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Política genérica: usuários autenticados podem ler tudo (relatórios são dados consolidados do workspace)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_snapshots' AND policyname = 'weekly_snapshots_select_auth') THEN
    CREATE POLICY weekly_snapshots_select_auth ON public.weekly_snapshots FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_trafego' AND policyname = 'weekly_trafego_select_auth') THEN
    CREATE POLICY weekly_trafego_select_auth ON public.weekly_trafego FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_aquisicao' AND policyname = 'weekly_aquisicao_select_auth') THEN
    CREATE POLICY weekly_aquisicao_select_auth ON public.weekly_aquisicao FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_organico' AND policyname = 'weekly_organico_select_auth') THEN
    CREATE POLICY weekly_organico_select_auth ON public.weekly_organico FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_prevendas' AND policyname = 'weekly_prevendas_select_auth') THEN
    CREATE POLICY weekly_prevendas_select_auth ON public.weekly_prevendas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_vendas' AND policyname = 'weekly_vendas_select_auth') THEN
    CREATE POLICY weekly_vendas_select_auth ON public.weekly_vendas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_recuperacao' AND policyname = 'weekly_recuperacao_select_auth') THEN
    CREATE POLICY weekly_recuperacao_select_auth ON public.weekly_recuperacao FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_sdr' AND policyname = 'weekly_sdr_select_auth') THEN
    CREATE POLICY weekly_sdr_select_auth ON public.weekly_sdr FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_closer' AND policyname = 'weekly_closer_select_auth') THEN
    CREATE POLICY weekly_closer_select_auth ON public.weekly_closer FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_metas' AND policyname = 'weekly_metas_select_auth') THEN
    CREATE POLICY weekly_metas_select_auth ON public.weekly_metas FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_cohort_audit' AND policyname = 'weekly_cohort_audit_select_auth') THEN
    CREATE POLICY weekly_cohort_audit_select_auth ON public.weekly_cohort_audit FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weekly_reprocess_queue' AND policyname = 'weekly_reprocess_queue_select_auth') THEN
    CREATE POLICY weekly_reprocess_queue_select_auth ON public.weekly_reprocess_queue FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- =============================================================================
-- 8. COMENTÁRIOS FINAIS
-- =============================================================================

COMMENT ON COLUMN public.weekly_reprocess_queue.priority IS 'Maior número = maior prioridade. Semanas recentes devem ter prioridade maior.';
COMMENT ON COLUMN public.weekly_cohort_audit.reason IS 'Descrição legível da causa (ex: "Venda de eduardosampaio.mb@gmail.com - opp_id abc").';
COMMENT ON COLUMN public.weekly_cohort_audit.trigger_record_id IS 'ID do registro que causou a mudança (oportunidade, pagamento, etc.).';

