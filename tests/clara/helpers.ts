import { expect } from '@playwright/test'

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3224'
export const TEST_EMAIL = process.env.TEST_EMAIL || 'clara-qa-test@omnx.dev'
export const TEST_PASSWORD = process.env.TEST_PASSWORD || 'ClaraQA2026!Test'

export async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForSelector('input#email', { state: 'visible', timeout: 10000 })

  const emailField = page.locator('input#email')
  const passwordField = page.locator('input#password')

  await emailField.fill(TEST_EMAIL)
  await passwordField.fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 20000 })
}

export async function openClara(page: any) {
  const chatBtn = page.locator('#chat-widget-btn')
  await expect(chatBtn).toBeVisible({ timeout: 10000 })
  await chatBtn.click()

  const textarea = page.locator('textarea[placeholder*="Pergunte sobre seus dados"]').first()
  await expect(textarea).toBeVisible({ timeout: 10000 })
  return textarea
}

export async function askClara(page: any, textarea: any, question: string) {
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      console.log(`[browser error] ${msg.text()}`)
    }
  })

  await textarea.fill(question)
  await textarea.press('Enter')

  await page.locator('text=Consultando dados...').first().waitFor({ timeout: 10000 })
  await page.locator('text=Consultando dados...').first().waitFor({ state: 'hidden', timeout: 90000 })

  const messages = page.locator('.group.flex.flex-col.items-start').last()
  await messages.waitFor({ timeout: 10000 })
  return await messages.innerText()
}
