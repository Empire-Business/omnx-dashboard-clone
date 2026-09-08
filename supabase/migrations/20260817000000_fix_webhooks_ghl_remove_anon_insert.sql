-- Fix (auditoria de RLS permissiva, Item 2 da caca a bugs pos-PR #35):
-- policy "Allow insert" em public.webhooks_ghl concedia INSERT a `anon` com
-- WITH CHECK (true) -- qualquer requisicao nao autenticada com a anon key
-- (que e publica por design) podia inserir uma linha arbitraria direto via
-- PostgREST (POST /rest/v1/webhooks_ghl), contornando POR COMPLETO a
-- validacao de webhook_secret por workspace que a edge function
-- `webhook-ghl` implementa (extractLocationId + secretsEqual, ver
-- supabase/functions/webhook-ghl/index.ts). A linha inserida dispara o mesmo
-- trigger (`trigger_extrair_dados_ghl`) que processa webhooks legitimos --
-- ou seja, um atacante podia forjar contatos/oportunidades fake so com a
-- anon key, sem qualquer segredo de webhook.
--
-- Confirmado sem uso legitimo: a UNICA escrita em webhooks_ghl em todo o
-- codigo e a edge function webhook-ghl, que usa o client de SERVICE_ROLE
-- (bypassa RLS) -- nunca o client anon/authenticated. Corrigido revogando o
-- INSERT de anon; so service_role pode escrever nesta tabela.
DROP POLICY IF EXISTS "Allow insert" ON public.webhooks_ghl;
REVOKE INSERT ON public.webhooks_ghl FROM anon, authenticated;
