-- RPC: location ID do CRM (GHL) visivel para QUALQUER membro do workspace.
--
-- Problema corrigido: o link "Abrir no CRM" do card do lead depende de
-- `ghl_integration_settings.ghl_location_id`, mas a RLS dessa tabela so libera
-- SELECT para owner/admin (a linha tambem guarda `webhook_secret`). Resultado:
-- para SDR/pre-vendedor (role `member`) o hook devolvia NULL e a UI escondia o
-- link em silencio -- exatamente quem mais precisa abrir o contato no CRM.
--
-- Solucao: expor SO o `ghl_location_id` (identificador publico, aparece na
-- propria URL do CRM) via funcao SECURITY DEFINER, sem afrouxar a RLS da tabela
-- nem expor o `webhook_secret`.
CREATE OR REPLACE FUNCTION public.get_workspace_ghl_location_id(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT g.ghl_location_id
  FROM public.ghl_integration_settings g
  WHERE g.workspace_id = p_workspace_id
    AND g.is_active
    -- Fail-closed: sem vinculo com o workspace, nao devolve nada.
    AND (
      public.is_workspace_member(p_workspace_id)
      OR public.can_access_workspace_via_agency(p_workspace_id)
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_workspace_ghl_location_id(UUID) IS
  'Location ID do CRM (GHL) do workspace, para montar o link "Abrir no CRM". '
  'Visivel a qualquer membro ativo do workspace (ou admin da agencia). '
  'Nao expoe webhook_secret -- a RLS de ghl_integration_settings continua '
  'restrita a owner/admin.';

-- `anon` nunca executa: a funcao depende de auth.uid() e sem sessao retornaria
-- NULL de qualquer forma, mas o REVOKE deixa a intencao explicita e evita que
-- a funcao vire oraculo de existencia de workspace.
REVOKE ALL ON FUNCTION public.get_workspace_ghl_location_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_workspace_ghl_location_id(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_ghl_location_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_ghl_location_id(UUID) TO service_role;
