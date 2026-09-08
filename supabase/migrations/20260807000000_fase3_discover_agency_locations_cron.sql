-- ============================================================================
-- FASE 3 — Descoberta de sub-contas — fatia 4: cron discover-agency-locations
-- docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.4)
--
-- A edge function discover-agency-locations ja percorre INTERNAMENTE todas as
-- agencias com credencial em agency_ghl_credentials (sem precisar de
-- workspace_id/agency_id no body — diferente do padrao por-workspace da
-- fase8_meta_crons). Entao o job so precisa disparar UMA chamada HTTP.
--
-- Mesmo padrao de leitura de secrets via get_secret() dos crons fase8
-- (20260728000000_fase8_meta_crons_por_workspace.sql) — sem URL/token
-- hardcoded (20260706135825_remove_hardcoded_supabase_tokens.sql).
--
-- Frequencia: a cada 6h (descoberta de sub-conta nao e latencia-critica).
--
-- Idempotente: OR REPLACE / unschedule condicional.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.discover_agency_locations_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/discover-agency-locations';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_request_id  BIGINT;
  v_agency_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT agency_id) INTO v_agency_count FROM public.agency_ghl_credentials;

  IF v_agency_count = 0 THEN
    RETURN 'discover_agency_locations_job: nenhuma agencia com credencial GHL (no-op).';
  END IF;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := '{}'::jsonb
  ) INTO v_request_id;

  RETURN 'discover_agency_locations_job: agencias=' || v_agency_count || ' | request_id=' || COALESCE(v_request_id::text, 'null');
END;
$function$;

COMMENT ON FUNCTION public.discover_agency_locations_job() IS
  'Cron a cada 6h: dispara discover-agency-locations (descobre sub-contas novas via token de agencia so-leitura). No-op se nenhuma agencia tiver credencial cadastrada.';

SELECT cron.unschedule('discover-agency-locations-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'discover-agency-locations-6h');

SELECT cron.schedule(
  'discover-agency-locations-6h',
  '0 */6 * * *',
  'SELECT public.discover_agency_locations_job();'
);

NOTIFY pgrst, 'reload schema';
