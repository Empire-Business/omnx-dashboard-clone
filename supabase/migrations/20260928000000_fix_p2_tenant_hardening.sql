-- ============================================================================
-- Migration: 20260928000000_fix_p2_tenant_hardening.sql
-- ============================================================================
-- P2 — Endurecimento de isolamento (continuacao da 20260927000000, P0).
--
-- (a) 12 tabelas weekly_*: coluna workspace_id existia NULLABLE e as policies
--     `<tabela>_select_auth` admitiam `workspace_id IS NULL OR is_workspace_member(...)`
--     — qualquer membro autenticado lia as linhas NULL (historicamente do
--     compute global). Backfill para o workspace real (mesma justificativa da
--     P0: 1 workspace real com dados; verificados 0 gemeos em weekly_snapshots
--     e as 10 filhas por snapshot_id nao tem workspace_id na chave unica), SET
--     NOT NULL, policies recriadas sem a brecha de NULL.
-- (b) weekly_reprocess_queue: 12 das 16 linhas NULL tinham gemea nao-NULL
--     (mesma semana/tipo/motivo ja enfileirada com workspace) — removidas como
--     redundantes; as 4 restantes backfilladas. (verificado 2026-07-17)
-- (c) ghl_users (39 linhas, 0 NULL), ghl_calendars (0 linhas): SET NOT NULL +
--     policies sem `IS NULL OR`.
-- (d) meta_ads_sync_log (3.569 linhas, 3.511 NULL pre-Fase-15): backfill para
--     o workspace real (log anterior ao rastreio por workspace), NOT NULL,
--     policies sem `IS NULL OR`.
-- (e) contatos: remove o DEFAULT "workspace mais antigo" (anti-padrao de
--     atribuicao silenciosa) e SET NOT NULL (0 NULLs em prod; o writer atual
--     `extrair_dados_ghl_v2` sempre envia workspace_id).
-- (f) Limpeza: DROP da funcao morta public.trigger_sdr_ia_on_inbound_message
--     (chamava a edge function sdr-ia-orchestrator, removida em 20260626092130;
--     nenhum trigger a usa — objeto orfao confirmado via pg_trigger).
--
-- Idempotente. Re-aplicavel sem efeito colateral.
-- ============================================================================

SET search_path = public, pg_catalog;
SET lock_timeout = '10s';

-- ============================================================================
-- (a) 12 tabelas weekly_* — backfill + NOT NULL + policies sem brecha NULL
-- ============================================================================
DO $$
DECLARE
    t text;
    weekly_tables text[] := ARRAY[
        'weekly_snapshots', 'weekly_trafego', 'weekly_aquisicao',
        'weekly_organico', 'weekly_prevendas', 'weekly_vendas',
        'weekly_recuperacao', 'weekly_sdr', 'weekly_closer',
        'weekly_metas', 'weekly_cohort_audit'
    ];
BEGIN
    FOREACH t IN ARRAY weekly_tables LOOP
        EXECUTE format(
            'UPDATE public.%I SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1) WHERE workspace_id IS NULL', t);
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', t);
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id))', t || '_select_auth', t);
    END LOOP;
END $$;

-- ============================================================================
-- (b) weekly_reprocess_queue — remove gemas redundantes, backfill, NOT NULL
-- ============================================================================
DELETE FROM public.weekly_reprocess_queue q
WHERE q.workspace_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.weekly_reprocess_queue q2
      WHERE q2.workspace_id IS NOT NULL
        AND q2.week_start = q.week_start
        AND q2.report_type = q.report_type
        AND q2.reason = q.reason
  );

UPDATE public.weekly_reprocess_queue
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.weekly_reprocess_queue WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'weekly_reprocess_queue: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.weekly_reprocess_queue ALTER COLUMN workspace_id SET NOT NULL;

DROP POLICY IF EXISTS weekly_reprocess_queue_select_auth ON public.weekly_reprocess_queue;
CREATE POLICY weekly_reprocess_queue_select_auth
    ON public.weekly_reprocess_queue FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- (c) ghl_users + ghl_calendars — NOT NULL + policies sem brecha NULL
--     Producao: 0 NULLs verificado (2026-07-17); o backfill abaixo so dispara
--     em ambiente de teste (dados sinteticos antigos sem workspace).
-- ============================================================================
UPDATE public.ghl_users
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

ALTER TABLE public.ghl_users ALTER COLUMN workspace_id SET NOT NULL;

DROP POLICY IF EXISTS workspace_members_read_ghl_users ON public.ghl_users;
CREATE POLICY workspace_members_read_ghl_users
    ON public.ghl_users FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS workspace_members_select_ghl_users ON public.ghl_users;
CREATE POLICY workspace_members_select_ghl_users
    ON public.ghl_users FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS workspace_admins_insert_ghl_users ON public.ghl_users;
CREATE POLICY workspace_admins_insert_ghl_users
    ON public.ghl_users FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS workspace_admins_update_ghl_users ON public.ghl_users;
CREATE POLICY workspace_admins_update_ghl_users
    ON public.ghl_users FOR UPDATE TO authenticated
    USING (public.is_workspace_admin(workspace_id))
    WITH CHECK (public.is_workspace_admin(workspace_id));

UPDATE public.ghl_calendars
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

ALTER TABLE public.ghl_calendars ALTER COLUMN workspace_id SET NOT NULL;

DROP POLICY IF EXISTS workspace_members_select_ghl_calendars ON public.ghl_calendars;
CREATE POLICY workspace_members_select_ghl_calendars
    ON public.ghl_calendars FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- (d) meta_ads_sync_log — backfill + NOT NULL + policies sem brecha NULL
-- ============================================================================
UPDATE public.meta_ads_sync_log
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.meta_ads_sync_log WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'meta_ads_sync_log: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.meta_ads_sync_log ALTER COLUMN workspace_id SET NOT NULL;

DROP POLICY IF EXISTS "Workspace members can view meta_ads_sync_log" ON public.meta_ads_sync_log;
DROP POLICY IF EXISTS workspace_members_read_meta_ads_sync_log ON public.meta_ads_sync_log;
CREATE POLICY workspace_members_read_meta_ads_sync_log
    ON public.meta_ads_sync_log FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- (e) contatos — fim do DEFAULT "workspace mais antigo" + NOT NULL
--     Insert sem workspace_id agora FALHA (fail-closed) em vez de atribuir
--     silenciosamente ao tenant errado. Producao: 0 NULLs (2026-07-17); o
--     backfill so dispara em ambiente de teste (fixtures antigas).
-- ============================================================================
UPDATE public.contatos
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

ALTER TABLE public.contatos ALTER COLUMN workspace_id DROP DEFAULT;
ALTER TABLE public.contatos ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================================
-- (f) Limpeza — funcao morta que chamava a edge function removida
--     sdr-ia-orchestrator (sem trigger associado; confirmado via pg_trigger).
-- ============================================================================
DROP FUNCTION IF EXISTS public.trigger_sdr_ia_on_inbound_message();

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
