-- ============================================================
-- Migration: Criar função segura de parse de data
-- Problema: Conversão direta ::DATE pode inverter mês/dia
-- Solução: Função que tenta múltiplos formatos explicitamente
-- Data: 2026-02-27
-- ============================================================

CREATE OR REPLACE FUNCTION public.parse_safe_date(p_date_string text)
RETURNS timestamptz AS $$
DECLARE
    v_result timestamptz;
    v_cleaned text;
BEGIN
    -- Retornar NULL se vazio
    IF p_date_string IS NULL OR NULLIF(TRIM(p_date_string), '') IS NULL THEN
        RETURN NULL;
    END IF;
    
    v_cleaned := TRIM(p_date_string);
    
    -- Tentar parse como ISO8601 timestamp completo primeiro (ex: 2026-02-13T01:17:19.806Z)
    BEGIN
        v_result := v_cleaned::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar para próximo método
    END;
    
    -- Tentar parse como data ISO YYYY-MM-DD (ex: 2026-02-12)
    -- Usar TO_DATE com formato explícito para evitar interpretação ambígua
    BEGIN
        v_result := TO_DATE(v_cleaned, 'YYYY-MM-DD')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar para próximo método
    END;
    
    -- Tentar parse como data brasileira DD/MM/YYYY (ex: 12/02/2026)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'DD/MM/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        -- Continuar para próximo método
    END;
    
    -- Tentar parse como data americana MM/DD/YYYY (ex: 02/12/2026)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'MM/DD/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date IS 
'Converte string de data para timestamptz de forma segura, tentando múltiplos formatos na ordem: ISO8601 timestamp, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY';

-- ============================================================
-- Criar também uma versão que retorna DATE (para casos que não precisam de timezone)
-- ============================================================

CREATE OR REPLACE FUNCTION public.parse_safe_date_only(p_date_string text)
RETURNS date AS $$
DECLARE
    v_result timestamptz;
BEGIN
    v_result := public.parse_safe_date(p_date_string);
    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN v_result::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date_only IS 
'Converte string de data para date de forma segura (sem timezone)';
