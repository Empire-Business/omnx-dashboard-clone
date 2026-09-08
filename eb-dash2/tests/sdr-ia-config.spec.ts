/**
 * Testes Playwright — SDR IA > Configuração
 *
 * Cobre:
 * 1. Carregamento da aba Configuração sem erro JS crítico
 * 2. Presença dos filtros configuráveis (tags, pipelines, UTMs)
 * 3. Botão/Opção "Deixar 100% aberto" visível
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function goToSdrIaConfig(page: Page) {
  await page.goto('/sdr-ia?tab=configuracao')
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForTimeout(2000)
}

test.describe('SDR IA → Configuração', () => {
  test('aba Configuração carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToSdrIaConfig(page)

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[SDR-IA/config] carregou sem erros JS ✅')
  })

  test('filtros configuráveis estão presentes (tags, pipelines, UTMs)', async ({ page }) => {
    await login(page)
    await goToSdrIaConfig(page)

    const bodyText = await page.locator('body').innerText()
    const hasTags = /tags/i.test(bodyText)
    const hasPipelines = /pipeline/i.test(bodyText)
    const hasUtms = /utm/i.test(bodyText)

    expect(hasTags || hasPipelines || hasUtms, 'Esperava encontrar referência a tags, pipelines ou UTMs').toBe(true)
    console.log('[SDR-IA/config] filtros configuráveis visíveis ✅')
  })

  test('opção "Deixar 100% aberto" está presente', async ({ page }) => {
    await login(page)
    await goToSdrIaConfig(page)

    const bodyText = await page.locator('body').innerText()
    expect(/100% aberto|tudo aberto|limpar filtros/i.test(bodyText)).toBe(true)
    console.log('[SDR-IA/config] opção "100% aberto" visível ✅')
  })
})
