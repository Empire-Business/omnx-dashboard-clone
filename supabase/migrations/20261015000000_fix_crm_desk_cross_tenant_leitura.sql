-- Fecha o vazamento cross-tenant de LEITURA da ponte omnx-desk (PASSO 1 de 2).
--
-- ACHADO (2026-08-05, reproduzido em producao):
--   `buscar_lead_para_venda(p_telefone, p_email)` nao recebe o workspace e a guarda
--   era `auth.role() = 'service_role' OR is_workspace_member(ct.workspace_id)`.
--   A edge function `crm-buscar-lead` conecta com a SERVICE ROLE KEY, entao o primeiro
--   ramo e SEMPRE verdadeiro e a busca varria TODOS os workspaces.
--
--   Prova: telefone que so existe no workspace de demonstracao retornou o contato
--   (nome, e-mail, telefone) + a lista de oportunidades (titulo, funil, SDR, closer)
--   para um chamador autenticado com o secret global do desk.
--
-- CORRECAO:
--   A funcao passa a EXIGIR `p_workspace_id`. `service_role` deixa de ser passe-livre:
--   vira apenas a permissao de *informar* o workspace, que e sempre aplicado como
--   filtro na consulta. Usuario logado continua limitado ao proprio workspace.
--
-- ROLLOUT EM 2 MIGRATIONS, SEM JANELA DE INDISPONIBILIDADE:
--   Esta aqui SO CRIA a assinatura nova de 3 argumentos. A antiga de 2 continua viva,
--   entao o `crm-buscar-lead` que ainda esta em producao segue funcionando.
--   Depois: deploy das edge functions (passam a usar a nova) -> migration
--   `20261015000001` remove a antiga.
--
--   As duas assinaturas NAO sao ambiguas: `p_workspace_id` nao tem DEFAULT, entao uma
--   chamada com 2 argumentos nomeados so casa com a antiga. Verificado em producao
--   (teste com duas funcoes temporarias, removidas em seguida) antes de escolher
--   este caminho.

-- 2. Nova assinatura: workspace obrigatorio e sempre aplicado como filtro.
CREATE OR REPLACE FUNCTION public.buscar_lead_para_venda(
  p_workspace_id uuid,
  p_telefone     text DEFAULT NULL,
  p_email        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tel_digits text;
  v_tel_core   text;
  v_email      text;
  v_result     jsonb;
BEGIN
  -- Fail-closed: sem workspace nao ha busca. Fecha o caminho que vazava.
  IF p_workspace_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- `service_role` pode informar qualquer workspace (a edge function ja provou a posse
  -- do secret daquela conta antes de chamar). Usuario logado so enxerga o proprio.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN '[]'::jsonb;
  END IF;

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
            -- 2a barreira: a oportunidade tambem precisa ser do mesmo workspace.
            AND op.workspace_id = p_workspace_id
        ) op_row
      ), '[]'::jsonb)                                         AS oportunidades
    FROM public.contatos ct
    WHERE
      ct.workspace_id = p_workspace_id   -- <- o filtro que faltava
      AND (
        (v_tel_core IS NOT NULL
          AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core)
        OR (v_email IS NOT NULL AND lower(ct.email) = v_email)
      )
    LIMIT 25
  ) cand;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.buscar_lead_para_venda(uuid, text, text) IS
  'Ponte omnx-desk: contatos candidatos (com oportunidades) por telefone (ultimos 8 digitos) '
  'ou e-mail, SEMPRE restritos a p_workspace_id. Sem workspace retorna vazio (fail-closed).';

-- 3. Permissoes: so a ponte (service_role) chama. `REVOKE ... FROM PUBLIC` nao remove
--    grant explicito de anon/authenticated — por isso os REVOKE nominais.
--    Ver docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md.
REVOKE ALL ON FUNCTION public.buscar_lead_para_venda(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_lead_para_venda(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.buscar_lead_para_venda(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_lead_para_venda(uuid, text, text) TO service_role;
