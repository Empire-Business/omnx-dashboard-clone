-- Disparos: 3 melhorias pedidas pelo usuário no mesmo pacote —
--   1) renomeia significado 'comprou' -> 'converteu' (pode significar mais coisas
--      que só compra: agendamento, lead qualificado, etc.)
--   2) custo estimado por disparo — preço configurável por tipo de mensagem
--      do WhatsApp Business Platform (marketing/utility, cobrança por
--      mensagem entregue desde jul/2025) x contatos acionados (trigger_count)
--   3) campos manuais customizáveis por disparo — métricas que o usuário
--      quer registrar à mão, sem depender de tag do GHL

-- =============================================================================
-- 1. Rename 'comprou' -> 'converteu' em disparo_tags
-- =============================================================================

-- Bug latente desde a criação do módulo: o trigger
-- trigger_update_disparo_tags_updated_at já existia apontando pra
-- update_updated_at_column(), mas a coluna updated_at nunca foi criada
-- nesta tabela — qualquer UPDATE (inclusive upsert com ON CONFLICT DO
-- UPDATE) quebrava com "record NEW has no field updated_at". Nunca foi
-- percebido porque, até agora, toda escrita em disparo_tags era INSERT
-- puro (criação de disparo novo). Corrigido aqui porque o UPDATE de rename
-- abaixo precisa funcionar.
ALTER TABLE disparo_tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now() NOT NULL;

ALTER TABLE disparo_tags DROP CONSTRAINT IF EXISTS disparo_tags_significado_check;

UPDATE disparo_tags SET significado = 'converteu' WHERE significado = 'comprou';

ALTER TABLE disparo_tags ADD CONSTRAINT disparo_tags_significado_check
    CHECK (significado IN ('trigger', 'respondeu', 'parou', 'erro', 'nao_respondeu', 'converteu'));

-- =============================================================================
-- 2. Custo estimado — tipo de mensagem por disparo + preço por categoria
-- =============================================================================

ALTER TABLE disparos ADD COLUMN IF NOT EXISTS tipo_mensagem TEXT NOT NULL DEFAULT 'marketing'
    CHECK (tipo_mensagem IN ('marketing', 'utility'));

COMMENT ON COLUMN disparos.tipo_mensagem IS
    'Categoria de template do WhatsApp Business Platform usada neste disparo (Meta cobra por mensagem entregue, preço difere por categoria). Ver whatsapp_pricing_config pro valor pago por categoria.';

CREATE TABLE IF NOT EXISTS whatsapp_pricing_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    preco_marketing NUMERIC(10,4) NOT NULL DEFAULT 0,
    preco_utility NUMERIC(10,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE whatsapp_pricing_config IS
    'Preço pago por mensagem entregue no WhatsApp Business Platform, por categoria (marketing/utility) e por workspace. Preço varia por país/mercado na tabela da Meta — cada workspace configura o que realmente paga.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_pricing_config_workspace ON whatsapp_pricing_config(workspace_id);

CREATE TRIGGER trigger_update_whatsapp_pricing_config_updated_at
    BEFORE UPDATE ON whatsapp_pricing_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed com 0 pros workspaces existentes — custo_estimado fica 0 até o
-- usuário configurar os valores reais na aba Configuração.
INSERT INTO whatsapp_pricing_config (workspace_id, preco_marketing, preco_utility)
SELECT id, 0, 0 FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

ALTER TABLE whatsapp_pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_whatsapp_pricing_config" ON whatsapp_pricing_config;
CREATE POLICY "workspace_members_select_whatsapp_pricing_config"
    ON whatsapp_pricing_config FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_insert_whatsapp_pricing_config" ON whatsapp_pricing_config;
CREATE POLICY "workspace_writers_insert_whatsapp_pricing_config"
    ON whatsapp_pricing_config FOR INSERT
    TO authenticated
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_update_whatsapp_pricing_config" ON whatsapp_pricing_config;
CREATE POLICY "workspace_writers_update_whatsapp_pricing_config"
    ON whatsapp_pricing_config FOR UPDATE
    TO authenticated
    USING (can_write_disparos(workspace_id))
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "service_role_all_whatsapp_pricing_config" ON whatsapp_pricing_config;
CREATE POLICY "service_role_all_whatsapp_pricing_config"
    ON whatsapp_pricing_config FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- 3. Campos manuais customizáveis por disparo
-- =============================================================================

CREATE TABLE IF NOT EXISTS disparo_campos_custom (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    nome_campo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'numero', 'moeda', 'data')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, nome_campo)
);

CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_workspace ON disparo_campos_custom(workspace_id);

CREATE TRIGGER trigger_update_disparo_campos_custom_updated_at
    BEFORE UPDATE ON disparo_campos_custom FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS disparo_campos_custom_valores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    disparo_id UUID NOT NULL REFERENCES disparos(id) ON DELETE CASCADE,
    campo_id UUID NOT NULL REFERENCES disparo_campos_custom(id) ON DELETE CASCADE,
    valor TEXT,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(disparo_id, campo_id)
);

CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_valores_workspace ON disparo_campos_custom_valores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_valores_disparo ON disparo_campos_custom_valores(disparo_id);

CREATE TRIGGER trigger_update_disparo_campos_custom_valores_updated_at
    BEFORE UPDATE ON disparo_campos_custom_valores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE disparo_campos_custom ENABLE ROW LEVEL SECURITY;
ALTER TABLE disparo_campos_custom_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_disparo_campos_custom" ON disparo_campos_custom;
CREATE POLICY "workspace_members_select_disparo_campos_custom"
    ON disparo_campos_custom FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_insert_disparo_campos_custom" ON disparo_campos_custom;
CREATE POLICY "workspace_writers_insert_disparo_campos_custom"
    ON disparo_campos_custom FOR INSERT
    TO authenticated
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_update_disparo_campos_custom" ON disparo_campos_custom;
CREATE POLICY "workspace_writers_update_disparo_campos_custom"
    ON disparo_campos_custom FOR UPDATE
    TO authenticated
    USING (can_write_disparos(workspace_id))
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_delete_disparo_campos_custom" ON disparo_campos_custom;
CREATE POLICY "workspace_writers_delete_disparo_campos_custom"
    ON disparo_campos_custom FOR DELETE
    TO authenticated
    USING (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "service_role_all_disparo_campos_custom" ON disparo_campos_custom;
CREATE POLICY "service_role_all_disparo_campos_custom"
    ON disparo_campos_custom FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workspace_members_select_disparo_campos_custom_valores" ON disparo_campos_custom_valores;
CREATE POLICY "workspace_members_select_disparo_campos_custom_valores"
    ON disparo_campos_custom_valores FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_insert_disparo_campos_custom_valores" ON disparo_campos_custom_valores;
CREATE POLICY "workspace_writers_insert_disparo_campos_custom_valores"
    ON disparo_campos_custom_valores FOR INSERT
    TO authenticated
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_update_disparo_campos_custom_valores" ON disparo_campos_custom_valores;
CREATE POLICY "workspace_writers_update_disparo_campos_custom_valores"
    ON disparo_campos_custom_valores FOR UPDATE
    TO authenticated
    USING (can_write_disparos(workspace_id))
    WITH CHECK (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "workspace_writers_delete_disparo_campos_custom_valores" ON disparo_campos_custom_valores;
CREATE POLICY "workspace_writers_delete_disparo_campos_custom_valores"
    ON disparo_campos_custom_valores FOR DELETE
    TO authenticated
    USING (can_write_disparos(workspace_id));

DROP POLICY IF EXISTS "service_role_all_disparo_campos_custom_valores" ON disparo_campos_custom_valores;
CREATE POLICY "service_role_all_disparo_campos_custom_valores"
    ON disparo_campos_custom_valores FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- 4. v_disparo_metricas — renomeia comprou_count -> converteu_count, adiciona
--    tipo_mensagem, preco_unitario e custo_estimado
-- =============================================================================

DROP VIEW IF EXISTS v_disparo_metricas;

CREATE VIEW v_disparo_metricas AS
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
        c.updated_at AS tagged_at
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
        COUNT(DISTINCT CASE WHEN tpd.significado = 'converteu'    AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS converteu_count,
        MIN(tc.tagged_at) AS primeiro_trigger,
        MAX(tc.tagged_at) AS ultimo_trigger
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
    d.tipo_mensagem,
    COALESCE(m.trigger_count, 0) AS trigger_count,
    COALESCE(m.respondeu_count, 0) AS respondeu_count,
    COALESCE(m.parou_count, 0) AS parou_count,
    COALESCE(m.erro_count, 0) AS erro_count,
    COALESCE(m.nao_respondeu_count, 0) AS nao_respondeu_count,
    COALESCE(m.converteu_count, 0) AS converteu_count,
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
         ELSE ROUND((m.converteu_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_conversao_pct,
    CASE WHEN d.tipo_mensagem = 'utility' THEN COALESCE(wpc.preco_utility, 0) ELSE COALESCE(wpc.preco_marketing, 0) END AS preco_unitario,
    COALESCE(m.trigger_count, 0) * CASE WHEN d.tipo_mensagem = 'utility' THEN COALESCE(wpc.preco_utility, 0) ELSE COALESCE(wpc.preco_marketing, 0) END AS custo_estimado,
    m.primeiro_trigger,
    m.ultimo_trigger
FROM disparos d
LEFT JOIN metricas m ON m.disparo_id = d.id AND m.workspace_id = d.workspace_id
LEFT JOIN whatsapp_pricing_config wpc ON wpc.workspace_id = d.workspace_id;

NOTIFY pgrst, 'reload schema';
