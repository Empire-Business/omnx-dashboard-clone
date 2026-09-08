-- =============================================================================
-- Script: Configurar variáveis para sync_meta_ads_job
-- Execute este script no SQL Editor do Supabase para configurar
-- a variável que permite a sincronização automática funcionar
-- =============================================================================

-- 1. Configurar a Service Role Key
-- Substitua pelo valor real da sua Service Role Key
-- Pegue em: Supabase Dashboard > Settings > API > service_role
ALTER DATABASE postgres SET app.settings.service_role_key = 'SUA_SERVICE_ROLE_KEY_AQUI';

-- 2. Verificar se a variável foi configurada
SELECT current_setting('app.settings.service_role_key', true) as service_role_configured;

-- 3. Testar a função de sincronização
SELECT sync_meta_ads_job();

-- 4. Verificar se funcionou
SELECT * FROM meta_ads_sync_log ORDER BY started_at DESC LIMIT 1;
