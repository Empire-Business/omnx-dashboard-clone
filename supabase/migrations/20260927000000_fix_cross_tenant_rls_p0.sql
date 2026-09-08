-- ============================================================================
-- Migration: 20260927000000_fix_cross_tenant_rls_p0.sql
-- ============================================================================
-- P0 — Fecha 8 vazamentos cross-tenant CONFIRMADOS em producao (auditoria de
-- 2026-07-17, verificada ao vivo em pg_policies):
--
--   tabela                  | politica ao vivo (problema)
--   ------------------------|--------------------------------------------------
--   ghl_tasks               | SELECT USING (true) p/ authenticated
--   maquina_de_conteudo     | SELECT USING (true) p/ authenticated (PII Hotmart)
--   stevo_whatsapp_calls    | membro de QUALQUER workspace le (coluna existia!)
--   webhooks_ghl            | admin de QUALQUER workspace le payloads brutos
--   reunioes                | membro de QUALQUER workspace le
--   audit_log               | admin de QUALQUER workspace le tudo
--   bot_context             | membro le / admin ESCREVE cross-tenant
--   app_config              | SELECT USING (true) p/ ANON
--
-- Por que agora: a sub-conta "Burn-in Interno" ja existe e tem chave GHL real
-- conectada — ou seja, ja ha um segundo tenant capaz de ler o workspace
-- Default. Com 1 workspace real o vazamento e invisivel, mas viola o
-- isolamento que o modelo agency + sub-contas exige.
--
-- Estrategia por tabela:
--   - Adicionar workspace_id (quando falta), backfill com mapeamento REAL onde
--     existe (contato_id -> contatos.workspace_id; location_id -> RPC
--     get_workspace_id_by_ghl_location_id), guard com RAISE EXCEPTION se o
--     backfill ficar incompleto, SET NOT NULL.
--   - O que nao tem mapeamento relacional (maquina_de_conteudo, bot_context,
--     webhooks_ghl sem location) recebe o workspace mais antigo — decisao
--     segura APENAS porque existe exatamente 1 workspace real com dados
--     (Single-Tenant Lock); a "Burn-in Interno" e teste e esta vazia.
--     Documentado aqui para nunca ser copiado como padrao.
--   - Triggers BEFORE INSERT fecham o gap pra frente (padrao
--     set_workspace_id_* de 20260803000000).
--   - Policies novas filtram por is_workspace_member/workspace_admin do
--     workspace da LINHA — nunca mais "membro de qualquer workspace".
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE FUNCTION / CREATE INDEX IF NOT EXISTS.
-- Re-aplicavel sem efeito colateral.
-- ============================================================================

SET search_path = public, pg_catalog;
SET lock_timeout = '10s';
-- Backfills grandes (webhooks_ghl ~246k linhas) excedem o statement_timeout
-- padrao da sessao do CLI; elevamos so nesta sessao de migration.
SET statement_timeout = '15min';

-- ============================================================================
-- 1. ghl_tasks (221 linhas, 100% com contato_id) — backfill via contatos
-- ============================================================================
ALTER TABLE public.ghl_tasks
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.ghl_tasks t
SET workspace_id = c.workspace_id
FROM public.contatos c
WHERE t.contato_id = c.id
  AND t.workspace_id IS NULL;

-- Orfaos (contato deletado ou dado sintetico de fixture): em producao o
-- caminho acima cobre 221/221 (verificado 2026-07-17); este fallback so
-- dispara em ambiente de teste. Mesmo criterio documentado no cabecalho.
UPDATE public.ghl_tasks
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.ghl_tasks WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'ghl_tasks: backfill incompleto — % linhas sem workspace_id',
            (SELECT count(*) FROM public.ghl_tasks WHERE workspace_id IS NULL);
    END IF;
END $$;

ALTER TABLE public.ghl_tasks ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ghl_tasks_workspace_id_idx ON public.ghl_tasks(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_ghl_tasks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public.get_contact_workspace_id(NEW.contato_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_ghl_tasks ON public.ghl_tasks;
CREATE TRIGGER tr_set_workspace_id_ghl_tasks
    BEFORE INSERT ON public.ghl_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_ghl_tasks();

DROP POLICY IF EXISTS authenticated_read_ghl_tasks ON public.ghl_tasks;
DROP POLICY IF EXISTS workspace_members_read_ghl_tasks ON public.ghl_tasks;
CREATE POLICY workspace_members_read_ghl_tasks
    ON public.ghl_tasks FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 2. maquina_de_conteudo (24 linhas) — compras Hotmart, integracao single-tenant
--    Sem link relacional: backfill para o workspace real (ver justificativa no
--    cabecalho). Inserts futuros: trigger com mesmo default (stop-gap
--    single-tenant; quando Hotmart virar por-workspace, webhook-compras passa
--    a enviar workspace_id explicito e o default deixa de ser usado).
-- ============================================================================
ALTER TABLE public.maquina_de_conteudo
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.maquina_de_conteudo
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.maquina_de_conteudo WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'maquina_de_conteudo: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.maquina_de_conteudo ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS maquina_de_conteudo_workspace_id_idx
    ON public.maquina_de_conteudo(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_maquina_de_conteudo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        -- Single-Tenant Lock: conta Hotmart unica da instancia.
        NEW.workspace_id := (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_maquina_de_conteudo ON public.maquina_de_conteudo;
CREATE TRIGGER tr_set_workspace_id_maquina_de_conteudo
    BEFORE INSERT ON public.maquina_de_conteudo
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_maquina_de_conteudo();

DROP POLICY IF EXISTS "Autenticados podem ler" ON public.maquina_de_conteudo;
DROP POLICY IF EXISTS workspace_members_read_maquina_de_conteudo ON public.maquina_de_conteudo;
CREATE POLICY workspace_members_read_maquina_de_conteudo
    ON public.maquina_de_conteudo FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 3. stevo_whatsapp_calls (30 linhas, 100% Default) — coluna JA existia com
--    NOT NULL + trigger; faltava reescrever a policy. So troca a policy.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_stevo_whatsapp_calls ON public.stevo_whatsapp_calls;
CREATE POLICY workspace_members_read_stevo_whatsapp_calls
    ON public.stevo_whatsapp_calls FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 4. webhooks_ghl (246k linhas) — payload bruto com PII.
--    Backfill: location_id -> RPC fail-closed; linhas historicas sem location
--    (95%, era pre-multi-tenant de location unica) -> workspace real.
--    Insert novo SEM location resolvida => NOT NULL rejeita (fail-closed);
--    desconhecidas ja viram dead-letter no webhook-ghl antes do insert.
-- ============================================================================
ALTER TABLE public.webhooks_ghl
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- Passo 1: resolve por location (join set-based; unique parcial garante <=1
-- ativo por location). Muito mais rapido que chamar a RPC por linha.
UPDATE public.webhooks_ghl w
SET workspace_id = s.workspace_id
FROM (
    SELECT ghl_location_id, workspace_id
    FROM public.ghl_integration_settings
    WHERE ghl_location_id IS NOT NULL AND is_active = true
) s
WHERE w.location_id = s.ghl_location_id
  AND w.workspace_id IS NULL;

-- Passo 2: historicas sem location (era pre-multi-tenant de location unica)
-- ou sem match -> workspace real (justificativa no cabecalho).
UPDATE public.webhooks_ghl
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.webhooks_ghl WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'webhooks_ghl: backfill incompleto — % linhas sem workspace_id',
            (SELECT count(*) FROM public.webhooks_ghl WHERE workspace_id IS NULL);
    END IF;
END $$;

ALTER TABLE public.webhooks_ghl ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS webhooks_ghl_workspace_id_idx ON public.webhooks_ghl(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_webhooks_ghl()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public.get_workspace_id_by_ghl_location_id(NEW.location_id);
        -- Sem COALESCE aqui: location desconhecida NAO pode ser atribuida a
        -- nenhum tenant (NOT NULL rejeita = fail-closed).
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_webhooks_ghl ON public.webhooks_ghl;
CREATE TRIGGER tr_set_workspace_id_webhooks_ghl
    BEFORE INSERT ON public.webhooks_ghl
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_webhooks_ghl();

DROP POLICY IF EXISTS admins_read_webhooks ON public.webhooks_ghl;
DROP POLICY IF EXISTS workspace_members_read_webhooks_ghl ON public.webhooks_ghl;
CREATE POLICY workspace_members_read_webhooks_ghl
    ON public.webhooks_ghl FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 5. reunioes (0 linhas) — coluna + trigger por contato_id + policy
-- ============================================================================
ALTER TABLE public.reunioes
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.reunioes r
SET workspace_id = c.workspace_id
FROM public.contatos c
WHERE r.contato_id = c.id
  AND r.workspace_id IS NULL;

-- Orfaos (contato deletado/sintetico): 0 linhas em producao (2026-07-17);
-- fallback so dispara em ambiente de teste.
UPDATE public.reunioes
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.reunioes WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'reunioes: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.reunioes ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS reunioes_workspace_id_idx ON public.reunioes(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_reunioes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public.get_contact_workspace_id(NEW.contato_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_reunioes ON public.reunioes;
CREATE TRIGGER tr_set_workspace_id_reunioes
    BEFORE INSERT ON public.reunioes
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_reunioes();

DROP POLICY IF EXISTS workspace_members_read_reunioes ON public.reunioes;
CREATE POLICY workspace_members_read_reunioes
    ON public.reunioes FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 6. audit_log (0 linhas, sistema dormente) — coluna NULLABLE: quem escreve
--    via service_role sem workspace gera linha operacional invisivel para
--    authenticated (RLS nega NULL), nunca vazamento. Insert autenticado exige
--    workspace valido + membership.
-- ============================================================================
ALTER TABLE public.audit_log
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

CREATE INDEX IF NOT EXISTS audit_log_workspace_id_idx ON public.audit_log(workspace_id);

DROP POLICY IF EXISTS admins_read_audit_log ON public.audit_log;
CREATE POLICY admins_read_audit_log
    ON public.audit_log FOR SELECT TO authenticated
    USING (workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS authenticated_insert_audit_log ON public.audit_log;
CREATE POLICY authenticated_insert_audit_log
    ON public.audit_log FOR INSERT TO authenticated
    WITH CHECK (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));

-- ============================================================================
-- 7. bot_context (12 linhas) — contexto global da Clara, consumido pelo
--    bot-chat (filtrado por workspace a partir do deploy desta fase).
-- ============================================================================
ALTER TABLE public.bot_context
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.bot_context
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.bot_context WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'bot_context: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.bot_context ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS bot_context_workspace_id_idx ON public.bot_context(workspace_id);

DROP POLICY IF EXISTS workspace_members_select_bot_context ON public.bot_context;
DROP POLICY IF EXISTS workspace_admins_insert_bot_context ON public.bot_context;
DROP POLICY IF EXISTS workspace_admins_update_bot_context ON public.bot_context;
DROP POLICY IF EXISTS workspace_admins_delete_bot_context ON public.bot_context;

CREATE POLICY workspace_members_select_bot_context
    ON public.bot_context FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY workspace_admins_insert_bot_context
    ON public.bot_context FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY workspace_admins_update_bot_context
    ON public.bot_context FOR UPDATE TO authenticated
    USING (public.is_workspace_admin(workspace_id))
    WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY workspace_admins_delete_bot_context
    ON public.bot_context FOR DELETE TO authenticated
    USING (public.is_workspace_admin(workspace_id));

-- ============================================================================
-- 8. app_config — fim do SELECT USING (true) para ANON.
--    Anon passa a ler SOMENTE chaves publicas por design (a anon key e publica:
--    vai no bundle do cliente). Qualquer chave futura deixa de ser publica por
--    acidente — quem precisar expor outra chave adiciona ao whitelist aqui.
--    Consumidores atuais (crons/functions SQL) rodam como definer/service e
--    nao dependem dessa policy.
-- ============================================================================
DROP POLICY IF EXISTS app_config_anon_read ON public.app_config;
CREATE POLICY app_config_anon_read_public_keys
    ON public.app_config FOR SELECT TO anon
    USING (key IN ('supabase_anon_key'));

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
RESET statement_timeout;
