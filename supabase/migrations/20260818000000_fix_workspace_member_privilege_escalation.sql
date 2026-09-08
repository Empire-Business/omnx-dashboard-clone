-- ============================================================================
-- P0 — Bloqueia autoelevação de privilégio em workspace_members
--
-- Achado confirmado no Supabase de teste: um admin conseguia promover a própria
-- membership a owner e rebaixar/desativar o owner atual, pois a policy RLS de
-- UPDATE validava somente is_workspace_admin(workspace_id).
--
-- A RLS continua delimitando quem pode alcançar a linha. Este trigger valida a
-- transição OLD -> NEW, que uma policy WITH CHECK isolada não consegue comparar.
-- ============================================================================

SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.enforce_workspace_member_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_actor_is_owner boolean;
BEGIN
    -- Operações de migration/operador via service_role não passam pelo contrato
    -- de usuário final. O acesso a service_role continua restrito fora do cliente.
    IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    v_actor_is_owner := public.is_workspace_owner(OLD.workspace_id);

    -- Admin pode operar o cadastro do membro, mas nunca modificar a identidade,
    -- o workspace ou o papel que determina o próprio raio de acesso.
    IF NOT v_actor_is_owner THEN
        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
           OR NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.role IS DISTINCT FROM OLD.role
           OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
           OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
            RAISE EXCEPTION 'somente owner pode alterar papel, vínculo ou auditoria de um membro'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.role = 'owner'
           AND (NEW.is_active IS DISTINCT FROM OLD.is_active
                OR NEW.clara_habilitado IS DISTINCT FROM OLD.clara_habilitado) THEN
            RAISE EXCEPTION 'admin não pode alterar um owner'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Mesmo um owner não pode remover ou desativar o último owner ativo.
    IF OLD.role = 'owner'
       AND OLD.is_active = true
       AND (NEW.role IS DISTINCT FROM 'owner' OR NEW.is_active IS DISTINCT FROM true) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = OLD.workspace_id
              AND wm.id <> OLD.id
              AND wm.role = 'owner'
              AND wm.is_active = true
        ) THEN
            RAISE EXCEPTION 'o workspace precisa manter ao menos um owner ativo'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_workspace_member_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_workspace_member_update() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_workspace_member_update() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_workspace_member_update() TO service_role;

DROP TRIGGER IF EXISTS tr_enforce_workspace_member_update ON public.workspace_members;
CREATE TRIGGER tr_enforce_workspace_member_update
    BEFORE UPDATE ON public.workspace_members
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_workspace_member_update();

COMMENT ON FUNCTION public.enforce_workspace_member_update() IS
    'P0: bloqueia autoelevação e takeover em workspace_members; owner controla roles, admin só altera campos operacionais de não-owners.';

NOTIFY pgrst, 'reload schema';
