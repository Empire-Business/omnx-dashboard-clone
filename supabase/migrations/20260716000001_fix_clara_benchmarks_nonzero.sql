-- ============================================================
-- Migration: 20260716000001
-- Corrige benchmarks da Clara: CPMQL e spend devem considerar
-- apenas semanas com investimento real (cpmql > 0 / spend > 0).
-- Semanas sem dados de Meta Ads puxavam a media para zero,
-- distorcendo a comparacao (ex: CPMQL medio de R$ 3,79 vs
-- semana atual de R$ 102,41).
-- docs/CLARA-AGENTE-RELATORIOS.md
-- ============================================================
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.get_clara_benchmarks(
    p_workspace_id uuid,
    p_metric text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'leads_avg',            round(avg(r.leads_count)::numeric, 1),
        'leads_stddev',         round(stddev(r.leads_count)::numeric, 1),
        'mqls_avg',             round(avg(r.mqls_count)::numeric, 1),
        'mqls_stddev',          round(stddev(r.mqls_count)::numeric, 1),
        -- CPMQL e spend: benchmark so faz sentido sobre semanas COM investimento
        'cpmql_avg',            round(avg(r.cpmql) FILTER (WHERE r.cpmql > 0)::numeric, 2),
        'cpmql_stddev',         round(stddev(r.cpmql) FILTER (WHERE r.cpmql > 0)::numeric, 2),
        'spend_avg',            round(avg(r.meta_spend) FILTER (WHERE r.meta_spend > 0)::numeric, 2),
        'taxa_conexao_avg',     round(avg(r.taxa_conexao_pct)::numeric, 2),
        'taxa_agendamento_avg', round(avg(r.taxa_agendamento_pct)::numeric, 2),
        'taxa_no_show_avg',     round(avg(r.taxa_no_show_pct)::numeric, 2),
        'roas_avg',             round(avg(r.roas) FILTER (WHERE r.roas > 0)::numeric, 2),
        'semanas_consideradas', count(*)::int,
        'semanas_com_cpmql',    count(*) FILTER (WHERE r.cpmql > 0)::int,
        'semanas_com_spend',    count(*) FILTER (WHERE r.meta_spend > 0)::int
    ) INTO v_result
    FROM public.v_weekly_dashboard r
    WHERE r.workspace_id = p_workspace_id
      AND r.module = 'trafego'
      AND r.dimension = 'todos'
      AND r.report_type = 'cohort'
      AND r.week_start <= CURRENT_DATE
      AND r.leads_count > 0;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_clara_benchmarks(uuid, text) IS
'Medias e desvios-padrao historicos. CPMQL, spend e ROAS ignoram semanas zeradas.';

REVOKE ALL ON FUNCTION public.get_clara_benchmarks(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clara_benchmarks(uuid, text) TO service_role;
