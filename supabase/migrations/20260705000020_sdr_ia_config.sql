-- Configuração de critérios de inclusão da Auditoria IA (SDR IA)
--
-- Pedido do usuário: poder escolher livremente quais tags/pipelines/UTMs
-- contam como critério de inclusão do painel de auditoria — inclusive
-- deixando 100% aberto (sem filtro nenhum) se quiser.
--
-- Antes disso, useAuditoriaIA.ts tinha os critérios hardcoded:
--   - tag: ilike('tags', '%[cp] sdr ia%')
--   - pipeline: exclusão fixa de PIPELINE_VENDAS_SQL_ID via buildSdrMap()
--   - utm_source/utm_campaign: nenhum filtro existia
--
-- Uma linha por workspace. Cada critério é um FilterValues (mesmo formato
-- usado pelo MultiSelectFilter no frontend): { include: string[], exclude: string[] }.
-- include=[] e exclude=[] em todos os campos = 100% aberto (sem filtro,
-- todo contato do workspace é candidato).

CREATE TABLE IF NOT EXISTS sdr_ia_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    tags_filter JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}'::jsonb,
    pipelines_filter JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}'::jsonb,
    utm_source_filter JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}'::jsonb,
    utm_campaign_filter JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sdr_ia_config_workspace ON sdr_ia_config(workspace_id);

CREATE TRIGGER trigger_update_sdr_ia_config_updated_at
    BEFORE UPDATE ON sdr_ia_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Semeia o comportamento atual (hardcoded) como default pros workspaces já
-- existentes, pra não mudar silenciosamente o que já aparece na auditoria
-- de quem não mexer na tela de configuração.
INSERT INTO sdr_ia_config (workspace_id, tags_filter, pipelines_filter, utm_source_filter, utm_campaign_filter)
SELECT
    w.id,
    '{"include":["[cp] sdr ia"],"exclude":[]}'::jsonb,
    jsonb_build_object('include', '[]'::jsonb, 'exclude', jsonb_build_array('ZWuCjEXM2VDyLCx8CtGU')),
    '{"include":[],"exclude":[]}'::jsonb,
    '{"include":[],"exclude":[]}'::jsonb
FROM workspaces w
ON CONFLICT (workspace_id) DO NOTHING;

-- =============================================================================
-- RLS — mesmo padrão de disparos: leitura por qualquer membro do workspace,
-- escrita por admin/owner OU quem tiver can_edit=true explícito na feature
-- sdr-ia.configuracao (override de usuário ou permissão de role).
-- =============================================================================

ALTER TABLE sdr_ia_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_write_sdr_ia_config(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        is_workspace_admin(p_workspace_id)
        OR EXISTS (
            SELECT 1 FROM app_feature_user_overrides
            WHERE workspace_id = p_workspace_id
              AND app_slug = 'sdr-ia'
              AND feature_key = 'configuracao'
              AND user_id = auth.uid()
              AND can_edit = true
        )
        OR EXISTS (
            SELECT 1
            FROM app_feature_role_permissions afrp
            JOIN workspace_members wm
              ON wm.workspace_id = afrp.workspace_id
             AND wm.role = afrp.role
            WHERE afrp.workspace_id = p_workspace_id
              AND afrp.app_slug = 'sdr-ia'
              AND afrp.feature_key = 'configuracao'
              AND afrp.can_edit = true
              AND wm.user_id = auth.uid()
              AND wm.is_active = true
        );
$$;

COMMENT ON FUNCTION can_write_sdr_ia_config(UUID) IS
    'Permite escrita em sdr_ia_config pra owner/admin OU qualquer usuário/role com can_edit=true explicitamente concedido na feature sdr-ia.configuracao.';

DROP POLICY IF EXISTS "workspace_members_select_sdr_ia_config" ON sdr_ia_config;
CREATE POLICY "workspace_members_select_sdr_ia_config"
    ON sdr_ia_config FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_insert_sdr_ia_config" ON sdr_ia_config;
CREATE POLICY "workspace_writers_insert_sdr_ia_config"
    ON sdr_ia_config FOR INSERT
    TO authenticated
    WITH CHECK (can_write_sdr_ia_config(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_update_sdr_ia_config" ON sdr_ia_config;
CREATE POLICY "workspace_writers_update_sdr_ia_config"
    ON sdr_ia_config FOR UPDATE
    TO authenticated
    USING (can_write_sdr_ia_config(workspace_id))
    WITH CHECK (can_write_sdr_ia_config(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_delete_sdr_ia_config" ON sdr_ia_config;
CREATE POLICY "workspace_writers_delete_sdr_ia_config"
    ON sdr_ia_config FOR DELETE
    TO authenticated
    USING (can_write_sdr_ia_config(workspace_id));

DROP POLICY IF EXISTS "service_role_all_sdr_ia_config" ON sdr_ia_config;
CREATE POLICY "service_role_all_sdr_ia_config"
    ON sdr_ia_config FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
