-- ============================================================================
-- Migration: 20261004000002_fix_clara_dashboard_rpc_cross_tenant_p0.sql
-- ============================================================================
-- NOTA DE FAXINA (2026-07-19, recuperada de um commit órfão de checkpoint —
-- ver docs/handoffs/latest.md): este arquivo usa o padrão `auth.uid() IS NULL`
-- para liberar o caminho de service_role/automação. Esse padrão tem um bug
-- residual (anon key sem sessão também tem `auth.uid() IS NULL`, então
-- também passava pelo bypass). Esse mesmo achado está documentado em
-- docs/VARREDURA-CROSS-TENANT-COMPLETA.md ("o próprio fix do round2 tinha um
-- anon-bypass residual em 6 funções") e foi corrigido pela migration
-- `20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql`, que
-- redefine estas mesmas 6 funções com `auth.role() <> 'service_role'` e
-- revoga EXECUTE de `anon`/`PUBLIC`. Este arquivo é mantido como estava
-- (histórico real do que rodou em produção) — a versão vigente em produção
-- é a da migration 20261006000000, aplicada depois desta na mesma sequência.
-- ============================================================================
-- P0 (achado extra da validação adversarial de 2026-07-19, Agente E do teste
-- multi-agente) — RPCs `SECURITY DEFINER`, GRANTadas para `authenticated`, que
-- NUNCA checam workspace/posse antes de ler ou escrever. Confirmado ao vivo
-- em ambiente de escrita real (não é teoria de código): um usuário do
-- workspace A, autenticado normalmente (anon key + sessão real, sem qualquer
-- bypass), conseguiu:
--   - `get_lead_full(p_opp_id)`               -> ler oportunidade+contato de B
--   - `get_opp_id_by_email(p_email)`          -> descobrir o opp_id de B pelo e-mail
--   - `buscar_lead_para_venda(tel, email)`    -> achar o lead de B por tel/e-mail
--   - `auditoria_sdr_ia(p_workspace_id, ...)` -> ler auditoria de SDR IA de B
--   - `list_weekly_email_schedules()`         -> listar TODOS os agendamentos
--     de e-mail semanal de TODOS os workspaces, sem filtro nenhum
--   - `delete_weekly_email_schedule(p_id)`    -> APAGOU de fato um agendamento
--     de e-mail semanal do workspace B (escrita cross-tenant confirmada)
--
-- Correção: cada função passa a exigir que o CHAMADOR autenticado seja membro
-- do workspace do recurso, seguindo o padrão já usado em `get_workspace_credential_status`
-- (RAISE/filtra com `public.is_workspace_member(...)`). Chamadas via
-- `service_role` (auth.uid() IS NULL — é o caso de toda automação/webhook/
-- edge function com a service key) NÃO são afetadas: a checagem só entra em
-- vigor quando `auth.uid()` está preenchido (sessão de usuário real).
--
-- NÃO CORRIGIDO NESTA MIGRATION (risco aceito, documentado, requer desenho
-- dedicado — ver docs/VALIDACAO-MULTITENANT.md):
--   - `get_contact_workspace_id` / `get_opportunity_workspace_id` — usadas
--     DIRETAMENTE dentro de 30+ políticas RLS (`comunicacoes`, `oportunidades`,
--     `vendas_fechamento`, `ghl_opp_reconcile_items`). REVOGAR o EXECUTE de
--     `authenticated` quebraria toda leitura/escrita autenticada nessas 4
--     tabelas (o Postgres exige EXECUTE na função para o role que avalia a
--     policy, mesmo a função sendo SECURITY DEFINER). Adicionar checagem de
--     posse DENTRO delas também é arriscado — são chamadas por triggers
--     BEFORE INSERT (`set_workspace_id_*`) em contexto de service_role/definer
--     onde `auth.uid()` pode ser NULL por razões legítimas. Continuam
--     utilizáveis como "oráculo" (revelam a qual workspace um ID pertence,
--     sem revelar o conteúdo) por um usuário autenticado qualquer — vazamento
--     de metadado, não de PII, mas real.
--   - `get_user_workspace_ids` / `get_user_admin_workspace_ids` /
--     `get_user_owner_workspace_ids(p_user_id)` — mesma classe (não checam
--     `p_user_id = auth.uid()`), usadas amplamente como helpers internos.
--
-- Idempotente: CREATE OR REPLACE FUNCTION / DROP VIEW + CREATE OR REPLACE VIEW
-- com mesma definição + security_invoker=true.
--
-- NÃO aplicada em produção por esta sessão — testada em ambiente de validação
-- efêmero. Aplicação em produção é decisão do dono.
-- ============================================================================

SET search_path = public, pg_catalog;
SET lock_timeout = '10s';
SET statement_timeout = '5min';

-- ============================================================================
-- 1. get_lead_full — exige que o chamador autenticado seja membro do
--    workspace da oportunidade.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_lead_full(p_opp_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_workspace_id uuid;
BEGIN
  SELECT c.workspace_id INTO v_workspace_id
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  WHERE o.id = p_opp_id;

  IF v_workspace_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.is_workspace_member(v_workspace_id) THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(t) INTO result FROM (
    SELECT o.*,
      (SELECT row_to_json(c.*) FROM contatos c WHERE c.id = o.contato_id) AS contatos
    FROM oportunidades o WHERE o.id = p_opp_id
  ) t;
  RETURN result;
END;
$function$;

-- ============================================================================
-- 2. get_opp_id_by_email — mesmo padrão: filtra pelo workspace do chamador
--    quando há sessão de usuário real.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_opp_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT o.id FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE lower(c.email) = lower(p_email)
      AND (auth.uid() IS NULL OR public.is_workspace_member(c.workspace_id))
    ORDER BY o.data_lead_recebido DESC NULLS LAST LIMIT 1;
$function$;

-- ============================================================================
-- 3. buscar_lead_para_venda — não recebe p_workspace_id (busca por
--    telefone/e-mail); quando chamado por sessão de usuário real, restringe
--    aos workspaces dos quais o chamador é membro ativo. Chamada de
--    service_role (crm-buscar-lead, integração omnx-desk) continua sem
--    filtro — auth.uid() é NULL nesse caminho.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.buscar_lead_para_venda(p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
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
      (
        (v_tel_core IS NOT NULL
          AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core)
        OR (v_email IS NOT NULL AND lower(ct.email) = v_email)
      )
      AND (auth.uid() IS NULL OR public.is_workspace_member(ct.workspace_id))
    LIMIT 25
  ) cand;

  RETURN v_result;
END;
$function$;

-- ============================================================================
-- 4. auditoria_sdr_ia — já recebe p_workspace_id; só faltava a checagem de
--    posse (comparar com a validação que get_workspace_credential_status já
--    faz). Guard adicionado no topo, sem alterar a query em si.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auditoria_sdr_ia(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_include_tags text[] DEFAULT NULL::text[],
  p_exclude_tags text[] DEFAULT NULL::text[],
  p_include_pipelines text[] DEFAULT NULL::text[],
  p_exclude_pipelines text[] DEFAULT NULL::text[],
  p_include_utm_source text[] DEFAULT NULL::text[],
  p_exclude_utm_source text[] DEFAULT NULL::text[],
  p_include_utm_campaign text[] DEFAULT NULL::text[],
  p_exclude_utm_campaign text[] DEFAULT NULL::text[]
)
RETURNS TABLE(contato_id uuid, contato_nome text, contato_email text, contato_telefone text, contato_tags text[], opp_id uuid, sdr_humano text, tipo text, severidade text, detalhes text, ultima_interacao timestamp with time zone, msg_ia integer, msg_lead integer, channel text, error_msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_cutoff_7d timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  v_start_ts := timezone('America/Sao_Paulo', (p_start_date::text || ' 00:00:00')::timestamp);
  v_end_ts   := timezone('America/Sao_Paulo', (p_end_date::text || ' 23:59:59')::timestamp);
  v_cutoff_7d := timezone('America/Sao_Paulo', ((current_date - interval '7 days')::date::text || ' 00:00:00')::timestamp);

  RETURN QUERY
  WITH
  universo AS (
    SELECT DISTINCT c.contato_id
    FROM comunicacoes c
    JOIN contatos ct ON ct.id = c.contato_id
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    WHERE ct.workspace_id = p_workspace_id
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND (p_include_utm_source IS NULL OR p_include_utm_source = '{}'::text[] OR ct.utm_source = ANY(p_include_utm_source))
      AND (p_exclude_utm_source IS NULL OR p_exclude_utm_source = '{}'::text[] OR ct.utm_source IS NULL OR NOT (ct.utm_source = ANY(p_exclude_utm_source)))
      AND (p_include_utm_campaign IS NULL OR p_include_utm_campaign = '{}'::text[] OR ct.utm_campaign::text = ANY(p_include_utm_campaign))
      AND (p_exclude_utm_campaign IS NULL OR p_exclude_utm_campaign = '{}'::text[] OR ct.utm_campaign IS NULL OR NOT (ct.utm_campaign::text = ANY(p_exclude_utm_campaign)))
  ),
  contato_info AS (
    SELECT
      ct.id AS cid,
      ct.nome AS cnome,
      ct.email AS cemail,
      ct.telefone AS ctelefone,
      string_to_array(ct.tags, ',') AS ctags_arr
    FROM contatos ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.id IN (SELECT contato_id FROM universo)
      AND (
        p_include_tags IS NULL OR p_include_tags = '{}'::text[] OR
        ct.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(p_include_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
      AND (
        p_exclude_tags IS NULL OR p_exclude_tags = '{}'::text[] OR
        ct.tags IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p_exclude_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
  ),
  oportunidade_info AS (
    SELECT DISTINCT ON (o.contato_id)
      o.contato_id AS ocid,
      o.id AS oid,
      COALESCE(o.sdr_name, ct.owner_name) AS osdr
    FROM oportunidades o
    JOIN contatos ct ON ct.id = o.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND o.contato_id IN (SELECT cid FROM contato_info)
      AND (p_include_pipelines IS NULL OR p_include_pipelines = '{}'::text[] OR o.pipeline_id = ANY(p_include_pipelines))
      AND (p_exclude_pipelines IS NULL OR p_exclude_pipelines = '{}'::text[] OR NOT (o.pipeline_id = ANY(p_exclude_pipelines)))
    ORDER BY o.contato_id, o.data_lead_recebido DESC NULLS LAST
  ),
  stats AS (
    SELECT
      c.contato_id AS scid,
      COUNT(*) FILTER (WHERE ccr.autor = 'automacao' AND c.direction = 'outbound') AS qtd_ia,
      COUNT(*) FILTER (WHERE c.direction = 'inbound') AS qtd_lead,
      COUNT(*) FILTER (WHERE ccr.autor != 'automacao' AND c.direction = 'outbound') AS qtd_humano,
      MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') AS ultimo_outbound
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    GROUP BY c.contato_id
  ),
  erro_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS ecid,
      c.channel AS echannel,
      c.error_msg AS eerror,
      c.data_comunicacao AS edata
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.error_msg IS NOT NULL
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    ORDER BY c.contato_id, c.data_comunicacao DESC
  )
  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr,
    oi.oid, oi.osdr,
    'auditoria'::text, 'info'::text, NULL::text,
    s.ultimo_outbound, s.qtd_ia::int, s.qtd_lead::int,
    ei.echannel, ei.eerror
  FROM contato_info ci
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  LEFT JOIN stats s ON s.scid = ci.cid
  LEFT JOIN erro_info ei ON ei.ecid = ci.cid;
END;
$function$;

-- ============================================================================
-- 5. list_weekly_email_schedules — sem WHERE nenhum antes; agora filtra pelos
--    workspaces do chamador autenticado (service_role continua vendo tudo).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
RETURNS SETOF weekly_email_schedules
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  WHERE auth.uid() IS NULL OR public.is_workspace_member(s.workspace_id)
  ORDER BY s.created_at DESC;
END;
$function$;

-- ============================================================================
-- 6. delete_weekly_email_schedule — exige que o chamador autenticado seja
--    admin/owner do workspace dono do agendamento antes de apagar.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_weekly_email_schedule(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.weekly_email_schedules WHERE id = p_id;

  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_workspace_admin(v_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: somente admin/owner do workspace' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.weekly_email_schedules WHERE id = p_id;
  RETURN FOUND;
END;
$function$;

-- ============================================================================
-- 7. Views sem security_invoker=true, cujo dono (postgres) tem BYPASSRLS —
--    a view ignora a RLS das tabelas base para QUALQUER role que a consulte.
--    Adicionar security_invoker=true faz a view respeitar o RLS do role que
--    a está consultando (comportamento padrão desejado, mudança aditiva e
--    estritamente mais restritiva — nunca abre acesso que não existia).
-- ============================================================================
ALTER VIEW public.v_creative_metrics SET (security_invoker = true);
ALTER VIEW public.v_disparo_metricas SET (security_invoker = true);
ALTER VIEW public.v_creative_status_counts SET (security_invoker = true);
ALTER VIEW public.v_weekly_snapshots_status SET (security_invoker = true);
ALTER VIEW public.v_weekly_dashboard SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
RESET statement_timeout;
