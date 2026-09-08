-- ============================================================
-- Migration: Corrigir parse_safe_date para formato real do GHL
--
-- Diagnóstico (2026-03-11):
--   GHL envia campos customizados de data no formato:
--     "D/M/YYYY H:MM AM/PM"  (ex: "7/3/2026 08:40 PM" = 7 de março)
--
--   Problema anterior: o branch 1 (::timestamptz) capturava
--   "7/3/2026 08:40 PM" usando DateStyle MDY do Supabase,
--   interpretando como July 3 (M/D/YYYY). Mesmo com DD/MM-first
--   na ordem seguinte, o cast já tinha "funcionado" — errado.
--
--   Solução:
--   1. Branch 1 (ISO8601): só executa se a string PARECE ISO8601
--      (começa com YYYY- ou contém T seguido de dígitos)
--   2. Branch 2 (GHL datetime): formato explícito "FMDD/FMMM/YYYY HH12:MI AM"
--      cobre o formato real dos campos customizados do GHL
--   3. Branch 3: DD/MM/YYYY (datas sem hora, formato brasileiro)
--   4. Branch 4: YYYY-MM-DD
--   5. Branch 5: MM/DD/YYYY (fallback)
--
-- Exemplo confirmado:
--   "7/3/2026 08:40 PM" → branch 2 → 2026-03-07 20:40:00  ✓
--   "2026-03-07T23:40:03Z" → branch 1 → 2026-03-07 23:40:03 ✓
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

    -- 1. ISO8601 — apenas para strings que realmente parecem ISO8601
    --    (começam com YYYY- ou contêm T seguido de dígitos)
    --    Impede que "7/3/2026 08:40 PM" seja capturada pelo cast MDY do Supabase
    IF v_cleaned ~ '^\d{4}-' OR v_cleaned ~ 'T\d{2}:' THEN
        BEGIN
            v_result := v_cleaned::timestamptz;
            RETURN v_result;
        EXCEPTION WHEN OTHERS THEN
        END;
    END IF;

    -- 2. D/M/YYYY H:MM AM/PM — formato real dos campos customizados do GHL
    --    Ordem DIA/MÊS (ex: "7/3/2026 08:40 PM" = 7 de março de 2026 às 20:40)
    BEGIN
        v_result := TO_TIMESTAMP(v_cleaned, 'FMDD/FMMM/YYYY FMHH12:MI AM');
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 3. DD/MM/YYYY — data brasileira sem hora
    BEGIN
        v_result := TO_DATE(v_cleaned, 'DD/MM/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 4. YYYY-MM-DD — data ISO sem hora (não capturada pelo branch 1)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'YYYY-MM-DD')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 5. MM/DD/YYYY — formato americano (fallback)
    BEGIN
        v_result := TO_DATE(v_cleaned, 'MM/DD/YYYY')::timestamptz;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_safe_date IS
'Converte string de data para timestamptz de forma segura.
Ordem: ISO8601 (apenas strings com formato YYYY- ou T##:) → D/M/YYYY H:MM AM/PM (GHL custom fields) → DD/MM/YYYY → YYYY-MM-DD → MM/DD/YYYY.
Corrigido 2026-03-11: branch ISO8601 restrito para não capturar strings M/D/YYYY pelo MDY datestyle do Supabase.
Formato GHL confirmado: "7/3/2026 08:40 PM" = 7 de março de 2026 (DD/MM, hora local SP).';
