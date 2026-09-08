-- ============================================================
-- Migration: backfill contatos.tags a partir dos webhooks
-- Executa sync_tags_from_latest_webhook(90) imediatamente.
-- Migrations rodam sem o timeout curto do PostgREST.
-- ============================================================

-- Ajustar statement_timeout local para esta migration
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM sync_tags_from_latest_webhook(90);
  RAISE NOTICE 'Backfill tags concluído: % contatos atualizados', v_result.updated_count;
END;
$$;
