-- Migration: RPC para o botao "Sincronizar" da Biblioteca de Criativos
--
-- CONTEXTO (reuniao de criativos de 2026-08-28, BUG-02)
--   O botao "Sincronizar" da aba Biblioteca chamava a edge function
--   `notion-creatives-sync` direto do navegador. Isso NUNCA funcionou depois do
--   hardening multi-tenant, por dois motivos encadeados:
--     1. a function tem `requireServiceRoleCaller` (so aceita chamada interna do
--        cron com a service_role_key) -> 401 com o JWT do usuario logado;
--     2. o body do frontend nao mandava `workspace_id`, e a function exige o
--        campo (fail-closed do isolamento) -> 400.
--   O usuario clicava, tomava erro na tela, e concluia que o sync "travava em
--   1000 registros". Os dois fatos eram independentes: o 1000 era truncamento de
--   leitura no frontend (PostgREST max_rows), corrigido em codigo.
--
-- O QUE ESTA MIGRATION FAZ
--   Cria a ponte que faltava, SEM afrouxar o guard da function: uma RPC
--   SECURITY DEFINER que (a) confirma que quem chama e owner/admin do workspace
--   pedido e (b) dispara a function com a service_role_key pelo lado do banco.
--   O segredo nunca chega ao navegador.
--
--   Reusa exatamente o mesmo caminho do cron `notion_sync_creatives_job`
--   (net.http_post + get_secret), so que para UM workspace e sob demanda.
--
-- SEGURANCA
--   - `p_workspace_id` e sempre validado por `is_workspace_admin()`, que resolve
--     `auth.uid()` internamente: nao da para pedir sync do workspace alheio.
--   - EXECUTE revogado de PUBLIC/anon; concedido so a `authenticated`
--     (a checagem de papel acontece dentro da funcao, fail-closed para anon
--     porque `auth.uid()` e NULL e `is_workspace_admin` retorna false).
--   - Exige credencial Notion cadastrada para o workspace; sem ela, erro claro
--     em vez de uma chamada que morreria com 400 do outro lado.

CREATE OR REPLACE FUNCTION public.enqueue_notion_creatives_sync(
  p_workspace_id  uuid,
  p_database_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT;
  v_service_key TEXT;
  v_request_id  BIGINT;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id obrigatorio.' USING ERRCODE = '22023';
  END IF;

  IF p_database_type IS NULL OR p_database_type NOT IN ('paid', 'organic') THEN
    RAISE EXCEPTION 'database_type invalido: % (esperado paid|organic)', p_database_type
      USING ERRCODE = '22023';
  END IF;

  -- Fail-closed: anon tem auth.uid() NULL, entao nunca passa daqui.
  IF NOT public.is_workspace_admin(p_workspace_id) THEN
    RAISE EXCEPTION 'Sem permissao para sincronizar criativos desta conta.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_integration_credentials
    WHERE workspace_id = p_workspace_id
      AND provider = 'notion'
  ) THEN
    RAISE EXCEPTION 'Nenhuma credencial Notion cadastrada para esta conta. Configure em Administracao > Integracoes.'
      USING ERRCODE = '22023';
  END IF;

  v_url         := '' || get_secret('supabase_url') || '/functions/v1/notion-creatives-sync';
  v_service_key := '' || get_secret('service_role_key') || '';

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'database_type',  p_database_type,
      'request_source', 'manual',
      'workspace_id',   p_workspace_id
    )
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'enqueued',      true,
    'request_id',    v_request_id,
    'workspace_id',  p_workspace_id,
    'database_type', p_database_type
  );
END;
$function$;

COMMENT ON FUNCTION public.enqueue_notion_creatives_sync(uuid, text) IS
  'Dispara notion-creatives-sync sob demanda para UM workspace. Exige owner/admin do workspace (is_workspace_admin) e credencial Notion cadastrada. A service_role_key fica no banco — nunca no navegador. Criada para o botao Sincronizar da Biblioteca de Criativos (BUG-02, reuniao 2026-08-28).';

REVOKE ALL ON FUNCTION public.enqueue_notion_creatives_sync(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notion_creatives_sync(uuid, text) TO authenticated, service_role;
