-- ============================================================================
-- Alarme de campanha [cp] órfã
-- ============================================================================
-- Problema que isso previne
--   Campanha "[cp]" é casada por TAG do contato contra o nome cadastrado em
--   `utm_campaigns`. Tag nova no CRM sem campanha cadastrada — ou com grafia
--   diferente (espaço, acento) — simplesmente não aparece no filtro: os leads
--   somem do painel sem erro e sem log.
--
--   Em 2026-07-31 achamos tags nessa situação que estavam invisíveis havia
--   meses (a maior com 3.042 contatos) sem ninguém perceber. Corrigir o
--   cadastro (migration 20261011000000) resolve o passado; esta RPC é o que
--   torna o problema VISÍVEL quando voltar a acontecer.
--
-- Segurança (padrão do projeto, ver docs/VARREDURA-CROSS-TENANT-COMPLETA.md)
--   - SECURITY DEFINER com `search_path` fixo;
--   - checagem explícita de `is_workspace_member` (service_role isento);
--   - EXECUTE revogado de PUBLIC/anon — revogação explícita, porque
--     `REVOKE ... FROM PUBLIC` não remove grant explícito de anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.listar_campanhas_cp_orfas(p_workspace_id uuid)
RETURNS TABLE (
  tag              text,
  contatos         bigint,
  primeiro_contato timestamptz,
  ultimo_contato   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_workspace_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.tag,
         t.contatos,
         t.primeiro_contato,
         t.ultimo_contato
    FROM (
      SELECT (array_agg(trim(x.tag_raw) ORDER BY trim(x.tag_raw)))[1] AS tag,
             COUNT(DISTINCT c.id)                                     AS contatos,
             MIN(c.date_created)                                      AS primeiro_contato,
             MAX(c.date_created)                                      AS ultimo_contato,
             lower(trim(x.tag_raw))                                   AS tag_norm
        FROM contatos c
        CROSS JOIN LATERAL unnest(string_to_array(c.tags, ',')) AS x(tag_raw)
       WHERE c.workspace_id = p_workspace_id
         AND lower(trim(x.tag_raw)) LIKE '[cp]%'
       GROUP BY lower(trim(x.tag_raw))
    ) t
   WHERE NOT EXISTS (
     SELECT 1
       FROM utm_campaigns u
      WHERE u.workspace_id = p_workspace_id
        AND lower(u.nome) = t.tag_norm
   )
   ORDER BY t.contatos DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_campanhas_cp_orfas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_campanhas_cp_orfas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_campanhas_cp_orfas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_campanhas_cp_orfas(uuid) TO service_role;

COMMENT ON FUNCTION public.listar_campanhas_cp_orfas(uuid) IS
  'Tags [cp] presentes em contatos do workspace que nao possuem campanha correspondente em utm_campaigns. Alimenta o alerta da aba Traqueamento > Cods UTM.';
