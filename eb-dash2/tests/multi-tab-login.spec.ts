/**
 * Teste Playwright — múltiplas abas abertas simultaneamente
 *
 * Cenário que disparava o bug do navigator.locks:
 * abrir 2-3 abas do dashboard ao mesmo tempo e trocar entre elas.
 * Verifica que a tela de apps não quebra com o erro
 * "Lock broken by another request with the 'steal' option".
 */

import { test, expect } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function loginInPage(page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|disparos|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

test('múltiplas abas abertas não quebram com navigator.locks', async ({ browser }) => {
  const context = await browser.newContext()
  const errorsByPage: Record<string, string[]> = {}

  const page1 = await context.newPage()
  const page2 = await context.newPage()
  const page3 = await context.newPage()

  for (const [label, page] of [['page1', page1], ['page2', page2], ['page3', page3]]) {
    page.on('pageerror', (err) => {
      errorsByPage[label] = errorsByPage[label] || []
      errorsByPage[label].push(err.message)
    })
  }

  // Login em paralelo nas 3 abas
  await Promise.all([loginInPage(page1), loginInPage(page2), loginInPage(page3)])

  // Alterna rapidamente entre as abas
  for (let i = 0; i < 5; i++) {
    await page1.bringToFront()
    await page1.waitForTimeout(300)
    await page2.bringToFront()
    await page2.waitForTimeout(300)
    await page3.bringToFront()
    await page3.waitForTimeout(300)
  }

  const lockErrors: string[] = []
  for (const [label, errors] of Object.entries(errorsByPage)) {
    for (const err of errors) {
      if (err.toLowerCase().includes('lock') || err.toLowerCase().includes('steal')) {
        lockErrors.push(`${label}: ${err}`)
      }
    }
  }

  expect(lockErrors.length, `Erros de lock detectados: ${lockErrors.join(' | ')}`).toBe(0)

  await context.close()
  console.log('[Multi-tab] nenhum erro de navigator.locks ✅')
})
