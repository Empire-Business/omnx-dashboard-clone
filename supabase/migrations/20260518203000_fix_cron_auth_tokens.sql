-- Migration: Remove hardcoded service_role tokens from cron jobs
-- Date: 2026-05-18
-- Issue: CRITICAL — service_role JWT hardcoded in cron functions
-- Fix: Use app_config table + helper function for secure token storage
-- After deploy: rotate service_role key in Supabase Dashboard → Settings → API

-- =============================================================================
-- 1. TABELA DE CONFIGURAÇÃO SEGURA
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can modify; anon can read (needed for cron context)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'app_config' AND policyname = 'app_config_service_all'
  ) THEN
    CREATE POLICY app_config_service_all ON public.app_config FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'app_config' AND policyname = 'app_config_anon_read'
  ) THEN
    CREATE POLICY app_config_anon_read ON public.app_config FOR SELECT TO anon USING (true);
  END IF;
END
$$;

-- =============================================================================
-- 2. FUNÇÃO HELPER DE AUTORIZAÇÃO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_auth_header()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- First try: read from app_config table (preferred, works without ALTER DATABASE)
  SELECT value INTO v_token
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  -- Second try: legacy database setting (backward compat)
  IF v_token IS NULL OR v_token = '' THEN
    v_token := current_setting('app.settings.supabase_anon_key', true);
  END IF;

  -- Third try: alternative setting name
  IF v_token IS NULL OR v_token = '' THEN
    v_token := current_setting('app.weekly_reports_anon_key', true);
  END IF;

  RETURN 'Bearer ' || COALESCE(v_token, '');
END;
$$;

-- =============================================================================
-- 3. RECRIAÇÃO DAS FUNÇÕES DE CRON SEM TOKEN HARDCODED
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Produtividade
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reports_produtividade_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_week_start DATE;
  v_request_id BIGINT;
BEGIN
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', public.weekly_reports_auth_header()
    ),
    body := jsonb_build_object(
      'report_type', 'produtividade',
      'week_start',  v_week_start
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | Week: ' || v_week_start || ' | Type: produtividade';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3.2 Cohort
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_week_start DATE;
  v_request_id BIGINT;
BEGIN
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', public.weekly_reports_auth_header()
    ),
    body := jsonb_build_object(
      'report_type', 'cohort',
      'week_start',  v_week_start
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | Week: ' || v_week_start || ' | Type: cohort';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3.3 Cohort Reprocess
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  FOR v_item IN
    SELECT id, week_start, report_type
    FROM public.weekly_reprocess_queue
    WHERE processed_at IS NULL
    ORDER BY priority DESC, created_at ASC
    LIMIT 5
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type', 'cohort',
        'week_start',  v_item.week_start,
        'reprocess',   true
      )
    ) INTO v_request_id;

    UPDATE public.weekly_reprocess_queue
    SET processed_at = NOW(),
        attempts     = attempts + 1
    WHERE id = v_item.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Processed: ' || v_count || ' items';
END;
$$;

-- =============================================================================
-- 4. INSTRUÇÕES PÓS-MIGRAÇÃO
-- =============================================================================
--
-- APÓS RODAR ESTA MIGRAÇÃO, execute no SQL Editor ou via CLI:
--
--   INSERT INTO public.app_config (key, value) VALUES ('supabase_anon_key', 'eyJ...')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- Onde 'eyJ...' é o anon key do projeto (Settings → API no Supabase Dashboard).
--
-- Se ALTER DATABASE SET for suportado no futuro, pode usar como fallback:
--   ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'eyJ...';
--
-- =============================================================================
