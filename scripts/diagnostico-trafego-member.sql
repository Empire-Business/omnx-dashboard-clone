-- Diagnóstico: simula o usuário acessos@thetrinity.com.br no Dashboard de Tráfego
-- Cole no SQL Editor do Supabase e execute.
-- Substitua o UUID abaixo pelo user_id correto se necessário.

DO $$
DECLARE
    v_user_id UUID := 'bac494f2-da72-4a51-9564-6aa3f8841e2a';
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);
    PERFORM set_config('role', 'authenticated', true);
    SET LOCAL ROLE authenticated;
END $$;

WITH usuario_workspace AS (
    SELECT workspace_id
    FROM workspace_members
    WHERE user_id = 'bac494f2-da72-4a51-9564-6aa3f8841e2a'
      AND is_active = true
    ORDER BY joined_at ASC
    LIMIT 1
)
SELECT
    'workspace_id' AS metric,
    (SELECT workspace_id::text FROM usuario_workspace) AS value
UNION ALL
SELECT
    'get_workspace_id_by_ghl_location_id(NULL)',
    (SELECT get_workspace_id_by_ghl_location_id(NULL)::text)
UNION ALL
SELECT
    'contatos_visiveis_rls',
    (SELECT COUNT(*)::text FROM contatos)
UNION ALL
SELECT
    'oportunidades_visiveis_rls',
    (SELECT COUNT(*)::text FROM oportunidades)
UNION ALL
SELECT
    'utm_sources_no_workspace',
    (SELECT COUNT(*)::text FROM utm_sources WHERE workspace_id = (SELECT workspace_id FROM usuario_workspace))
UNION ALL
SELECT
    'utm_campaigns_no_workspace',
    (SELECT COUNT(*)::text FROM utm_campaigns WHERE workspace_id = (SELECT workspace_id FROM usuario_workspace))
UNION ALL
SELECT
    'funnels_no_workspace',
    (SELECT COUNT(*)::text FROM funnels WHERE workspace_id = (SELECT workspace_id FROM usuario_workspace))
UNION ALL
SELECT
    'meta_ads_insights_visiveis_rls',
    (SELECT COUNT(*)::text FROM meta_ads_insights)
UNION ALL
SELECT
    'vendas_fechamento_visiveis_rls',
    (SELECT COUNT(*)::text FROM vendas_fechamento)
UNION ALL
SELECT
    'ghl_location_id',
    COALESCE(
        (SELECT ghl_location_id FROM ghl_integration_settings WHERE workspace_id = (SELECT workspace_id FROM usuario_workspace)),
        'NULL'
    );
