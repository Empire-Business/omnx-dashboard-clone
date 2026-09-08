-- ============================================================================
-- TRIAGEM P0 (continuação de 20260918000000) — revoga GRANTs explícitos a
-- `anon`/`authenticated`/`PUBLIC` em funções SECURITY DEFINER internas cujo
-- intent é inequívoco. Origem do bug: o baseline 20260218000000 (linha 14661)
-- executou `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,
-- authenticated`; funções criadas antes desse GRANT carregam o grant explícito
-- no proacl até hoje, e `REVOKE ... FROM PUBLIC` é no-op contra ele (o grant
-- foi feito DIRETO nos roles, não via pseudo-role PUBLIC — ver análise da
-- causa raiz em 20260816000000 e docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md).
--
-- MÉTODO DA TRIAGEM (2026-07-16, produção qzesffnkqgelmtfblzkr, read-only):
-- 133 funções SECURITY DEFINER com EXECUTE explícito a anon e/ou
-- authenticated foram cruzadas com: (a) pg_policies (uso em RLS), (b)
-- pg_trigger (anexação como trigger), (c) pg_get_functiondef das demais
-- funções (chamadores internos), (d) GRANT/REVOKE explícitos declarados nas
-- migrations do repo, (e) callers em eb-dash2/src e supabase/functions,
-- (f) cron.job. As 36 funções abaixo passaram em TODOS os critérios de
-- revogação segura:
--   - não são referenciadas por nenhuma policy RLS;
--   - não estão anexadas a nenhum trigger;
--   - nenhum caller no frontend nem em edge functions com JWT de usuário;
--   - conteúdo claramente interno (jobs de cron, helpers de fila/relatório).
-- As demais ficaram em MANTER (usadas em policies/triggers/código) ou
-- REVISÃO HUMANA (ambíguas) — ver relatório da sessão.
--
-- GRUPO 1 (27) — jobs de cron e helpers internos SEM caller no código.
-- Chamadores legítimos: pg_cron (executa como postgres/owner — não depende
-- de GRANT), scripts operacionais com service_role (scripts/run-backfill.js)
-- e funções SECURITY DEFINER internas (executam como owner). Caso especial:
-- weekly_reports_auth_header() retorna 'Bearer ' || service_role_key em
-- texto puro — exposição equivalente à do get_secret já corrigida; hoje
-- qualquer chamador com a anon key a invocaria via /rest/v1/rpc.
--
-- GRUPO 2 (9) — intent service_role-only JÁ DECLARADO na migration própria
-- (20260916000000 para get_clara_*, 20260917000000 para
-- update_workspace_external_form_source_status), cujo REVOKE FROM PUBLIC foi
-- no-op para os grants diretos a anon/authenticated. Callers reais: edge
-- functions send-weekly-report-email (via _shared/report-tools.ts) e
-- external-form-submissions, ambas com client SUPABASE_SERVICE_ROLE_KEY.
-- Esta migration apenas CONCLUI o intent já aprovado — mesmo padrão da
-- correção aceita em 20260918000000.
--
-- Idempotente e segura em qualquer ambiente: cada bloco é guardado por
-- to_regprocedure (o banco de teste fgjbmdsucruvtpywyhhf tem drift de
-- migrations — ver docs/BASELINE-REPRODUCIBILIDADE.md — e pode não ter
-- algumas dessas funções).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- GRUPO 1 — jobs de cron e helpers internos (revoga tudo; service_role only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.backfill_meta_ads_job(date,date)',
    'public.discover_agency_locations_job()',
    'public.ghl_api_worker_job()',
    'public.ghl_opp_reconcile_process_job()',
    'public.ghl_opp_reconcile_start_nightly_job()',
    'public.notion_sync_creatives_job(text)',
    'public.notion_sync_organic_creatives_job()',
    'public.notion_sync_paid_creatives_job()',
    'public.recalcular_discagem_scores()',
    'public.sync_ad_permalinks_job()',
    'public.sync_contact_attribution_job()',
    'public.sync_contact_opportunities_job()',
    'public.sync_contact_tags_job()',
    'public.sync_contact_tasks_job()',
    'public.sync_ghl_conversations_job()',
    'public.sync_ghl_users_job()',
    'public.sync_meta_ads_7days_job()',
    'public.sync_meta_ads_job()',
    'public.sync_opp_dates_job()',
    'public.sync_tags_from_latest_webhook(integer)',
    'public.weekly_email_dispatcher_job()',
    'public.weekly_reports_cohort_job()',
    'public.weekly_reports_cohort_reprocess_job()',
    'public.weekly_reports_finalize_job()',
    'public.weekly_reports_produtividade_job()',
    'public.weekly_reports_auth_header()',
    'public.verificar_status_backfill()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- GRUPO 2 — intent service_role-only declarado em migration própria
-- (20260916000000 / 20260917000000); conclui o REVOKE que foi no-op.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.get_clara_benchmarks(uuid,text)',
    'public.get_clara_campaigns(uuid,date,date)',
    'public.get_clara_channels(uuid,date,date)',
    'public.get_clara_comparison(uuid,date,date)',
    'public.get_clara_creatives(uuid,date,date)',
    'public.get_clara_funnel(uuid,date,date)',
    'public.get_clara_kpis(uuid,date,date)',
    'public.get_clara_trend(uuid,text,integer)',
    'public.update_workspace_external_form_source_status(uuid,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END
$$;
