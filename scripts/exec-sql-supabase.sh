#!/usr/bin/env bash
# Executa um arquivo .sql num projeto Supabase via Management API.
# Lê SUPABASE_ACCESS_TOKEN de .env.local (não versionado).
#
# Uso: bash scripts/exec-sql-supabase.sh <project_ref> <arquivo.sql>
#   CRM/dashboard: qzesffnkqgelmtfblzkr
#   omnx-desk:     wuzmckatbmlpkdxtfhqr
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a

ref="$1"; arq="$2"
python -c "import json,sys;print(json.dumps({'query':open(sys.argv[1],encoding='utf-8').read()}))" "$arq" > /tmp/_execsql.json
curl -s -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/_execsql.json
echo
