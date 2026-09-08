-- ============================================================================
-- FASE 6 (fatia 1) — Denormalizacao de workspace_id nas 3 tabelas centrais
-- do CRM: oportunidades, comunicacoes, vendas_fechamento.
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 4.3)
--
-- Hoje essas tabelas resolvem workspace_id via JOIN (get_contact_workspace_id
-- / get_opportunity_workspace_id). Isso ja e seguro para RLS, mas nao escala
-- bem em performance com muitas sub-contas e nao permite associar um
-- registro "orfao" (contato deletado) a um workspace. Esta migration:
--   1. Adiciona a coluna workspace_id (nullable no inicio).
--   2. Faz backfill historico via o mesmo join ja usado pela RLS.
--   3. Trata orfaos (join retorna NULL) SOMENTE se houver exatamente 1
--      workspace ativo hoje (janela single-tenant) — nunca silenciosamente
--      com 2+ workspaces (RAISE EXCEPTION forca resolucao manual).
--   4. Aperta para NOT NULL pelo padrao seguro (CHECK NOT VALID -> VALIDATE
--      -> SET NOT NULL), com lock_timeout curto.
--   5. Cria trigger BEFORE INSERT que preenche workspace_id automaticamente
--      em linhas novas (para nao reabrir o gap depois desta migration).
--
-- IMPORTANTE (secao 4.3, item 4): a RLS dessas tabelas CONTINUA usando o
-- join (get_contact_workspace_id/get_opportunity_workspace_id) — NAO foi
-- reescrita para a coluna nova nesta fatia. Reescrever as policies (~4 por
-- tabela, ver migration 20260722000000) para usar a coluna direto e uma
-- melhoria de performance OPCIONAL documentada como proximo passo, nao
-- aplicada aqui (evita re-testar 198 policies numa unica fatia).
--
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- 1. Coluna (nullable no inicio — aperta para NOT NULL depois do backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.comunicacoes ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.vendas_fechamento ADD COLUMN IF NOT EXISTS workspace_id uuid;

CREATE INDEX IF NOT EXISTS idx_oportunidades_workspace_id ON public.oportunidades (workspace_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_workspace_id ON public.comunicacoes (workspace_id);
CREATE INDEX IF NOT EXISTS idx_vendas_fechamento_workspace_id ON public.vendas_fechamento (workspace_id);

-- ---------------------------------------------------------------------------
-- 2 + 3. Backfill historico via join + tratamento de orfaos (fail-closed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_orphans integer;
    v_workspace_count integer;
    v_only_workspace_id uuid;
BEGIN
    -- oportunidades: backfill via contato
    UPDATE public.oportunidades o
       SET workspace_id = public.get_contact_workspace_id(o.contato_id)
     WHERE o.workspace_id IS NULL;

    -- comunicacoes: backfill via contato
    UPDATE public.comunicacoes c
       SET workspace_id = public.get_contact_workspace_id(c.contato_id)
     WHERE c.workspace_id IS NULL;

    -- vendas_fechamento: backfill via contato OU oportunidade (o que resolver primeiro)
    UPDATE public.vendas_fechamento v
       SET workspace_id = COALESCE(
               public.get_contact_workspace_id(v.contato_id),
               public.get_opportunity_workspace_id(v.oportunidade_id)
           )
     WHERE v.workspace_id IS NULL;

    -- Orfaos: join nao resolveu (contato/oportunidade deletado). So e seguro
    -- atribuir automaticamente ao unico workspace ativo se houver EXATAMENTE
    -- 1 workspace hoje (janela single-tenant garantida pela "regra de ouro"
    -- da secao 10 do plano — nunca aceitar 2o tenant antes das Fases 2/8).
    SELECT count(*) INTO v_workspace_count FROM public.workspaces;

    SELECT count(*) INTO v_orphans FROM public.oportunidades WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        IF v_workspace_count = 1 THEN
            SELECT id INTO v_only_workspace_id FROM public.workspaces LIMIT 1;
            UPDATE public.oportunidades SET workspace_id = v_only_workspace_id WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'oportunidades: % linha(s) orfa(s) sem workspace_id resolvivel via join, e existem % workspaces — atribuicao automatica so e segura com exatamente 1 workspace ativo (docs/PLANO-MULTI-TENANT-AGENCY.md secao 4.3). Resolva manualmente antes de reaplicar esta migration.', v_orphans, v_workspace_count;
        END IF;
    END IF;

    SELECT count(*) INTO v_orphans FROM public.comunicacoes WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        IF v_workspace_count = 1 THEN
            SELECT id INTO v_only_workspace_id FROM public.workspaces LIMIT 1;
            UPDATE public.comunicacoes SET workspace_id = v_only_workspace_id WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'comunicacoes: % linha(s) orfa(s) sem workspace_id resolvivel via join, e existem % workspaces — atribuicao automatica so e segura com exatamente 1 workspace ativo (docs/PLANO-MULTI-TENANT-AGENCY.md secao 4.3). Resolva manualmente antes de reaplicar esta migration.', v_orphans, v_workspace_count;
        END IF;
    END IF;

    SELECT count(*) INTO v_orphans FROM public.vendas_fechamento WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        IF v_workspace_count = 1 THEN
            SELECT id INTO v_only_workspace_id FROM public.workspaces LIMIT 1;
            UPDATE public.vendas_fechamento SET workspace_id = v_only_workspace_id WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'vendas_fechamento: % linha(s) orfa(s) sem workspace_id resolvivel via join, e existem % workspaces — atribuicao automatica so e segura com exatamente 1 workspace ativo (docs/PLANO-MULTI-TENANT-AGENCY.md secao 4.3). Resolva manualmente antes de reaplicar esta migration.', v_orphans, v_workspace_count;
        END IF;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Aperto para NOT NULL — padrao seguro (secao 4.2): NOT VALID -> VALIDATE
--    -> SET NOT NULL. lock_timeout curto para nao empilhar atras de txn longa.
-- ---------------------------------------------------------------------------
SET lock_timeout = '2s';

ALTER TABLE public.oportunidades
    ADD CONSTRAINT oportunidades_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.oportunidades VALIDATE CONSTRAINT oportunidades_workspace_id_not_null;
ALTER TABLE public.oportunidades ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.oportunidades DROP CONSTRAINT oportunidades_workspace_id_not_null;

ALTER TABLE public.comunicacoes
    ADD CONSTRAINT comunicacoes_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.comunicacoes VALIDATE CONSTRAINT comunicacoes_workspace_id_not_null;
ALTER TABLE public.comunicacoes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.comunicacoes DROP CONSTRAINT comunicacoes_workspace_id_not_null;

ALTER TABLE public.vendas_fechamento
    ADD CONSTRAINT vendas_fechamento_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.vendas_fechamento VALIDATE CONSTRAINT vendas_fechamento_workspace_id_not_null;
ALTER TABLE public.vendas_fechamento ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.vendas_fechamento DROP CONSTRAINT vendas_fechamento_workspace_id_not_null;

RESET lock_timeout;

-- ---------------------------------------------------------------------------
-- 5. Triggers — preenchem workspace_id em linhas NOVAS (fecha o gap pra frente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_workspace_id_oportunidades()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public.get_contact_workspace_id(NEW.contato_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_oportunidades ON public.oportunidades;
CREATE TRIGGER tr_set_workspace_id_oportunidades
    BEFORE INSERT ON public.oportunidades
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_oportunidades();

CREATE OR REPLACE FUNCTION public.set_workspace_id_comunicacoes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public.get_contact_workspace_id(NEW.contato_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_comunicacoes ON public.comunicacoes;
CREATE TRIGGER tr_set_workspace_id_comunicacoes
    BEFORE INSERT ON public.comunicacoes
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_comunicacoes();

CREATE OR REPLACE FUNCTION public.set_workspace_id_vendas_fechamento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := COALESCE(
            public.get_contact_workspace_id(NEW.contato_id),
            public.get_opportunity_workspace_id(NEW.oportunidade_id)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_vendas_fechamento ON public.vendas_fechamento;
CREATE TRIGGER tr_set_workspace_id_vendas_fechamento
    BEFORE INSERT ON public.vendas_fechamento
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_vendas_fechamento();

NOTIFY pgrst, 'reload schema';
