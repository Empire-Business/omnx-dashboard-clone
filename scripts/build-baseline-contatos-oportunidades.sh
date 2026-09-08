#!/usr/bin/env bash
# build-baseline-contatos-oportunidades.sh — migration RE-ENTRANTE para
# contatos/oportunidades (+ dependências), a partir de:
#   /tmp/funcs.sql   — 9 funções (pg_get_functiondef ... || ';')
#   /tmp/co_ddl.sql  — DDL de contatos/oportunidades (pg_dump --schema-only)
# Uso: scripts/build-baseline-contatos-oportunidades.sh <saida.sql>
# Não conecta em banco; só transforma texto. Não aplica em nada.
# Ordem: tabelas -> constraints -> funções -> índices -> gatilhos -> policies -> comentários -> grants.
set -euo pipefail

OUT="${1:-}"
[[ -z "$OUT" ]] && { echo "ERRO: informe o arquivo de saída (arg 1)." >&2; exit 1; }
[[ -f /tmp/funcs.sql ]] || { echo "ERRO: /tmp/funcs.sql não existe." >&2; exit 1; }
[[ -f /tmp/co_ddl.sql ]] || { echo "ERRO: /tmp/co_ddl.sql não existe." >&2; exit 1; }

D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
for k in tables constraints indexes triggers policies comments; do : > "$D/$k"; done

# RS="" => modo parágrafo (separado por linha em branco). Robusto a ';' dentro de
# strings (ex.: COMMENT com ';'). Cada registro = bloco de comentário + 1 statement.
awk -v D="$D" 'BEGIN{ RS=""; T=D"/tables"; CO=D"/constraints"; IX=D"/indexes"; TR=D"/triggers"; PO=D"/policies"; CM=D"/comments" }
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
  # garante ponto-e-virgula final ao imprimir statement preservado
  endsemi = (stmt ~ /;[ \t]*$/) ? "" : ";"

  if (flat ~ /^CREATE TABLE[ \t]/) {
    sub(/^CREATE TABLE[ \t]+/, "CREATE TABLE IF NOT EXISTS ", stmt); print stmt endsemi > T; next
  }
  if (flat ~ /^ALTER TABLE ONLY .* ADD CONSTRAINT/) {
    split(flat, a, "ADD CONSTRAINT "); con=a[2]; split(con, b, " "); name=b[1]
    gsub(/;[ \t]*$/, "", flat)
    print "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '\''" name "'\'') THEN " flat "; END IF; END $$;" > CO; next
  }
  if (flat ~ /^CREATE UNIQUE INDEX[ \t]/) {
    sub(/^CREATE UNIQUE INDEX[ \t]+/, "CREATE UNIQUE INDEX IF NOT EXISTS ", stmt); print stmt endsemi > IX; next
  }
  if (flat ~ /^CREATE INDEX[ \t]/) {
    sub(/^CREATE INDEX[ \t]+/, "CREATE INDEX IF NOT EXISTS ", stmt); print stmt endsemi > IX; next
  }
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
}
' /tmp/co_ddl.sql

{
  echo "-- ============================================================================"
  echo "-- BASELINE RE-ENTRANTE: contatos / oportunidades (+ dependências)"
  echo "-- Gerado por scripts/build-baseline-contatos-oportunidades.sh"
  echo "-- Origem: DDL extraído do banco de teste (cópia fiel do produção)."
  echo "-- Objetivo (Fase 0.7): setup-do-zero reproduzível pelas migrations."
  echo "-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / guard de constraint)."
  echo "-- Ordem: tabelas -> constraints -> funções -> índices -> gatilhos -> policies -> comentários -> grants."
  echo "-- NÃO aplicar em produção fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md."
  echo "-- ============================================================================"
  echo
  echo "-- Tabelas";      echo; cat "$D/tables";      echo
  echo "-- Constraints";   echo; cat "$D/constraints";  echo
  echo "-- Funções";       echo
  sed -E '/^-- ===== FUNC/d; s/^CREATE FUNCTION /CREATE OR REPLACE FUNCTION /' /tmp/funcs.sql
  echo; echo "-- Índices";     echo; cat "$D/indexes";      echo
  echo "-- Gatilhos";     echo; cat "$D/triggers";     echo
  echo "-- Policies";     echo; cat "$D/policies";     echo
  echo "-- Comentários";  echo; cat "$D/comments";     echo
  echo "-- Grants";       echo
  echo "GRANT ALL ON public.contatos TO service_role;"
  echo "GRANT ALL ON public.oportunidades TO service_role;"
  echo "GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;"
  echo "GRANT SELECT, INSERT, UPDATE, DELETE ON public.oportunidades TO authenticated;"
  echo "GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;"
  echo "GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;"
  echo "GRANT EXECUTE ON FUNCTION public.get_contact_workspace_id(uuid) TO authenticated;"
} > "$OUT"

echo "migration gerada: $OUT ($(wc -l < "$OUT") linhas)"
echo "tabelas=$(grep -c '^CREATE TABLE IF NOT EXISTS' "$OUT") constraints=$(grep -c 'pg_constraint' "$OUT") funcs=$(grep -c 'CREATE OR REPLACE FUNCTION' "$OUT") idx=$(grep -c '^CREATE .*INDEX IF NOT EXISTS' "$OUT") trg=$(grep -c '^DROP TRIGGER IF EXISTS' "$OUT") pol=$(grep -c '^DROP POLICY IF EXISTS' "$OUT") comments=$(grep -c '^COMMENT ON' "$OUT")"
