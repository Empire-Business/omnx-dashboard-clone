-- ============================================================
-- Migration: Fila centralizada de chamadas à API GHL
--
-- Problema: 5+ edge functions chamam a GHL API de forma independente,
-- cada uma com seu próprio estado de rate limit local. O limite de
-- 100 req/10s é compartilhado — sem coordenação, 429s acontecem.
--
-- Solução: tabela ghl_api_jobs como fila central. Um único worker
-- (ghl-api-worker) processa os jobs em ordem, mantendo um único
-- estado de rate limit. Jobs nunca se perdem — ficam em status 'dead'
-- se excederem max_attempts.
--
-- Status possíveis:
--   pending    → aguardando processamento (ou retry agendado)
--   processing → sendo processado agora pelo worker
--   done       → concluído com sucesso (result salvo)
--   dead       → falhou após max_attempts (auditável, não deletado)
--
-- Prioridade: 1 = urgente (webhook em tempo real), 5 = normal (cron), 10 = backfill lento
-- ============================================================

-- --------------------------------------------------------
-- Tabela: ghl_api_jobs
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS ghl_api_jobs (
  id            BIGSERIAL PRIMARY KEY,
  url           TEXT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'GET',
  body          JSONB,

  -- Controle de execução
  priority      INT NOT NULL DEFAULT 5,        -- 1=urgente | 5=normal | 10=backfill
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 4,

  -- Resultado e erro
  result        JSONB,
  error         TEXT,

  -- Metadados
  caller        TEXT,                           -- ex: 'sync-ghl-conversations', 'webhook-trigger'
  idempotency_key TEXT UNIQUE,                  -- evita duplicatas (opcional)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice principal: worker busca jobs pending, ordenados por prioridade e retry
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_pending
  ON ghl_api_jobs (priority ASC, next_retry_at ASC)
  WHERE status = 'pending';

-- Índice para auditoria de jobs mortos
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_dead
  ON ghl_api_jobs (created_at DESC)
  WHERE status = 'dead';

-- --------------------------------------------------------
-- Função: claim_ghl_api_jobs
-- Pega N jobs pendentes atomicamente (SKIP LOCKED evita race conditions
-- quando dois workers rodam ao mesmo tempo)
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_ghl_api_jobs(max_jobs INT DEFAULT 50)
RETURNS SETOF ghl_api_jobs
LANGUAGE sql
SECURITY DEFINER AS $$
  UPDATE ghl_api_jobs
  SET
    status    = 'processing',
    attempts  = attempts + 1
  WHERE id IN (
    SELECT id
    FROM   ghl_api_jobs
    WHERE  status = 'pending'
      AND  next_retry_at <= NOW()
    ORDER  BY priority ASC, next_retry_at ASC
    LIMIT  max_jobs
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- --------------------------------------------------------
-- Comentários
-- --------------------------------------------------------

COMMENT ON TABLE ghl_api_jobs IS
  'Fila centralizada de chamadas à API GHL. Worker: ghl-api-worker (*/1 * * * *).';

COMMENT ON COLUMN ghl_api_jobs.priority IS
  '1=urgente (webhook tempo real) | 5=normal (cron) | 10=backfill lento';

COMMENT ON COLUMN ghl_api_jobs.idempotency_key IS
  'Chave única opcional para evitar duplicatas (ex: "sync-opp-dates:{opp_id}")';

-- Verificação
DO $$
BEGIN
  RAISE NOTICE 'Tabela ghl_api_jobs criada com índices e função claim_ghl_api_jobs()';
END;
$$;
