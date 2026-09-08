-- Metadados de traqueamento para a Clara: sources e campanhas

CREATE OR REPLACE FUNCTION listar_utm_sources()
RETURNS TABLE (
  nome TEXT,
  utm_source TEXT,
  public_code TEXT,
  slug TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT nome, utm_source, public_code, slug
  FROM utm_sources
  WHERE utm_source IS NOT NULL AND utm_source != ''
  ORDER BY nome, utm_source;
$$;

CREATE OR REPLACE FUNCTION listar_utm_campaigns()
RETURNS TABLE (
  nome TEXT,
  utm_campaign TEXT,
  page_code TEXT,
  funnels JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT nome, utm_campaign::TEXT, page_code, funnels
  FROM utm_campaigns
  ORDER BY nome, utm_campaign;
$$;

COMMENT ON FUNCTION listar_utm_sources() IS 'Retorna a lista de canais/sources de tráfego pago cadastrados no dashboard.';
COMMENT ON FUNCTION listar_utm_campaigns() IS 'Retorna a lista de campanhas cadastradas no dashboard com código e funis associados.';
