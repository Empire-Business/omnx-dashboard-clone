-- ============================================================================
-- FASE 3 — Descoberta de sub-contas — fatia 3: unicidade de ghl_location_id
-- docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.3, item de colisao)
--
-- agency_workspaces.ghl_location_id nao tinha nenhuma restricao de unicidade
-- (achado da pesquisa de codigo desta sessao). Sem isso, discover-agency-locations
-- poderia inserir a MESMA sub-conta GHL vinculada a DUAS agencias diferentes
-- silenciosamente. Mesma tecnica de
-- 20260725000000_fase3_routing_location_uniqueness.sql
-- (uq_ghl_integration_settings_location_active): indice UNICO PARCIAL
-- (so entre linhas 'active'), permitindo reaproveitar o location_id se a
-- vinculacao anterior foi suspensa.
--
-- Idempotente: IF NOT EXISTS.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_workspaces_location_active
    ON public.agency_workspaces (ghl_location_id)
    WHERE ghl_location_id IS NOT NULL AND status = 'active';

NOTIFY pgrst, 'reload schema';
