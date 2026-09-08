-- ============================================================
-- Fix: attribution imediata para novos leads form-fb
--
-- Problema: o cron de 5 min chama a edge function via net.http_post
-- (fire-and-forget). Se a edge function falhar silenciosamente,
-- leads novos ficam sem UTM indefinidamente.
--
-- Solução:
-- 1. Trigger direto no banco: quando um contato qualificado é
--    inserido ou atualizado, enfileira o job de attribution
--    imediatamente via enqueue_ghl_api_job — sem depender da edge.
-- 2. Colunas attribution_attempts + attribution_skip para evitar
--    loop infinito em contatos sem attributionSource no GHL.
-- ============================================================

-- --------------------------------------------------------
-- Novas colunas em contatos
-- --------------------------------------------------------

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS attribution_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_skip BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.contatos.attribution_attempts IS
'Número de vezes que tentamos resolver attribution sem sucesso para este contato.';

COMMENT ON COLUMN public.contatos.attribution_skip IS
'Quando TRUE, a cron e o trigger não enfileiram mais jobs de attribution para este contato (attribution exaurida).';

-- --------------------------------------------------------
-- Função do trigger
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_enqueue_attribution_on_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot        TEXT;
  v_idempotency TEXT;
  v_base_url    TEXT := 'https://services.leadconnectorhq.com/contacts/';
BEGIN
  -- Pré-condições obrigatórias
  IF NEW.ghl_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.attribution_skip THEN RETURN NEW; END IF;
  IF NOT (LOWER(COALESCE(NEW.tags, '')) LIKE '%[cp] form-fb%') THEN RETURN NEW; END IF;
  IF NOT (LOWER(COALESCE(NEW.contact_source, '')) LIKE 'facebook%') THEN RETURN NEW; END IF;

  -- Só age se ainda há campo base vazio
  IF NEW.utm_source IS NOT NULL
     AND NEW.utm_campaign IS NOT NULL
     AND NEW.utm_medium IS NOT NULL
     AND NEW.utm_content IS NOT NULL
     AND NEW.utm_term IS NOT NULL
  THEN RETURN NEW; END IF;

  -- Calcula slot de 5 min (mesmo padrão do TypeScript)
  v_slot := to_char(
    date_trunc('hour', NOW()) +
    (floor(extract(minute FROM NOW()) / 5.0) * interval '5 minutes'),
    'YYYY-MM-DD"T"HH24:MI'
  );

  v_idempotency := 'sync-contact-attribution-fetch:' || NEW.id::text || ':' || v_slot;

  -- Enfileira (ON CONFLICT DO NOTHING via unique index de jobs ativos)
  PERFORM public.enqueue_ghl_api_job(
    p_url             := v_base_url || NEW.ghl_id,
    p_method          := 'GET',
    p_body            := NULL,
    p_priority        := 2,
    p_caller          := 'sync-contact-attribution-fetch',
    p_idempotency_key := v_idempotency,
    p_context         := jsonb_build_object(
                           'contato_id', NEW.id,
                           'ghl_id',     NEW.ghl_id,
                           'reason',     'facebook_form_missing_utm_trigger'
                         ),
    p_max_attempts    := 6
  );

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------
-- Trigger em contatos
-- --------------------------------------------------------

DROP TRIGGER IF EXISTS trg_attribution_on_contact ON public.contatos;

CREATE TRIGGER trg_attribution_on_contact
  AFTER INSERT OR UPDATE OF tags, contact_source,
    utm_source, utm_campaign, utm_medium, utm_content, utm_term,
    attribution_skip
  ON public.contatos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_enqueue_attribution_on_contact();

-- --------------------------------------------------------
-- Marcar os 2 contatos conhecidos sem attributionSource
-- como skip para parar o loop infinito
-- Rubens Cunha  : 23186f02-473a-4ab7-b2f2-df284d6c20fc
-- Tatiana Coelho: 44161bf9-1278-4829-97d1-f4f46ba96894
-- --------------------------------------------------------

UPDATE public.contatos
SET
  attribution_skip     = TRUE,
  attribution_attempts = 99
WHERE id IN (
  '23186f02-473a-4ab7-b2f2-df284d6c20fc',
  '44161bf9-1278-4829-97d1-f4f46ba96894'
);
