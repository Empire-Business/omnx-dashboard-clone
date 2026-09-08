-- Telemetria de IA para suporte e cobrança futura por conta.
-- Não armazena prompts, respostas, credenciais ou mensagens de erro do provedor.

CREATE TABLE IF NOT EXISTS public.workspace_ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN (
    'ai-ghl-mapping', 'prevendas-ai', 'bot-chat', 'bot-chat-synthesis'
  )),
  provider text NOT NULL DEFAULT 'openrouter' CHECK (provider = 'openrouter'),
  model text,
  status text NOT NULL CHECK (status IN ('success', 'failure')),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count = 1),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  estimated_cost_usd numeric(14, 8),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,80}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_ai_usage_events_failure_details
    CHECK ((status = 'success' AND error_code IS NULL) OR (status = 'failure' AND error_code IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_workspace_ai_usage_events_workspace_occurred
  ON public.workspace_ai_usage_events (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_ai_usage_events_workspace_status_occurred
  ON public.workspace_ai_usage_events (workspace_id, status, occurred_at DESC);

ALTER TABLE public.workspace_ai_usage_events ENABLE ROW LEVEL SECURITY;

-- A escrita é exclusivamente server-side via service_role. Owner/admin podem
-- consultar o histórico da própria conta para suporte e cobrança; membros não.
CREATE POLICY "Workspace admins read own AI usage telemetry"
  ON public.workspace_ai_usage_events FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "Service role manages AI usage telemetry"
  ON public.workspace_ai_usage_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.workspace_ai_usage_events IS
  'Eventos operacionais de OpenRouter por workspace. Não contém prompts, respostas, chaves ou erros brutos.';
COMMENT ON COLUMN public.workspace_ai_usage_events.error_code IS
  'Código sanitizado de falha, sem mensagem do provedor nem conteúdo do usuário.';
