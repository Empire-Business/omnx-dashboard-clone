-- Isola o acesso da Clara pelo Telegram em uma única subconta explicitamente definida.
-- Entradas legadas só recebem backfill quando há exatamente uma conta ativa;
-- em qualquer ambiguidade, o bot falha fechado até o administrador mapear a conta.

ALTER TABLE public.telegram_allowed_users
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

DO $$
DECLARE
  v_single_workspace uuid;
BEGIN
  SELECT id INTO v_single_workspace
  FROM public.workspaces
  ORDER BY created_at
  LIMIT 1;

  IF (SELECT count(*) FROM public.workspaces) = 1 THEN
    UPDATE public.telegram_allowed_users
    SET workspace_id = v_single_workspace
    WHERE workspace_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_allowed_users_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.telegram_allowed_users
      ADD CONSTRAINT telegram_allowed_users_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_telegram_allowed_users_workspace_id
  ON public.telegram_allowed_users(workspace_id)
  WHERE ativo = true;

COMMENT ON COLUMN public.telegram_allowed_users.workspace_id IS
  'Subconta que o usuário do Telegram pode consultar via Clara. Nulo bloqueia o bot por segurança.';
