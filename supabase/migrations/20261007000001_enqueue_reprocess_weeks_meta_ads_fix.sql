-- ============================================================
-- chore: enfileira reprocessamento dos relatórios semanais afetados
-- pela corrupção de meta_ads_insights (janela 30/06–06/07/2026)
--
-- compute-weekly-reports lê meta_ads_insights; os relatórios das
-- semanas de 29/06 e 06/07 foram persistidos com investimento inflado.
-- Após a cura dos dados (migration 20261007000000), enfileirar o
-- reprocessamento — o job weekly_reports_cohort_reprocess_job (a cada
-- 30 min) consome a fila chamando a edge function com service_role.
-- Idempotente: só insere se não houver item pendente igual.
-- ============================================================

INSERT INTO public.weekly_reprocess_queue (week_start, report_type, reason, priority, workspace_id)
SELECT v.week_start, v.report_type, 'recalculo apos cura meta_ads_insights 30/06-06/07/2026 (migration 20261007000000)', 10, '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
FROM (
    VALUES
        (DATE '2026-06-29', 'cohort'),
        (DATE '2026-06-29', 'produtividade'),
        (DATE '2026-07-06', 'cohort'),
        (DATE '2026-07-06', 'produtividade')
) AS v(week_start, report_type)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.weekly_reprocess_queue q
    WHERE q.week_start = v.week_start
      AND q.report_type = v.report_type
      AND q.workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
      AND q.processed_at IS NULL
);
