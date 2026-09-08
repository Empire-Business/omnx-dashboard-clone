/**
 * Teste da automação diária de tráfego com análise da Clara
 *
 * Cobre:
 * 1. Acesso à aba Automações em /relatorios
 * 2. O schedule "Análise diária completa de tráfego" existe e está ativo
 * 3. Envio de e-mail de teste para bruno@aliancadealtovalor.com.br
 * 4. Confirmação de envio (alert) aparece
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'
const TARGET_EMAIL = 'bruno@aliancadealtovalor.com.br'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) =>
      url.pathname === '/' ||
      /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function waitForModuleReady(page: Page, timeout = 20000) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Autenticando'), { timeout })
    .catch(() => {})
  await page.waitForTimeout(500)
}

test.describe('Clara — Análise diária completa de tráfego', () => {
  test('schedule diário existe, está ativo e permite envio de teste', async ({ page }) => {
    test.setTimeout(180_000) // agent loop da Clara pode levar ~1-2 min
    await login(page)
    await page.goto('/relatorios?tab=automacoes')
    await waitForModuleReady(page)

    // A página de automações deve carregar
    await expect(page.locator('text=Automações de e-mail')).toBeVisible({ timeout: 15000 })

    // O schedule criado pela migration deve estar listado
    const scheduleTitle = page.locator('h3', { hasText: 'Análise diária completa de tráfego' }).first()
    await expect(scheduleTitle).toBeVisible({ timeout: 15000 })

    // Busca o card pai (componente Card) do schedule
    const card = scheduleTitle.locator('xpath=ancestor::div[contains(@class, "border-empire-border")][contains(@class, "bg-empire-surface")][1]')
    await expect(card.locator('text=Diário às 08:00')).toBeVisible()
    await expect(card.locator('text=1 destinatário')).toBeVisible()

    // Preenche e-mail de teste e envia
    const testInput = card.locator('input[type="email"]')
    await testInput.fill(TARGET_EMAIL)

    // Aguarda o alert de confirmação (Promise — o agent loop demora; não usar wait fixo)
    let alertMessage = ''
    const dialogSeen = new Promise<void>((resolve) => {
      page.on('dialog', async (dialog) => {
        alertMessage = dialog.message()
        await dialog.accept()
        resolve()
      })
    })

    await card.locator('button', { hasText: 'Testar' }).first().click()
    await dialogSeen

    // Exato para não dar falso-positivo com mensagens de erro que contêm "não enviado"
    expect(alertMessage).toBe('E-mail de teste enviado!')

    console.log('[Clara daily report] teste enviado com sucesso ✅')
  })

  test('preset de análise diária preenche o formulário corretamente', async ({ page }) => {
    await login(page)
    await page.goto('/relatorios?tab=automacoes')
    await waitForModuleReady(page)

    await page.locator('button', { hasText: 'Nova automação' }).first().click()
    await expect(page.locator('text=Análise diária de tráfego')).toBeVisible({ timeout: 10000 })

    await page.locator('button', { hasText: 'Análise diária de tráfego' }).first().click()

    // Verifica que o formulário foi preenchido com os valores do preset
    await expect(page.locator('input#name')).toHaveValue('Análise diária completa de tráfego')
    await expect(page.locator('text=Adicionar resumo escrito pela Clara')).toBeVisible()

    console.log('[Clara daily report] preset preenche o formulário ✅')
  })
})
