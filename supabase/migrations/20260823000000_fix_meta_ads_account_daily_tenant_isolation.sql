-- =============================================================================
-- Meta Ads account daily: isolamento por workspace
--
-- O backfill e o sync normal escrevem a conta Meta por workspace. A chave
-- anterior (account_id, date) permitia colisao entre workspaces e a policy de
-- agencia ainda nao cobria esta tabela.
-- =============================================================================

SET search_path = public, pg_catalog;

ALTER TABLE public.meta_ads_account_daily
  DROP CONSTRAINT IF EXISTS meta_ads_account_daily_account_date_key;

ALTER TABLE public.meta_ads_account_daily
  ADD CONSTRAINT meta_ads_account_daily_workspace_account_date_key
  UNIQUE (workspace_id, account_id, date);

-- Linhas legadas continuam legiveis para o cutover, mas toda escrita nova deve
-- declarar o workspace. A validacao total so pode ocorrer apos o backfill
-- historico ser atribuido com seguranca.
ALTER TABLE public.meta_ads_account_daily
  DROP CONSTRAINT IF EXISTS meta_ads_account_daily_workspace_id_required;

ALTER TABLE public.meta_ads_account_daily
  ADD CONSTRAINT meta_ads_account_daily_workspace_id_required
  CHECK (workspace_id IS NOT NULL) NOT VALID;

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

NOTIFY pgrst, 'reload schema';
