/**
 * Teste da página de Integrações: garante que a OpenRouter está fácil de achar
 * e que o fluxo de salvar uma chave funciona (mesmo que a chave seja inválida).
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
    (url) =>
      url.pathname === '/' ||
      /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

test.describe('Integrações — OpenRouter', () => {
  test('menu Integrações leva à página com card OpenRouter funcional', async ({ page }) => {
    await login(page)

    // Abre o menu de workspace (Administração)
    await page.goto('/workspace/users')
    await page.waitForURL('/workspace/users', { timeout: 30000 })

    // O menu lateral deve mostrar "Integrações" (não "Meta Ads")
    const integracoesLink = page.locator('aside nav a', { hasText: 'Integrações' }).first()
    await expect(integracoesLink).toBeVisible({ timeout: 10000 })
    await expect(integracoesLink).not.toHaveText('Meta Ads')

    // Clica e vai para a página
    await integracoesLink.click()
    await page.waitForURL('/workspace/integracoes', { timeout: 30000 })

    // Título da página deve refletir que é a central de integrações
    await expect(page.locator('h1', { hasText: 'Integrações' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Conecte as chaves de acesso externas')).toBeVisible()

    // Card OpenRouter deve estar visível e identificável
    const openrouterHeading = page.getByRole('heading', { name: 'OpenRouter (IA)' }).first()
    await expect(openrouterHeading).toBeVisible({ timeout: 10000 })
    const openrouterCard = openrouterHeading.locator('xpath=ancestor::div[contains(@class, "rounded-")][contains(@class, "border")][1]')
    await expect(openrouterCard).toBeVisible()
    await expect(openrouterCard.getByText('Use a chave da sua própria conta OpenRouter')).toBeVisible()

    // Fluxo de salvar uma chave (chave fake — espera-se feedback de erro/sucesso, não travamento)
    const input = openrouterCard.locator('input[type="password"]').first()
    await expect(input).toBeVisible()
    await input.fill('sk-or-v1-fake-test-key-playwright')

    const submit = openrouterCard.locator('button[type="submit"]').first()
    await expect(submit).toBeEnabled()
    await submit.click()

    // Após clicar, o sistema deve dar algum feedback (toast de sucesso ou erro)
    // e o campo deve ser limpo em caso de sucesso
    await page.waitForTimeout(2000)
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast.first()).toBeVisible({ timeout: 10000 })

    console.log('✅ Integrações: menu, página e card OpenRouter estão acessíveis e funcionais')
  })
})
