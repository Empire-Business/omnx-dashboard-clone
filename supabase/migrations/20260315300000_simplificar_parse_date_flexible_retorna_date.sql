-- ============================================================
-- Migration: Simplificar parse_date_flexible() para retornar DATE
--
-- Motivação:
--   Com parse_safe_date() agora retornando DATE e as colunas de pipeline
--   sendo tipo DATE, parse_date_flexible() também deve retornar DATE.
--   Remove a necessidade de USING ::TIMESTAMPTZ em qualquer parte do código.
--
-- Regras de validação (mantidas):
--   - Rejeita datas antes de 2020-01-01
--   - Rejeita datas > 30 dias no futuro
--   - Se inválido, retorna NULL (permite fallback correto)
-- ============================================================

-- DROP necessário pois PostgreSQL não permite mudar tipo de retorno com CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.parse_date_flexible(text);

CREATE FUNCTION public.parse_date_flexible(date_str text)
RETURNS date AS $$
DECLARE
    v_result date;
BEGIN
    v_result := parse_safe_date(date_str);

    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;

    -- Rejeitar datas impossíveis para dados de pipeline
    IF v_result < '2020-01-01'::date
       OR v_result > CURRENT_DATE + 30 THEN
        RETURN NULL;
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_date_flexible IS
'Converte string de data para DATE com validação de range.
Reutiliza parse_safe_date() mas rejeita:
  - Datas antes de 2020-01-01
  - Datas > 30 dias no futuro (protege contra parsing errado, ex: MM/DD invertido)
Retorna NULL se inválido — permite fallback correto no INSERT/UPDATE.
Alterado em 2026-03-15: era TIMESTAMPTZ, agora DATE — alinhado às colunas DATE da tabela oportunidades.';
