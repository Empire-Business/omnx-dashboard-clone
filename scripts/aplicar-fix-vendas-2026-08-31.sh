#!/usr/bin/env bash
# Aplica em PRODUÇÃO o pacote de 31/08/2026:
#   1. migration 20261021000000 — o webhook do GHL para de sobrescrever o
#      financeiro de venda vinda do omnx-desk
#   2. registro da migration em supabase_migrations.schema_migrations
#   3. correção das 2 vendas de agosto já esmagadas (recalcula pelo `pagamentos`)
#   4. conferência final do mês
#
# Lê SUPABASE_ACCESS_TOKEN de .env.local (não versionado).
# Uso: bash scripts/aplicar-fix-vendas-2026-08-31.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
REF=qzesffnkqgelmtfblzkr

executar() { # $1 = rótulo, $2 = arquivo .sql
  echo "── $1"
  python -c "import json,sys;print(json.dumps({'query':open(sys.argv[1],encoding='utf-8').read()}))" "$2" > /tmp/_exec.json
  curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data-binary @/tmp/_exec.json
  echo; echo
}

executar "1/4 migration do trigger" supabase/migrations/20261021000000_trigger_ghl_nao_sobrescreve_financeiro_omnx_desk.sql

printf "%s\n" \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)" \
  "VALUES ('20261021000000', 'trigger_ghl_nao_sobrescreve_financeiro_omnx_desk')" \
  "ON CONFLICT (version) DO NOTHING;" > /tmp/_reg.sql
executar "2/4 registro em schema_migrations" /tmp/_reg.sql

executar "3/4 correção das vendas esmagadas" scripts/sql/fix-valores-omnx-desk-2026-08-31.sql

printf "%s\n" \
  "SELECT (data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo')::date AS pago_em," \
  "       valor_faturado::numeric(12,2) AS faturado," \
  "       left(oportunidade_id::text, 8) AS opp" \
  "FROM vendas_fechamento" \
  "WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'" \
  "  AND data_pagamento_entrada >= '2026-08-01T00:00:00-03:00'" \
  "  AND data_pagamento_entrada <= '2026-08-31T23:59:59-03:00'" \
  "ORDER BY 1;" > /tmp/_conf.sql
executar "4/4 conferência de agosto" /tmp/_conf.sql
