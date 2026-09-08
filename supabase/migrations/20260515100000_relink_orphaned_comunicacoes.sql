-- ============================================================
-- RELINK: Re-vincular comunicacoes com contato_id = NULL
-- ============================================================
-- Contexto: sync-ghl-conversations pode inserir mensagens com
-- contato_id=NULL quando o contato ainda nao existe em `contatos`
-- no momento do sync. Quando o contato é criado depois, as mensagens
-- ficam orphas porque o trigger existente (tr_fill_comunicacao_contato_id)
-- só cobre novos INSERTs em `comunicacoes`, nao o lado do `contatos`.
--
-- Esta migration faz:
--   1. Backfill imediato das 61 mensagens orphas existentes
--   2. Trigger em `contatos` para re-linkar automaticamente quando
--      um contato é inserido ou tem email/telefone atualizado

-- ── Step 1: Backfill por email (case-insensitive) ──────────────
UPDATE comunicacoes c
SET contato_id = ct.id
FROM contatos ct
WHERE c.contato_id IS NULL
  AND c.contato_email IS NOT NULL
  AND c.contato_email <> ''
  AND LOWER(ct.email) = LOWER(c.contato_email);

-- ── Step 2: Backfill por telefone (normalizado: só dígitos) ────
UPDATE comunicacoes c
SET contato_id = ct.id
FROM contatos ct
WHERE c.contato_id IS NULL
  AND c.contato_telefone IS NOT NULL
  AND c.contato_telefone <> ''
  AND REGEXP_REPLACE(ct.telefone, '[^0-9]', '', 'g')
    = REGEXP_REPLACE(c.contato_telefone, '[^0-9]', '', 'g');

-- ── Step 3: Funcao para re-linkar quando contato é criado/atualizado ──
CREATE OR REPLACE FUNCTION relink_comunicacoes_for_contato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Re-link por email
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE comunicacoes
    SET contato_id = NEW.id
    WHERE contato_id IS NULL
      AND contato_email IS NOT NULL
      AND contato_email <> ''
      AND LOWER(contato_email) = LOWER(NEW.email);
  END IF;

  -- Re-link por telefone (normalizado)
  IF NEW.telefone IS NOT NULL AND NEW.telefone <> '' THEN
    UPDATE comunicacoes
    SET contato_id = NEW.id
    WHERE contato_id IS NULL
      AND contato_telefone IS NOT NULL
      AND contato_telefone <> ''
      AND REGEXP_REPLACE(contato_telefone, '[^0-9]', '', 'g')
        = REGEXP_REPLACE(NEW.telefone, '[^0-9]', '', 'g');
  END IF;

  RETURN NEW;
END;
$$;

-- ── Step 4: Trigger AFTER INSERT OR UPDATE em contatos ─────────
CREATE TRIGGER tr_relink_comunicacoes_on_contato_change
AFTER INSERT OR UPDATE OF email, telefone ON contatos
FOR EACH ROW EXECUTE FUNCTION relink_comunicacoes_for_contato();

-- ── Step 5: Log do resultado ────────────────────────────────────
DO $$
DECLARE
  v_still_null INT;
  v_total      INT;
BEGIN
  SELECT COUNT(*) INTO v_still_null FROM comunicacoes WHERE contato_id IS NULL;
  SELECT COUNT(*) INTO v_total      FROM comunicacoes;
  RAISE NOTICE 'relink_orphaned_comunicacoes: % / % ainda NULL após backfill', v_still_null, v_total;
END $$;
