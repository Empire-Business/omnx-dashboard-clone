-- ============================================
-- TRIGGER: Auto-preencher contato_id em comunicacoes
-- ============================================
-- Problema: Comunicacoes chegam com contato_id=NULL se o contato ainda nao existia no momento do sync
-- Solucao: Trigger BEFORE INSERT tenta preencher contato_id pelo email (primario) ou telefone (fallback)
-- Status: Preventivo — dados ja estao completos, mas evita regressao

-- Step 1: Criar funcao para auto-preencher contato_id por EMAIL
CREATE OR REPLACE FUNCTION fill_comunicacao_contato_id_by_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Se contato_id ja vem preenchido, respeitar
  IF NEW.contato_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Se contato_email vem preenchido, tentar lookup por email
  IF NEW.contato_email IS NOT NULL THEN
    SELECT id INTO NEW.contato_id
    FROM contatos
    WHERE email = NEW.contato_email
    LIMIT 1;

    -- Se encontrou, retornar com contato_id preenchido
    IF NEW.contato_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Se nao achou por email mas tem telefone, tentar fallback por telefone
  IF NEW.contato_telefone IS NOT NULL THEN
    SELECT id INTO NEW.contato_id
    FROM contatos
    WHERE telefone = NEW.contato_telefone
    LIMIT 1;
  END IF;

  -- Se ainda nao achou ou ambos NULL, deixar como chegou (NULL permitido)
  RETURN NEW;
END;
$$;

-- Step 2: Criar trigger BEFORE INSERT
CREATE TRIGGER tr_fill_comunicacao_contato_id
BEFORE INSERT ON comunicacoes
FOR EACH ROW
EXECUTE FUNCTION fill_comunicacao_contato_id_by_email();

-- Step 3: Backfill de seguranca — preencher qualquer NULL remanescente por EMAIL
UPDATE comunicacoes c
SET contato_id = ct.id
FROM contatos ct
WHERE c.contato_id IS NULL
  AND c.contato_email IS NOT NULL
  AND ct.email = c.contato_email;

-- Step 4: Segundo backfill por TELEFONE (para contatos sem email)
UPDATE comunicacoes c
SET contato_id = ct.id
FROM contatos ct
WHERE c.contato_id IS NULL
  AND c.contato_telefone IS NOT NULL
  AND ct.telefone = c.contato_telefone;

-- Step 5: Log do resultado
DO $$
DECLARE
  v_still_null INT;
BEGIN
  SELECT COUNT(*) INTO v_still_null
  FROM comunicacoes
  WHERE contato_id IS NULL;

  RAISE NOTICE 'comunicacoes auto-fill trigger installed. Still NULL after backfill: %', v_still_null;
END $$;
