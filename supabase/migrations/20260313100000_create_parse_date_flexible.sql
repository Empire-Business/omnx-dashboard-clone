-- ============================================================
-- Migration: Criar parse_date_flexible com validação de range
--
-- Problema identificado:
--   A função parse_date_flexible() existe no banco mas NUNCA foi criada
--   por migration. É uma função "manual" sem versão de código controlada.
--   Além disso, ela não tinha validação de range — datas futuras > 30 dias
--   não eram rejeitadas, causando problemas como "12/02/2026" → dezembro.
--
-- Solução:
--   Criar parse_date_flexible() como migration controlada, reutilizando
--   a base de parse_safe_date() mas adicionando validação de range:
--   - Rejeita datas antes de 2020-01-01 (evita epoch, timestamps inválidos)
--   - Rejeita datas > 30 dias no futuro (protege contra 12/02 → dezembro)
--   - Se rejeitado, retorna NULL → função pode usar fallback correto
--
-- Impacto:
--   Novo INSERT/UPDATE de oportunidades com campos customizados inválidos
--   (ex: "12/03/2099") resultarão em NULL automaticamente.
--   O fallback então usará date_created ou outro campo confiável.
-- ============================================================

CREATE OR REPLACE FUNCTION public.parse_date_flexible(date_str text)
RETURNS timestamptz AS $$
DECLARE
    v_result timestamptz;
BEGIN
    -- Usar parse_safe_date() como base de parsing
    v_result := parse_safe_date(date_str);

    -- Se parsing falhou, retorna NULL
    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;

    -- Validação de range:
    -- 1. Rejeita datas muito antigas (antes de 2020-01-01)
    --    Evita epoch, timestamps de sistema, valores incorretos
    -- 2. Rejeita datas > 30 dias no futuro
    --    Agendamentos legítimos têm até ~15 dias (reuniões), tolerância de 30d
    --    Datas de pipeline (conectado, fechado, etc) NUNCA devem ser futuras.
    --    Se resulta futura > 30d, é erro de parsing (ex: MM/DD invertido)
    IF v_result < '2020-01-01'::timestamptz
       OR v_result > NOW() + INTERVAL '30 days' THEN
        RETURN NULL;
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.parse_date_flexible IS
'Converte string de data para timestamptz com validação de range.
Reutiliza parse_safe_date() mas rejeita:
  - Datas antes de 2020-01-01 (evita epoch/inválidos)
  - Datas > 30 dias no futuro (protege contra parsing errado, ex: MM/DD invertido)
Se validação falha, retorna NULL → permite fallback correto (date_created, outro campo).
Usado em INSERT/UPDATE de oportunidades para proteger contra datas impossíveis no webhook.';
