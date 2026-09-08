-- Adiciona campos manuais de acompanhamento de teste na Produção (Notion)
-- Esses campos ficam fora do payload de sync do Notion e são editados pela UI.

ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS creative_tested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_started_at DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notion_creatives'
      AND policyname = 'Workspace members can update notion_creatives'
  ) THEN
    CREATE POLICY "Workspace members can update notion_creatives"
      ON notion_creatives
      FOR UPDATE
      TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
      WITH CHECK (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
