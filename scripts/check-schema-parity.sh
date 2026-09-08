#!/usr/bin/env bash
# check-schema-parity.sh — compara o schema public de um banco alvo com o alvo de
# paridade de produção (supabase/baseline/prod-schema.manifest.txt).
#
# Uso:
#   scripts/check-schema-parity.sh "<DATABASE_URL>"
#   TARGET_DB_URL="<...>" scripts/check-schema-parity.sh
#
# Saída:
#   - diff entre o manifest (produção) e o banco alvo (somente estrutura public).
#   - exit 0 = paridade (sem diff); exit 1 = divergência ou erro.
#
# Seguro: nunca imprime a URL/senha do banco; roda só SELECTs de metadados.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/supabase/baseline/prod-schema.manifest.txt"

if [[ ! -f "$MANIFEST" ]]; then
  echo "ERRO: manifest não encontrado em $MANIFEST" >&2
  exit 1
fi

URL="${1:-${TARGET_DB_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "ERRO: informe a URL do banco alvo (arg 1 ou TARGET_DB_URL)." >&2
  exit 1
fi

# psql: preferir o do PATH; cair para libpq do Homebrew se existir.
PSQL="$(command -v psql || true)"
if [[ -z "$PSQL" && -x /opt/homebrew/opt/libpq/bin/psql ]]; then
  PSQL=/opt/homebrew/opt/libpq/bin/psql
fi
if [[ -z "$PSQL" ]]; then
  echo "ERRO: psql não encontrado." >&2
  exit 1
fi

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
LIVE="$(mktemp)"
trap 'rm -f "$LIVE"' EXIT

q() { "$PSQL" "$URL" -At -X -v ON_ERROR_STOP=1 -c "$1" 2>/tmp/parity.err || {
        echo "ERRO: falha ao introspectar o banco alvo." >&2
        sed -E 's#postgres(ql)?://[^@]*@#postgresql://***@#g' /tmp/parity.err >&2
        exit 1
      }; }

n_tables=$(q "select count(*) from pg_tables where schemaname='public'")
n_funcs=$(q "select count(*) from (select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') group by p.proname) s")
n_trigs=$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal")
n_pols=$(q "select count(*) from pg_policies where schemaname='public'")
n_idx=$(q "select count(*) from pg_indexes where schemaname='public'")

{
  echo "# Live schema manifest (estrutura, introspectado do banco alvo)"
  echo "# Gerado por scripts/check-schema-parity.sh em runtime — comparar com prod-schema.manifest.txt"
  echo
  echo "## TABLES ($n_tables)"
  q "select tablename from pg_tables where schemaname='public' order by 1"
  echo
  echo "## FUNCTIONS ($n_funcs)"
  q "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') group by p.proname order by 1"
  echo
  echo "## INDEXES ($n_idx)  # informativo: inclui índices de PK/UNIQUE; não entra no diff duro"
  echo
  echo "## TRIGGERS ($n_trigs)"
  q "select 'trg:'||t.tgname||' ON public.'||c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1"
  echo
  echo "## POLICIES ($n_pols)"
  q "select 'pol:'||policyname||' ON public.'||tablename from pg_policies where schemaname='public' order by 1"
} > "$LIVE"

# Compara como CONJUNTOS (ordem-normalizada) as seções relevantes
# (TABLES/FUNCTIONS/TRIGGERS/POLICIES). INDEXES é informativa (fica fora).
# A ordenação canônica (LC_ALL=C) remove ruído de locale/collation entre o
# manifest (sort do shell) e o banco (ORDER BY do Postgres).
canon() {
  for sec in TABLES FUNCTIONS TRIGGERS POLICIES; do
    awk -v s="## $sec" '$0 ~ "^"s {f=1; print; next} /^## /{f=0} f' "$1" \
      | { read -r hdr; echo "$hdr"; LC_ALL=C sort; }
  done
}

diff_out=$(diff -u <(canon "$MANIFEST") <(canon "$LIVE") || true)

echo "Alvo de paridade: $MANIFEST"
echo "Banco alvo (contagens): tables=$n_tables functions=$n_funcs triggers=$n_trigs policies=$n_pols indexes(info)=$n_idx"
echo

if [[ -z "$diff_out" ]]; then
  echo "PARIDADE OK — estrutura do banco alvo bate com o manifest de produção (TABLES/FUNCTIONS/TRIGGERS/POLICIES)."
  exit 0
fi

echo "DIVERGÊNCIA encontrada."
echo "  linhas com '-' = existem em produção e FALTAM no alvo (gap das migrations)"
echo "  linhas com '+' = existem no alvo e NÃO estão no manifest de produção (deriva)"
echo
echo "$diff_out"
exit 1
