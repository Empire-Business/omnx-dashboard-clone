-- =============================================================================
-- Pré-requisito do retrofit RLS de agência para meta_ads_account_daily.
--
-- A tabela já possuía uma policy por workspace no schema restaurado de produção,
-- mas ficou fora do gerador da migration 20260722000000. O próprio verificador de
-- cobertura daquela migration interrompe corretamente sem esta via de agência.
-- Esta migration entra depois de can_access_workspace_via_agency() e antes do
-- retrofit, sem alterar dados nem conceder acesso a subconta suspensa/outra agência.
-- =============================================================================

SET search_path = public, pg_catalog;

DROP POLICY IF EXISTS "agencia_select_meta_ads_account_daily"
  ON public.meta_ads_account_daily;

CREATE POLICY "agencia_select_meta_ads_account_daily"
  ON public.meta_ads_account_daily
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL
    OR public.can_access_workspace_via_agency(workspace_id)
  );
