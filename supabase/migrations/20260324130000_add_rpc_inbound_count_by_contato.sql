-- RPC: get_inbound_count_by_contato
-- Dado um array de contato_ids, retorna a contagem histórica total
-- de mensagens inbound (lead → SDR) por contato.
--
-- Recebe array para evitar o bug de truncamento PostgREST max_rows=1000:
-- ao passar só os IDs relevantes, o resultado nunca excede o limite.

CREATE OR REPLACE FUNCTION get_inbound_count_by_contato(p_contato_ids UUID[])
RETURNS TABLE (contato_id UUID, total_inbound BIGINT)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT c.contato_id, COUNT(*) AS total_inbound
  FROM comunicacoes c
  WHERE c.direction = 'inbound'
    AND c.contato_id = ANY(p_contato_ids)
  GROUP BY c.contato_id;
$$;
