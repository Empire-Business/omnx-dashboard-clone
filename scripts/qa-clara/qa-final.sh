#!/usr/bin/env bash
# Agente de QA Final da Clara
# Verifica se os 3 módulos faltantes foram implementados corretamente.
# Uso: ./scripts/qa-clara/qa-final.sh

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPORT_FILE="$ROOT_DIR/scripts/qa-clara/qa-report.md"

PASS=0
FAIL=0
WARN=0

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN++)); }
log_info() { echo -e "  $1"; }

mkdir -p "$(dirname "$REPORT_FILE")"
echo "# Relatório de QA Final — Clara Módulos Faltantes" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Data: $(date -Iseconds)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

check_file_contains() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    log_pass "$description"
    echo "- ✅ $description" >> "$REPORT_FILE"
  else
    log_fail "$description"
    echo "- ❌ $description" >> "$REPORT_FILE"
  fi
}

echo "=== Verificação 1: Tools definidas ==="
echo "## 1. Tools definidas" >> "$REPORT_FILE"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/tools.ts" "query_vendas_detalhado" "Tool query_vendas_detalhado definida"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/tools.ts" "query_pre_vendas" "Tool query_pre_vendas definida"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/tools.ts" "query_criativos" "Tool query_criativos definida"
echo "" >> "$REPORT_FILE"

echo "=== Verificação 2: Executores implementados ==="
echo "## 2. Executores implementados" >> "$REPORT_FILE"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/executors.ts" "case 'query_vendas_detalhado'" "Executor query_vendas_detalhado implementado"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/executors.ts" "case 'query_pre_vendas'" "Executor query_pre_vendas implementado"
check_file_contains "$ROOT_DIR/supabase/functions/_shared/clara/executors.ts" "case 'query_criativos'" "Executor query_criativos implementado"
echo "" >> "$REPORT_FILE"

echo "=== Verificação 3: Migrations SQL ==="
echo "## 3. Migrations SQL" >> "$REPORT_FILE"
for mig in \
  "20260619160000_analisar_vendas.sql" \
  "20260619161000_analisar_pre_vendas.sql" \
  "20260619162000_analisar_criativos.sql"; do
  if [ -f "$ROOT_DIR/supabase/migrations/$mig" ]; then
    log_pass "Migration $mig existe"
    echo "- ✅ Migration $mig existe" >> "$REPORT_FILE"
  else
    log_fail "Migration $mig não encontrada"
    echo "- ❌ Migration $mig não encontrada" >> "$REPORT_FILE"
  fi
done
echo "" >> "$REPORT_FILE"

echo "=== Verificação 4: Testes Playwright ==="
echo "## 4. Testes Playwright" >> "$REPORT_FILE"
if [ -f "$ROOT_DIR/tests/clara/clara-e2e.spec.ts" ]; then
  log_pass "Arquivo de testes E2E existe"
  echo "- ✅ Arquivo de testes E2E existe" >> "$REPORT_FILE"
else
  log_fail "Arquivo de testes E2E não encontrado"
  echo "- ❌ Arquivo de testes E2E não encontrado" >> "$REPORT_FILE"
fi

if command -v npx >/dev/null 2>&1 && [ -f "$ROOT_DIR/playwright.config.ts" ]; then
  if (cd "$ROOT_DIR" && BASE_URL=http://localhost:3223 npx playwright test tests/clara/clara-e2e.spec.ts --reporter=list); then
    log_pass "Testes Playwright passaram"
    echo "- ✅ Testes Playwright passaram" >> "$REPORT_FILE"
  else
    log_fail "Testes Playwright falharam"
    echo "- ❌ Testes Playwright falharam" >> "$REPORT_FILE"
  fi
else
  log_warn "npx/playwright não disponível — pulando execução de testes"
  echo "- ⚠️ npx/playwright não disponível — pulando execução de testes" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

echo "=== Verificação 5: Regras de segurança ==="
echo "## 5. Regras de segurança" >> "$REPORT_FILE"
if grep -qE "anthropic/|openai/|claude" "$ROOT_DIR/supabase/functions/bot-chat/index.ts"; then
  log_fail "Modelo proibido encontrado em bot-chat/index.ts"
  echo "- ❌ Modelo proibido encontrado em bot-chat/index.ts" >> "$REPORT_FILE"
else
  log_pass "Nenhum modelo proibido em bot-chat/index.ts"
  echo "- ✅ Nenhum modelo proibido em bot-chat/index.ts" >> "$REPORT_FILE"
fi

if grep -qE "anthropic/|openai/|claude" "$ROOT_DIR/supabase/functions/bot-chat-synthesis/index.ts"; then
  log_fail "Modelo proibido encontrado em bot-chat-synthesis/index.ts"
  echo "- ❌ Modelo proibido encontrado em bot-chat-synthesis/index.ts" >> "$REPORT_FILE"
else
  log_pass "Nenhum modelo proibido em bot-chat-synthesis/index.ts"
  echo "- ✅ Nenhum modelo proibido em bot-chat-synthesis/index.ts" >> "$REPORT_FILE"
fi

if git -C "$ROOT_DIR" ls-files | xargs grep -l "sbp_\|service_role\|SUPABASE_SERVICE_ROLE_KEY" 2>/dev/null | grep -v ".env" | grep -v "node_modules" | head -1; then
  log_warn "Possível secret commitado (verificar manualmente)"
  echo "- ⚠️ Possível secret commitado (verificar manualmente)" >> "$REPORT_FILE"
else
  log_pass "Nenhum secret óbvio encontrado nos arquivos rastreados"
  echo "- ✅ Nenhum secret óbvio encontrado nos arquivos rastreados" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

echo "=== Resultado Final ==="
echo "## Resultado Final" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- Passaram: $PASS" >> "$REPORT_FILE"
echo "- Falharam: $FAIL" >> "$REPORT_FILE"
echo "- Avisos: $WARN" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}=== APROVADO ===${NC}"
  echo "# 🟢 APROVADO" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "A entrega dos 3 módulos (Vendas, Pré-Vendas e Criativos) foi aprovada pelo agente de QA." >> "$REPORT_FILE"
  exit 0
else
  echo -e "${RED}=== REJEITADO ===${NC}"
  echo "# 🔴 REJEITADO" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "A entrega foi rejeitada. Corrija os itens marcados com ❌ e execute o QA novamente." >> "$REPORT_FILE"
  exit 1
fi
