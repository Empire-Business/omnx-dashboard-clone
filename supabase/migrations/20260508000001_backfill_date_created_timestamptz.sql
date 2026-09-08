-- ============================================================
-- Migration: Backfill contatos.date_created como TIMESTAMPTZ correto
--
-- PROBLEMA:
--   Contatos criados ANTES de 2026-03-15 podem ter date_created
--   armazenado como meia-noite UTC (= 21:00 BRT do dia anterior),
--   porque parse_safe_date() retornava apenas DATE antes da correção.
--   Resultado visual: datas de criação aparecem "3h a menos" do esperado.
--
-- SOLUÇÃO:
--   Reler date_created diretamente do payload JSONB dos webhooks_ghl
--   como TIMESTAMPTZ completo (com hora e fuso), usando a extração
--   segura via regex para garantir que só valores ISO sejam atualizados.
--
-- CRITÉRIO:
--   Só atualiza contatos onde date_created tem hora = 00:00:00
--   (indica armazenamento como DATE convertido para TIMESTAMPTZ midnight UTC).
-- ============================================================

UPDATE contatos c
SET date_created = (
    SELECT
        CASE
            -- Tenta cast direto para TIMESTAMPTZ se parecer ISO8601
            WHEN TRIM(w.payload->>'date_created') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
            THEN NULLIF(TRIM(w.payload->>'date_created'), '')::TIMESTAMPTZ
            ELSE NULL
        END
    FROM webhooks_ghl w
    WHERE TRIM(w.payload->>'contact_id') = c.ghl_id
      AND TRIM(COALESCE(w.payload->>'date_created', '')) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
    ORDER BY w.created_at DESC
    LIMIT 1
)
WHERE c.ghl_id IS NOT NULL
  -- Só corrige registros cujo date_created tem hora exatamente 00:00:00 UTC
  -- (síntoma do armazenamento como DATE convertido para TIMESTAMPTZ midnight)
  AND c.date_created IS NOT NULL
  AND EXTRACT(HOUR   FROM c.date_created AT TIME ZONE 'UTC') = 0
  AND EXTRACT(MINUTE FROM c.date_created AT TIME ZONE 'UTC') = 0
  AND EXTRACT(SECOND FROM c.date_created AT TIME ZONE 'UTC') = 0;

COMMENT ON COLUMN contatos.date_created IS
'Data/hora de criação do contato no GHL. Armazenada como TIMESTAMPTZ UTC.
Para exibição em BRT: usar fmtDateTime() no frontend (aplica America/Sao_Paulo).
Backfill aplicado em 2026-05-08 para corrigir registros onde hora estava zerada.';
