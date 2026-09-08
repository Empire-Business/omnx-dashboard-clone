#!/usr/bin/env bash
set -euo pipefail

project_ref=""
execute=false
verdict_path="security-report/verdict.json"

usage() {
  cat <<'EOF'
Uso:
  bash scripts/deploy-multi-tenant-functions.sh --project-ref <ref>
  bash scripts/deploy-multi-tenant-functions.sh --project-ref <ref> --execute [--verdict <arquivo>]

Sem --execute, apenas lista o lote e valida os arquivos locais.
Com --execute, exige um verdict de segurança PASS gerado hoje em BRT.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref)
      project_ref="${2:-}"
      shift 2
      ;;
    --verdict)
      verdict_path="${2:-}"
      shift 2
      ;;
    --execute)
      execute=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Argumento desconhecido: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "$project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  printf '%s\n' 'Informe um --project-ref Supabase válido com 20 caracteres minúsculos.' >&2
  exit 1
fi

functions=(
  sync-contact-opportunities
  reconcile-contact-opportunities
  sync-contact-tasks
  sync-appointment-dates
  sync-ghl-conversations
  sync-ghl-users
  sync-recuperacao-stages
  recuperacao-prefetch
  recuperacao-corrigir
  discover-ghl-config
  diag-ghl
  ghl-api-worker
  sync-meta-ads
  sync-ad-permalinks
  notion-creatives-sync
  test-workspace-credential
  sync-meta-ads-backfill
  webhook-ghl
  discover-agency-locations
)

repository_root="$(git rev-parse --show-toplevel)"
for function_name in "${functions[@]}"; do
  if [[ ! -f "$repository_root/supabase/functions/$function_name/index.ts" ]]; then
    printf 'Função ausente: %s\n' "$function_name" >&2
    exit 1
  fi
done

printf 'Projeto: %s\n' "$project_ref"
printf 'Lote multi-tenant: %s funções\n' "${#functions[@]}"
printf '%s\n' "${functions[@]}"

if [[ "$execute" != true ]]; then
  printf '%s\n' 'Nenhum deploy executado. Use --execute somente após auditoria desta sessão com gate PASS.'
  exit 0
fi

if [[ ! -f "$repository_root/$verdict_path" ]]; then
  printf 'Verdict ausente: %s\n' "$verdict_path" >&2
  exit 1
fi

expected_date="$(TZ=America/Sao_Paulo date +%F)"
node -e '
const fs = require("fs");
const [path, expectedDate] = process.argv.slice(1);
const verdict = JSON.parse(fs.readFileSync(path, "utf8"));
if (verdict.contract_version !== 1 || verdict.gate !== "PASS") process.exit(1);
if (typeof verdict.timestamp !== "string") process.exit(1);
const verdictDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(verdict.timestamp));
if (verdictDate !== expectedDate) process.exit(1);
' "$repository_root/$verdict_path" "$expected_date" || {
  printf '%s\n' 'Verdict inválido: exige contract_version=1, gate=PASS e timestamp de hoje em BRT.' >&2
  exit 1
}

for function_name in "${functions[@]}"; do
  printf 'Deploy: %s\n' "$function_name"
  supabase functions deploy "$function_name" --project-ref "$project_ref"
done

printf '%s\n' 'Deploy concluído. Confirme a saúde e registre o burn-in antes de liberar cliente pago.'
