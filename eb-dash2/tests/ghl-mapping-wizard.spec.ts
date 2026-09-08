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

test.describe('GHL Mapping Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/workspace/ghl-config')
    await waitForModuleReady(page)
  })

  test('mostra empty state antes da descoberta', async ({ page }) => {
    await expect(page.locator('text=/Configuração GHL/i').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Descobrir campos do GHL/i })).toBeVisible()
    await expect(page.locator('text=/Nenhuma descoberta executada/i').first()).toBeVisible()
    await expect(page.locator('text=/Assistente de mapeamento GHL/i').first()).not.toBeVisible()

    console.log('[GHL Mapping Wizard] empty state inicial visível ✅')
  })

  test('wizard aparece após descoberta bem-sucedida', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Descobrir campos do GHL/i })).toBeVisible()
    await page.getByRole('button', { name: /Descobrir campos do GHL/i }).click()

    await expect(page.locator('text=/Assistente de mapeamento GHL/i').first()).toBeVisible({ timeout: 30000 })
    await expect(page.locator('text=/Campos obrigatórios/i').first()).toBeVisible()

    console.log('[GHL Mapping Wizard] wizard renderizado após discovery ✅')
  })
})
