import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia|criativos|workspace)/.test(url.pathname),
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

test.describe('GHL Config — API Key não é armazenada na UI', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/workspace/ghl-config')
    await waitForModuleReady(page)
  })

  test('página renderiza sem input de GHL API Key', async ({ page }) => {
    await expect(page.locator('text=/Configuração GHL/i').first()).toBeVisible({ timeout: 15000 })

    const apiKeyInput = page.locator('input#ghl_api_key, input[type="password"][placeholder*="chave da API GHL"]').first()
    await expect(apiKeyInput).not.toBeVisible()

    console.log('[GHL Config] campo de API Key ausente ✅')
  })

  test('apenas Location ID e Webhook Secret estão disponíveis', async ({ page }) => {
    await expect(page.locator('input#ghl_location_id').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('input#webhook_secret').first()).toBeVisible({ timeout: 10000 })

    const locationInput = page.locator('input#ghl_location_id').first()
    await locationInput.fill('test-location-id-123')
    await expect(locationInput).toHaveValue('test-location-id-123')

    console.log('[GHL Config] apenas Location ID e Webhook Secret disponíveis ✅')
  })

  test('mensagem orienta configurar secret no Supabase', async ({ page }) => {
    await expect(page.locator('text=/secret/i').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=/GHL_API_KEY/i').first()).toBeVisible({ timeout: 10000 })

    console.log('[GHL Config] mensagem de orientação sobre secret visível ✅')
  })
})
