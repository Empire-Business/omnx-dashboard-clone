-- ============================================================================
-- FASE 15 — Múltiplas contas de anúncio Meta por workspace — fatia 1 (D2)
-- Design: docs/FASE-15-MULTI-CONTA-META.md (item D2)
--
-- O que muda em save_workspace_credential quando provider = 'meta':
--   1. Aceita metadata.ad_account_ids: string[] (lista canônica de contas).
--      Normalização: trim, remove vazios/duplicados (preservando a ordem),
--      adiciona prefixo 'act_' quando vier só números; rejeita entradas fora
--      de ^act_[0-9]+$ com erro 22023.
--   2. Compat legado: metadata.ad_account_id (singular) continua aceito e é
--      normalizado para uma lista de 1 item.
--   3. O metadata gravado carrega SEMPRE os dois formatos: ad_account_ids
--      (lista canônica) e ad_account_id (primeiro da lista — código que ainda
--      lê o singular, ex.: sync/teste de conexão atuais, continua funcionando).
--   4. Merge defensivo: save sem nenhuma das duas chaves (ex.: UI trocando só
--      o token) PRESERVA a lista já gravada — nunca apaga por omissão.
--   5. Na mesma transação (SECURITY DEFINER), sincroniza a fonte de verdade
--      workspace_meta_ad_accounts — SOMENTE quando a lista foi fornecida
--      explicitamente (save só-token não reativa nem desativa nada):
--        - ids da lista -> INSERT ... ON CONFLICT (workspace_id, account_id)
--          DO UPDATE SET is_active = true;
--        - ids ativos do workspace ausentes da nova lista -> is_active=false
--          (histórico de dados preservado; a conta fica livre para outro
--          workspace — o índice único parcial só cobre is_active=true);
--        - pré-checagem amigável: id ativo em OUTRO workspace -> erro claro
--          (22023) antes do índice único estourar.
--      Lista explicitamente vazia (ad_account_ids: []) = desconectar todas as
--      contas do workspace (grava ad_account_ids: [] e remove o singular).
--
-- Sem mudança de tabela (a camada de armazenamento já suporta N contas).
-- Comportamento de ghl/notion/openrouter (incl. sync de ghl_integration_settings
-- por location_id) absolutamente inalterado — base: 20260828000000.
--
-- Idempotente: OR REPLACE / REVOKE / GRANT (mesmos de
-- 20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql).
-- NÃO aplicar em produção fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.save_workspace_credential(
    p_workspace_id uuid,
    p_provider text,
    p_secret text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id uuid;
    v_new_version int;
    v_location_id text;
    -- Fase 15 (meta multi-conta)
    v_account_ids text[];                 -- lista normalizada final (NULL = sem contas)
    v_list_provided boolean := false;     -- true se ad_account_ids/ad_account_id vieram no save
    v_existing_metadata jsonb;            -- metadata atual da credencial meta (merge defensivo)
    v_item jsonb;
    v_norm text;
    v_conflict_account text;
BEGIN
    -- Guarda de papel: somente admin/owner DESTE workspace grava a chave.
    IF NOT public.is_workspace_admin(p_workspace_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner do workspace'
            USING ERRCODE = '42501';
    END IF;

    IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion', 'openrouter') THEN
        RAISE EXCEPTION 'provider invalido' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN
        RAISE EXCEPTION 'secret obrigatorio' USING ERRCODE = '22023';
    END IF;

    -- Normaliza NULL para '{}' (o INSERT já fazia COALESCE; o bloco meta precisa
    -- operar sobre o jsonb — NULL || jsonb seria NULL).
    p_metadata := COALESCE(p_metadata, '{}'::jsonb);

    -- ========================================================================
    -- FASE 15 — normalização da lista de contas Meta (provider = 'meta')
    -- ========================================================================
    IF p_provider = 'meta' THEN
        IF p_metadata ? 'ad_account_ids' THEN
            -- Lista canônica (prioridade sobre o singular legado).
            v_list_provided := true;
            IF jsonb_typeof(p_metadata->'ad_account_ids') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'metadata.ad_account_ids deve ser um array de strings (ex.: ["act_123"])'
                    USING ERRCODE = '22023';
            END IF;
            FOR v_item IN SELECT value FROM jsonb_array_elements(p_metadata->'ad_account_ids') LOOP
                IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' THEN
                    RAISE EXCEPTION 'metadata.ad_account_ids deve conter apenas strings no formato act_<numeros>'
                        USING ERRCODE = '22023';
                END IF;
                v_norm := btrim(v_item #>> '{}');
                CONTINUE WHEN v_norm = '';                          -- remove vazios
                IF v_norm ~ '^[0-9]+$' THEN
                    v_norm := 'act_' || v_norm;                     -- prefixo automático
                END IF;
                IF v_norm !~ '^act_[0-9]+$' THEN
                    RAISE EXCEPTION 'ad_account_id invalido: "%" (formato esperado: act_<numeros>)', v_norm
                        USING ERRCODE = '22023';
                END IF;
                IF v_account_ids IS NULL OR NOT v_norm = ANY(v_account_ids) THEN
                    v_account_ids := array_append(v_account_ids, v_norm); -- dedup, preserva ordem
                END IF;
            END LOOP;
        ELSIF p_metadata ? 'ad_account_id' THEN
            -- Legado singular -> lista de 1. String vazia/ausente NÃO conta como
            -- "fornecido" (cai no merge defensivo) — protege contra formulário
            -- que manda "" por engano e desativaria todas as contas.
            v_norm := btrim(COALESCE(p_metadata->>'ad_account_id', ''));
            IF v_norm <> '' THEN
                v_list_provided := true;
                IF v_norm ~ '^[0-9]+$' THEN
                    v_norm := 'act_' || v_norm;
                END IF;
                IF v_norm !~ '^act_[0-9]+$' THEN
                    RAISE EXCEPTION 'ad_account_id invalido: "%" (formato esperado: act_<numeros>)', v_norm
                        USING ERRCODE = '22023';
                END IF;
                v_account_ids := ARRAY[v_norm];
            END IF;
        END IF;

        -- Merge defensivo: save sem nenhuma das duas chaves (ex.: UI trocando só
        -- o token) preserva a lista já gravada na credencial existente. Entradas
        -- legadas fora do formato são descartadas aqui (dado preexistente, fora
        -- do contrato novo) — nunca derrubam uma troca de token.
        IF NOT v_list_provided THEN
            SELECT wic.metadata INTO v_existing_metadata
            FROM public.workspace_integration_credentials wic
            WHERE wic.workspace_id = p_workspace_id
              AND wic.provider = 'meta';

            IF v_existing_metadata IS NOT NULL THEN
                IF jsonb_typeof(v_existing_metadata->'ad_account_ids') = 'array' THEN
                    FOR v_item IN SELECT value FROM jsonb_array_elements(v_existing_metadata->'ad_account_ids') LOOP
                        IF jsonb_typeof(v_item) = 'string' THEN
                            v_norm := btrim(v_item #>> '{}');
                            IF v_norm ~ '^[0-9]+$' THEN
                                v_norm := 'act_' || v_norm;
                            END IF;
                            IF v_norm ~ '^act_[0-9]+$'
                               AND (v_account_ids IS NULL OR NOT v_norm = ANY(v_account_ids)) THEN
                                v_account_ids := array_append(v_account_ids, v_norm);
                            END IF;
                        END IF;
                    END LOOP;
                ELSE
                    v_norm := btrim(COALESCE(v_existing_metadata->>'ad_account_id', ''));
                    IF v_norm ~ '^[0-9]+$' THEN
                        v_norm := 'act_' || v_norm;
                    END IF;
                    IF v_norm ~ '^act_[0-9]+$' THEN
                        v_account_ids := ARRAY[v_norm];
                    END IF;
                END IF;
            END IF;
        END IF;

        -- Pré-checagem amigável (só quando a lista foi fornecida e será
        -- sincronizada): conta ativa em OUTRO workspace -> erro claro antes de
        -- o índice único parcial estourar. A garantia real continua sendo o
        -- índice; isto é só a mensagem decente.
        IF v_list_provided AND v_account_ids IS NOT NULL THEN
            SELECT wmaa.account_id INTO v_conflict_account
            FROM public.workspace_meta_ad_accounts wmaa
            WHERE wmaa.account_id = ANY(v_account_ids)
              AND wmaa.is_active
              AND wmaa.workspace_id <> p_workspace_id
            LIMIT 1;
            IF v_conflict_account IS NOT NULL THEN
                RAISE EXCEPTION 'a conta % ja esta conectada a outro workspace; desconecte-a de la antes de usa-la aqui', v_conflict_account
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        -- Grava SEMPRE os dois formatos no metadata: lista canônica + singular
        -- (primeiro da lista) para compat com código que ainda lê o singular.
        p_metadata := p_metadata - 'ad_account_ids' - 'ad_account_id';
        IF v_account_ids IS NOT NULL THEN
            p_metadata := p_metadata || jsonb_build_object(
                'ad_account_ids', to_jsonb(v_account_ids),
                'ad_account_id', v_account_ids[1]
            );
        ELSIF v_list_provided THEN
            -- Lista explicitamente vazia: desconecta todas (sem singular).
            p_metadata := p_metadata || jsonb_build_object('ad_account_ids', '[]'::jsonb);
        END IF;
    END IF;

    -- O nome do segredo no vault tem UNIQUE (secrets_name_idx): incluir um nonce
    -- garante que cada ROTACAO (mesmo provider/workspace) crie um segredo novo em
    -- vez de colidir. O rótulo legivel fica provider@workspace@<nonce>.
    v_secret_id := vault.create_secret(
        p_secret,
        p_provider || '@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
        'workspace credential'
    );

    INSERT INTO public.workspace_integration_credentials
        (workspace_id, provider, secret_key_id, metadata, rotation_version)
    VALUES
        (p_workspace_id, p_provider, v_secret_id, p_metadata, 1)
    ON CONFLICT (workspace_id, provider) DO UPDATE
        SET secret_key_id    = EXCLUDED.secret_key_id,
            metadata         = EXCLUDED.metadata,
            rotation_version = public.workspace_integration_credentials.rotation_version + 1
    RETURNING rotation_version INTO v_new_version;

    -- ========================================================================
    -- FASE 15 — sincronização transacional da fonte de verdade
    -- workspace_meta_ad_accounts. SOMENTE quando a lista foi fornecida
    -- explicitamente: save só-token (merge defensivo) não reativa nem desativa
    -- nada — metadata e tabela permanecem como estavam.
    -- ========================================================================
    IF p_provider = 'meta' AND v_list_provided THEN
        IF v_account_ids IS NOT NULL THEN
            INSERT INTO public.workspace_meta_ad_accounts (workspace_id, account_id, is_active)
            SELECT p_workspace_id, unnest(v_account_ids), true
            ON CONFLICT (workspace_id, account_id) DO UPDATE
                SET is_active = true;
        END IF;

        -- Contas ativas do workspace ausentes da nova lista -> desativa
        -- (histórico preservado; conta fica livre para outro workspace).
        -- Com lista explicitamente vazia (v_account_ids NULL), desativa todas.
        UPDATE public.workspace_meta_ad_accounts
        SET is_active = false
        WHERE workspace_id = p_workspace_id
          AND is_active
          AND (v_account_ids IS NULL OR NOT account_id = ANY(v_account_ids));
    END IF;

    -- Sincroniza a tabela de roteamento de webhook — só para GHL, só quando o
    -- metadata trouxe um location_id não vazio (inalterado desde 20260825000000).
    IF p_provider = 'ghl' THEN
        v_location_id := NULLIF(TRIM(COALESCE(p_metadata->>'location_id', '')), '');
        IF v_location_id IS NOT NULL THEN
            INSERT INTO public.ghl_integration_settings (workspace_id, ghl_location_id)
            VALUES (p_workspace_id, v_location_id)
            ON CONFLICT (workspace_id) DO UPDATE
                SET ghl_location_id = EXCLUDED.ghl_location_id,
                    updated_at      = now();
        END IF;
    END IF;

    RETURN v_new_version; -- NUNCA o segredo
END;
$$;

COMMENT ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) IS
'Admin/owner salva credencial GHL, Meta, Notion ou OpenRouter no Vault; nunca retorna plaintext. Meta (Fase 15): aceita metadata.ad_account_ids (lista) e/ou ad_account_id (legado), grava os dois formatos e sincroniza workspace_meta_ad_accounts na mesma transação; save sem lista preserva as contas atuais.';

REVOKE ALL ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
