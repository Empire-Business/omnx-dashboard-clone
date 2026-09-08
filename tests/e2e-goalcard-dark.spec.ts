import { test } from '@playwright/test'
import { loginAs } from './sub-apps/helpers/login'

// Verificação pontual do fix: GoalPerformanceCard usava `bg-white` hardcoded,
// quebrando o card inteiro no dark mode (achado do E2E de 2026-07-15).
test.use({ viewport: { width: 1440, height: 900 } })

test('GoalPerformanceCard legível em dark e light', async ({ page }) => {
  await loginAs(page, 'admin_master')
  await page.goto('/metas?tab=tracking')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
  const setTheme = async (target: 'light' | 'dark') => {
    if ((await isDark()) === (target === 'dark')) return
    await page.getByRole('button', { name: /Ativar modo (claro|escuro)/ }).first().click()
    await page.waitForTimeout(600)
  }

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(theme)
    await page.screenshot({ path: `playwright-screenshots/e2e-2026-07-15/fix-goalcard-${theme}.png` })
  }
})
