import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3224'
const TEST_EMAIL = process.env.TEST_EMAIL || 'clara-qa-test@omnx.dev'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'ClaraQA2026!Test'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  const emailField = page.locator('input[type="email"], input[name="email"]').first()
  const passwordField = page.locator('input[type="password"], input[name="password"]').first()

  if ((await emailField.count()) > 0 && (await passwordField.count()) > 0) {
    await emailField.fill(TEST_EMAIL)
    await passwordField.fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForLoadState('networkidle')
  }
}

async function openClara(page: any) {
  const chatBtn = page.locator('#chat-widget-btn')
  await expect(chatBtn).toBeVisible({ timeout: 10000 })
  await chatBtn.click()

  const textarea = page.locator('textarea[placeholder*="Pergunte sobre seus dados"]').first()
  await expect(textarea).toBeVisible({ timeout: 10000 })
  return textarea
}

async function askClara(page: any, textarea: any, question: string) {
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

test.describe('Clara — módulo de Metas vs Realizado', () => {
  test.setTimeout(120000)

  test('meta de MQLs de maio de 2026 — acima ou abaixo', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Estamos acima ou abaixo da meta de MQLs de maio de 2026?')

    // Deve mencionar meta e conter um número ou percentual
    expect(answer.toLowerCase()).toContain('meta')
    expect(answer).toMatch(/\d+/)
    // Anti-invenção: não deve criar nomes de pessoas fictícios
    expect(answer).not.toMatch(/João|Maria|Pedro|Ana|Carla|Lucas/)
  })

  test('pergunta simples de contagem de MQLs deve usar cohort, não metas', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Quantos MQLs tivemos em maio de 2026?')

    // Deve conter número e rótulo de cohort correto
    expect(answer).toMatch(/\d+/)
    expect(answer.toLowerCase()).toContain('cohort')
    expect(answer.toLowerCase()).toContain('data_lead_recebido')

    // Anti-erros: não deve confundir com meta nem com produtividade
    expect(answer.toLowerCase()).not.toContain('meta')
    expect(answer.toLowerCase()).not.toMatch(/produtividade.*data_lead_recebido/)
    expect(answer.toLowerCase()).not.toMatch(/produtividade por dataleadrecebido/)
  })
})
