-- Diagnóstico temporário: status dos jobs de revert de tags no GHL
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT caller, status, COUNT(*) AS qtd
    FROM ghl_api_jobs
    WHERE caller IN (
      'revert-tag-conectado-calls',
      'revert-opp-fields-conectado',
      'auto-tag-conectado-backfill-calls'
    )
    GROUP BY caller, status
    ORDER BY caller, status
  LOOP
    RAISE NOTICE 'caller=% | status=% | qtd=%', v_rec.caller, v_rec.status, v_rec.qtd;
  END LOOP;
END;
$$;

-- Reverte esta migration imediatamente (só era diagnóstico)
