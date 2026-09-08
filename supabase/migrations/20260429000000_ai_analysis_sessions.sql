-- ai_analysis_sessions: persiste estado de análises complexas para continuar em múltiplas chamadas HTTP
-- Usado pela Clara quando coleta dados mas não tem budget para sintetizar na mesma request.
-- TTL de 1 hora — dados de análise são efêmeros e não precisam persistir além disso.

CREATE TABLE IF NOT EXISTS ai_analysis_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL DEFAULT 'service',
  question        TEXT        NOT NULL,
  context         JSONB       NOT NULL DEFAULT '{}',
  collected_data  JSONB       NOT NULL DEFAULT '[]',  -- array de mensagens do loop (assistant + tool roles)
  status          TEXT        NOT NULL DEFAULT 'collecting'
                              CHECK (status IN ('collecting', 'done', 'failed')),
  final_answer    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

-- Índice para cleanup e lookup por user
CREATE INDEX IF NOT EXISTS ai_analysis_sessions_expires ON ai_analysis_sessions (expires_at);
CREATE INDEX IF NOT EXISTS ai_analysis_sessions_user    ON ai_analysis_sessions (user_id, created_at DESC);

-- RLS: service_role tem acesso total (a edge function usa service key)
ALTER TABLE ai_analysis_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON ai_analysis_sessions
  TO service_role USING (true) WITH CHECK (true);
