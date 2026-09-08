/**
 * Teste de sanidade: Taxa de Comparecimento + Taxa de No-show nunca passa de 100%
 * no painel de vendas (módulo Vendas).
 *
 * Contexto: havia 52 oportunidades com ambos data_realizacao_vendas e
 * data_no_show_vendas preenchidos, fazendo a soma passar de 100%.
 * Correção: no-show exclui leads que também têm reunião realizada.
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

// ─── Helper: login ───────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao)/, { timeout: 25000 })
}

// ─── Helper: extrair número de um texto como "Taxa de Comparecimento 64%" ───

function extractPercent(text: string): number {
  const match = text.match(/(\d+)%/)
  return match ? parseInt(match[1], 10) : -1
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Vendas — Taxa Comparecimento + No-show ≤ 100%', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/vendas')
    // Aguarda a página carregar completamente
    await page.waitForTimeout(1500)
  })

  test('Aba Geral: soma dos KPIs não passa de 100%', async ({ page }) => {
    // Localiza os cards pelos textos visíveis
    const comparecimentoLocator = page.locator('div, span, p').filter({ hasText: /Taxa de Comparecimento.*\d+%/i }).first()
    const noShowLocator = page.locator('div, span, p').filter({ hasText: /Taxa de No-show.*\d+%/i }).first()

    await expect(comparecimentoLocator).toBeVisible({ timeout: 15000 })
    await expect(noShowLocator).toBeVisible({ timeout: 15000 })

    const comparecimentoText = await comparecimentoLocator.textContent() ?? ''
    const noShowText = await noShowLocator.textContent() ?? ''

    const comparecimento = extractPercent(comparecimentoText)
    const noShow = extractPercent(noShowText)

    console.log(`[GeralTab] Comparecimento: ${comparecimento}% | No-show: ${noShow}% | Soma: ${comparecimento + noShow}%`)

    expect(comparecimento, `Taxa de Comparecimento deve ser ≥ 0, mas foi ${comparecimento}`).toBeGreaterThanOrEqual(0)
    expect(noShow, `Taxa de No-show deve ser ≥ 0, mas foi ${noShow}`).toBeGreaterThanOrEqual(0)
    expect(comparecimento + noShow, `Soma de Comparecimento (${comparecimento}%) + No-show (${noShow}%) não deve passar de 100%`).toBeLessThanOrEqual(100)
  })

  test('Aba Matriz (Cohort): carrega sem erros e dados estão visíveis', async ({ page }) => {
    // Navega para a aba Matriz
    const matrizTab = page.locator('nav button, [role="tab"]').filter({ hasText: /^matriz$/i }).first()
    if (await matrizTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await matrizTab.click()
      await page.waitForTimeout(1000)
    }

    // Aguarda a matriz carregar
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 15000 })

    // Verifica que não há texto de erro ou carregamento infinito
    const bodyText = await page.locator('body').textContent() ?? ''
    expect(bodyText).not.toContain('Erro ao carregar')
    expect(bodyText).not.toContain('Carregando...')

    // Verifica que há pelo menos 1 linha de dados
    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)
    console.log(`[MatrizTab] Matriz carregou com ${rowCount} linhas ✅`)
  })

  test('Modo Produtividade: soma dos KPIs não passa de 100%', async ({ page }) => {
    // Muda para modo Produtividade
    const prodBtn = page.locator('button').filter({ hasText: /^produtividade$/i }).first()
    if (await prodBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prodBtn.click()
      await page.waitForTimeout(1000)
    }

    const comparecimentoLocator = page.locator('div, span, p').filter({ hasText: /Taxa de Comparecimento.*\d+%/i }).first()
    const noShowLocator = page.locator('div, span, p').filter({ hasText: /Taxa de No-show.*\d+%/i }).first()

    await expect(comparecimentoLocator).toBeVisible({ timeout: 15000 })
    await expect(noShowLocator).toBeVisible({ timeout: 15000 })

    const comparecimentoText = await comparecimentoLocator.textContent() ?? ''
    const noShowText = await noShowLocator.textContent() ?? ''

    const comparecimento = extractPercent(comparecimentoText)
    const noShow = extractPercent(noShowText)

    console.log(`[Produtividade] Comparecimento: ${comparecimento}% | No-show: ${noShow}% | Soma: ${comparecimento + noShow}%`)

    expect(comparecimento + noShow, `Soma de Comparecimento (${comparecimento}%) + No-show (${noShow}%) não deve passar de 100%`).toBeLessThanOrEqual(100)
  })
})
