-- Configuração da Clara por conta. Nenhum segredo é armazenado aqui: a chave
-- OpenRouter continua exclusivamente no Vault, via workspace_integration_credentials.

CREATE TABLE IF NOT EXISTS public.clara_workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  persistent_instructions text NOT NULL DEFAULT '',
  business_context text NOT NULL DEFAULT '',
  response_rules text NOT NULL DEFAULT '',
  allowed_modules text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  analysis_depth text NOT NULL DEFAULT 'standard'
    CHECK (analysis_depth IN ('concise', 'standard', 'detailed')),
  max_response_tokens integer NOT NULL DEFAULT 2048
    CHECK (max_response_tokens BETWEEN 256 AND 4096),
  conversation_retention_days integer NOT NULL DEFAULT 365
    CHECK (conversation_retention_days BETWEEN 1 AND 3650),
  scheduled_report_instructions text NOT NULL DEFAULT '',
  -- Política atual: bot-chat e prevendas-ai são obrigatoriamente Qwen.
  -- A liberação de outros modelos exige migration/política revisada.
  model_id text NOT NULL DEFAULT 'qwen/qwen3.6-plus'
    CHECK (model_id = 'qwen/qwen3.6-plus'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.clara_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(changed_fields) = 'array')
);

CREATE INDEX IF NOT EXISTS clara_settings_audit_workspace_created_idx
  ON public.clara_settings_audit (workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS clara_workspace_settings_updated_at ON public.clara_workspace_settings;
CREATE TRIGGER clara_workspace_settings_updated_at
  BEFORE UPDATE ON public.clara_workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.clara_workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clara_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins read Clara settings"
  ON public.clara_workspace_settings FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "Workspace admins read Clara settings audit"
  ON public.clara_settings_audit FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "Service role manages Clara settings"
  ON public.clara_workspace_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages Clara settings audit"
  ON public.clara_settings_audit FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.clara_workspace_settings FROM anon;
REVOKE ALL ON public.clara_settings_audit FROM anon;
GRANT SELECT ON public.clara_workspace_settings, public.clara_settings_audit TO authenticated;
GRANT ALL ON public.clara_workspace_settings, public.clara_settings_audit TO service_role;

COMMENT ON TABLE public.clara_workspace_settings IS
  'Preferências operacionais da Clara por workspace; não contém segredo nem permite modelo fora da política Qwen.';
COMMENT ON TABLE public.clara_settings_audit IS
  'Auditoria sanitizada de mudanças nas preferências da Clara, isolada por workspace.';
