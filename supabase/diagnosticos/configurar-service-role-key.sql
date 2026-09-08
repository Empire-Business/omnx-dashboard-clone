-- =============================================================================
-- Script: Configurar Service Role Key para sync_meta_ads_job
-- 
-- INSTRUÇÕES:
-- 1. Vá em Supabase Dashboard > Settings > API
-- 2. Copie o valor de "service_role" (começa com eyJ...)
-- 3. Cole este script no SQL Editor
-- 4. Substitua YOUR_SERVICE_ROLE_KEY_AQUI pelo valor copiado
-- 5. Execute
-- =============================================================================

-- Configurar a Service Role Key (SUBSTITUA PELO VALOR REAL!)
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY_AQUI';

-- Verificar se funcionou
SELECT current_setting('app.settings.service_role_key', true) as key_configurada;

-- Testar a sincronização
SELECT sync_meta_ads_job();

-- Verificar o log
SELECT * FROM meta_ads_sync_log ORDER BY started_at DESC LIMIT 1;
