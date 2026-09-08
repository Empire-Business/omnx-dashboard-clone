#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "════════════════════════════════════════════"
echo "  GUZELA_TASK — Exportação + Análise de Persona"
echo "════════════════════════════════════════════"
echo ""

echo "▶ [1/3] Exportando MQLs de 2026..."
node GUZELA_TASK/export-mqls.js

echo ""
echo "▶ [2/3] Exportando Compradores de 2026..."
node GUZELA_TASK/export-compradores.js

echo ""
echo "▶ [3/3] Gerando análise de persona..."
node GUZELA_TASK/analise-persona.js

echo ""
echo "════════════════════════════════════════════"
echo "  ✅ CONCLUÍDO — Arquivos em GUZELA_TASK/"
echo "════════════════════════════════════════════"
ls -lh GUZELA_TASK/*.csv GUZELA_TASK/*.md 2>/dev/null
