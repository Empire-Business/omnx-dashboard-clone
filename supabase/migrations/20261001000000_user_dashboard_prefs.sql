-- ============================================================================
-- user_dashboard_prefs — preferências de dashboard por usuário + workspace
-- ============================================================================
-- Guarda preferências persistentes do usuário no dashboard (ex: o modo do
-- filtro de Recuperação em Vendas/Aquisição), para que a escolha siga a CONTA
-- do usuário entre navegadores/dispositivos — não só o localStorage.
--
-- Isolamento (RLS fail-closed):
--   - cada usuário só enxerga/edita a PRÓPRIA linha (user_id = auth.uid());
--   - o workspace_id precisa ser um workspace do qual o usuário é membro ativo
--     (is_workspace_member) — evita gravar preferência sob um tenant alheio;
--   - service_role tem acesso total (operações administrativas/CLI).
--
-- prefs (jsonb) é um saco de chaves extensível. Chave inicial:
--   { "recuperacao_mode": "exclude" | "include" | "only" }
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- Aditivo: nenhuma tabela/coluna existente é alterada.
-- ============================================================================
SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.user_dashboard_prefs (
    user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    prefs        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, workspace_id)
);

COMMENT ON TABLE public.user_dashboard_prefs IS
  'Preferências de dashboard por usuário+workspace (ex: recuperacao_mode). RLS: cada usuário só a própria linha.';
COMMENT ON COLUMN public.user_dashboard_prefs.prefs IS
  'Saco extensível de preferências. Ex: {"recuperacao_mode":"exclude|include|only"}.';

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_user_dashboard_prefs_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_user_dashboard_prefs_updated_at ON public.user_dashboard_prefs;
CREATE TRIGGER tr_user_dashboard_prefs_updated_at
    BEFORE UPDATE ON public.user_dashboard_prefs
    FOR EACH ROW EXECUTE FUNCTION public.set_user_dashboard_prefs_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_dashboard_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own prefs select" ON public.user_dashboard_prefs;
CREATE POLICY "own prefs select" ON public.user_dashboard_prefs
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own prefs insert" ON public.user_dashboard_prefs;
CREATE POLICY "own prefs insert" ON public.user_dashboard_prefs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "own prefs update" ON public.user_dashboard_prefs;
CREATE POLICY "own prefs update" ON public.user_dashboard_prefs
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "own prefs delete" ON public.user_dashboard_prefs;
CREATE POLICY "own prefs delete" ON public.user_dashboard_prefs
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service role full access user_dashboard_prefs" ON public.user_dashboard_prefs;
CREATE POLICY "service role full access user_dashboard_prefs" ON public.user_dashboard_prefs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
