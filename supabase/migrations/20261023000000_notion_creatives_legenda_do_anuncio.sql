-- Migration: coluna "Legenda do anúncio" em notion_creatives (MEL-08)
--
-- CONTEXTO (reuniao de criativos de 2026-08-28)
--   O time pediu um campo para o texto que aparece ACIMA do criativo no anuncio
--   veiculado. Hoje nao existe lugar para isso e a pessoa acaba enfiando na
--   observacao ou no copy.
--     "Acho que teria que ter legenda do anuncio, porque ai a pessoa coloca o
--      texto que vai em cima daquele anuncio." (00:38:51)
--
--   NAO da para reaproveitar `copy_text`: na mesma reuniao ficou definido que
--   "Copy" e o texto da POSTAGEM (MEL-07, 00:38:22). Sao duas coisas diferentes,
--   e juntar as duas perderia informacao.
--
-- SEGURANCA / COMPATIBILIDADE
--   Aditiva e idempotente (modo "so producao", docs/DECISAO-SO-PRODUCAO-2026-07-18.md):
--   coluna nova, anulavel, sem default e sem backfill. Nenhuma escrita existente
--   muda de comportamento; RLS da tabela continua valendo sem alteracao (a policy
--   e por linha, nao por coluna).

ALTER TABLE public.notion_creatives
  ADD COLUMN IF NOT EXISTS ad_caption TEXT;

COMMENT ON COLUMN public.notion_creatives.ad_caption IS
  'Legenda do anuncio: texto exibido acima do criativo no anuncio veiculado. Diferente de copy_text, que e o texto da postagem organica (MEL-07/MEL-08, reuniao 2026-08-28).';
