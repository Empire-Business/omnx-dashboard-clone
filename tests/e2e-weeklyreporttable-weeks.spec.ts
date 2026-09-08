import { test } from '@playwright/test'
import { loginAs } from './sub-apps/helpers/login'

// Verificação do fix de semanas duplicadas na WeeklyReportTable (2026-07-16).
// Mesmo defeito corrigido no TrendChart: snapshots legados em weekly_snapshots
// (pares workspace_id NULL + novo, week_start fora da convenção de segunda)
// geravam linhas repetidas/fora de ordem e warnings de key duplicada.
// E2E somente-leitura: app aponta para PRODUÇÃO.
test.use({ viewport: { width: 1440, height: 900 } })

test('WeeklyReportTable sem semanas duplicadas, ordenadas e sem warnings de key', async ({ page }) => {
  const keyWarnings: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('same key')) keyWarnings.push(msg.text())
  })

  await loginAs(page, 'admin_master')
  await page.goto('/relatorios?tab=cohort')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)

  // Coleta os labels de semana (primeira célula de cada linha do tbody).
  const weekLabels = await page.evaluate(() => {
    const labels: string[] = []
    document.querySelectorAll('main table tbody tr').forEach((tr) => {
      const firstCell = tr.querySelector('td')
      const match = (firstCell?.textContent ?? '').match(/20\d\d-W\d{1,2}/)
      if (match) labels.push(match[0])
    })
    return labels
  })

  const dupes = [...new Set(weekLabels.filter((l, i) => weekLabels.indexOf(l) !== i))]
  console.log(`linhas=${weekLabels.length} semanas=${weekLabels.join(',')} warnings=${keyWarnings.length}`)

  if (weekLabels.length === 0) {
    throw new Error('Nenhuma linha de semana encontrada — seletor quebrado ou tabela não renderizou')
  }

  // Screenshots em light e dark para inspeção visual.
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
  const setTheme = async (target: 'light' | 'dark') => {
    if ((await isDark()) === (target === 'dark')) return
    await page.getByRole('button', { name: /Ativar modo (claro|escuro)/ }).first().click()
    await page.waitForTimeout(600)
  }
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(theme)
    await page.screenshot({ path: `playwright-screenshots/weeklyreporttable-fix/tabela-cohort-${theme}.png` })
  }

  if (dupes.length > 0) {
    throw new Error(`Semanas duplicadas na tabela: ${dupes.join(',')}`)
  }
  if (keyWarnings.length > 0) {
    throw new Error(`Ainda há ${keyWarnings.length} warnings de key duplicada`)
  }
  // Ordem: semana mais recente primeiro (compara ano/semana numericamente —
  // sort de string quebraria em W9 vs W29).
  const weekNum = (l: string) => {
    const m = l.match(/20(\d\d)-W(\d{1,2})/)!
    return Number(m[1]) * 100 + Number(m[2])
  }
  const foraDeOrdem = weekLabels.findIndex((l, i) => i > 0 && weekNum(weekLabels[i - 1]) < weekNum(l))
  if (foraDeOrdem !== -1) {
    throw new Error(`Tabela fora de ordem: ${weekLabels.join(', ')}`)
  }
})
