-- ============================================================
-- Migration: 20260708000001
-- Helpers SQL para resolucao de campos GHL a partir dos mapeamentos
-- configuraveis por workspace.
--
-- Funcoes criadas:
--   1. resolve_ghl_field_value(payload, variations)
--   2. apply_ghl_field_mappings(workspace_id, payload)
--   3. get_workspace_id_by_ghl_location_id(location_id)
-- ============================================================

-- ------------------------------------------------------------------
-- 1. resolve_ghl_field_value
--    Extrai um valor do payload tentando uma lista de variacoes de chave.
--
--    Formatos de variacao suportados:
--      - 'foo'                    -> payload->>'foo'
--      - 'foo.bar'                -> payload#>>'{foo,bar}'
--      - 'lastAttributionSource.utmSource' -> payload->'lastAttributionSource'->>'utmSource'
--      - '{{opportunity.campo}}'  -> payload->'customData'->>'{{opportunity.campo}}'
--
--    Retorna o primeiro valor nao-nulo e nao-vazio encontrado.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_ghl_field_value(
    p_payload jsonb,
    p_variations jsonb
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_variation text;
    v_value text;
    v_path text[];
BEGIN
    IF p_payload IS NULL OR p_variations IS NULL OR jsonb_typeof(p_variations) <> 'array' THEN
        RETURN NULL;
    END IF;

    FOR v_variation IN SELECT jsonb_array_elements_text(p_variations)
    LOOP
        v_variation := TRIM(v_variation);
        IF v_variation = '' THEN
            CONTINUE;
        END IF;

        -- Campos customizados de oportunidade: procuram em customData com chave exata
        IF v_variation LIKE '{{%' THEN
            v_value := NULLIF(TRIM(p_payload->'customData'->>v_variation), '');
            -- Fallback: GHL as vezes armazena sem espacos internos; tenta tambem a versao compacta
            IF v_value IS NULL THEN
                v_value := NULLIF(TRIM(p_payload->'customData'->>REGEXP_REPLACE(v_variation, E'\\s+', '', 'g')), '');
            END IF;
        -- Caminho aninhado (ex: lastAttributionSource.utmSource)
        ELSIF v_variation LIKE '%.%' THEN
            v_path := string_to_array(v_variation, '.');
            v_value := NULLIF(TRIM(p_payload #>> v_path), '');
        -- Chave simples no payload root
        ELSE
            v_value := NULLIF(TRIM(p_payload->>v_variation), '');
        END IF;

        IF v_value IS NOT NULL THEN
            RETURN v_value;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.resolve_ghl_field_value(jsonb, jsonb) IS
'Extrai valor de um payload GHL tentando todas as variacoes de chave fornecidas. Suporta chaves simples, caminhos aninhados e campos customizados {{opportunity.xxx}}.';

-- ------------------------------------------------------------------
-- 2. apply_ghl_field_mappings
--    Aplica todos os mapeamentos ativos de um workspace a um payload,
--    retornando um objeto JSONB { logical_name: valor_resolvido }.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_ghl_field_mappings(
    p_workspace_id uuid,
    p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_result jsonb := '{}'::jsonb;
    rec record;
    v_value text;
BEGIN
    IF p_workspace_id IS NULL OR p_payload IS NULL THEN
        RETURN v_result;
    END IF;

    FOR rec IN
        SELECT logical_name, variations
        FROM public.ghl_field_mappings
        WHERE workspace_id = p_workspace_id
          AND enabled = true
        ORDER BY logical_name
    LOOP
        v_value := public.resolve_ghl_field_value(p_payload, rec.variations);
        IF v_value IS NOT NULL THEN
            v_result := v_result || jsonb_build_object(rec.logical_name, v_value);
        END IF;
    END LOOP;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.apply_ghl_field_mappings(uuid, jsonb) IS
'Retorna JSONB com {logical_name: valor} para todos os mapeamentos ativos do workspace, aplicados ao payload GHL.';

-- ------------------------------------------------------------------
-- 3. get_workspace_id_by_ghl_location_id
--    Resolve workspace_id a partir do locationId do payload do webhook.
--    Na Fase A (instancia isolada) faz fallback para o workspace mais antigo
--    quando nao encontra match exato.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workspace_id_by_ghl_location_id(
    p_location_id text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_workspace_id uuid;
    v_clean_location_id text;
BEGIN
    v_clean_location_id := NULLIF(TRIM(p_location_id), '');

    IF v_clean_location_id IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id
        FROM public.ghl_integration_settings
        WHERE ghl_location_id = v_clean_location_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Fallback Fase A: workspace unico/mais antigo
    IF v_workspace_id IS NULL THEN
        SELECT id INTO v_workspace_id
        FROM public.workspaces
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    RETURN v_workspace_id;
END;
$$;

COMMENT ON FUNCTION public.get_workspace_id_by_ghl_location_id(text) IS
'Resolve workspace_id a partir do locationId GHL. Fallback para o workspace mais antigo (Fase A).';
