-- Fase 1.2 — Função de match para a ponte EmpireDesk → vendas_fechamento
-- Recebe telefone e/ou e-mail e devolve os contatos candidatos com suas
-- oportunidades (mais recente primeiro). Consumida pela edge function crm-buscar-lead.
-- Match de telefone: compara os ULTIMOS 8 dígitos (ignora DDI/nono dígito).

CREATE OR REPLACE FUNCTION public.buscar_lead_para_venda(
  p_telefone text DEFAULT NULL,
  p_email    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_digits text;
  v_tel_core   text;
  v_email      text;
  v_result     jsonb;
BEGIN
  v_tel_digits := NULLIF(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g'), '');
  v_tel_core   := CASE
                    WHEN v_tel_digits IS NOT NULL AND length(v_tel_digits) >= 8
                    THEN right(v_tel_digits, 8)
                    ELSE NULL
                  END;
  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');

  IF v_tel_core IS NULL AND v_email IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(cand), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ct.id                                                   AS contato_id,
      ct.nome                                                 AS contato_nome,
      ct.email                                                AS contato_email,
      ct.telefone                                             AS contato_telefone,
      CASE
        WHEN v_tel_core IS NOT NULL
             AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core
          THEN 'telefone'
        ELSE 'email'
      END                                                     AS match_por,
      COALESCE((
        SELECT jsonb_agg(op_row ORDER BY op_row.data_lead_recebido DESC NULLS LAST)
        FROM (
          SELECT
            op.id              AS oportunidade_id,
            op.titulo          AS titulo,
            op.pipeline_name   AS pipeline_name,
            op.status          AS status,
            op.data_lead_recebido,
            op.sdr_name        AS sdr_name,
            op.vendedor_closer AS vendedor_closer
          FROM public.oportunidades op
          WHERE op.contato_id = ct.id
        ) op_row
      ), '[]'::jsonb)                                         AS oportunidades
    FROM public.contatos ct
    WHERE
      (v_tel_core IS NOT NULL
        AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core)
      OR (v_email IS NOT NULL AND lower(ct.email) = v_email)
    LIMIT 25
  ) cand;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.buscar_lead_para_venda(text, text) IS
  'Ponte EmpireDesk: retorna contatos candidatos (com oportunidades, mais recente primeiro) para uma venda, casando por telefone (ultimos 8 digitos) ou e-mail.';
