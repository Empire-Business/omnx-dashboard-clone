-- ============================================================
-- Migration: 20260708000002
-- Seed de ghl_field_mappings a partir do template "Empire Default"
-- para workspaces existentes que ainda nao possuem mapeamentos.
--
-- Na Fase A (workspace unico/instancia isolada), isso popula o workspace
-- atual com o template padrao, garantindo equivalencia com extrair_dados_ghl.
--
-- Workspaces futuros recebem o seed automaticamente via trigger
-- trg_new_workspace_ghl_field_mappings (criada abaixo).
-- ============================================================

-- ------------------------------------------------------------------
-- Backfill / merge: workspaces existentes recebem/atualizam o template Empire Default.
-- Faz upsert para garantir que workspaces que ja possuiam mapeamentos do template
-- antigo (Fase 1) sejam atualizados com os campos novos/corrigidos da Fase 4.
-- Campos personalizados do workspace (logical_name fora do template) sao preservados.
-- ------------------------------------------------------------------
INSERT INTO ghl_field_mappings
    (workspace_id, logical_name, ghl_field_key, field_type, variations, is_required)
SELECT
    w.id,
    t.logical_name,
    t.ghl_field_key,
    t.field_type,
    t.variations,
    t.is_required
FROM public.workspaces w
CROSS JOIN public.ghl_field_mapping_templates t
WHERE t.name = 'Empire Default'
ON CONFLICT (workspace_id, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- ------------------------------------------------------------------
-- Trigger: novos workspaces recebem o template automaticamente
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_new_workspace_seed_ghl_mappings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO ghl_field_mappings
        (workspace_id, logical_name, ghl_field_key, field_type, variations, is_required)
    SELECT
        NEW.id,
        t.logical_name,
        t.ghl_field_key,
        t.field_type,
        t.variations,
        t.is_required
    FROM public.ghl_field_mapping_templates t
    WHERE t.name = 'Empire Default'
    ON CONFLICT (workspace_id, logical_name) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_workspace_ghl_field_mappings ON public.workspaces;

CREATE TRIGGER trg_new_workspace_ghl_field_mappings
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.on_new_workspace_seed_ghl_mappings();

COMMENT ON FUNCTION public.on_new_workspace_seed_ghl_mappings() IS
'Seed automatico de ghl_field_mappings com o template Empire Default para todo workspace novo.';
