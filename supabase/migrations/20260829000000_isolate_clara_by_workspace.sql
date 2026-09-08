-- Clara: conversas e sessões pertencem a uma única conta.
-- Linhas legadas sem contexto de conta continuam preservadas, mas são
-- inacessíveis pela aplicação até uma migração assistida; novas escritas são
-- fail-closed e exigem workspace_id.

ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.ai_analysis_sessions
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_workspace_updated
  ON public.ai_conversations (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_sessions_workspace_user
  ON public.ai_analysis_sessions (workspace_id, user_id, created_at DESC);

-- Backfill somente quando a associação é inequívoca. Nunca adivinha uma conta
-- para usuário que pertence a mais de uma subconta.
WITH single_workspace_members AS (
  SELECT user_id, (array_agg(workspace_id))[1] AS workspace_id
  FROM public.workspace_members
  WHERE is_active = true
  GROUP BY user_id
  HAVING count(*) = 1
)
UPDATE public.ai_conversations conversation
SET workspace_id = member.workspace_id
FROM single_workspace_members member
WHERE conversation.workspace_id IS NULL
  AND conversation.user_id = member.user_id;

WITH single_workspace_members AS (
  SELECT user_id::text AS user_id, (array_agg(workspace_id))[1] AS workspace_id
  FROM public.workspace_members
  WHERE is_active = true
  GROUP BY user_id
  HAVING count(*) = 1
)
UPDATE public.ai_analysis_sessions session
SET workspace_id = member.workspace_id
FROM single_workspace_members member
WHERE session.workspace_id IS NULL
  AND session.user_id = member.user_id;

ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_workspace_required;
ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_workspace_required
  CHECK (workspace_id IS NOT NULL) NOT VALID;

ALTER TABLE public.ai_analysis_sessions
  DROP CONSTRAINT IF EXISTS ai_analysis_sessions_workspace_required;
ALTER TABLE public.ai_analysis_sessions
  ADD CONSTRAINT ai_analysis_sessions_workspace_required
  CHECK (workspace_id IS NOT NULL) NOT VALID;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.ai_conversations;

CREATE POLICY "Users can view own workspace conversations"
  ON public.ai_conversations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "Users can create own workspace conversations"
  ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "Users can update own workspace conversations"
  ON public.ai_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id))
  WITH CHECK (user_id = auth.uid() AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users can delete own workspace conversations"
  ON public.ai_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Users can view own messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.ai_messages;

CREATE POLICY "Users can view messages in own workspace conversations"
  ON public.ai_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations conversation
      WHERE conversation.id = ai_messages.conversation_id
        AND conversation.user_id = auth.uid()
        AND conversation.workspace_id IS NOT NULL
        AND public.is_workspace_member(conversation.workspace_id)
    )
  );

CREATE POLICY "Users can create messages in own workspace conversations"
  ON public.ai_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations conversation
      WHERE conversation.id = ai_messages.conversation_id
        AND conversation.user_id = auth.uid()
        AND conversation.workspace_id IS NOT NULL
        AND public.is_workspace_member(conversation.workspace_id)
    )
  );

COMMENT ON COLUMN public.ai_conversations.workspace_id IS
  'Conta dona da conversa da Clara. Obrigatória para novas escritas; legado ambíguo permanece inacessível.';
COMMENT ON COLUMN public.ai_analysis_sessions.workspace_id IS
  'Conta dona da sessão efêmera de análise da Clara. Obrigatória para novas escritas.';
