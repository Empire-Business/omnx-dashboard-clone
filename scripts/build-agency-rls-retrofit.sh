#!/usr/bin/env bash
# build-agency-rls-retrofit.sh — gera a migration do RETROFIT de RLS de agencia
# (Fase 1, fatia 2b). Le pg_policies do banco alvo (TESTE) e EMITE o SQL em
# arquivo. NAO aplica em nada. Substituicao textual: troca
# is_workspace_member(X)/is_workspace_admin(X) por
# can_access_workspace_via_agency(X) preservando o argumento X (coluna, id,
# get_*_workspace_id(...), ou OR combinado). Uma policy por (tabela,cmd).
#
# Uso: scripts/build-agency-rls-retrofit.sh <saida.sql>
set -euo pipefail
OUT="${1:-}"
[[ -z "$OUT" ]] && { echo "ERRO: informe o arquivo de saida (arg 1)." >&2; exit 1; }
[[ -f .env.test ]] || { echo "ERRO: .env.test nao encontrado (rode na raiz)." >&2; exit 1; }
URL=$(grep -E '^TEST_DB_URL=' .env.test | sed -E 's/^TEST_DB_URL=//; s/^"//; s/"$//')
PSQL=/opt/homebrew/opt/libpq/bin/psql

TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT

# Gera o DDL das policies via_agencia (uma por (tabela,cmd) de workspace).
$PSQL "$URL" -At -F'|' -v ON_ERROR_STOP=1 <<'SQL' > "$TMP"
WITH alvo AS (
  SELECT p.tablename, p.cmd,
    -- argumento: primeiro predicado chamando a funcao (qual preferido; senao with_check)
    (SELECT COALESCE(p2.qual, p2.with_check)
     FROM pg_policies p2
     WHERE p2.schemaname='public' AND p2.tablename=p.tablename AND p2.cmd=p.cmd
       AND (p2.qual ILIKE '%is_workspace_member(%' OR p2.qual ILIKE '%is_workspace_admin(%'
            OR p2.with_check ILIKE '%is_workspace_member(%' OR p2.with_check ILIKE '%is_workspace_admin(%')
     ORDER BY (p2.qual IS NOT NULL) DESC, length(coalesce(p2.qual,'')) DESC
     LIMIT 1) AS predicado_func,
    bool_or(p.qual ILIKE '%is_workspace_member(%' OR p.qual ILIKE '%is_workspace_admin(%'
            OR p.with_check ILIKE '%is_workspace_member(%' OR p.with_check ILIKE '%is_workspace_admin(%') AS chama_func
  FROM pg_policies p
  WHERE p.schemaname='public' AND p.cmd <> 'ALL'
    AND (p.qual ILIKE '%workspace%' OR p.with_check ILIKE '%workspace%'
         OR p.qual ILIKE '%get_%_workspace_id(%' OR p.with_check ILIKE '%get_%_workspace_id(%')
  GROUP BY p.tablename, p.cmd
),
expr AS (
  SELECT tablename, cmd,
    CASE
      WHEN chama_func THEN
        replace(replace(predicado_func, 'is_workspace_member(', 'can_access_workspace_via_agency('),
                                      'is_workspace_admin(' , 'can_access_workspace_via_agency(')
      WHEN tablename = 'workspaces' THEN 'can_access_workspace_via_agency(id)'
      WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema='public' AND c.table_name=alvo.tablename AND c.column_name='workspace_id')
           THEN 'can_access_workspace_via_agency(workspace_id)'
      ELSE NULL
    END AS e
  FROM alvo
)
SELECT
  'DROP POLICY IF EXISTS "agencia_' || lower(cmd) || '_' || tablename || '" ON public."' || tablename || '";' || E'\n' ||
  'CREATE POLICY "agencia_' || lower(cmd) || '_' || tablename || '" ON public."' || tablename ||
  '" AS PERMISSIVE FOR ' || cmd || ' TO authenticated' ||
  CASE WHEN cmd IN ('SELECT','DELETE') THEN ' USING (' || e || ');'
       WHEN cmd = 'INSERT' THEN ' WITH CHECK (' || e || ');'
       WHEN cmd = 'UPDATE' THEN ' USING (' || e || ') WITH CHECK (' || e || ');'
  END AS ddl
FROM expr
WHERE e IS NOT NULL
ORDER BY tablename, cmd;
SQL

# Allowlist: tabelas cujo RLS NAO isola por linha (predicado global por usuario,
# sem referenciar o workspace da linha — qualquer membro de qualquer workspace
# ve tudo). Conceder acesso de agencia a elas exige uma funcao SEM argumento e
# uma decisao de escopo propria (quais o dono da agencia deve enxergar). Ficam
# fora desta migration e fora do relatorio de cobertura (fatia propria).
ALLOW="('ai_embeddings','audit_log','bot_context','ghl_custom_field_mappings','ghl_opp_reconcile_runs','meta_ads_backfill_controle','meta_ads_backfill_log','meta_ads_campaigns','meta_ads_permalinks','reunioes','stevo_whatsapp_calls','webhooks_ghl')"

{
  echo "-- ============================================================================"
  echo "-- FASE 1 (fatia 2b) — RETROFIT de RLS aditiva de agencia (~85 tabelas)"
  echo "-- docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 3.3, 3.3.1, 3.3.2)"
  echo "-- Gerado por scripts/build-agency-rls-retrofit.sh (substituicao textual)."
  echo "-- Idempotente (DROP POLICY IF EXISTS + CREATE). NAO aplicar em producao."
  echo "-- Excecao conhecida (allowlist — RLS global por usuario, nao isola por linha;"
  echo "--   tratada em fatia propria com funcao sem argumento + decisao de escopo):"
  echo "--   ai_embeddings, audit_log, bot_context, ghl_custom_field_mappings,"
  echo "--   ghl_opp_reconcile_runs, meta_ads_backfill_controle, meta_ads_backfill_log,"
  echo "--   meta_ads_campaigns, meta_ads_permalinks, reunioes, stevo_whatsapp_calls,"
  echo "--   webhooks_ghl."
  echo "-- ============================================================================"
  echo "SET search_path = public, pg_catalog;"
  echo "SET check_function_bodies = false;"
  echo
  cat "$TMP"
  echo
  echo "-- ---- Relatorio de cobertura (FALHA a migration se faltar) ---------------"
  cat <<SQL
DO \$\$
DECLARE faltantes int; detalhe text;
BEGIN
  WITH alvo AS (
    SELECT p.tablename, p.cmd
    FROM pg_policies p
    WHERE p.schemaname='public' AND p.cmd <> 'ALL'
      AND p.tablename NOT IN $ALLOW
      AND (p.qual ILIKE '%workspace%' OR p.with_check ILIKE '%workspace%'
           OR p.qual ILIKE '%get_%_workspace_id(%' OR p.with_check ILIKE '%get_%_workspace_id(%')
    GROUP BY p.tablename, p.cmd
  ),
  sem AS (
    SELECT a.tablename, a.cmd
    FROM alvo a
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies v
      WHERE v.schemaname='public' AND v.tablename=a.tablename AND v.cmd=a.cmd
        AND v.policyname = 'agencia_' || lower(a.cmd) || '_' || a.tablename
    )
  )
  SELECT count(*), COALESCE(string_agg(tablename||'/'||cmd, ', '), '')
    INTO faltantes, detalhe FROM sem;
  IF faltantes > 0 THEN
    RAISE EXCEPTION 'RLS agencia: cobertura incompleta (% cmds sem via_agencia): %', faltantes, detalhe;
  END IF;
END \$\$;
SQL
} > "$OUT"

echo "retrofit gerado: $OUT ($(wc -l < "$OUT") linhas)"
echo "policies via_agencia: $(grep -c '^CREATE POLICY' "$OUT")"
