#!/usr/bin/env bash
# scripts/security-check.sh
# Verifica se arquivos staged/rastreados contêm tokens, chaves ou secrets conhecidos.
# Uso: ./scripts/security-check.sh [arquivos...]
# Se nenhum arquivo for passado, verifica todo o working tree rastreado.

set -euo pipefail

FILES="${*:-}"

if [ -z "$FILES" ]; then
  FILES=$(git ls-files)
fi

# Lista de regexes que indicam valores reais de secrets.
# Placeholders/documentacao sao ignorados pelos filtros grep abaixo.
PATTERNS=(
  # GHL API key
  'pit-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
  # Supabase access token
  'sbp_[a-f0-9]{40,}'
  # JWT completo (3 partes base64url)
  'eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*'
  # Atribuicao de service role key com JWT
  'SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'\''`]eyJ'
  # Atribuicao de anon key com JWT
  'SUPABASE_ANON_KEY\s*[:=]\s*["'\''`]eyJ'
  # Atribuicao de GHL API key
  'GHL_API_KEY\s*[:=]\s*["'\''`]pit-'
  # supabase secrets set com valor real
  'supabase secrets set [A-Z_]+=["'\''`]*(pit-|eyJ|sbp_)'
)

EXCLUDE_REGEX='(<REMOVED|CONFIGURE_IN_ENV|<SUA_|SEU_|<REMOVE|placeholder|exemplo|EXEMPLO|sua-|seu-|xxxxx|\[project-id\]|\[empire-crm-supabase\]|\[projeto\]|\[supabase-project\])'

FOUND=0
for PATTERN in "${PATTERNS[@]}"; do
  MATCHES=$(echo "$FILES" | xargs grep -n -E "$PATTERN" 2>/dev/null | grep -v -E "$EXCLUDE_REGEX" || true)
  if [ -n "$MATCHES" ]; then
    echo "🔴 Possível secret encontrado (padrão: $PATTERN):"
    echo "$MATCHES"
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "❌ Security check falhou. Substitua os valores por placeholders/variáveis de ambiente antes de commitar."
  exit 1
fi

echo "✅ Security check passou. Nenhum secret óbvio encontrado."
