#!/usr/bin/env bash
# Suite de isolamento cross-tenant (RLS) — substitui o integration-isolation.yml do GitHub
# Actions, que a empresa não usa mais (21/11/2026). Só manual, contra um projeto Supabase
# de TESTE (desde 2026-07-18 não existe nenhum; sem as variáveis abaixo, o script pula):
#
#   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... TEST_PROJECT_REF=... \
#     bash scripts/testar-isolamento.sh
#
# As variáveis vêm do ambiente, nunca de arquivo versionado. NUNCA aponte para produção:
# __tests__/helpers/safe-guard.ts aborta se a URL for de produção ou o ref não bater.
set -euo pipefail
cd "$(dirname "$0")/.."

for v in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY TEST_PROJECT_REF; do
  if [ -z "${!v:-}" ]; then
    echo "Sem $v (modo só produção, não há projeto de teste): pulando a suite de isolamento."
    exit 0
  fi
done

npm ci --no-audit --no-fund
(cd eb-dash2 && npm ci --no-audit --no-fund)
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
