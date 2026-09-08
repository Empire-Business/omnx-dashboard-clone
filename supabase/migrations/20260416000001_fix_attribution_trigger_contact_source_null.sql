-- ============================================================
-- Fix: trigger trg_attribution_on_contact excluía contatos com
-- contact_source NULL, impedindo repair de UTMs em leads do Facebook
-- onde o GHL não preencheu esse campo.
--
-- Problema: a condição original era:
--   IF NOT (LOWER(COALESCE(NEW.contact_source, '')) LIKE 'facebook%')
-- Isso resulta em FALSE para contact_source IS NULL (COALESCE → ''),
-- então o trigger retornava sem enfileirar o job.
--
-- A tag [cp] form-fb é a fonte de verdade para identificar leads de
-- formulário do Facebook. contact_source é auxiliar e pode ser NULL.
-- Solução: aceitar contact_source IS NULL OU começando com 'facebook'.
-- ============================================================

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

  -- contact_source: aceita NULL (GHL nem sempre preenche) ou começando com 'facebook'.
  -- A tag [cp] form-fb é suficiente para identificar o lead como Facebook form.
  IF NEW.contact_source IS NOT NULL
     AND LOWER(NEW.contact_source) NOT LIKE 'facebook%'
  THEN RETURN NEW; END IF;

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
