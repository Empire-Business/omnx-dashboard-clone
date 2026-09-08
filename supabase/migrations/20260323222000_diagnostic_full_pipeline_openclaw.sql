-- Diagnóstico completo: verificar cada etapa do pipeline OpenClaw
-- Etapa 1: webhook chegou? → Etapa 2: vendas_fechamento atualizado? → Etapa 3: pg_net disparou?

DO $$
DECLARE
  v_rec RECORD;
  v_count INT;
  v_func_exists BOOLEAN;
  v_func_schema TEXT;
  v_func_args TEXT;
BEGIN

  -- ============================================================
  -- ETAPA 0: Verificar se net.http_post existe e onde
  -- ============================================================
  RAISE NOTICE '========== ETAPA 0: Verificar net.http_post ==========';

  FOR v_rec IN
    SELECT n.nspname AS schema_name, p.proname, pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'http_post'
    ORDER BY n.nspname
  LOOP
    RAISE NOTICE 'Encontrado: %.%(%) ', v_rec.schema_name, v_rec.proname, v_rec.args;
  END LOOP;

  -- Verificar search_path da função
  SELECT pg_get_functiondef(p.oid)
  INTO v_func_schema
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'notify_openclaw_contrato_assinado' AND n.nspname = 'public';

  RAISE NOTICE 'Definição da função (primeiros 500 chars): %', LEFT(v_func_schema, 500);

  -- ============================================================
  -- ETAPA 1: Webhooks recentes com stage "Assinada"
  -- ============================================================
  RAISE NOTICE '========== ETAPA 1: Webhooks recentes ==========';

  SELECT COUNT(*) INTO v_count
  FROM webhooks_ghl
  WHERE created_at > NOW() - INTERVAL '2 hours';
  RAISE NOTICE 'Webhooks nas últimas 2h: %', v_count;

  FOR v_rec IN
    SELECT
      w.id,
      w.created_at,
      w.payload->>'id' AS opp_id,
      w.payload->>'contact_id' AS contact_id,
      w.payload->>'pipeline_id' AS pipeline_id,
      w.payload->>'pipleline_stage' AS stage,
      LEFT(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}', 60) AS link_contrato
    FROM webhooks_ghl w
    WHERE w.created_at > NOW() - INTERVAL '2 hours'
    ORDER BY w.created_at DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'webhook id=% | opp=% | stage=% | link=% | criado=%',
      v_rec.id, v_rec.opp_id, v_rec.stage, v_rec.link_contrato, v_rec.created_at;
  END LOOP;

  -- ============================================================
  -- ETAPA 2: vendas_fechamento — registros recentes com link
  -- ============================================================
  RAISE NOTICE '========== ETAPA 2: vendas_fechamento recentes ==========';

  FOR v_rec IN
    SELECT
      vf.id,
      vf.updated_at,
      vf.op_link_do_contrato_assinado IS NOT NULL AS tem_link,
      LEFT(vf.op_link_do_contrato_assinado, 60) AS link,
      c.nome,
      c.email
    FROM vendas_fechamento vf
    JOIN contatos c ON c.id = vf.contato_id
    WHERE vf.updated_at > NOW() - INTERVAL '2 hours'
    ORDER BY vf.updated_at DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'vf_id=% | link=% | nome=% | email=% | updated=%',
      v_rec.id, v_rec.tem_link, v_rec.nome, v_rec.email, v_rec.updated_at;
  END LOOP;

  -- ============================================================
  -- ETAPA 3: pg_net requests recentes
  -- ============================================================
  RAISE NOTICE '========== ETAPA 3: pg_net requests recentes ==========';

  FOR v_rec IN
    SELECT id, status_code, error_msg, created
    FROM net._http_response
    WHERE created > NOW() - INTERVAL '2 hours'
    ORDER BY created DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'request_id=% | status=% | erro=% | criado=%',
      v_rec.id, v_rec.status_code, v_rec.error_msg, v_rec.created;
  END LOOP;

  -- Verificar se há requests pendentes (enviados mas sem resposta)
  SELECT COUNT(*) INTO v_count
  FROM net._http_response
  WHERE created > NOW() - INTERVAL '2 hours'
    AND status_code IS NULL
    AND error_msg IS NULL;
  RAISE NOTICE 'Requests pendentes (sem resposta): %', v_count;

  -- ============================================================
  -- ETAPA 4: Testar net.http_post diretamente
  -- ============================================================
  RAISE NOTICE '========== ETAPA 4: Teste direto net.http_post ==========';

  BEGIN
    PERFORM net.http_post(
      url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
      ),
      body    := jsonb_build_object('evento', 'teste_diagnostico', 'timestamp', NOW()::text)
    );
    RAISE NOTICE '✅ net.http_post executou sem erro';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ net.http_post FALHOU: % | SQLSTATE: %', SQLERRM, SQLSTATE;
  END;

END $$;
