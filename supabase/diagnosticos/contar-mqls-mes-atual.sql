-- Consulta: Contar MQLs gerados no mês atual (Fevereiro 2026)
-- MQL = Marketing Qualified Lead = Oportunidade Criada
-- Data de referência: data_mql_lead_recebido (com fallback para created_at)

-- Mês atual: Fevereiro 2026
SELECT 
    COUNT(*) as total_mqls_fevereiro_2026,
    COUNT(CASE WHEN data_mql_lead_recebido IS NOT NULL THEN 1 END) as mqls_com_data_mql,
    COUNT(CASE WHEN data_mql_lead_recebido IS NULL THEN 1 END) as mqls_sem_data_mql
FROM oportunidades
WHERE 
    -- Filtra por fevereiro de 2026
    (
        -- Prioridade 1: data_mql_lead_recebido
        (data_mql_lead_recebido >= '2026-02-01'::date 
         AND data_mql_lead_{