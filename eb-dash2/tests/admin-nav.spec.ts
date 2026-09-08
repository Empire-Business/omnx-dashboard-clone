import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao)/, { timeout: 25000 })
}

async function openAdminMenu(page: Page) {
  const adminBtn = page.locator('button[aria-label="Admin"]').first()
  await expect(adminBtn).toBeVisible({ timeout: 10000 })
  await adminBtn.click()
  await page.locator('[data-dropdown-portal]').waitFor({ state: 'visible', timeout: 5000 })
}

test.describe('Administração soberana — navegação no header', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('ícone de engrenagem aparece no header dentro de um app', async ({ page }) => {
    await page.goto('/aquisicao', { waitUntil: 'networkidle' })
    const adminBtn = page.locator('button[aria-label="Admin"]').first()
    await expect(adminBtn).toBeVisible({ timeout: 10000 })
  })

  test('menu abre com links para /admin, /workspace/users e /workspace/apps', async ({ page }) => {
    await page.goto('/aquisicao', { waitUntil: 'networkidle' })
    await openAdminMenu(page)

    const menu = page.locator('[data-dropdown-portal]')
    await expect(menu).toBeVisible()
    await expect(menu.getByText('Painel Admin')).toBeVisible()
    await expect(menu.getByText('Pessoas')).toBeVisible()
    await expect(menu.getByText('Apps').nth(0)).toBeVisible()
  })

  test('clicar em Painel Admin navega para /admin', async ({ page }) => {
    await page.goto('/aquisicao', { waitUntil: 'networkidle' })
    await openAdminMenu(page)

    await page.locator('[data-dropdown-portal]').getByText('Painel Admin').click()
    await page.waitForURL('/admin', { timeout: 10000 })
  })

  test('clicar em Pessoas navega para /workspace/users', async ({ page }) => {
    await page.goto('/aquisicao', { waitUntil: 'networkidle' })
    await openAdminMenu(page)

    await page.locator('[data-dropdown-portal]').getByText('Pessoas').click()
    await page.waitForURL('/workspace/users', { timeout: 10000 })
  })

  test('clicar em Apps navega para /workspace/apps', async ({ page }) => {
    await page.goto('/aquisicao', { waitUntil: 'networkidle' })
    await openAdminMenu(page)

    await page.locator('[data-dropdown-portal]').getByText('Apps').nth(0).click()
    await page.waitForURL('/workspace/apps', { timeout: 10000 })
  })

  test('/admin exibe hub com card GHL e cards de plataforma', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('h1')).toContainText('Administração')
    await expect(page.locator('text=/GHL/i').first()).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Usuários' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Apps' })).toBeVisible()
    await expect(page.locator('h3', { hasText: 'Permissões' })).toBeVisible()
  })

  test('/settings redireciona para /workspace', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.waitForURL('/workspace', { timeout: 10000 })
  })

  test('/settings/apps redireciona para /workspace/apps com aviso', async ({ page }) => {
    await page.goto('/settings/apps', { waitUntil: 'networkidle' })
    await page.waitForURL('/workspace/apps', { timeout: 10000 })
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Configurações globais mudaram para Administração' }).first()).toBeVisible({ timeout: 5000 })
  })
})
