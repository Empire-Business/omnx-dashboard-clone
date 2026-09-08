-- Função para auditoria de leads de fevereiro 2026
CREATE OR REPLACE FUNCTION audit_leads_fevereiro()
RETURNS TABLE (
  total_leads_fevereiro BIGINT,
  com_trafego_pago BIGINT,
  sem_utm_source BIGINT,
  utm_desconhecido BIGINT
) AS $$
WITH leads_fev AS (
  SELECT
    o.id,
    c.utm_source,
    CASE
      WHEN c.utm_source IS NULL OR TRIM(c.utm_source) = ''
        THEN 'sem_utm'
      WHEN us.utm_source IS NOT NULL
        THEN 'trafego_pago'
      ELSE 'utm_nao_cadastrado'
    END AS classificacao
  FROM oportunidades o
  INNER JOIN contatos c ON c.id = o.contato_id
  LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
  WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
    AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
)
SELECT
  COUNT(*) AS total_leads_fevereiro,
  COUNT(*) FILTER (WHERE classificacao = 'trafego_pago') AS com_trafego_pago,
  COUNT(*) FILTER (WHERE classificacao = 'sem_utm') AS sem_utm_source,
  COUNT(*) FILTER (WHERE classificacao = 'utm_desconhecido') AS utm_desconhecido
FROM leads_fev;
$$ LANGUAGE SQL STABLE;

-- Função para breakdown por utm_source
CREATE OR REPLACE FUNCTION audit_leads_por_utm_source()
RETURNS TABLE (
  utm_source TEXT,
  canal_cadastrado TEXT,
  total_leads BIGINT,
  e_trafego_pago TEXT
) AS $$
SELECT
  COALESCE(c.utm_source, '(NULL)') AS utm_source,
  us.nome AS canal_cadastrado,
  COUNT(o.id) AS total_leads,
  CASE WHEN us.utm_source IS NOT NULL THEN '✓ Sim' ELSE '✗ Não' END AS e_trafego_pago
FROM oportunidades o
INNER JOIN contatos c ON c.id = o.contato_id
LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
  AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
GROUP BY c.utm_source, us.nome, us.utm_source
ORDER BY total_leads DESC;
$$ LANGUAGE SQL STABLE;
