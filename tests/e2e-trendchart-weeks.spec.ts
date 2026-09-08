import { test } from '@playwright/test'
import { loginAs } from './sub-apps/helpers/login'

// Verificação do fix de semanas duplicadas no TrendChart (2026-07-15).
// Antes: eixo X com labels repetidos (2026-W27 2x) e 224 warnings de key.
test.use({ viewport: { width: 1440, height: 900 } })

test('TrendChart sem semanas duplicadas, em ordem cronológica e sem warnings de key', async ({ page }) => {
  const keyWarnings: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('same key')) keyWarnings.push(msg.text())
  })

  await loginAs(page, 'admin_master')
  await page.goto('/relatorios?tab=tendencias')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)

  // Coleta os labels do eixo X por gráfico (ticks do recharts em <text>/<tspan>).
  // Cada gráfico mostra as mesmas semanas — a duplicata do bug era DENTRO do mesmo gráfico.
  const perChart = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('main svg')).map((svg) => {
      const labels: string[] = []
      svg.querySelectorAll('text, tspan').forEach((el) => {
        const t = (el.textContent || '').trim()
        if (/^20\d\d-W\d{1,2}$/.test(t)) labels.push(t)
      })
      return labels
    }).filter((l) => l.length > 0)
  })

  const totalCharts = perChart.length
  const dupeCharts = perChart
    .map((labels, i) => {
      const dupes = labels.filter((l, j) => labels.indexOf(l) !== j)
      return dupes.length ? `gráfico ${i}: ${[...new Set(dupes)].join(',')}` : null
    })
    .filter(Boolean)
  console.log(`graficos=${totalCharts} labelsPorGrafico=${perChart.map((l) => l.length).join(',')} warnings=${keyWarnings.length}`)
  console.log(`amostra: ${(perChart[0] ?? []).join(', ')}`)

  if (totalCharts === 0) {
    throw new Error('Nenhum gráfico com labels de semana encontrado — seletor quebrado ou página não renderizou')
  }

  await page.screenshot({ path: 'playwright-screenshots/e2e-2026-07-15/fix-trendchart-tendencias.png' })

  if (dupeCharts.length > 0) {
    throw new Error(`Semanas duplicadas dentro do mesmo gráfico: ${dupeCharts.join(' | ')}`)
  }
  if (keyWarnings.length > 0) {
    throw new Error(`Ainda há ${keyWarnings.length} warnings de key duplicada`)
  }
  // Ordem cronológica crescente em cada gráfico.
  for (let i = 0; i < perChart.length; i++) {
    const l = perChart[i]
    if (l.length >= 2 && l[0] > l[l.length - 1]) {
      throw new Error(`Gráfico ${i} fora de ordem cronológica: ${l[0]} ... ${l[l.length - 1]}`)
    }
  }
})
