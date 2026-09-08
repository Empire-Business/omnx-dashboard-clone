-- Migration: backfill inicial de sdr_name a partir de contatos.owner_name
--
-- Contexto: acabamos de adicionar oportunidades.sdr_name (NULL por padrão).
-- Sem este backfill, TODAS as ~4770 opps existentes teriam sdr_name = NULL,
-- causando flood de jobs na fila do cron sync-opp-sdr na primeira execução.
--
-- Estratégia: pré-preencher sdr_name com o owner_name do contato associado.
-- Este valor é um "ponto de partida" — o cron vai progressivamente refinar
-- cada opp com o valor correto da API de followers.
--
-- Opps sem contato ou com contato sem owner_name ficam NULL
-- (o cron as processa e aplica o fallback correto).

UPDATE oportunidades o
SET sdr_name = c.owner_name
FROM contatos c
WHERE o.contato_id = c.id
  AND o.sdr_name IS NULL
  AND c.owner_name IS NOT NULL
  AND c.owner_name != '';

-- Log do resultado
DO $$
DECLARE
  v_preenchidas INTEGER;
  v_null_restantes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_preenchidas
  FROM oportunidades
  WHERE sdr_name IS NOT NULL;

  SELECT COUNT(*) INTO v_null_restantes
  FROM oportunidades
  WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL;

  RAISE NOTICE '=== Backfill sdr_name concluído ===';
  RAISE NOTICE 'Preenchidas: %', v_preenchidas;
  RAISE NOTICE 'Ainda NULL (sem owner_name no contato): %', v_null_restantes;
  RAISE NOTICE 'O cron sync-opp-sdr processará as restantes via API.';
END;
$$;
