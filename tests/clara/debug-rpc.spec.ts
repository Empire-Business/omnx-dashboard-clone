import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3223'
const TEST_EMAIL = process.env.TEST_EMAIL || 'clara-qa-test@omnx.dev'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'ClaraQA2026!Test'

test('debug query_criativos', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL)
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForLoadState('networkidle')

  let authHeader: string | null = null
  page.on('request', (request) => {
    const h = request.headers()['authorization']
    if (h && h.startsWith('Bearer ')) authHeader = h
  })

  const chatBtn = page.locator('#chat-widget-btn')
  await expect(chatBtn).toBeVisible({ timeout: 10000 })
  await chatBtn.click()
  const textarea = page.locator('textarea[placeholder*="Pergunte sobre seus dados"]').first()
  await expect(textarea).toBeVisible({ timeout: 10000 })
  await textarea.fill('Oi')
  await textarea.press('Enter')
  await page.waitForTimeout(3000)

  expect(authHeader).toBeTruthy()
  const token = authHeader!.replace('Bearer ', '')

  const res = await page.evaluate(async (params) => {
    const response = await fetch('https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/bot-chat-data', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools: [{ name: 'query_criativos', arguments: { start_date: '2026-05-01', end_date: '2026-05-31', group_by: 'creative' } }] }),
    })
    return { status: response.status, body: await response.text() }
  }, { token })

  console.log('STATUS:', res.status)
  console.log('BODY:', res.body.slice(0, 4000))
})
