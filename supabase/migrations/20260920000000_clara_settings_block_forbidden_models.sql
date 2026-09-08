-- Bloqueia modelos anthropic/* e openai/* em clara_workspace_settings.model_id.
--
-- Regra inegociável (AGENTS.md): "NUNCA use anthropic/*, openai/* ou qualquer
-- modelo Claude (Sonnet, Haiku, Opus) nas edge functions bot-chat ou
-- prevendas-ai" — custo proibido é o motivo, sem exceção.
--
-- Achado (2026-07-15): o CHECK de 20260902000000 validava apenas o FORMATO
-- provider/model, e a edge function clara-settings validava só formato também.
-- Um owner/admin conseguia salvar "anthropic/claude-..." pela tela Configurar
-- Clara e bot-chat/prevendas-ai consumiriam esse modelo diretamente na
-- OpenRouter. Esta migration é a camada de defesa no banco (write path);
-- a camada na edge function clara-settings rejeita antes de qualquer escrita.
--
-- Preserva a validação de formato existente e adiciona a blocklist de
-- providers. A checagem usa lower() por robustez (case-insensitive), embora o
-- formato já exija minúsculas. Idempotente: DROP IF EXISTS + ADD.

ALTER TABLE public.clara_workspace_settings
  DROP CONSTRAINT IF EXISTS clara_workspace_settings_model_id_check;

ALTER TABLE public.clara_workspace_settings
  ADD CONSTRAINT clara_workspace_settings_model_id_check
  CHECK (
    model_id ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'
    AND lower(model_id) NOT LIKE 'anthropic/%'
    AND lower(model_id) NOT LIKE 'openai/%'
  );

COMMENT ON COLUMN public.clara_workspace_settings.model_id IS
  'Identificador do modelo OpenRouter (ex: qwen/qwen3.6-plus). Padrão: Qwen. Providers anthropic/* e openai/* são rejeitados por política de custo (regra inegociável do AGENTS.md).';
