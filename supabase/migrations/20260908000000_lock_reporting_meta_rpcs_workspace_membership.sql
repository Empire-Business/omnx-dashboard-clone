-- Trava 3 RPCs SECURITY DEFINER que não verificavam membership de workspace.
--
-- Achado da auditoria de segurança de 2026-07-15 (gate de merge
-- feat/roadmap-advance -> main, security-auditor v1.10):
--   * get_meta_ads_campaign_metrics(uuid, integer) — SECURITY DEFINER,
--     executável por anon (chave pública), aceitava workspace_id arbitrário
--     sem verificar membership. Sem vazamento observado apenas porque as
--     linhas legadas de meta_ads_insights têm workspace_id NULL.
--   * list_weekly_email_schedules() — SECURITY DEFINER sem filtro de
--     workspace: com a primeira linha criada, vazaria recipient_emails
--     (PII), prompts e configs para qualquer caller.
--   * get_weekly_email_logs(uuid, integer) — mesmo problema via schedule_id.
--
-- Correção (falha fechado, sem mudança de contrato para membros legítimos):
--   1. Toda função passa a exigir public.is_workspace_member(...) da linha/
--      parâmetro consultado — anon e não-membros recebem conjunto vazio.
--   2. REVOKE de anon/PUBLIC + GRANT explícito para authenticated e
--      service_role (defesa em profundidade: mesmo sem filtro, anon não
--      executa).
--
-- Compatibilidade: o frontend chama as 3 via supabase.rpc com o JWT do
-- usuário e sempre dentro do próprio workspace (useWeeklyEmailSchedules.ts,
-- MetaAdsSubTab.tsx). weekly_email_schedules/logs estão vazias em produção
-- na data desta migration — nenhum dado legado deixa de aparecer.

-- 1) Meta Ads: só membros do workspace consultado
CREATE OR REPLACE FUNCTION public.get_meta_ads_campaign_metrics(
  p_workspace_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  campaign_id text,
  campaign_name text,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_leads bigint,
  avg_ctr numeric,
  avg_cpc numeric,
  days_active bigint,
  last_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.campaign_id,
    i.campaign_name,
    COALESCE(SUM(i.spend), 0) AS total_spend,
    COALESCE(SUM(i.impressions), 0) AS total_impressions,
    COALESCE(SUM(i.clicks), 0) AS total_clicks,
    COALESCE(SUM(i.leads) + SUM(i.onsite_web_leads) + SUM(i.fb_pixel_leads), 0) AS total_leads,
    CASE WHEN SUM(i.impressions) > 0
      THEN SUM(i.clicks)::numeric / SUM(i.impressions)::numeric
      ELSE 0
    END AS avg_ctr,
    CASE WHEN SUM(i.clicks) > 0
      THEN SUM(i.spend) / SUM(i.clicks)::numeric
      ELSE 0
    END AS avg_cpc,
    COUNT(DISTINCT i.date) AS days_active,
    MAX(i.date) AS last_date
  FROM public.meta_ads_insights i
  WHERE i.workspace_id = p_workspace_id
    AND public.is_workspace_member(p_workspace_id)
    AND i.campaign_id IS NOT NULL
    AND i.date >= CURRENT_DATE - (p_days || ' days')::interval
  GROUP BY i.campaign_id, i.campaign_name
  ORDER BY total_spend DESC
  LIMIT 100;
$$;

-- 2) Schedules de email semanal: só linhas de workspaces do caller
CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
  RETURNS TABLE(
    id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    created_by uuid,
    name text,
    description text,
    is_active boolean,
    modules text[],
    report_type text,
    dimensions text[],
    frequency text,
    day_of_week integer,
    day_of_month integer,
    time_of_day time,
    timezone text,
    last_run_at timestamptz,
    next_run_at timestamptz,
    subject text,
    recipient_emails text[],
    reply_to text,
    template_key text,
    include_comparative boolean,
    include_trends boolean,
    clara_prompt text,
    use_clara_summary boolean,
    email_sent_count integer,
    last_error text,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  WHERE s.workspace_id IS NOT NULL
    AND public.is_workspace_member(s.workspace_id)
  ORDER BY s.created_at DESC;
END;
$$;

-- 3) Logs de email semanal: idem, pelo workspace do próprio log
CREATE OR REPLACE FUNCTION public.get_weekly_email_logs(p_schedule_id uuid, p_limit integer DEFAULT 20)
  RETURNS TABLE(
    id uuid,
    created_at timestamptz,
    schedule_id uuid,
    week_start date,
    report_type text,
    recipient_emails text[],
    subject text,
    status text,
    resend_message_id text,
    error_message text,
    opened_at timestamptz,
    clicked_at timestamptz,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT l.*
  FROM public.weekly_email_logs l
  WHERE l.schedule_id = p_schedule_id
    AND l.workspace_id IS NOT NULL
    AND public.is_workspace_member(l.workspace_id)
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 4) Defesa em profundidade: remove EXECUTE de anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.get_meta_ads_campaign_metrics(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_weekly_email_schedules() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_weekly_email_logs(uuid, integer) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_meta_ads_campaign_metrics(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_weekly_email_schedules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_email_logs(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
