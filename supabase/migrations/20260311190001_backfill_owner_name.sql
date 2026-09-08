-- ============================================================
-- Migration: Backfill owner_name / owner_email para contatos
--            que ficaram com NULL por causa do bug anterior.
-- Fonte: webhook mais recente de cada contato que contém
--        customData->>'Owner (SDR ou SS)' preenchido.
-- Data: 2026-03-11
-- ============================================================

-- PASSO 1: Atualizar contatos com owner_name NULL buscando do webhook mais recente
UPDATE contatos c
SET
    owner_name  = wh.owner_name,
    owner_email = wh.owner_email,
    updated_at  = NOW()
FROM (
    SELECT DISTINCT ON (TRIM(w.payload->>'contact_id'))
        TRIM(w.payload->>'contact_id') AS ghl_id,
        NULLIF(TRIM(w.payload->'customData'->>'Owner (SDR ou SS)'), '') AS owner_name,
        NULLIF(TRIM(w.payload->'customData'->>'E-mail Owner'), '')      AS owner_email
    FROM webhooks_ghl w
    WHERE TRIM(COALESCE(w.payload->'customData'->>'Owner (SDR ou SS)', '')) != ''
      AND TRIM(COALESCE(w.payload->'customData'->>'Owner (SDR ou SS)', '')) != 'undefined'
    ORDER BY TRIM(w.payload->>'contact_id'), w.created_at DESC
) wh
WHERE c.ghl_id     = wh.ghl_id
  AND wh.owner_name IS NOT NULL
  AND (c.owner_name IS NULL OR c.owner_name = '');

-- PASSO 2: Sincronizar sdr_name / sdr_email em comunicacoes existentes
-- Executado condicionalmente: só roda se a coluna sdr_name existir na tabela.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'comunicacoes'
          AND column_name  = 'sdr_name'
    ) THEN
        UPDATE comunicacoes cm
        SET
            sdr_name  = c.owner_name,
            sdr_email = c.owner_email
        FROM contatos c
        WHERE cm.contato_id = c.id
          AND c.owner_name  IS NOT NULL
          AND c.owner_name  != ''
          AND (cm.sdr_name IS NULL OR cm.sdr_name = '');
    END IF;
END;
$$;
