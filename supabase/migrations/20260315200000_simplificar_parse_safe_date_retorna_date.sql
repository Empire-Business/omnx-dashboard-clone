-- ============================================================
-- Migration: Simplificar parse_safe_date() para retornar DATE
--
-- Motivação:
--   Com as colunas de pipeline agora sendo tipo DATE (não TIMESTAMPTZ),
--   a função parse_safe_date() deve retornar DATE diretamente.
--   Isso elimina toda ambiguidade de timezone no parsing:
--   "7/3/2026 08:40 PM" → DATE '2026-03-07' (sem hora, sem fuso)
--
-- Formatos suportados (ordem de prioridade):
--   1. ISO8601 com hora: "2026-02-21T00:04:11.514Z" → extrai data UTC → DATE
--   2. YYYY-MM-DD puro: "2026-02-21" → DATE
--   3. D/M/YYYY H:MM AM/PM: "7/3/2026 08:40 PM" (formato real dos custom fields GHL)
--   4. DD/MM/YYYY: "21/02/2026"
--   5. NULL → NULL
--
-- O que NÃO muda:
--   parse_safe_date_only() — mantida por compatibilidade (já retornava DATE)
-- ============================================================

-- DROP necessário pois PostgreSQL não permite mudar tipo de retorno com CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.parse_safe_date(text);

CREATE FUNCTION public.parse_safe_date(p_date_string text)
RETURNS date AS $$
DECLARE
    v_ts  timestamptz;
    v_cleaned text;
BEGIN
    IF p_date_string IS NULL OR NULLIF(TRIM(p_date_string), '') IS NULL THEN
        RETURN NULL;
    END IF;

    v_cleaned := TRIM(p_date_string);

    -- 1. ISO8601 com hora (ex: "2026-02-21T00:04:11.514Z" ou "2026-02-21")
    --    Restrito a strings que começam com YYYY- para evitar capturar D/M/YYYY pelo datestyle MDY
    IF v_cleaned ~ '^\d{4}-' THEN
        BEGIN
            RETURN (v_cleaned::timestamptz)::date;
        EXCEPTION WHEN OTHERS THEN
        END;
    END IF;

    -- 2. D/M/YYYY H:MM AM/PM — formato real dos campos customizados do GHL
    --    Ex: "7/3/2026 08:40 PM" = 7 de março de 2026
    BEGIN
        v_ts := TO_TIMESTAMP(v_cleaned, 'FMDD/FMMM/YYYY FMHH12:MI AM');
        RETURN v_ts::date;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 3. DD/MM/YYYY — data brasileira sem hora
    BEGIN
        RETURN TO_DATE(v_cleaned, 'DD/MM/YYYY');
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date IS
'Converte string de data para DATE (sem hora, sem fuso).
Formatos suportados em ordem: ISO8601 (YYYY-...) → D/M/YYYY H:MM AM/PM (GHL) → DD/MM/YYYY.
Retorna NULL se nenhum formato casar.
Alterado em 2026-03-15: era TIMESTAMPTZ, agora DATE — alinhado às colunas DATE da tabela oportunidades.';

-- parse_safe_date_only() mantida por compatibilidade — agora é alias de parse_safe_date()
CREATE OR REPLACE FUNCTION public.parse_safe_date_only(p_date_string text)
RETURNS date AS $$
BEGIN
    RETURN public.parse_safe_date(p_date_string);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
