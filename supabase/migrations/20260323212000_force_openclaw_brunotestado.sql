-- Forçar disparo do trigger OpenClaw para brunotestado@gmail.com
-- O link já estava no banco quando o trigger foi recriado, então não disparou.
-- Estratégia: zerar o link e depois restaurar → trigger detecta NULL → NOT NULL e envia.

DO $$
DECLARE v_vf_id UUID; v_link TEXT;
BEGIN
  -- Pegar id e link atual
  SELECT vf.id, vf.op_link_do_contrato_assinado
  INTO v_vf_id, v_link
  FROM vendas_fechamento vf
  JOIN oportunidades o ON o.id = vf.oportunidade_id
  JOIN contatos c ON c.id = o.contato_id
  WHERE c.email = 'brunotestado@gmail.com'
    AND vf.op_link_do_contrato_assinado IS NOT NULL
    AND vf.op_link_do_contrato_assinado NOT LIKE '%instagram%'
  LIMIT 1;

  IF v_vf_id IS NULL THEN
    RAISE NOTICE 'Nenhum registro encontrado com link válido';
    RETURN;
  END IF;

  RAISE NOTICE 'Disparando OpenClaw para vf_id=% | link=%', v_vf_id, v_link;

  -- Zerar o link (sem trigger — UPDATE direto bypass via função SECURITY DEFINER não funciona,
  -- então precisamos usar UPDATE que o trigger vai capturar a transição NULL → preenchido)
  UPDATE vendas_fechamento SET op_link_do_contrato_assinado = NULL WHERE id = v_vf_id;

  -- Restaurar — o trigger detecta NULL → NOT NULL e envia ao OpenClaw
  UPDATE vendas_fechamento SET op_link_do_contrato_assinado = v_link WHERE id = v_vf_id;

  RAISE NOTICE 'Concluído — trigger OpenClaw acionado';
END $$;
