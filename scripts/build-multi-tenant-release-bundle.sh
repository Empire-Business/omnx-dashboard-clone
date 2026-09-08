#!/usr/bin/env bash
set -euo pipefail

release_group=""
project_ref=""
output_dir=""

usage() {
  cat <<'EOF'
Uso:
  bash scripts/build-multi-tenant-release-bundle.sh \
    --group <a|b|c|d|all> --project-ref <ref> [--output-dir <diretorio>]

Cria um pacote temporário, com migrations aprovadas e verificadas por SHA-256.
O script não executa migrations nem chama o Supabase.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --group)
      release_group="${2:-}"
      shift 2
      ;;
    --project-ref)
      project_ref="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
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

if [[ ! "$release_group" =~ ^(a|b|c|d|all)$ ]]; then
  printf '%s\n' 'Informe --group a, b, c, d ou all.' >&2
  exit 1
fi

if [[ ! "$project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  printf '%s\n' 'Informe um --project-ref Supabase válido com 20 caracteres minúsculos.' >&2
  exit 1
fi

repository_root="$(git rev-parse --show-toplevel)"
source_migrations_dir="$repository_root/supabase/migrations"
remote_history_cutoff="20260713170448"

if ! git -C "$repository_root" diff --quiet -- supabase/migrations; then
  printf '%s\n' 'Há migrations versionadas modificadas localmente; gere o bundle somente a partir de uma árvore limpa.' >&2
  exit 1
fi

if [[ -n "$(git -C "$repository_root" ls-files --others --exclude-standard -- supabase/migrations)" ]]; then
  printf '%s\n' 'Há migrations não versionadas; gere o bundle somente a partir de uma árvore limpa.' >&2
  exit 1
fi

if [[ -n "$output_dir" ]]; then
  if [[ -d "$output_dir" ]] && [[ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    printf '%s\n' 'O --output-dir precisa estar vazio para evitar arquivos residuais.' >&2
    exit 1
  fi
  bundle_root="$(mkdir -p "$output_dir" && cd "$output_dir" && pwd)"
else
  bundle_root="$(mktemp -d "${TMPDIR:-/tmp}/omnx-multi-tenant-release.XXXXXX")"
fi

mkdir -p "$bundle_root/supabase/migrations" "$bundle_root/supabase/.temp"
cp "$repository_root/supabase/config.toml" "$bundle_root/supabase/config.toml"
printf '%s' "$project_ref" > "$bundle_root/supabase/.temp/project-ref"

history_count=0
for source_file in "$source_migrations_dir"/*.sql; do
  migration_name="$(basename "$source_file")"
  if [[ ! "$migration_name" =~ ^([0-9]{14})_.*\.sql$ ]]; then
    continue
  fi

  migration_version="${BASH_REMATCH[1]}"
  if [[ "$migration_version" > "$remote_history_cutoff" ]]; then
    continue
  fi

  cp "$source_file" "$bundle_root/supabase/migrations/$migration_name"
  history_count=$((history_count + 1))
done

declare -a release_entries=(
  "a:20260720000000_fase1_agency_modelo.sql:455dc401011039aae1590e47c5dc771f52a30470d89dc8f69f34d1694d8b1355"
  "a:20260721000000_fase1_agency_rls_funcoes.sql:b4cb9df1833d6da759128099118c647649a189c3f01fe1d0ac0c7810529ebd40"
  "a:20260721120000_fix_agency_rls_meta_ads_account_daily.sql:fa6a7c79cd77fd84d4b24ea9cfeb8cba3f317f68a4c19619c38fb2fab0899b34"
  "a:20260722000000_fase1_agency_rls_retrofit.sql:e9d247807c65e6d9b3f214191ba9b41b5bb4f1a6d47e7ff28f859838ad7e268c"
  "a:20260723000000_fase2_workspace_integration_credentials.sql:e90905f9d474a93d2d6700ce73a692bac5384fa7011c1d46bb5773be006690be"
  "a:20260724000000_fase2_credential_rpcs.sql:2de2316ec6e68699adef681271c57faaf332668e6bdc74ac3a8517c1849a1392"
  "a:20260725000000_fase3_routing_location_uniqueness.sql:90dd4a656bd558810437c71d68de43ee48b27d115dbc69b87081bd71f4d08e88"
  "a:20260726000000_fase4_ghl_api_jobs_tenant.sql:c137f698ba1402d9d3e9762db48e043a70796300d2034b328599d6802079b755"
  "a:20260727000000_fase7_outbound_webhooks.sql:7318a5156c16909add83b38880d3552b67e645c64859167109771b95f8d7f39b"
  "a:20260728000000_fase8_meta_crons_por_workspace.sql:7c82a9d3843f96ff797bb63df8711ea06a0a28763516a9f11c3612867b35b631"
  "a:20260729000000_fase8_notion_crons_por_workspace.sql:0b16687e3146125c180d150af0924265196a1258aa9cdd783e4604d7df965b9e"
  "a:20260730000000_fase8_permalinks_cron_por_workspace.sql:f9022115f7750994094039e1a909f6009c29e8d326231e15fd737bd4326fe021"
  "a:20260731000000_fase4_save_workspace_credential.sql:617fb3c4362172bec12255c2662bd60a01e4a1aa8156f1b3d5534a3c0de10ff5"
  "a:20260801000000_fase5_agency_admin_rpcs.sql:633fed303e30675d98ae7c40cde24b8e8339eb0585278dff0018d8ec6c0a58d1"
  "a:20260802000000_fase1_agency_rls_auth_uid_perf.sql:bd157a6f9e20ae82c17f5eed73852ea5d0b063e09a84111a50ac60c681de000c"
  "a:20260802500000_fix_permission_audit_cascade_delete.sql:e837554365a679d7f9fed3e4c40cc79f4b02da2c67f04419d6b0a20c7ace247b"
  "b:20260803000000_fase6_denormaliza_workspace_id_crm.sql:a26285ba1298c445936a32846f4147cb814f875c817a211af6a54f06b60af90a"
  "b:20260804000000_fase3_agency_ghl_credentials.sql:56c7b3b386d1d6640d25f0292995afff7840d64b764b40a69d1621402f9bb059"
  "b:20260805000000_fase3_agency_ghl_credential_rpcs.sql:418ad9344a92dc9ff6685c14bf6c7b8d268f8e199b0cd8f49389c954ad7068c1"
  "b:20260806000000_fase3_agency_workspaces_location_uniqueness.sql:97b56b4d4ae65198949c9b504702b51b6d4a1ff541b40ef5acfe1bd03a6d7310"
  "b:20260807000000_fase3_discover_agency_locations_cron.sql:875d55d6c0ce9ecde13b4aea11657ba0778b80212c108db56d69618f2ba40523"
  "b:20260808000000_fix_cron_caller_service_role.sql:0c6d6e29dae5ff4713b1a5605e060c947437902ea0fa1eddfdb7c6a2a3233c7e"
  "b:20260809000000_fase2_seed_ghl_credential_env_cutover.sql:8917e1e1197e060fa8f37ee2778f3fd1f5e018420e5295702911b11b5d4091bd"
  "b:20260810000000_remove_orphan_crons_and_dead_functions.sql:efe777be3100590db3963d932862c47af4ab48e44ee303fc7f4504a3c92fa222"
  "b:20260811000000_fase8_lgpd_workspace_purge.sql:bb6eb3afaf0255a5193b1bae40056192a7664adaf2c4fa4be4fde384957ce0ff"
  "b:20260812000000_fase6_workspace_id_stevo_whatsapp_calls.sql:db4e25fc6892c953f86100da7f63ed7bbace187be37b352354b1acf213e4c965"
  "b:20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql:9ec4e0933b0acd9ae7ee0a1fe6b542edfd32ab9ab32b295ec4ca4f43b5ec8267"
  "b:20260814000000_create_agency_for_owner_service_role.sql:4613dd93c280173d3d00012c0edc2061775524220f58c3603ff353e38cce4bc6"
  "c:20260815000000_fix_maquina_de_conteudo_colunas_faltantes.sql:dd4b8546a7e33a891f746e074b494832c98a4ccf13451eacf3e2007c8b4efdcb"
  "c:20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql:2c9af1bf01448689121e4a71944119aa19b0d9fb8ace03a863aa00cf9cdcfbda"
  "c:20260817000000_fix_webhooks_ghl_remove_anon_insert.sql:d3fd85111a8d4313793befc680e494ad9735e25e39cb7c491b9b7061eff35887"
  "c:20260818000000_fix_workspace_member_privilege_escalation.sql:41af60401c9bad7b659184b9eb4711993ca9a24cf584310e9561f4626e2fbde5"
  "d:20260822000000_adopt_existing_workspace_service_role.sql:dd0621eff44a93c533348340af5e6170d3b5a68e8e1b84303f7437f283d2f7d7"
  "d:20260823000000_fix_meta_ads_account_daily_tenant_isolation.sql:35bec0dbf2037abada0a5d22128f4a1a04fd2ab8233646bfda2f72fdd15c9d2a"
)

group_rank() {
  case "$1" in
    a) printf '1' ;;
    b) printf '2' ;;
    c) printf '3' ;;
    d) printf '4' ;;
    *) return 1 ;;
  esac
}

selected_count=0
included_count=0
requested_rank=""
if [[ "$release_group" != "all" ]]; then
  requested_rank="$(group_rank "$release_group")"
fi

for release_entry in "${release_entries[@]}"; do
  IFS=':' read -r entry_group migration_name expected_hash <<< "$release_entry"
  entry_rank="$(group_rank "$entry_group")"
  if [[ "$release_group" != "all" && "$entry_rank" -gt "$requested_rank" ]]; then
    continue
  fi

  source_file="$source_migrations_dir/$migration_name"
  actual_hash="$(shasum -a 256 "$source_file" | awk '{print $1}')"
  if [[ "$actual_hash" != "$expected_hash" ]]; then
    printf 'Hash divergente: %s\nEsperado: %s\nRecebido: %s\n' "$migration_name" "$expected_hash" "$actual_hash" >&2
    exit 1
  fi

  cp "$source_file" "$bundle_root/supabase/migrations/$migration_name"
  included_count=$((included_count + 1))
  if [[ "$release_group" == "all" || "$release_group" == "$entry_group" ]]; then
    selected_count=$((selected_count + 1))
  fi
done

if [[ "$selected_count" -eq 0 ]]; then
  printf '%s\n' 'Nenhuma migration selecionada.' >&2
  exit 1
fi

printf 'Bundle criado: %s\n' "$bundle_root"
printf 'Grupo: %s | Histórico remoto: %s | Migrations incluídas: %s | Migrations do grupo: %s | Projeto: %s\n' "$release_group" "$history_count" "$included_count" "$selected_count" "$project_ref"
printf '%s\n' 'Próximo passo seguro: supabase --workdir <bundle> db push --dry-run --linked'
