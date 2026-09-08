-- ============================================================================
-- FIX CRÍTICO (P0): RPCs SECURITY DEFINER sensíveis com EXECUTE concedido
-- DIRETAMENTE a `anon`/`authenticated` — não apenas a PUBLIC.
--
-- Achado (2026-07-11, durante investigação da suite "flaky"): funções como
-- get_decrypted_secret (decifra segredo/API key), purge_workspace_data
-- (expurgo LGPD — pode apagar um workspace inteiro),
-- create_agency_for_owner_service_role e register_outbound_webhook estavam
-- com `EXECUTE` concedido a `anon` e `authenticated` no banco de teste. Como
-- são SECURITY DEFINER, a RLS da tabela por baixo NÃO protege — o GRANT
-- EXECUTE era a ÚNICA barreira.
--
-- CAUSA RAIZ REAL (não é só drift de migration não aplicada): toda migration
-- de hardening anterior (fases 2/3/4/5/7/8) usava
-- `REVOKE ALL ON FUNCTION ... FROM PUBLIC`. Isso é INSUFICIENTE neste projeto
-- porque o schema `public` do Supabase recebeu, na configuração inicial do
-- projeto, um GRANT EXECUTE explícito e direto a `anon`/`authenticated` sobre
-- todas as funções então existentes (comportamento padrão do template
-- Supabase para o schema `public`, pensado para expor tudo via PostgREST por
-- padrão). Esse grant foi feito DIRETO nos roles `anon`/`authenticated`, não
-- via o pseudo-role PUBLIC — então `REVOKE ... FROM PUBLIC` nunca tocou
-- nele. Confirmado via `pg_proc.proacl`: o ACL de get_decrypted_secret tinha
-- `anon=X/postgres` e `authenticated=X/postgres` explícitos, sem entrada de
-- PUBLIC. Ou seja, mesmo que TODAS as migrations anteriores tivessem sido
-- aplicadas (não é o caso aqui — ver docs/BASELINE-REPRODUCIBILIDADE.md — mas
-- é irrelevante para este bug específico), o REVOKE nelas seria um no-op.
--
-- Esta migration corrige revogando EXPLICITAMENTE de `anon` E `authenticated`
-- (nunca só de PUBLIC) em toda função SECURITY DEFINER que deveria ser
-- service_role-only ou authenticated-only. Idempotente.
--
-- ⚠️ AÇÃO MANUAL URGENTE (fora do escopo desta migration — regra do projeto
-- proíbe tocar produção diretamente por aqui): como a causa raiz é um erro no
-- PRÓPRIO TEXTO das migrations originais (REVOKE do role errado), é provável
-- que o MESMO gap exista em PRODUÇÃO (qzesffnkqgelmtfblzkr) independente de
-- quais migrations já rodaram lá. Rodar em produção, com urgência:
--
--   SELECT p.proname, p.proacl
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname IN (
--     'get_decrypted_secret','get_workspace_credential_meta',
--     'purge_workspace_data','create_agency_for_owner_service_role',
--     'register_outbound_webhook','get_agency_credential_meta',
--     'seed_workspace_ghl_credential_service_role'
--   );
--
-- Se `anon=X` ou `authenticated=X` aparecer no proacl de get_decrypted_secret
-- ou purge_workspace_data em produção, é uma vulnerabilidade crítica ativa
-- (decifragem de segredo e/ou expurgo de tenant chamável sem controle de
-- acesso adequado) e precisa de correção IMEDIATA por quem tem acesso a
-- produção — aplicar lá o mesmo REVOKE explícito de anon+authenticated
-- desta migration.
-- ============================================================================

-- Fase 2 — credenciais (migration 20260724000000) — service_role ONLY
REVOKE ALL ON FUNCTION public.get_workspace_credential_meta(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_credential_meta(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_decrypted_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_decrypted_secret(uuid) TO service_role;

-- Fase 2 — tabela de credenciais (migration 20260723000000)
GRANT ALL ON public.workspace_integration_credentials TO service_role;
REVOKE ALL ON public.workspace_integration_credentials FROM authenticated, anon, PUBLIC;

-- Fase 3 — roteamento por location_id (migration 20260725000000)
REVOKE ALL ON public.webhook_unresolved FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.webhook_unresolved TO service_role;

-- Fase 3 — credenciais GHL de agência (migration 20260804000000)
GRANT ALL ON public.agency_ghl_credentials TO service_role;
REVOKE ALL ON public.agency_ghl_credentials FROM authenticated, anon, PUBLIC;

-- Fase 3 — RPCs de credencial de agência (migration 20260805000000)
REVOKE ALL ON FUNCTION public.get_agency_credential_meta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_credential_meta(uuid) TO service_role;

-- save_agency_ghl_credential e get_agency_ghl_credential_status SÃO chamáveis por authenticated (intencional) — só anon/PUBLIC saem
REVOKE ALL ON FUNCTION public.save_agency_ghl_credential(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_agency_ghl_credential(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_agency_ghl_credential_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agency_ghl_credential_status(uuid) TO authenticated, service_role;

-- Fase 4 — BYOK (migration 20260731000000) — authenticated intencional, anon fora
REVOKE ALL ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_workspace_credential_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_credential_status(uuid) TO authenticated, service_role;

-- Fase 5 — admin de agência (migration 20260801000000) — authenticated intencional, anon fora
REVOKE ALL ON FUNCTION public.suspend_agency_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_agency_workspace(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reactivate_agency_workspace(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_agency_workspace(uuid, boolean) TO authenticated, service_role;

-- Fase 7 — outbound webhooks (migration 20260727000000)
REVOKE ALL ON public.outbound_webhooks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_webhooks TO authenticated;
GRANT ALL ON public.outbound_webhooks TO service_role;

-- assert_outbound_url_safe é chamada por authenticated indiretamente (intencional) — anon/PUBLIC fora
REVOKE ALL ON FUNCTION public.assert_outbound_url_safe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_outbound_url_safe(text) TO service_role, authenticated;

REVOKE ALL ON FUNCTION public.register_outbound_webhook(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_outbound_webhook(uuid, text, text, text, jsonb) TO service_role;

-- Fase 2 (cutover) — seed de credencial GHL (migration 20260809000000) — service_role ONLY
REVOKE ALL ON FUNCTION public.seed_workspace_ghl_credential_service_role(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_workspace_ghl_credential_service_role(uuid, text, text) TO service_role;

-- Fase 8 — LGPD expurgo/offboarding (migration 20260811000000)
GRANT SELECT ON public.workspace_deletion_requests TO authenticated;
GRANT ALL ON public.workspace_deletion_requests TO service_role;

-- request_workspace_deletion é chamada por authenticated (intencional) — anon fora
REVOKE ALL ON FUNCTION public.request_workspace_deletion(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_workspace_deletion(uuid, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.export_workspace_data_manifest(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_workspace_data_manifest(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.purge_workspace_data(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_workspace_data(uuid, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_workspace_deletion_request(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_deletion_request(uuid, jsonb) TO service_role;

-- Bootstrap de agência (migration 20260814000000) — service_role ONLY
REVOKE ALL ON FUNCTION public.create_agency_for_owner_service_role(uuid, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_agency_for_owner_service_role(uuid, text) TO service_role;

-- bot_query — RPC de leitura sandboxed (migration 20260413160000) — service_role ONLY
REVOKE ALL ON FUNCTION public.bot_query(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_query(text) TO service_role;
