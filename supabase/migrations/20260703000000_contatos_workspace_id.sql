-- Migration: adiciona workspace_id à tabela contatos
--
-- Bug pré-existente encontrado em 2026-07-05: a migration
-- 20260704000000_rls_data_tables_workspace_isolation.sql ativa RLS em
-- contatos/oportunidades/comunicacoes/vendas_fechamento assumindo que
-- `contatos.workspace_id` já existe ("contatos (possui workspace_id)" no
-- comentário de topo), mas NENHUMA migration — aplicada ou pendente —
-- jamais criou essa coluna. A policy `is_workspace_member(workspace_id)`
-- falharia com "column contatos.workspace_id does not exist" assim que
-- fosse aplicada. `oportunidades`, `comunicacoes` e `vendas_fechamento`
-- não precisam de coluna própria — resolvem workspace via
-- get_contact_workspace_id(contato_id), que já faz o join correto.
--
-- Esta migration precisa rodar ANTES de 20260704000000 (por isso o
-- timestamp 20260703, entre 20260702000000 já aplicada e 20260704000000
-- pendente).

ALTER TABLE contatos
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contatos_workspace_id ON contatos(workspace_id);

-- =============================================================================
-- Backfill — hoje existe um único workspace ("Default"), então todo
-- contato legado recebe esse workspace. Se no futuro isso rodar com mais
-- de um workspace já criado, o backfill usa o mais antigo (mesmo padrão
-- usado em 20260705000007_ghl_users_workspace_id.sql) — não é o cenário
-- ideal para multi-tenant real, mas evita registros órfãos.
-- =============================================================================
DO $$
DECLARE
    default_workspace_id UUID;
BEGIN
    SELECT id INTO default_workspace_id
    FROM workspaces
    ORDER BY created_at ASC
    LIMIT 1;

    IF default_workspace_id IS NOT NULL THEN
        UPDATE contatos
        SET workspace_id = default_workspace_id
        WHERE workspace_id IS NULL;

        -- Cobre inserts futuros que não passem workspace_id explicitamente
        -- (ex: o trigger de webhook extrair_dados_ghl() ainda não foi
        -- atualizado para resolver o workspace certo por location_id —
        -- fica registrado como débito técnico em docs/MUDANCAS.md).
        EXECUTE format(
            'ALTER TABLE contatos ALTER COLUMN workspace_id SET DEFAULT %L',
            default_workspace_id
        );
    END IF;
END $$;

COMMENT ON COLUMN contatos.workspace_id IS
    'Workspace ao qual o contato pertence. Isolamento por tenant. DEFAULT aponta para o workspace mais antigo até o trigger de ingestão de webhook resolver o workspace certo por location_id.';

NOTIFY pgrst, 'reload schema';
