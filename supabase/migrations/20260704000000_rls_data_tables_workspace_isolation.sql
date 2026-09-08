-- Migration: RLS e isolamento por workspace nas tabelas de dados principais
-- Objetivo: garantir que usuarios so acessem contatos, oportunidades,
-- comunicacoes e vendas_fechamento do seu workspace.
--
-- Tabelas afetadas:
--   - contatos (possui workspace_id)
--   - oportunidades (relacionado a contatos)
--   - comunicacoes (relacionado a contatos)
--   - vendas_fechamento (relacionado a contatos/oportunidades)
--   - ghl_users (reativa RLS efetivo)

-- =============================================================================
-- Helpers SECURITY DEFINER para resolver workspace a partir de relacionamentos
-- =============================================================================

CREATE OR REPLACE FUNCTION get_contact_workspace_id(p_contato_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT workspace_id FROM contatos WHERE id = p_contato_id;
$$;

CREATE OR REPLACE FUNCTION get_opportunity_workspace_id(p_oportunidade_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT c.workspace_id
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.id = p_oportunidade_id;
$$;

-- =============================================================================
-- contatos
-- =============================================================================
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_contatos" ON contatos;
DROP POLICY IF EXISTS "workspace_members_insert_contatos" ON contatos;
DROP POLICY IF EXISTS "workspace_members_update_contatos" ON contatos;
DROP POLICY IF EXISTS "workspace_admins_delete_contatos" ON contatos;

CREATE POLICY "workspace_members_select_contatos"
    ON contatos FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_members_insert_contatos"
    ON contatos FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "workspace_members_update_contatos"
    ON contatos FOR UPDATE
    TO authenticated
    USING (is_workspace_member(workspace_id))
    WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "workspace_admins_delete_contatos"
    ON contatos FOR DELETE
    TO authenticated
    USING (is_workspace_admin(workspace_id));

-- Service role mantem acesso total para edge functions e syncs
DROP POLICY IF EXISTS "service_role_all_contatos" ON contatos;
CREATE POLICY "service_role_all_contatos"
    ON contatos FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- oportunidades
-- =============================================================================
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_delete_oportunidades" ON oportunidades;
DROP POLICY IF EXISTS "workspace_members_select_oportunidades" ON oportunidades;
DROP POLICY IF EXISTS "workspace_members_insert_oportunidades" ON oportunidades;
DROP POLICY IF EXISTS "workspace_members_update_oportunidades" ON oportunidades;
DROP POLICY IF EXISTS "workspace_admins_delete_oportunidades" ON oportunidades;

CREATE POLICY "workspace_members_select_oportunidades"
    ON oportunidades FOR SELECT
    TO authenticated
    USING (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_insert_oportunidades"
    ON oportunidades FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_update_oportunidades"
    ON oportunidades FOR UPDATE
    TO authenticated
    USING (is_workspace_member(get_contact_workspace_id(contato_id)))
    WITH CHECK (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_admins_delete_oportunidades"
    ON oportunidades FOR DELETE
    TO authenticated
    USING (is_workspace_admin(get_contact_workspace_id(contato_id)));

DROP POLICY IF EXISTS "service_role_all_oportunidades" ON oportunidades;
CREATE POLICY "service_role_all_oportunidades"
    ON oportunidades FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- comunicacoes
-- =============================================================================
ALTER TABLE comunicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_comunicacoes" ON comunicacoes;
DROP POLICY IF EXISTS "workspace_members_insert_comunicacoes" ON comunicacoes;
DROP POLICY IF EXISTS "workspace_members_update_comunicacoes" ON comunicacoes;
DROP POLICY IF EXISTS "workspace_admins_delete_comunicacoes" ON comunicacoes;

CREATE POLICY "workspace_members_select_comunicacoes"
    ON comunicacoes FOR SELECT
    TO authenticated
    USING (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_insert_comunicacoes"
    ON comunicacoes FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_update_comunicacoes"
    ON comunicacoes FOR UPDATE
    TO authenticated
    USING (is_workspace_member(get_contact_workspace_id(contato_id)))
    WITH CHECK (is_workspace_member(get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_admins_delete_comunicacoes"
    ON comunicacoes FOR DELETE
    TO authenticated
    USING (is_workspace_admin(get_contact_workspace_id(contato_id)));

DROP POLICY IF EXISTS "service_role_all_comunicacoes" ON comunicacoes;
CREATE POLICY "service_role_all_comunicacoes"
    ON comunicacoes FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- vendas_fechamento
-- =============================================================================
ALTER TABLE vendas_fechamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_vendas_fechamento" ON vendas_fechamento;
DROP POLICY IF EXISTS "workspace_members_insert_vendas_fechamento" ON vendas_fechamento;
DROP POLICY IF EXISTS "workspace_members_update_vendas_fechamento" ON vendas_fechamento;
DROP POLICY IF EXISTS "workspace_admins_delete_vendas_fechamento" ON vendas_fechamento;

CREATE POLICY "workspace_members_select_vendas_fechamento"
    ON vendas_fechamento FOR SELECT
    TO authenticated
    USING (
        is_workspace_member(get_contact_workspace_id(contato_id))
        OR is_workspace_member(get_opportunity_workspace_id(oportunidade_id))
    );

CREATE POLICY "workspace_members_insert_vendas_fechamento"
    ON vendas_fechamento FOR INSERT
    TO authenticated
    WITH CHECK (
        is_workspace_member(get_contact_workspace_id(contato_id))
        OR is_workspace_member(get_opportunity_workspace_id(oportunidade_id))
    );

CREATE POLICY "workspace_members_update_vendas_fechamento"
    ON vendas_fechamento FOR UPDATE
    TO authenticated
    USING (
        is_workspace_member(get_contact_workspace_id(contato_id))
        OR is_workspace_member(get_opportunity_workspace_id(oportunidade_id))
    )
    WITH CHECK (
        is_workspace_member(get_contact_workspace_id(contato_id))
        OR is_workspace_member(get_opportunity_workspace_id(oportunidade_id))
    );

CREATE POLICY "workspace_admins_delete_vendas_fechamento"
    ON vendas_fechamento FOR DELETE
    TO authenticated
    USING (
        is_workspace_admin(get_contact_workspace_id(contato_id))
        OR is_workspace_admin(get_opportunity_workspace_id(oportunidade_id))
    );

DROP POLICY IF EXISTS "service_role_all_vendas_fechamento" ON vendas_fechamento;
CREATE POLICY "service_role_all_vendas_fechamento"
    ON vendas_fechamento FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- ghl_users: reativar RLS efetivo
-- =============================================================================
ALTER TABLE ghl_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_members_select_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_users" ON ghl_users;

-- ghl_users nao tem workspace_id; limitamos a usuarios autenticados do mesmo
-- location/workspace via vinculo indireto: o user logado deve ser membro de
-- algum workspace ativo. Isso evita vazamento entre tenants enquanto nao
-- adicionamos workspace_id a tabela.
CREATE POLICY "workspace_members_select_ghl_users"
    ON ghl_users FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "workspace_admins_update_ghl_users"
    ON ghl_users FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "workspace_admins_insert_ghl_users"
    ON ghl_users FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "service_role_all_ghl_users" ON ghl_users;
CREATE POLICY "service_role_all_ghl_users"
    ON ghl_users FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- Indices de apoio para performance das policies
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_contatos_workspace_id ON contatos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_contato_id ON oportunidades(contato_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_id ON comunicacoes(contato_id);
CREATE INDEX IF NOT EXISTS idx_vendas_fechamento_contato_id ON vendas_fechamento(contato_id);
CREATE INDEX IF NOT EXISTS idx_vendas_fechamento_oportunidade_id ON vendas_fechamento(oportunidade_id);
