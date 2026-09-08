-- Adiciona novos campos mapeados do Notion em notion_creatives.
-- objective      → campo "Objetivo" (select/multi_select) — placeholder para quando criado no Notion
-- social_network → campo "Rede Social" (multi_select) — presente nos databases orgânicos
-- micro_program  → campo "MicroPrograma" (select) — presente nos databases orgânicos

ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS objective      TEXT,
  ADD COLUMN IF NOT EXISTS social_network TEXT,
  ADD COLUMN IF NOT EXISTS micro_program  TEXT;

COMMENT ON COLUMN notion_creatives.objective      IS 'Objetivo do criativo — campo "Objetivo" do Notion (select/multi_select). Null até o campo ser criado no Notion.';
COMMENT ON COLUMN notion_creatives.social_network IS 'Rede social de destino — campo "Rede Social" do Notion (multi_select, primeiro item). Orgânicos.';
COMMENT ON COLUMN notion_creatives.micro_program  IS 'MicroPrograma — campo "MicroPrograma" do Notion (select). Orgânicos.';

NOTIFY pgrst, 'reload schema';
