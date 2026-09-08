-- Migration: Vigilância automática de mudanças de campos GHL
--
-- CONTEXTO
--   Achado da auditoria do sistema de mapeamento de campos GHL (2026-07-12):
--   discover-ghl-config só roda quando o usuário clica um botão. Não existe
--   nenhum agendamento que revisite o GHL periodicamente para detectar campo
--   novo ou campo removido — o dono pediu explicitamente essa vigilância.
--
--   Decisão de escopo: o diff item-a-item completo (quais campos exatos
--   mudaram) já existe e funciona no frontend (computeMappingChanges em
--   eb-dash2/src/lib/ghl-mapping.ts), mas só roda sobre um resultado de
--   discovery carregado na sessão do usuário. Reimplementar esse mesmo diff
--   item-a-item em SQL puro, parseando o JSON bruto de cada endpoint do GHL
--   (formatos diferentes por endpoint), seria frágil e não testável sem
--   credencial GHL real. Em vez disso, esta migration implementa um alerta
--   de PRIMEIRO NÍVEL, baseado em contagem (quantos campos/pipelines/stages
--   existem agora vs. na última verificação) — 100% testável com dados
--   sintéticos, sem depender de parsing por-fornecedor. Quando o alerta
--   dispara, o admin abre a UI e o diff item-a-item preciso (já existente)
--   assume a partir daí.
--
-- ⚠️ APLICAR APENAS NO BANCO DE TESTE (fgjbmdsucruvtpywyhhf). NÃO aplicar em
--   produção sem autorização do dono.

-- ============================================================================
-- 1) Tabela de alertas de mudança
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ghl_mapping_change_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source TEXT NOT NULL,               -- 'contact_custom_fields' | 'opportunity_custom_fields' | 'pipelines'
    previous_count INTEGER NOT NULL,
    current_count INTEGER NOT NULL,
    delta INTEGER GENERATED ALWAYS AS (current_count - previous_count) STORED,
    previous_run_id UUID REFERENCES public.ghl_discovery_runs(id) ON DELETE SET NULL,
    current_run_id UUID NOT NULL REFERENCES public.ghl_discovery_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ghl_mapping_change_alerts_workspace_pending
    ON public.ghl_mapping_change_alerts (workspace_id)
    WHERE acknowledged_at IS NULL;

COMMENT ON TABLE public.ghl_mapping_change_alerts IS
    'Vigilância automática: alerta de 1º nível (baseado em contagem) quando um '
    'discovery periódico encontra um número diferente de campos/pipelines em '
    'relação à última verificação. O admin revisa o diff completo na UI.';

ALTER TABLE public.ghl_mapping_change_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ghl_mapping_change_alerts: owner/admin le" ON public.ghl_mapping_change_alerts;
CREATE POLICY "ghl_mapping_change_alerts: owner/admin le"
    ON public.ghl_mapping_change_alerts FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ghl_mapping_change_alerts.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "ghl_mapping_change_alerts: owner/admin reconhece" ON public.ghl_mapping_change_alerts;
CREATE POLICY "ghl_mapping_change_alerts: owner/admin reconhece"
    ON public.ghl_mapping_change_alerts FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ghl_mapping_change_alerts.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = ghl_mapping_change_alerts.workspace_id
              AND wm.user_id = (SELECT auth.uid())
              AND wm.is_active = true
              AND wm.role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS "ghl_mapping_change_alerts: service_role full access" ON public.ghl_mapping_change_alerts;
CREATE POLICY "ghl_mapping_change_alerts: service_role full access"
    ON public.ghl_mapping_change_alerts FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

REVOKE ALL ON public.ghl_mapping_change_alerts FROM anon;
GRANT SELECT, UPDATE ON public.ghl_mapping_change_alerts TO authenticated;
GRANT ALL ON public.ghl_mapping_change_alerts TO service_role;

-- ============================================================================
-- 2) Função de detecção — compara os 2 discovery runs mais recentes (status
--    'success') de cada source, por workspace, e registra alerta se a
--    contagem mudou. Idempotente: não duplica alerta para o mesmo par de runs.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.detect_ghl_mapping_changes(p_workspace_id UUID)
RETURNS TABLE(source TEXT, previous_count INTEGER, current_count INTEGER, alert_created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source TEXT;
  v_latest RECORD;
  v_previous RECORD;
  v_created BOOLEAN;
BEGIN
  FOR v_source IN
    SELECT DISTINCT ghl_discovery_runs.source
    FROM public.ghl_discovery_runs
    WHERE ghl_discovery_runs.workspace_id = p_workspace_id
      AND ghl_discovery_runs.source IN ('contact_custom_fields', 'opportunity_custom_fields', 'pipelines')
  LOOP
    SELECT dr.id, dr.created_at, COALESCE((dr.payload->>'count')::int, 0) AS cnt
      INTO v_latest
      FROM public.ghl_discovery_runs dr
      WHERE dr.workspace_id = p_workspace_id AND dr.source = v_source AND dr.status = 'success'
      ORDER BY dr.created_at DESC
      LIMIT 1;

    IF v_latest.id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT dr.id, dr.created_at, COALESCE((dr.payload->>'count')::int, 0) AS cnt
      INTO v_previous
      FROM public.ghl_discovery_runs dr
      WHERE dr.workspace_id = p_workspace_id AND dr.source = v_source AND dr.status = 'success'
        AND dr.created_at < v_latest.created_at
      ORDER BY dr.created_at DESC
      LIMIT 1;

    v_created := false;

    IF v_previous.id IS NOT NULL AND v_previous.cnt IS DISTINCT FROM v_latest.cnt THEN
      -- Idempotente: não recria alerta já registrado para este par exato de runs.
      IF NOT EXISTS (
        SELECT 1 FROM public.ghl_mapping_change_alerts a
        WHERE a.workspace_id = p_workspace_id
          AND a.source = v_source
          AND a.current_run_id = v_latest.id
          AND a.previous_run_id IS NOT DISTINCT FROM v_previous.id
      ) THEN
        INSERT INTO public.ghl_mapping_change_alerts
          (workspace_id, source, previous_count, current_count, previous_run_id, current_run_id)
        VALUES
          (p_workspace_id, v_source, v_previous.cnt, v_latest.cnt, v_previous.id, v_latest.id);
        v_created := true;
      END IF;
    END IF;

    source := v_source;
    previous_count := COALESCE(v_previous.cnt, v_latest.cnt);
    current_count := v_latest.cnt;
    alert_created := v_created;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.detect_ghl_mapping_changes(UUID) IS
    'Compara os 2 discovery runs mais recentes por source (contagem) e registra '
    'alerta em ghl_mapping_change_alerts quando a contagem mudou. Idempotente.';

REVOKE ALL ON FUNCTION public.detect_ghl_mapping_changes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_ghl_mapping_changes(UUID) TO service_role;

-- ============================================================================
-- 3) Cron de dispatch — roda discovery (count-only) para todo workspace com
--    credencial GHL ativa, uma vez por dia. discover-ghl-config aceita
--    chamador service_role desde esta mesma frente (ver index.ts).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ghl_mapping_discovery_watch_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/discover-ghl-config';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_workspace   RECORD;
  v_count       INTEGER := 0;
BEGIN
  FOR v_workspace IN
    SELECT DISTINCT gis.workspace_id
    FROM public.ghl_integration_settings gis
    WHERE gis.is_active = true
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('workspace_id', v_workspace.workspace_id, 'include_payload', false)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN 'ghl_mapping_discovery_watch_job: workspaces=' || v_count;
END;
$function$;

COMMENT ON FUNCTION public.ghl_mapping_discovery_watch_job() IS
    'Fase de dispatch da vigilância: chama discover-ghl-config (service_role, '
    'count-only) para cada workspace com credencial GHL ativa. A fase de '
    'detecção (detect_ghl_mapping_changes) roda 30min depois, via '
    'ghl_mapping_detect_changes_job, dando tempo do dispatch terminar.';

REVOKE ALL ON FUNCTION public.ghl_mapping_discovery_watch_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_mapping_discovery_watch_job() TO service_role;

-- ============================================================================
-- 4) Cron de reconciliação — roda 30min depois do dispatch, chama a detecção
--    para cada workspace com credencial GHL ativa.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ghl_mapping_detect_changes_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace RECORD;
  v_count     INTEGER := 0;
  v_alerts    INTEGER := 0;
  v_row       RECORD;
BEGIN
  FOR v_workspace IN
    SELECT DISTINCT gis.workspace_id
    FROM public.ghl_integration_settings gis
    WHERE gis.is_active = true
  LOOP
    v_count := v_count + 1;
    FOR v_row IN SELECT * FROM public.detect_ghl_mapping_changes(v_workspace.workspace_id) LOOP
      IF v_row.alert_created THEN
        v_alerts := v_alerts + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN 'ghl_mapping_detect_changes_job: workspaces=' || v_count || ' | alertas_novos=' || v_alerts;
END;
$function$;

REVOKE ALL ON FUNCTION public.ghl_mapping_detect_changes_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_mapping_detect_changes_job() TO service_role;

-- ============================================================================
-- 5) Agendamento — dispatch diário às 04:00 UTC (01:00 BRT), detecção 30min
--    depois. Horário de baixo tráfego, staggered em relação aos outros crons.
-- ============================================================================
SELECT cron.schedule(
    'ghl-mapping-discovery-watch',
    '0 4 * * *',
    $$SELECT public.ghl_mapping_discovery_watch_job();$$
);

SELECT cron.schedule(
    'ghl-mapping-detect-changes',
    '30 4 * * *',
    $$SELECT public.ghl_mapping_detect_changes_job();$$
);
