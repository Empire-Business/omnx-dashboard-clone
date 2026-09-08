-- Remove a trava rígida do model_id que forçava exclusivamente Qwen.
-- O modelo padrão continua sendo qwen/qwen3.6-plus, mas owner/admin
-- do workspace pode selecionar qualquer modelo do catálogo OpenRouter
-- via a tela Configurar Clara.
--
-- Decisão (2026-07-14): o dono autorizou a liberação da seleção de
-- modelo, mantendo Qwen como padrão por segurança de custo.
-- A allowlist de modelos fica na edge function clara-settings,
-- que valida o model_id contra o catálogo real da OpenRouter antes de
-- aceitar — nunca confia cegamente no identificador enviado pelo cliente.

ALTER TABLE public.clara_workspace_settings
  DROP CONSTRAINT IF EXISTS clara_workspace_settings_model_id_check;

-- Nova constraint: aceita qualquer string não-vazia que pareça um
-- identificador de modelo OpenRouter (formato: provider/model).
ALTER TABLE public.clara_workspace_settings
  ADD CONSTRAINT clara_workspace_settings_model_id_check
  CHECK (model_id ~ '^[a-z0-9._-]+/[a-z0-9._-]+$');

COMMENT ON COLUMN public.clara_workspace_settings.model_id IS
  'Identificador do modelo OpenRouter (ex: qwen/qwen3.6-plus). Padrão: Qwen. Validado contra o catálogo real da OpenRouter antes do uso.';
