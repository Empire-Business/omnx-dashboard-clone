import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3224'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  // Tenta preencher credenciais se os campos existirem
  const emailField = page.locator('input[type="email"], input[name="email"]').first()
  const passwordField = page.locator('input[type="password"], input[name="password"]').first()

  if (await emailField.count() > 0 && await passwordField.count() > 0) {
    await emailField.fill(process.env.TEST_EMAIL || 'test@example.com')
    await passwordField.fill(process.env.TEST_PASSWORD || 'password123')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForLoadState('networkidle')
  }
}

test.describe('eb-dash2 — screenshots visuais', () => {
  test('página de login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('eb-dash2-login.png', {
      fullPage: true,
      maxDiffPixels: 100,
    })
  })

  test('hub de apps', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('eb-dash2-hub.png', {
      fullPage: true,
      maxDiffPixels: 100,
    })
  })

  test('dashboard pré-vendas', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/pre-vendas`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('eb-dash2-pre-vendas.png', {
      fullPage: true,
      maxDiffPixels: 100,
    })
  })

})
