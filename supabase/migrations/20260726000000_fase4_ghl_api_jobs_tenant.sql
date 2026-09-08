-- ============================================================================
-- FASE 2 — Isolamento de credenciais — fatia 4: ghl-api-worker por job (DDL)
-- docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 4)
--
-- A fila central (ghl_api_jobs) nao tinha coluna de tenant — o tenant vivia so
-- em context jsonb, e o worker aplicava UMA GHL_API_KEY global a todos os jobs
-- (anti-pattern "constante de modulo"). Esta migration adiciona tenant explicito
-- a fila e faz backfill a partir do context. A MUDANCA DE COMPORTAMENTO do
-- worker (resolver credencial por job, fail-closed, remover GHL_API_KEY) fica no
-- codigo (supabase/functions/ghl-api-worker/index.ts), commitada junto.
--
-- (a) colunas workspace_id (uuid, nullable) e location_id (text, nullable).
--     Nullable de proposito: jobs orfaos (sem tenant) EXISTEM em teoria e nao
--     podem bloquear a migration; o worker trata orfao como fail-closed + dead-
--     letter (NUNCA chave global). Sem FK rigida para nao bloquear backfill.
-- (b) backfill: workspace_id = COALESCE(context.workspace_id,
--     get_workspace_id_by_ghl_location_id(context.location_id)); location_id =
--     COALESCE(location_id, context.location_id). get_workspace_id_by_ghl_location_id
--     (fatia 3) e segura (unique parcial => <=1 ativo por location).
-- (c) indices para o worker filtrar/auditar por tenant.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / UPDATE (backfill roda de novo sem
-- duplicar) / CREATE INDEX IF NOT EXISTS. Pre-checado: ghl_api_jobs vazia no
-- banco de teste (0 linhas) em 2026-07-10 => backfill e no-op aqui.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;

-- (a) Tenant explicito na fila -------------------------------------------------
ALTER TABLE public.ghl_api_jobs
    ADD COLUMN IF NOT EXISTS workspace_id uuid,
    ADD COLUMN IF NOT EXISTS location_id  text;

-- (b) Backfill a partir de context jsonb --------------------------------------
-- location_id: preenche a partir do context quando a coluna esta vazia.
UPDATE public.ghl_api_jobs
   SET location_id = NULLIF(context->>'location_id', '')
 WHERE location_id IS NULL
   AND NULLIF(context->>'location_id', '') IS NOT NULL;

-- workspace_id: prioridade para context.workspace_id (uuid valido); senao resolve
-- pelo location_id via funcao da fatia 3 (segura: NULL quando sem match).
UPDATE public.ghl_api_jobs
   SET workspace_id = (
        CASE
          WHEN (context->>'workspace_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (context->>'workspace_id')::uuid
          ELSE public.get_workspace_id_by_ghl_location_id(NULLIF(context->>'location_id', ''))
        END
      )
 WHERE workspace_id IS NULL
   AND (
        (context->>'workspace_id') ~ '^[0-9a-fA-F-]{36}$'
        OR NULLIF(context->>'location_id', '') IS NOT NULL
       );

-- (c) Indices por tenant -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_workspace_status
    ON public.ghl_api_jobs (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_location
    ON public.ghl_api_jobs (location_id)
    WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.ghl_api_jobs.workspace_id IS
'Tenant dono do job (Fase 2/fatia 4). Nullable: orfaos sao fail-closed + dead-letter no worker, NUNCA chave global.';
COMMENT ON COLUMN public.ghl_api_jobs.location_id IS
'locationId GHL do job (cache/denorm; Fase 2/fatia 4). Usado para auditar e resolver workspace quando workspace_id vier nulo.';

NOTIFY pgrst, 'reload schema';
