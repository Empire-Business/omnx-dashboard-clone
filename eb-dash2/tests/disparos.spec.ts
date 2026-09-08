/**
 * Testes Playwright — Módulo Disparos
 *
 * Cobre:
 * 1. Carregamento do Dashboard sem erro JS crítico
 * 2. Presença do resumo geral (quando há disparos) ou da tabela vazia
 * 3. Navegação para Configuração e presença de campos manuais / custo por mensagem
 * 4. Botão "Novo" visível na aba Configuração
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
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|disparos)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function goToDisparos(page: Page, tab = 'dashboard') {
  await page.goto(`/disparos?tab=${tab}`)
  // Aguarda o carregamento dos dados (spinner some)
  await page.waitForFunction(
    () => !document.querySelector('[class*="animate-spin"]'),
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForTimeout(500)
}

test.describe('Disparos — Dashboard', () => {
  test('Dashboard carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToDisparos(page, 'dashboard')

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[Disparos/dashboard] carregou sem erros JS ✅')
  })

  test('resumo geral ou estado vazio é exibido', async ({ page }) => {
    await login(page)
    await goToDisparos(page, 'dashboard')

    const bodyText = await page.locator('body').innerText()
    const hasResumo = /Custo total estimado|Total enviado|Total convertido|Campanhas ativas/i.test(bodyText)
    const hasEmpty = /Nenhuma campanha|nenhuma campanha|Selecione uma campanha/i.test(bodyText)

    expect(hasResumo || hasEmpty, 'Esperava resumo geral ou estado vazio do dashboard').toBe(true)
    console.log('[Disparos/dashboard] resumo/estado vazio visível ✅')
  })

  test('barra de filtros está presente (período, status, tipo, busca)', async ({ page }) => {
    await login(page)
    await goToDisparos(page, 'dashboard')

    const bodyText = await page.locator('body').innerText()
    expect(/Todo o período/i.test(bodyText)).toBe(true)
    expect(/30 dias/i.test(bodyText)).toBe(true)
    expect(/Status:/i.test(bodyText)).toBe(true)
    expect(/Tipo:/i.test(bodyText)).toBe(true)
    await expect(page.getByPlaceholder('Buscar campanha...')).toBeVisible({ timeout: 10000 })
    console.log('[Disparos/dashboard] barra de filtros visível ✅')
  })
})

test.describe('Disparos — Configuração', () => {
  test('aba Configuração carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToDisparos(page, 'configuracao')

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[Disparos/config] carregou sem erros JS ✅')
  })

  test('seção de custo por mensagem e campos manuais estão presentes', async ({ page }) => {
    await login(page)
    await goToDisparos(page, 'configuracao')

    const bodyText = await page.locator('body').innerText()
    expect(/Custo por mensagem/i.test(bodyText)).toBe(true)
    expect(/Campos manuais/i.test(bodyText)).toBe(true)
    console.log('[Disparos/config] custo por mensagem e campos manuais visíveis ✅')
  })

  test('botão "Novo" disparo está presente', async ({ page }) => {
    await login(page)
    await goToDisparos(page, 'configuracao')

    const button = page.getByRole('button', { name: /^Novo$/i })
    await expect(button).toBeVisible({ timeout: 10000 })
    console.log('[Disparos/config] botão Novo visível ✅')
  })
})
