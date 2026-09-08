-- ============================================================================
-- Consolidação da UX de conexão GHL — fatia 2: fecha vazamento de webhook_secret
--
-- Achado (auditoria de segurança escopada, 2026-07-14, ao revisar o diff da
-- consolidação da conexão GHL): a policy "ghl_integration_settings: members
-- can read" (20260707000000) permite que QUALQUER membro ativo do workspace
-- (não só owner/admin) leia a linha inteira de ghl_integration_settings —
-- incluindo webhook_secret em texto plano (não passa pelo Vault, diferente
-- das credenciais BYOK). O único consumidor frontend (WorkspaceGhlConfigPage)
-- já é restrito a owner/admin (AdminRoute + isAdminOrOwner), mas a RLS não
-- refletia essa restrição — um member comum podia ler o segredo via
-- DevTools/chamada direta ao PostgREST, mesmo sem ver na tela.
--
-- Correção: restringe o SELECT a owner/admin, mesmo padrão já usado na
-- policy de escrita ("owner/admin can write"). Idempotente (DROP + CREATE).
-- ============================================================================
SET search_path = public, pg_catalog;

DROP POLICY IF EXISTS "ghl_integration_settings: members can read" ON public.ghl_integration_settings;

CREATE POLICY "ghl_integration_settings: owner/admin can read"
    ON public.ghl_integration_settings FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );
