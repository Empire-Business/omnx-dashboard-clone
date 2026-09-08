-- ============================================================
-- Migration: 20260508000000
-- Backfill de usuários GHL faltantes + Cron de sync automático
--
-- Problema: tabela ghl_users populada manualmente em 2026-03-11
-- com 29 usuários. A API do GHL hoje retorna 28 usuários —
-- 5 novos não estavam no banco e 6 sumiram da API.
--
-- Ações desta migration:
--   1. Inserir 5 novos usuários do GHL
--   2. Marcar como deleted = true os 6 usuários que saíram do location
--   3. Registrar cron sync-ghl-users-cron (a cada 6 horas)
-- ============================================================

-- ============================================================
-- 1. Inserir novos usuários da API GHL
-- ============================================================

INSERT INTO ghl_users (ghl_id, nome, email, role_ghl, papeis, deleted, created_at, updated_at)
VALUES
  ('CDBtW74CBeRUnTxV7lwh', 'Caroline Alves',      'carolinealves@aliancadealtovalor.com.br',    'user',  '{}', false, now(), now()),
  ('Af6vCPLVP556lwzmPsk7', 'Gabrielle Oliveira',  'gabrielleoliveira@aliancadealtovalor.com.br','user',  '{}', false, now(), now()),
  ('jwA97orNTOnJvg1VWlSu', 'Ramon Gonçalves',     'ramonmpg@gmail.com',                         'user',  '{}', false, now(), now()),
  ('HpF3krT2gy3CJmM7O0p0', 'SDR RC1',             'sdr@aliancadealtovalor.com.br',              'user',  '{}', false, now(), now()),
  ('j00HTxvPbqeIxIdJPat2', 'WEBINAR PRO',         'marketing@webinarpro.com.br',                'user',  '{}', false, now(), now())
ON CONFLICT (ghl_id) DO UPDATE SET
  nome     = EXCLUDED.nome,
  email    = EXCLUDED.email,
  role_ghl = EXCLUDED.role_ghl,
  deleted  = EXCLUDED.deleted,
  updated_at = now();

-- ============================================================
-- 2. Soft-delete usuários que saíram do location GHL
-- ============================================================

UPDATE ghl_users
SET deleted = true, updated_at = now()
WHERE ghl_id IN (
  'Duj1wVLfBiTN8wm9rJJd',   -- Juninho Dalfré
  'GijCM9qEleps3H0wN79r',   -- Marcelo Tetzner
  'ALfP1X2JlslmFEYWuIZV',   -- Matheus Alves Webinar
  'cnIgqoTq3YoyWlE7KPXU',   -- PRY Moraes Webinar
  'xG1nHxlFVkEiadHXtOAE',   -- Williams Batista
  'WHMgFpXIQScSmrKHHKi9'    -- Leticia Costa
)
AND deleted = false;

-- ============================================================
-- 3. Cron: sync-ghl-users-cron (a cada 6 horas, offset :15)
--
--    Stagger dos crons existentes:
--    :00  → sync-ghl-conversations-incremental
--    :02  → sync-opp-dates
--    :04  → sync-opp-pipelines-cron
--    :06  → sync-opp-sdr-cron
--    :15  → sync-ghl-users-cron  [NOVO]
--    */15 → sync-contact-tags
--    */1  → ghl-api-worker-cron
-- ============================================================

SELECT cron.unschedule('sync-ghl-users-cron')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-ghl-users-cron'
  );

SELECT cron.schedule(
  'sync-ghl-users-cron',
  '0 */6 * * *',
  $$
    SELECT
      net.http_post(
        url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-ghl-users',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
        ),
        body    := '{}'::jsonb
      ) AS request_id;
  $$
);

-- Verificação
DO $$
BEGIN
  RAISE NOTICE '=== Migration 20260508000000 aplicada ===';
  RAISE NOTICE 'Novos usuários inseridos: 5';
  RAISE NOTICE 'Usuários marcados como deleted: 6';
  RAISE NOTICE 'Cron sync-ghl-users-cron registrado: 0 */6 * * *';
END;
$$;

NOTIFY pgrst, 'reload schema';
