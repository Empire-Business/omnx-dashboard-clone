-- ============================================================================
-- FIX CRÍTICO (P0) — continuação de 20260816000000: revoga GRANTs explícitos
-- a `anon`/`authenticated`/`PUBLIC` em RPCs SECURITY DEFINER sensíveis que a
-- migration anterior NÃO cobria. Verificado por leitura direta (SELECT em
-- pg_proc.proacl) em 2026-07-15:
--
-- PRODUÇÃO (qzesffnkqgelmtfblzkr):
--   - As 7 RPCs do doc FIX-FLAKINESS-SUITE-ISOLAMENTO (get_decrypted_secret,
--     purge_workspace_data, create_agency_for_owner_service_role,
--     register_outbound_webhook, get_workspace_credential_meta,
--     get_agency_credential_meta, seed_workspace_ghl_credential_service_role)
--     estão LIMPAS ({postgres=X, service_role=X}) — nunca receberam o GRANT
--     explícito porque foram criadas depois do GRANT ALL do baseline e suas
--     migrations próprias já revogavam na criação.
--   - MAS a mesma CLASSE de bug (GRANT EXECUTE explícito a anon/authenticated
--     herdado de `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,
--     authenticated` do baseline 20260218000000, linha 14661) segue ativa em
--     outras funções SECURITY DEFINER. Casos críticos confirmados ao vivo:
--       * get_secret(text): proacl {=X/postgres, anon=X, authenticated=X, ...}
--         — lê a tabela `secrets`, que contém a service_role_key REAL do
--         projeto (value_len=219, não é placeholder). Ou seja: qualquer
--         chamador com a anon key (pública no frontend) podia recuperar a
--         service_role key via POST /rest/v1/rpc/get_secret. ⚠️ A chave deve
--         ser considerada COMPROMETIDA e ROTACIONADA (a revogação aqui fecha
--         a porta, mas não desfaz leituras passadas).
--       * seed_workspace_credential_service_role(uuid,text,text,jsonb):
--         proacl {postgres=X, anon=X, authenticated=X, service_role=X} — sua
--         própria migration (20260915000000) usava o padrão bugado
--         `REVOKE ALL ... FROM PUBLIC` e o COMMENT da função diz
--         "service_role-only". Qualquer anon podia sobrescrever credenciais
--         de workspace no Vault.
--       * save_workspace_external_form_source e
--         get_workspace_external_form_source_status: intent é
--         authenticated+service_role (migration 20260917000000), mas `anon`
--         também tinha EXECUTE (poluição do GRANT ALL) — revogado só de anon.
--
-- TESTE (fgjbmdsucruvtpywyhhf): get_secret tinha o mesmo proacl vulnerável
-- ({=X/postgres, anon=X, authenticated=X, ...}); as outras 3 funções nem
-- existem lá (drift já documentado em docs/BASELINE-REPRODUCIBILIDADE.md —
-- migrations 20260915/20260917 nunca aplicadas no teste). Por isso cada bloco
-- abaixo é guardado por to_regprocedure: idempotente e seguro de rodar em
-- qualquer ambiente, existindo ou não a função.
--
-- POR QUE REVOKE EXPLÍCITO DE anon E authenticated (e não só PUBLIC):
-- o grant foi feito DIRETO nos roles (GRANT EXECUTE ON ALL FUNCTIONS ... TO
-- anon, authenticated), nunca via pseudo-role PUBLIC — então
-- `REVOKE ... FROM PUBLIC` é no-op para eles. Ver 20260816000000 e
-- docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md para a análise completa da causa raiz.
--
-- NOTA DE ESCOPO: a auditoria ao vivo em produção encontrou 118 funções
-- SECURITY DEFINER distintas com EXECUTE explícito a `anon` (134 a
-- `authenticated`) no schema public — a maioria precisa de triagem de negócio
-- (helpers de RLS como is_workspace_member, RPCs de analytics e jobs de sync
-- podem ter exposição intencional ou não). Esta migration cobre apenas as 4
-- funções da família credenciais/segredos cujo intent é inequívoco. O restante
-- está reportado para decisão do dono (ver relatório da sessão de 2026-07-15).
-- ============================================================================

-- get_secret — lê public.secrets (service_role_key, anon_key, supabase_url).
-- service_role ONLY. Chamadas legítimas vêm de funções SECURITY DEFINER
-- internas (cron jobs) — executam como owner, não dependem deste GRANT — e de
-- edge functions via service_role. Nenhum chamador anon/authenticated é
-- legítimo: a função retorna segredos em texto puro.
DO $$
BEGIN
  IF to_regprocedure('public.get_secret(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_secret(text) TO service_role';
  END IF;
END
$$;

-- seed_workspace_credential_service_role — seed de credencial no Vault,
-- "service_role-only" pelo próprio COMMENT/design (migration 20260915000000).
DO $$
BEGIN
  IF to_regprocedure('public.seed_workspace_credential_service_role(uuid,text,text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.seed_workspace_credential_service_role(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.seed_workspace_credential_service_role(uuid, text, text, jsonb) TO service_role';
  END IF;
END
$$;

-- save_workspace_external_form_source — intent: authenticated + service_role
-- (migration 20260917000000). Remove apenas o grant indevido de anon/PUBLIC.
DO $$
BEGIN
  IF to_regprocedure('public.save_workspace_external_form_source(uuid,text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_workspace_external_form_source(uuid, text, text, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_workspace_external_form_source(uuid, text, text, text) TO authenticated, service_role';
  END IF;
END
$$;

-- get_workspace_external_form_source_status — intent: authenticated +
-- service_role (migration 20260917000000). Remove apenas anon/PUBLIC.
DO $$
BEGIN
  IF to_regprocedure('public.get_workspace_external_form_source_status(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_workspace_external_form_source_status(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_workspace_external_form_source_status(uuid) TO authenticated, service_role';
  END IF;
END
$$;
