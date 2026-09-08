-- ============================================================
-- Migration: Corrigir ordem de formatos em parse_safe_date
-- Problema: GHL envia datas de campos customizados no formato MM/DD/YYYY
--           A versão anterior tentava DD/MM/YYYY antes de MM/DD/YYYY,
--           invertendo dia e mês em datas ambíguas (dia ≤ 12).
--
-- Exemplo confirmado:
--   GHL envia "03/07/2026" (março 7 em MM/DD/YYYY)
--   → parse_safe_date lia como DD/MM → 2026-07-03 (ERRADO)
--   → correto: 2026-03-07
--
-- Solução: inverter a ordem para MM/DD/YYYY antes de DD/MM/YYYY
-- Data: 2026-03-11
-- ============================================================

CREATE OR REPLACE FUNCTION public.parse_safe_date(p_date_string text)
RETURNS timestamptz AS $$
DECLARE
    v_result timestamptz;
    v_cleaned text;
BEGIN
    IF p_date_string IS NULL OR NULLIF(TRIM(p_date_string), '') IS NULL THEN
        RETURN NULL;
    END IF;

    v_cleaned := TRIM(p_date_string);

    -- 1. ISO8601 timestamp completo (ex: 2026-02-13T01:17:19.806Z)
    --    Cobre todos os webhooks que já chegam em formato padrão
    BEGIN
        v_result := v_cleaned::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 2. YYYY-MM-DD (ex: 2026-02-12)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'YYYY-MM-DD')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 3. MM/DD/YYYY — GHL custom fields usam formato americano
    --    DEVE vir ANTES do formato brasileiro para evitar inversão
    --    (ex: "03/07/2026" = março 7, não julho 3)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'MM/DD/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 4. DD/MM/YYYY — fallback para entradas em formato brasileiro
    BEGIN
        v_result := TO_DATE(v_cleaned, 'DD/MM/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date IS
'Converte string de data para timestamptz de forma segura.
Ordem dos formatos: ISO8601 timestamp → YYYY-MM-DD → MM/DD/YYYY (GHL) → DD/MM/YYYY (fallback).
IMPORTANTE: MM/DD/YYYY vem antes de DD/MM/YYYY porque campos customizados do GHL usam formato americano.
Corrigido em 2026-03-11 (era DD/MM antes de MM/DD, invertendo datas ambíguas).';

-- Atualizar também parse_safe_date_only para herdar a correção automaticamente
-- (a função já delega para parse_safe_date, então nenhuma mudança necessária)
-- Apenas recriar o comentário para deixar rastro da correção
COMMENT ON FUNCTION public.parse_safe_date_only IS
'Converte string de data para date de forma segura (sem timezone).
Delega para parse_safe_date() — herdou a correção MM/DD/YYYY de 2026-03-11.';
