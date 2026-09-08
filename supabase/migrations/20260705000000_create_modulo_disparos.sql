-- Migration: Módulo de Disparos (tag-driven campaign analytics)
-- Objetivo: permitir configurar campanhas de disparo baseadas em tags de contatos
-- e acompanhar métricas (trigger, respondeu, parou, erro, nao_respondeu, comprou).

-- =============================================================================
-- 1. Tabela de configuração dos disparos
-- =============================================================================

CREATE TABLE IF NOT EXISTS disparos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    cor TEXT DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_disparos_workspace ON disparos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparos_workspace_active ON disparos(workspace_id, is_active);

CREATE TRIGGER trigger_update_disparos_updated_at
    BEFORE UPDATE ON disparos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. Tabela de mapeamento tag -> significado
-- =============================================================================

CREATE TABLE IF NOT EXISTS disparo_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    disparo_id UUID NOT NULL REFERENCES disparos(id) ON DELETE CASCADE,
    significado TEXT NOT NULL CHECK (significado IN (
        'trigger', 'respondeu', 'parou', 'erro', 'nao_respondeu', 'comprou'
    )),
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, disparo_id, significado),
    UNIQUE(workspace_id, disparo_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_disparo_tags_workspace ON disparo_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparo_tags_disparo ON disparo_tags(disparo_id);

CREATE TRIGGER trigger_update_disparo_tags_updated_at
    BEFORE UPDATE ON disparo_tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. Helper: verifica se uma tag CSV contém uma tag específica
--    contatos.tags é TEXT no formato "tag1,tag2,tag3"
-- =============================================================================

CREATE OR REPLACE FUNCTION contato_tem_tag(tags_text TEXT, tag_buscada TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        EXISTS (
            SELECT 1
            FROM unnest(string_to_array(COALESCE(tags_text, ''), ',')) AS t
            WHERE lower(trim(t)) = lower(trim(tag_buscada))
        ),
        false
    );
$$;

-- =============================================================================
-- 4. View de métricas agregadas por disparo
-- =============================================================================

CREATE OR REPLACE VIEW v_disparo_metricas AS
WITH tags_por_disparo AS (
    SELECT
        d.id AS disparo_id,
        d.workspace_id,
        d.nome AS disparo_nome,
        d.cor,
        d.is_active,
        dt.significado,
        lower(trim(dt.tag)) AS tag
    FROM disparos d
    JOIN disparo_tags dt ON dt.disparo_id = d.id AND dt.workspace_id = d.workspace_id
),
trigger_contatos AS (
    SELECT
        tpd.disparo_id,
        tpd.workspace_id,
        c.id AS contato_id,
        c.date_created
    FROM tags_por_disparo tpd
    JOIN contatos c ON c.workspace_id = tpd.workspace_id
    WHERE tpd.significado = 'trigger'
      AND contato_tem_tag(c.tags, tpd.tag)
),
metricas AS (
    SELECT
        tc.disparo_id,
        tc.workspace_id,
        COUNT(DISTINCT tc.contato_id) AS trigger_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'respondeu'   AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'parou'       AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS parou_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'erro'        AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS erro_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'nao_respondeu' AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS nao_respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'comprou'     AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS comprou_count,
        MIN(tc.date_created) AS primeiro_trigger,
        MAX(tc.date_created) AS ultimo_trigger
    FROM trigger_contatos tc
    LEFT JOIN tags_por_disparo tpd
      ON tpd.disparo_id = tc.disparo_id
     AND tpd.workspace_id = tc.workspace_id
     AND tpd.significado <> 'trigger'
    LEFT JOIN contatos c
      ON c.id = tc.contato_id
     AND c.workspace_id = tc.workspace_id
    GROUP BY tc.disparo_id, tc.workspace_id
)
SELECT
    d.id AS disparo_id,
    d.workspace_id,
    d.nome AS disparo_nome,
    d.descricao,
    d.cor,
    d.is_active,
    COALESCE(m.trigger_count, 0) AS trigger_count,
    COALESCE(m.respondeu_count, 0) AS respondeu_count,
    COALESCE(m.parou_count, 0) AS parou_count,
    COALESCE(m.erro_count, 0) AS erro_count,
    COALESCE(m.nao_respondeu_count, 0) AS nao_respondeu_count,
    COALESCE(m.comprou_count, 0) AS comprou_count,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.respondeu_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_resposta_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.parou_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_parou_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.erro_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_erro_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.comprou_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_conversao_pct,
    m.primeiro_trigger,
    m.ultimo_trigger
FROM disparos d
LEFT JOIN metricas m ON m.disparo_id = d.id AND m.workspace_id = d.workspace_id;

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE disparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE disparo_tags ENABLE ROW LEVEL SECURITY;

-- disparos
DROP POLICY IF EXISTS "workspace_members_select_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_members_insert_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_members_update_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_admins_delete_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_admins_insert_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_admins_update_disparos" ON disparos;

CREATE POLICY "workspace_members_select_disparos"
    ON disparos FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_admins_insert_disparos"
    ON disparos FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_update_disparos"
    ON disparos FOR UPDATE
    TO authenticated
    USING (is_workspace_admin(workspace_id))
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_delete_disparos"
    ON disparos FOR DELETE
    TO authenticated
    USING (is_workspace_admin(workspace_id));

-- disparo_tags
DROP POLICY IF EXISTS "workspace_members_select_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_members_insert_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_members_update_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_admins_delete_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_admins_insert_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_admins_update_disparo_tags" ON disparo_tags;

CREATE POLICY "workspace_members_select_disparo_tags"
    ON disparo_tags FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_admins_insert_disparo_tags"
    ON disparo_tags FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_update_disparo_tags"
    ON disparo_tags FOR UPDATE
    TO authenticated
    USING (is_workspace_admin(workspace_id))
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_admins_delete_disparo_tags"
    ON disparo_tags FOR DELETE
    TO authenticated
    USING (is_workspace_admin(workspace_id));

-- Service role mantém acesso total
DROP POLICY IF EXISTS "service_role_all_disparos" ON disparos;
CREATE POLICY "service_role_all_disparos"
    ON disparos FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_disparo_tags" ON disparo_tags;
CREATE POLICY "service_role_all_disparo_tags"
    ON disparo_tags FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
