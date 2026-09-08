-- Fix: requeue_stale_contact_opp_sync_queue falhava com unique constraint
-- quando um item stale 'processing' tentava voltar para 'pending' mas já
-- existia uma entrada 'pending' para o mesmo ghl_contact_id.
--
-- Cenário: webhook chegou enquanto item antigo estava stuck em processing.
-- Agora temos: processing(stale) + pending(novo) para o mesmo contato.
-- O processing stale pode ser DELETADO — o pending novo já cobre o trabalho.

CREATE OR REPLACE FUNCTION public.requeue_stale_contact_opp_sync_queue(
  p_stale_after_minutes INT DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted  INTEGER := 0;
  v_requeued INTEGER := 0;
BEGIN
  -- Passo 1: deletar itens stale cujo contato já tem um 'pending' novo.
  -- Não faz sentido requeue — o pending mais recente vai cobrir o trabalho.
  DELETE FROM public.contact_opp_sync_queue stale
  WHERE stale.status = 'processing'
    AND (
      stale.claimed_at IS NULL
      OR stale.claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    )
    AND EXISTS (
      SELECT 1
      FROM public.contact_opp_sync_queue newer
      WHERE newer.ghl_contact_id = stale.ghl_contact_id
        AND newer.status = 'pending'
        AND newer.id <> stale.id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Passo 2: recolocar em pending os stale que NÃO têm pending duplicado.
  UPDATE public.contact_opp_sync_queue
  SET
    status    = 'pending',
    claimed_at = NULL
  WHERE status = 'processing'
    AND (
      claimed_at IS NULL
      OR claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    );

  GET DIAGNOSTICS v_requeued = ROW_COUNT;
  RETURN v_deleted + v_requeued;
END;
$$;
