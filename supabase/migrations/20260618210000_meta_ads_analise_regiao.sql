-- =============================================================================
-- Migration: Análise Meta Ads por Região para a Clara
-- Data: 2026-06-18
--
-- Objetivo:
--   Permitir que a Clara (bot-chat) responda análises completas de
--   investimento, vendas, CPV, ROAS e ROAS CAIXA por região brasileira,
--   cruzando dados da Meta Ads com vendas do CRM.
--
-- Visão: COHORT — leads de tráfego pago que entraram no período. O faturamento
--        atribuído é o total de vendas confirmadas (data_pagamento_entrada)
--        desses leads, independente de quando o pagamento ocorreu.
--        Alinhado com o painel Tráfego do dashboard.
-- =============================================================================

-- =============================================================================
-- PARTE 1: Tabela de normalização de estado/UF
-- =============================================================================

CREATE TABLE IF NOT EXISTS estado_uf_normalizacao (
    estado_raw TEXT PRIMARY KEY,
    uf         TEXT NOT NULL,
    regiao     TEXT NOT NULL
);

COMMENT ON TABLE estado_uf_normalizacao IS
'Normaliza variações de estado_uf (sigla, nome completo, erros comuns) para UF e região brasileira.';

INSERT INTO estado_uf_normalizacao (estado_raw, uf, regiao) VALUES
-- Siglas
('AC', 'AC', 'Norte'), ('AL', 'AL', 'Nordeste'), ('AP', 'AP', 'Norte'),
('AM', 'AM', 'Norte'), ('BA', 'BA', 'Nordeste'), ('CE', 'CE', 'Nordeste'),
('DF', 'DF', 'Centro-Oeste'), ('ES', 'ES', 'Sudeste'), ('GO', 'GO', 'Centro-Oeste'),
('MA', 'MA', 'Nordeste'), ('MT', 'MT', 'Centro-Oeste'), ('MS', 'MS', 'Centro-Oeste'),
('MG', 'MG', 'Sudeste'), ('PA', 'PA', 'Norte'), ('PB', 'PB', 'Nordeste'),
('PR', 'PR', 'Sul'), ('PE', 'PE', 'Nordeste'), ('PI', 'PI', 'Nordeste'),
('RJ', 'RJ', 'Sudeste'), ('RN', 'RN', 'Nordeste'), ('RS', 'RS', 'Sul'),
('RO', 'RO', 'Norte'), ('RR', 'RR', 'Norte'), ('SC', 'SC', 'Sul'),
('SP', 'SP', 'Sudeste'), ('SE', 'SE', 'Nordeste'), ('TO', 'TO', 'Norte'),
-- Nomes com acento
('Acre', 'AC', 'Norte'), ('Alagoas', 'AL', 'Nordeste'), ('Amapá', 'AP', 'Norte'),
('Amazonas', 'AM', 'Norte'), ('Bahia', 'BA', 'Nordeste'), ('Ceará', 'CE', 'Nordeste'),
('Distrito Federal', 'DF', 'Centro-Oeste'), ('Espírito Santo', 'ES', 'Sudeste'),
('Goiás', 'GO', 'Centro-Oeste'), ('Maranhão', 'MA', 'Nordeste'),
('Mato Grosso', 'MT', 'Centro-Oeste'), ('Mato Grosso do Sul', 'MS', 'Centro-Oeste'),
('Minas Gerais', 'MG', 'Sudeste'), ('Pará', 'PA', 'Norte'), ('Paraíba', 'PB', 'Nordeste'),
('Paraná', 'PR', 'Sul'), ('Pernambuco', 'PE', 'Nordeste'), ('Piauí', 'PI', 'Nordeste'),
('Rio de Janeiro', 'RJ', 'Sudeste'), ('Rio Grande do Norte', 'RN', 'Nordeste'),
('Rio Grande do Sul', 'RS', 'Sul'), ('Rondônia', 'RO', 'Norte'), ('Roraima', 'RR', 'Norte'),
('Santa Catarina', 'SC', 'Sul'), ('São Paulo', 'SP', 'Sudeste'), ('Sergipe', 'SE', 'Nordeste'),
('Tocantins', 'TO', 'Norte'),
-- Nomes sem acento
('Amapa', 'AP', 'Norte'), ('Ceara', 'CE', 'Nordeste'), ('Espirito Santo', 'ES', 'Sudeste'),
('Goias', 'GO', 'Centro-Oeste'), ('Maranhao', 'MA', 'Nordeste'), ('Para', 'PA', 'Norte'),
('Paraiba', 'PB', 'Nordeste'), ('Parana', 'PR', 'Sul'), ('Piaui', 'PI', 'Nordeste'),
('Rondonia', 'RO', 'Norte'), ('Sao Paulo', 'SP', 'Sudeste'),
-- Variações de case
('rio de janeiro', 'RJ', 'Sudeste'), ('Rio de janeiro', 'RJ', 'Sudeste'),
-- Erros comuns
('BH', 'MG', 'Sudeste')
ON CONFLICT (estado_raw) DO NOTHING;

-- =============================================================================
-- PARTE 2: Função de análise por região
-- =============================================================================

CREATE OR REPLACE FUNCTION analisar_meta_ads_por_regiao(
    p_start_date DATE,
    p_end_date   DATE
)
RETURNS TABLE (
    regiao          TEXT,
    investimento    NUMERIC,
    vendas          BIGINT,
    faturamento     NUMERIC,
    entrada         NUMERIC,
    cpv             NUMERIC,
    roas            NUMERIC,
    roas_caixa      NUMERIC,
    pct_vendas      NUMERIC,
    pct_faturamento NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_total_vendas      BIGINT;
    v_total_faturamento NUMERIC;
BEGIN
    -- Investimento por região (Meta Ads breakdown)
    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    -- Vendas por região (CRM): leads de tráfego pago que entraram no período e fecharam
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)        AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        COALESCE(SUM(c.vendas), 0)::BIGINT,
        COALESCE(SUM(c.faturamento), 0)
    INTO v_total_vendas, v_total_faturamento
    FROM cruzado c;

    RETURN QUERY
    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)::BIGINT AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        c.regiao,
        ROUND(c.investimento::NUMERIC, 2),
        c.vendas,
        ROUND(c.faturamento::NUMERIC, 2),
        ROUND(c.entrada::NUMERIC, 2),
        CASE WHEN c.vendas > 0 THEN ROUND((c.investimento / c.vendas)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.faturamento / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.entrada / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN v_total_vendas > 0 THEN ROUND((c.vendas::NUMERIC / v_total_vendas * 100), 2) ELSE 0 END,
        CASE WHEN v_total_faturamento > 0 THEN ROUND((c.faturamento / v_total_faturamento * 100), 2) ELSE 0 END
    FROM cruzado c
    ORDER BY c.investimento DESC;
END;
$$;

COMMENT ON FUNCTION analisar_meta_ads_por_regiao(DATE, DATE) IS
'Retorna investimento Meta Ads e vendas do CRM por região brasileira. Visão COHORT: considera leads de tráfego pago que entraram no período e fecharam (data_pagamento_entrada preenchida). Alinhado com o painel Tráfego do dashboard.';

-- =============================================================================
-- PARTE 3: RLS e grants
-- =============================================================================

ALTER TABLE estado_uf_normalizacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on estado_uf_normalizacao" ON estado_uf_normalizacao;
CREATE POLICY "Service role full access on estado_uf_normalizacao"
ON estado_uf_normalizacao FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON estado_uf_normalizacao TO service_role;
GRANT EXECUTE ON FUNCTION analisar_meta_ads_por_regiao(DATE, DATE) TO service_role;
