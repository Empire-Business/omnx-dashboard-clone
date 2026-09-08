-- ============================================================
-- Migration: Cria tabela de log para sync de conversas GHL
-- Permite rastrear execuções, controlar backfill e detectar erros
-- Data: 2026-03-11
-- ============================================================

CREATE TABLE IF NOT EXISTS ghl_conversations_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Quando a execução começou e terminou
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,

    -- Modo de execução
    -- incremental: só busca conversas com mensagens novas desde o último sync
    -- full_backfill: busca todas as conversas (sem filtro de data)
    mode TEXT NOT NULL DEFAULT 'incremental'
        CHECK (mode IN ('incremental', 'full_backfill')),

    -- Status da execução
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'error')),

    -- Qual página foi processada nesta execução (para backfill paginado)
    page_processed INTEGER DEFAULT 1,

    -- Contadores de resultado
    conversations_processed INTEGER DEFAULT 0,
    messages_processed       INTEGER DEFAULT 0,
    messages_upserted        INTEGER DEFAULT 0,

    -- Se há mais páginas (para backfill paginado)
    has_more_pages BOOLEAN DEFAULT FALSE,
    next_page      INTEGER,

    -- Total de conversas na location (retornado pela API)
    total_conversations INTEGER,

    -- Mensagem de erro se status = 'error'
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index para buscar o último sync bem-sucedido (usado pelo modo incremental)
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_mode_status_finished
    ON ghl_conversations_sync_log (mode, status, finished_at DESC);

-- Index para monitoramento
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_started
    ON ghl_conversations_sync_log (started_at DESC);

COMMENT ON TABLE ghl_conversations_sync_log IS
    'Registra cada execução do sync de conversas da API GHL. '
    'O modo incremental usa finished_at do último sucesso para calcular startAfterDate.';

COMMENT ON COLUMN ghl_conversations_sync_log.mode IS
    'incremental = busca mensagens novas desde último sync. '
    'full_backfill = processa todas as conversas (use page_processed para controlar progresso).';
