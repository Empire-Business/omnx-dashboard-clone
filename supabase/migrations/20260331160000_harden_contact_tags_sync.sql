-- ============================================================
-- Migration: hardening do sync de tags de contatos
--
-- Objetivos:
-- 1. Evitar depender de scans amplos em webhooks_ghl que sofrem timeout
-- 2. Permitir reparo direcionado por contato / ghl_id
-- 3. Processar backlog de tags nulas em lotes pequenos e previsíveis
-- ============================================================

-- --------------------------------------------------------
-- Função: sync_tags_from_webhook_batch
-- Repara tags a partir do webhook mais recente para um subconjunto
-- controlado de contatos, evitando scan global caro.
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_tags_from_webhook_batch(
  p_limit INT DEFAULT 200,
  p_days_back INT DEFAULT 30,
  p_only_null BOOLEAN DEFAULT true
)
RETURNS TABLE(candidate_count integer, updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_candidate_count INTEGER := 0;
  v_updated_count INTEGER := 0;
BEGIN
  WITH candidate_contacts AS (
    SELECT
      c.id,
      c.ghl_id
    FROM public.contatos c
    WHERE c.ghl_id IS NOT NULL
      AND TRIM(c.ghl_id) <> ''
      AND (
        NOT COALESCE(p_only_null, true)
        OR c.tags IS NULL
      )
    ORDER BY
      c.updated_at ASC NULLS FIRST,
      c.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  ),
  latest_webhook AS (
    SELECT
      cc.id AS contato_id,
      cc.ghl_id,
      extract_ghl_tags(w.payload->'tags') AS tags_value
    FROM candidate_contacts cc
    JOIN LATERAL (
      SELECT w.payload
      FROM public.webhooks_ghl w
      WHERE TRIM(w.payload->>'contact_id') = cc.ghl_id
        AND w.payload->'tags' IS NOT NULL
        AND jsonb_typeof(w.payload->'tags') <> 'null'
        AND w.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 30), 1))
      ORDER BY w.created_at DESC
      LIMIT 1
    ) w ON TRUE
  ),
  atualizado AS (
    UPDATE public.contatos c
    SET
      tags = lw.tags_value,
      updated_at = NOW()
    FROM latest_webhook lw
    WHERE c.id = lw.contato_id
      AND lw.tags_value IS NOT NULL
      AND c.tags IS DISTINCT FROM lw.tags_value
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM candidate_contacts),
    (SELECT COUNT(*) FROM atualizado)
  INTO v_candidate_count, v_updated_count;

  RETURN QUERY SELECT v_candidate_count, v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.sync_tags_from_webhook_batch(INT, INT, BOOLEAN) IS
'Repara contatos.tags em lotes pequenos a partir do webhook mais recente por contact_id.
Evita scan global em webhooks_ghl. Uso recomendado: backlog de tags nulas.';

-- --------------------------------------------------------
-- Função: sync_tags_from_webhook_target
-- Reprocessa um contato específico a partir do último webhook com tags.
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_tags_from_webhook_target(
  p_ghl_id TEXT DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_days_back INT DEFAULT 90
)
RETURNS TABLE(found_webhook boolean, updated_count integer, tags_value text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ghl_id TEXT;
  v_tags_value TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  IF p_ghl_id IS NULL AND p_contact_id IS NULL THEN
    RAISE EXCEPTION 'sync_tags_from_webhook_target requer p_ghl_id ou p_contact_id';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p_ghl_id), ''), c.ghl_id)
    INTO v_ghl_id
  FROM public.contatos c
  WHERE p_contact_id IS NULL OR c.id = p_contact_id
  LIMIT 1;

  IF v_ghl_id IS NULL OR TRIM(v_ghl_id) = '' THEN
    RETURN QUERY SELECT false, 0, NULL::TEXT;
    RETURN;
  END IF;

  SELECT extract_ghl_tags(w.payload->'tags')
    INTO v_tags_value
  FROM public.webhooks_ghl w
  WHERE TRIM(w.payload->>'contact_id') = v_ghl_id
    AND w.payload->'tags' IS NOT NULL
    AND jsonb_typeof(w.payload->'tags') <> 'null'
    AND w.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 90), 1))
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF v_tags_value IS NULL THEN
    RETURN QUERY SELECT false, 0, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.contatos c
  SET
    tags = v_tags_value,
    updated_at = NOW()
  WHERE c.ghl_id = v_ghl_id
    AND (p_contact_id IS NULL OR c.id = p_contact_id)
    AND c.tags IS DISTINCT FROM v_tags_value;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT true, v_updated_count, v_tags_value;
END;
$$;

COMMENT ON FUNCTION public.sync_tags_from_webhook_target(TEXT, UUID, INT) IS
'Reprocessa um contato específico usando o último webhook com tags.
Útil para debug e reparo operacional sem depender do scan global.';
