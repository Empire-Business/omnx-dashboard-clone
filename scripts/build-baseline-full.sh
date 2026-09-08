#!/usr/bin/env bash
# build-baseline-full.sh — migration baseline RE-ENTRANTE do schema public inteiro,
# a partir de:
#   /tmp/dump-prod-public.sql  (pg_dump --schema-only --no-owner --no-privileges)
#   /tmp/funcs_all.sql         (todas as funcoes do usuario, em ordem de criacao)
# Uso: scripts/build-baseline-full.sh <saida.sql>
# Nao conecta em banco; so transforma texto. Nao aplica em nada.
# Ordem: schema -> tabelas -> sequences -> constraints -> funcoes -> views ->
#        indices -> gatilhos -> policies -> comentarios -> grants.
set -euo pipefail

OUT="${1:-}"
[[ -z "$OUT" ]] && { echo "ERRO: informe o arquivo de saida (arg 1)." >&2; exit 1; }
DMP=/tmp/dump-prod-public.sql
FUNCS=/tmp/funcs_all.sql
GRANTS=/Users/bguzela/Desenvolvimento/GHL-SUPABASE/__tests__/fixtures/test-db-grants.sql
[[ -f "$DMP" ]]    || { echo "ERRO: $DMP nao existe." >&2; exit 1; }
[[ -f "$FUNCS" ]]  || { echo "ERRO: $FUNCS nao existe." >&2; exit 1; }
[[ -f "$GRANTS" ]] || { echo "ERRO: $GRANTS nao existe." >&2; exit 1; }

D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
for k in schema tables sequences constraints views indexes triggers policies comments alters; do : > "$D/$k"; done

# RS="" = modo paragrafo (robusto a ';' dentro de strings).
awk -v D="$D" 'BEGIN{ RS=""; SC=D"/schema"; T=D"/tables"; SQ=D"/sequences"; CO=D"/constraints"; V=D"/views"; IX=D"/indexes"; TR=D"/triggers"; PO=D"/policies"; CM=D"/comments"; AL=D"/alters" }
{
  n=split($0, L, /\n/); stmt=""
  for (i=1;i<=n;i++){
    ln=L[i]
    if (ln ~ /^[ \t]*--/) continue
    if (ln ~ /^[ \t]*$/) continue
    if (ln ~ /^\\/) continue
    if (ln ~ /^SET[ \t]/) continue
    if (ln ~ /^SELECT[ \t]+pg_catalog/) continue
    stmt = stmt (stmt==""?"":"\n") ln
  }
  if (stmt=="") next
  flat=stmt; gsub(/[\r\n]+/, " ", flat); gsub(/[ \t]+/, " ", flat)
  endsemi = (stmt ~ /;[ \t]*$/) ? "" : ";"

  if (flat ~ /^CREATE SCHEMA[ \t]/) { print "CREATE SCHEMA IF NOT EXISTS public;" > SC; next }
  if (flat ~ /^CREATE SEQUENCE[ \t]/) { sub(/^CREATE SEQUENCE[ \t]+/, "CREATE SEQUENCE IF NOT EXISTS ", stmt); print stmt endsemi > SQ; next }
  if (flat ~ /^CREATE TABLE[ \t]/) { sub(/^CREATE TABLE[ \t]+/, "CREATE TABLE IF NOT EXISTS ", stmt); print stmt endsemi > T; next }
  if (flat ~ /^CREATE OR REPLACE VIEW[ \t]/) { print stmt endsemi > V; next }
  if (flat ~ /^CREATE VIEW[ \t]/) { sub(/^CREATE VIEW[ \t]+/, "CREATE OR REPLACE VIEW ", stmt); print stmt endsemi > V; next }
  if (flat ~ /^ALTER TABLE[ \t].* ADD CONSTRAINT/) {
    split(flat, a, "ADD CONSTRAINT "); con=a[2]; split(con, b, " "); name=b[1]
    gsub(/"/, "", name)
    gsub(/;[ \t]*$/, "", flat)
    print "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '\''" name "'\'') THEN " flat "; END IF; END $$;" > CO; next
  }
  if (flat ~ /^ALTER TABLE[ \t].* ENABLE ROW LEVEL SECURITY/) { print stmt endsemi > AL; next }
  if (flat ~ /^CREATE UNIQUE INDEX[ \t]/) { sub(/^CREATE UNIQUE INDEX[ \t]+/, "CREATE UNIQUE INDEX IF NOT EXISTS ", stmt); print stmt endsemi > IX; next }
  if (flat ~ /^CREATE INDEX[ \t]/) { sub(/^CREATE INDEX[ \t]+/, "CREATE INDEX IF NOT EXISTS ", stmt); print stmt endsemi > IX; next }
  if (flat ~ /^CREATE TRIGGER[ \t]/) {
    rest=flat; sub(/^CREATE TRIGGER[ \t]+/, "", rest)
    if (substr(rest,1,1)=="\"") { rest=substr(rest,2); nm=substr(rest,1,index(rest,"\"")-1) }
    else { split(rest, a, /[ \t]/); nm=a[1] }
    i=index(rest, " ON public."); tb=substr(rest, i+4); split(tb, c, /[ \t(]/); tbl=c[1]
    print "DROP TRIGGER IF EXISTS \"" nm "\" ON " tbl ";" > TR
    print flat ";" > TR; next
  }
  if (flat ~ /^CREATE POLICY[ \t]/) {
    rest=flat; sub(/^CREATE POLICY[ \t]+/, "", rest)
    if (substr(rest,1,1)=="\"") { rest=substr(rest,2); nm=substr(rest,1,index(rest,"\"")-1); rest=substr(rest,index(rest,"\"")+1) }
    else { split(rest, a, /[ \t]/); nm=a[1]; rest=substr(rest,length(nm)+1) }
    sub(/^[ \t]*ON[ \t]+/, "", rest); split(rest, c, /[ \t]/); tbl=c[1]
    print "DROP POLICY IF EXISTS \"" nm "\" ON " tbl ";" > PO
    print flat ";" > PO; next
  }
  if (flat ~ /^COMMENT ON[ \t]/) { print stmt endsemi > CM; next }
  if (flat ~ /^ALTER[ \t]/) { print stmt endsemi > AL; next }
  # demais: ignora (CREATE FUNCTION vem de FUNCS; CREATE EXTENSION nao ha)
}
' "$DMP"

{
  echo "-- ============================================================================"
  echo "-- BASELINE RE-ENTRANTE DO SCHEMA PUBLIC (Fase 0.7)"
  echo "-- Gerado por scripts/build-baseline-full.sh a partir do dump de producao."
  echo "-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / guard de constraint)."
  echo "-- Ordem: schema -> tabelas -> sequences -> constraints -> funcoes -> views ->"
  echo "--        indices -> gatilhos -> policies -> comentarios -> grants."
  echo "-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md."
  echo "-- ============================================================================"
  echo "SET search_path = public, pg_catalog;"
  echo "SET check_function_bodies = false;"
  echo
  echo "-- Schema";       echo; cat "$D/schema";      echo
  echo "-- Tabelas";      echo; cat "$D/tables";      echo
  echo "-- Sequences";    echo; cat "$D/sequences";   echo
  echo "-- Constraints";  echo; cat "$D/constraints"; echo
  echo "-- Funcoes";      echo
  sed -E '/^-- ===== FUNC/d' "$FUNCS"
  echo; echo "-- Views";        echo; cat "$D/views";       echo
  echo "-- Indices";      echo; cat "$D/indexes";     echo
  echo "-- Triggers";     echo; cat "$D/triggers";    echo
  echo "-- Policies";     echo; cat "$D/policies";    echo
  echo "-- Comentarios";  echo; cat "$D/comments";    echo
  echo "-- Outros ALTERs (RLS etc.)"; echo; cat "$D/alters"; echo
  echo "-- Grants";       echo
  echo "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;"
  echo "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;"
  cat "$GRANTS"
} > "$OUT"

echo "baseline gerada: $OUT ($(wc -l < "$OUT") linhas)"
echo "tabelas=$(grep -c '^CREATE TABLE IF NOT EXISTS' "$OUT") seq=$(grep -c '^CREATE SEQUENCE IF NOT EXISTS' "$OUT") constraints=$(grep -c 'pg_constraint' "$OUT") funcs=$(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") views=$(grep -c '^CREATE OR REPLACE VIEW' "$OUT") idx=$(grep -c '^CREATE .*INDEX IF NOT EXISTS' "$OUT") trg=$(grep -c '^DROP TRIGGER IF EXISTS' "$OUT") pol=$(grep -c '^DROP POLICY IF EXISTS' "$OUT") rls=$(grep -c 'ENABLE ROW LEVEL SECURITY' "$OUT")"
