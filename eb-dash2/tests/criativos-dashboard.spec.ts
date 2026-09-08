import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia|criativos)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function waitForModuleReady(page: Page, timeout = 20000) {
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout }
  ).catch(() => {})
  await page.waitForTimeout(500)
}

test.describe('Criativos — Dashboard como primeira aba', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/criativos')
    await waitForModuleReady(page)
  })

  test('Dashboard é a aba ativa ao entrar no app', async ({ page }) => {
    const activeTab = page.locator('[role="tab"], button, a').filter({ hasText: /^Dashboard$/i }).first()
    await expect(activeTab).toBeVisible({ timeout: 15000 })

    const url = new URL(page.url())
    expect(url.searchParams.get('tab') ?? 'dashboard').toBe('dashboard')
    console.log(`[Criativos/Dashboard] aba ativa padrão: ${url.searchParams.get('tab') ?? 'dashboard'} ✅`)
  })

  test('meta semanal e gráficos estão visíveis', async ({ page }) => {
    await expect(page.locator('text=/Meta semanal/i').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=/Throughput diário/i').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/Throughput semanal/i').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/Funil de produção/i').first()).toBeVisible({ timeout: 10000 })
    console.log('[Criativos/Dashboard] meta, gráficos e funil visíveis ✅')
  })

  test('alertas ou estado vazio são renderizados', async ({ page }) => {
    const alertSection = page.locator('text=/Alertas/i').first()
    await expect(alertSection).toBeVisible({ timeout: 10000 })

    const hasAlertOrEmpty = await page.locator('text=/Tudo certo|Nenhum alerta|situação/i').first().isVisible()
    expect(hasAlertOrEmpty).toBe(true)
    console.log('[Criativos/Dashboard] seção de alertas renderizada ✅')
  })

  test('navegar para Ranking e voltar para Dashboard atualiza a URL', async ({ page }) => {
    const rankingTab = page.locator('[role="tab"], button, a').filter({ hasText: /^Ranking$/i }).first()
    await expect(rankingTab).toBeVisible({ timeout: 10000 })
    await rankingTab.click()
    await page.waitForURL((url) => url.searchParams.get('tab') === 'ranking', { timeout: 10000 })

    const dashboardTab = page.locator('[role="tab"], button, a').filter({ hasText: /^Dashboard$/i }).first()
    await dashboardTab.click()
    await page.waitForURL((url) => url.searchParams.get('tab') === 'dashboard', { timeout: 10000 })

    expect(new URL(page.url()).searchParams.get('tab')).toBe('dashboard')
    console.log('[Criativos/Dashboard] navegação Ranking ↔ Dashboard funciona ✅')
  })
})
