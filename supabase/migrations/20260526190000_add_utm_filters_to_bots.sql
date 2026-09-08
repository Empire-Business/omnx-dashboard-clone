-- Adiciona filtros UTM ao formulário de bots SDR-IA
-- Substitui o campo "origem" genérico por filtros específicos de UTM
-- que respeitam o padrão cadastrado nas tabelas utm_sources, utm_mediums, utm_campaigns

ALTER TABLE public.sdr_ia_bots
ADD COLUMN IF NOT EXISTS filtro_utm_source TEXT,
ADD COLUMN IF NOT EXISTS filtro_utm_medium TEXT,
ADD COLUMN IF NOT EXISTS filtro_utm_campaign TEXT;

COMMENT ON COLUMN public.sdr_ia_bots.filtro_utm_source IS
  'UTM Source (código técnico ex: iads-10). Filtra contatos.utm_source';
COMMENT ON COLUMN public.sdr_ia_bots.filtro_utm_medium IS
  'UTM Medium (código técnico ex: 1, 2, 3). Filtra contatos.utm_medium';
COMMENT ON COLUMN public.sdr_ia_bots.filtro_utm_campaign IS
  'UTM Campaign (código técnico ex: 12, 27). Filtra contatos.utm_campaign';
