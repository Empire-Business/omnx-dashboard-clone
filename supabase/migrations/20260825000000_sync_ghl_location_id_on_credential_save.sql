-- ============================================================================
-- Consolidação da UX de conexão GHL — fatia 1: fim da dessincronia de location_id
--
-- Achado (2026-07-14, ao investigar por que o usuário não achava onde colar a
-- chave GHL no fluxo de configuração): existem HOJE duas fontes de verdade
-- independentes para o location_id GHL de um workspace, escritas em duas
-- páginas diferentes, sem nenhuma sincronia entre elas:
--   - workspace_integration_credentials.metadata->>'location_id' (Vault/BYOK,
--     usado para CHAMAR a API do GHL — Fase 4)
--   - ghl_integration_settings.ghl_location_id (usado para ROTEAR webhooks
--     recebidos do GHL para o workspace certo — Fase 2 fatia 3)
-- Um usuário podia preencher só um dos dois e o sistema ficava parcialmente
-- quebrado sem nenhum aviso real (o card de status na Admin lia só a segunda
-- tabela e nunca checava a primeira).
--
-- Correção: save_workspace_credential (Fase 4/Fatia 1) passa a, quando
-- provider='ghl' e metadata contém 'location_id' não vazio, também fazer
-- upsert em ghl_integration_settings.ghl_location_id — no MESMO commit
-- transacional da função. De agora em diante o BYOK é a única entrada real;
-- a tabela de roteamento de webhook é sempre mantida em sincronia por ela.
--
-- Idempotente: CREATE OR REPLACE mantém a mesma assinatura
-- (uuid, text, text, jsonb) e os mesmos GRANTs já aplicados em
-- 20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql — não
-- precisa reconceder.
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
BEGIN
    -- Guarda de papel: somente admin/owner DESTE workspace grava a chave.
    IF NOT public.is_workspace_admin(p_workspace_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner do workspace'
            USING ERRCODE = '42501';
    END IF;

    IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion') THEN
        RAISE EXCEPTION 'provider invalido (use ghl, meta ou notion)'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN
        RAISE EXCEPTION 'secret obrigatorio'
            USING ERRCODE = '22023';
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
        (p_workspace_id, p_provider, v_secret_id, COALESCE(p_metadata, '{}'::jsonb), 1)
    ON CONFLICT (workspace_id, provider) DO UPDATE
        SET secret_key_id    = EXCLUDED.secret_key_id,
            metadata         = EXCLUDED.metadata,
            rotation_version = public.workspace_integration_credentials.rotation_version + 1
    RETURNING rotation_version INTO v_new_version;

    -- Sincroniza a tabela de roteamento de webhook — só para GHL, só quando o
    -- metadata trouxe um location_id não vazio. Mesma transação: se isto
    -- falhar (ex.: location_id já ativo em outro workspace), a credencial
    -- também não é salva — evita ficar com um dos dois lados sem o outro.
    IF p_provider = 'ghl' THEN
        v_location_id := NULLIF(TRIM(COALESCE(p_metadata->>'location_id', '')), '');
        IF v_location_id IS NOT NULL THEN
            BEGIN
                INSERT INTO public.ghl_integration_settings (workspace_id, ghl_location_id)
                VALUES (p_workspace_id, v_location_id)
                ON CONFLICT (workspace_id) DO UPDATE
                    SET ghl_location_id = EXCLUDED.ghl_location_id,
                        updated_at      = now();
            EXCEPTION WHEN unique_violation THEN
                RAISE EXCEPTION 'este Location ID já está conectado a outro workspace'
                    USING ERRCODE = '23505';
            END;
        END IF;
    END IF;

    RETURN v_new_version; -- NUNCA o segredo
END;
$$;

COMMENT ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) IS
'Self-service (admin/owner do workspace): cadastra/atualiza a credencial do provider no vault (sem plaintext) e sobe rotation_version. Para provider=ghl com metadata.location_id, sincroniza ghl_integration_settings.ghl_location_id na mesma transação (fonte única de verdade). Retorna so rotation_version. Unica via de escrita de credencial por workspace.';

NOTIFY pgrst, 'reload schema';
