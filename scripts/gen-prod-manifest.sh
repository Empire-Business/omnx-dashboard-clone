#!/usr/bin/env bash
# gen-prod-manifest.sh — regenera supabase/baseline/prod-schema.manifest.txt a
# partir de um dump --schema-only de produção. Parsing robusto (identificadores
# com aspas, hífen e Title Case). Não conecta em banco; só lê o arquivo .sql.
#
# Uso:
#   scripts/gen-prod-manifest.sh /caminho/para/dump.sql
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/baseline/prod-schema.manifest.txt"
DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERRO: informe o caminho do dump .sql (arg 1)." >&2; exit 1
fi

D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT

# extrai 1º identificador (com ou sem aspas) do início de "rest"
# uso awk: imprime o nome da tabela de uma linha CREATE TABLE public.<x>
awk 'index($0,"CREATE TABLE public.")==1 {
  r=substr($0,21)
  if (substr(r,1,1)=="\"") { r=substr(r,2); n=substr(r,1,index(r,"\"")-1) }
  else { split(r,a,/[\t (]/); n=a[1] }
  print n
}' "$DUMP" | sort -u > "$D/tables"

awk 'index($0,"CREATE FUNCTION public.")==1 {
  r=substr($0,24)
  if (substr(r,1,1)=="\"") { r=substr(r,2); n=substr(r,1,index(r,"\"")-1) }
  else { split(r,a,/[\t (]/); n=a[1] }
  print n
}' "$DUMP" | sort -u > "$D/functions"

# idx:<name> ON public.<table>  (CREATE INDEX <name> ON public.<table> ...)
awk 'index($0,"CREATE INDEX ")==1 {
  r=substr($0,14)
  if (substr(r,1,1)=="\"") { r=substr(r,2); nm=substr(r,1,index(r,"\"")-1); r=substr(r,index(r,"\"")+1) }
  else { split(r,a,/[\t ]/); nm=a[1]; r=substr(r,length(nm)+1) }
  sub(/^[\t ]*ON[\t ]+public\./,"",r); sub(/^[\t ]*ON[\t ]+/,"",r)
  if (substr(r,1,1)=="\"") { r=substr(r,2); tb=substr(r,1,index(r,"\"")-1) }
  else { split(r,b,/[\t (]/); tb=b[1] }
  print "idx:" nm " ON public." tb
}' "$DUMP" | sort -u > "$D/indexes"

# trg:<name> ON public.<table>  (CREATE TRIGGER <name> <timing>... ON public.<table>)
awk 'index($0,"CREATE TRIGGER ")==1 {
  r=substr($0,16)
  if (substr(r,1,1)=="\"") { r=substr(r,2); nm=substr(r,1,index(r,"\"")-1) }
  else { split(r,a,/[\t ]/); nm=a[1] }
  i=index(r," ON public."); if (i==0) i=index(r," ON ")
  rr=substr(r,i+4); sub(/^public\./,"",rr)
  if (substr(rr,1,1)=="\"") { rr=substr(rr,2); tb=substr(rr,1,index(rr,"\"")-1) }
  else { split(rr,b,/[\t ]/); tb=b[1] }
  print "trg:" nm " ON public." tb
}' "$DUMP" | sort -u > "$D/triggers"

# pol:<name> ON public.<table>  (CREATE POLICY <name> ON public.<table>)
awk 'index($0,"CREATE POLICY ")==1 {
  r=substr($0,15)
  if (substr(r,1,1)=="\"") { r=substr(r,2); nm=substr(r,1,index(r,"\"")-1); r=substr(r,index(r,"\"")+1) }
  else { split(r,a,/[\t ]/); nm=a[1]; r=substr(r,length(nm)+1) }
  sub(/^[\t ]*ON[\t ]+public\./,"",r); sub(/^[\t ]*ON[\t ]+/,"",r)
  if (substr(r,1,1)=="\"") { r=substr(r,2); tb=substr(r,1,index(r,"\"")-1) }
  else { split(r,b,/[\t (]/); tb=b[1] }
  print "pol:" nm " ON public." tb
}' "$DUMP" | sort -u > "$D/policies"

{
  echo "# Prod schema manifest (estrutura, sem privilégios) — fonte: pg_dump --schema-only --no-privileges de produção"
  echo "# Gerado por scripts/gen-prod-manifest.sh em 2026-07-09 (parsing robusto: aspas/hífen/Title Case)."
  echo "# Papel na Fase 0.7: ALVO DE PARIDADE. O setup-do-zero (db push das migrations) deve reproduzir este conjunto."
  echo "# Sem GRANTs (dump --no-privileges): privilégios vêm das migrations. Sem funções de extensão (pgvector/btree_gist): vêm do CREATE EXTENSION."
  echo
  echo "## TABLES ($(wc -l < "$D/tables" | tr -d ' '))";    cat "$D/tables"
  echo; echo "## FUNCTIONS ($(wc -l < "$D/functions" | tr -d ' '))"; cat "$D/functions"
  echo; echo "## INDEXES ($(wc -l < "$D/indexes" | tr -d ' '))";   cat "$D/indexes"
  echo; echo "## TRIGGERS ($(wc -l < "$D/triggers" | tr -d ' '))"; cat "$D/triggers"
  echo; echo "## POLICIES ($(wc -l < "$D/policies" | tr -d ' '))"; cat "$D/policies"
} > "$OUT"

echo "manifest gerado em $OUT"
grep -E '^## ' "$OUT"
