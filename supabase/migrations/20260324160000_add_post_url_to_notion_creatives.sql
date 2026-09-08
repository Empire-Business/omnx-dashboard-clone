-- Migration: Add post_url to notion_creatives
-- Armazena o link público do post no Instagram ou Facebook (preenchido via campo Notion)
-- Campo Notion esperado: "Link do Anúncio" (tipo URL)

ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS post_url TEXT;

COMMENT ON COLUMN notion_creatives.post_url IS
  'Link público do post no Instagram ou Facebook. Populado pelo campo "Link do Anúncio" do Notion.';
