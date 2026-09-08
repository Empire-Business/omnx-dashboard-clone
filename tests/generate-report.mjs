/**
 * Script para gerar relatório consolidado dos testes de legibilidade.
 * Executa os testes do Playwright e gera um resumo em Markdown.
 *
 * Uso:
 *   node tests/generate-report.mjs
 *   # ou após rodar os testes:
 *   npx playwright test && node tests/generate-report.mjs
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const REPORT_DIR = path.resolve('playwright-report')
const OUTPUT_MD = path.resolve('test-results/legibility-report.md')

function main() {
  console.log('🎭  Rodando testes do Playwright…')
  try {
    execSync('npx playwright test --reporter=json', {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    })
  } catch (err) {
    // Playwright retorna exit code != 0 quando há falhas — continuamos
    console.log('⚠️  Alguns testes falharam (veja relatório abaixo)')
  }

  const lines = []
  lines.push('# 📊 Relatório de Legibilidade & Acessibilidade')
  lines.push('')
  lines.push(`**Data:** ${new Date().toLocaleString('pt-BR')}`)
  lines.push('')

  // ── Design System Magalu ────────────────────────────────────────────────
  lines.push('## 🎨 Design System Magalu (referência)')
  lines.push('')
  lines.push('| Token | Valor |')
  lines.push('|-------|-------|')
  lines.push('| Primary | `#0086ff` |')
  lines.push('| Action | `#0075e2` |')
  lines.push('| Surface | `#ffffff` |')
  lines.push('| Surface Low | `#f0f3f4` |')
  lines.push('| Text | `#1e2428` |')
  lines.push('| Text Muted | `#697277` |')
  lines.push('| Border | `#e3e8ea` |')
  lines.push('| Border Input | `#b8c1c4` |')
  lines.push('| Error | `#d30d31` |')
  lines.push('| Success | `#08a022` |')
  lines.push('')

  // ── Relatório HTML do Playwright ────────────────────────────────────────
  const htmlReport = path.join(REPORT_DIR, 'index.html')
  if (fs.existsSync(htmlReport)) {
    lines.push('## 🖥️  Relatório HTML do Playwright')
    lines.push('')
    lines.push(`Abra no navegador: \`${htmlReport}\``)
    lines.push('')
  }

  // ── Screenshots ─────────────────────────────────────────────────────────
  const snapshotDir = path.resolve('test-results')
  const screenshots = findFiles(snapshotDir, /\.png$/)
  if (screenshots.length > 0) {
    lines.push('## 📸 Screenshots capturadas')
    lines.push('')
    for (const s of screenshots) {
      lines.push(`- \`${path.relative(process.cwd(), s)}\``)
    }
    lines.push('')
  }

  // ── Como executar ───────────────────────────────────────────────────────
  lines.push('## 🚀 Comandos disponíveis')
  lines.push('')
  lines.push('```bash')
  lines.push('# Testes visuais (screenshots)')
  lines.push('npm run test:visual')
  lines.push('')
  lines.push('# Testes de acessibilidade (contraste + legibilidade)')
  lines.push('npm run test:a11y')
  lines.push('')
  lines.push('# Todos os testes')
  lines.push('npm run test:all')
  lines.push('')
  lines.push('# Relatório HTML interativo')
  lines.push('npx playwright show-report playwright-report')
  lines.push('```')
  lines.push('')

  // ── Pré-requisitos ──────────────────────────────────────────────────────
  lines.push('## ⚠️ Pré-requisitos')
  lines.push('')
  lines.push('Os dev servers devem estar rodando antes de executar os testes:')
  lines.push('')
  lines.push('```bash')
  lines.push('# Terminal 1 — eb-dash2')
  lines.push('cd eb-dash2 && npm run dev')
  lines.push('```')
  lines.push('')

  fs.mkdirSync(path.dirname(OUTPUT_MD), { recursive: true })
  fs.writeFileSync(OUTPUT_MD, lines.join('\n'), 'utf-8')

  console.log(`✅ Relatório gerado: ${OUTPUT_MD}`)
  console.log(`🌐 Relatório HTML:  ${htmlReport}`)
}

function findFiles(dir, pattern) {
  const results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findFiles(full, pattern))
    } else if (pattern.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

main()
