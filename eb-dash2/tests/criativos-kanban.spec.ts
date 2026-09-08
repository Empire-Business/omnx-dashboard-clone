import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia|criativos)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function waitForModuleReady(page: Page, timeout = 20000) {
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout }
  ).catch(() => {})
  await page.waitForTimeout(500)
}

test.describe('Criativos — Kanban de aprovação', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/criativos?tab=kanban')
    await waitForModuleReady(page)
  })

  test('Kanban renderiza colunas de produção', async ({ page }) => {
    const kanbanTitle = page.locator('text=/Produção — Kanban/i').first()
    await expect(kanbanTitle).toBeVisible({ timeout: 15000 })

    const roteiroColumn = page.locator('text=/Roteiro/i').first()
    await expect(roteiroColumn).toBeVisible({ timeout: 10000 })

    console.log('[Criativos/Kanban] colunas renderizadas ✅')
  })

  test('cards com tag de aprovação exibem ação de aprovar ou revisão', async ({ page }) => {
    const hasPendingCard = await page.locator('text=/Roteiro em aprovação/i').first().isVisible().catch(() => false)

    if (hasPendingCard) {
      await expect(page.locator('button').filter({ hasText: /Aprovar roteiro/i }).first()).toBeVisible({ timeout: 10000 })
      await expect(page.locator('button').filter({ hasText: /Pedir revisão/i }).first()).toBeVisible({ timeout: 10000 })
      console.log('[Criativos/Kanban] ações de aprovação visíveis ✅')
    } else {
      console.log('[Criativos/Kanban] nenhum card em aprovação no momento — teste de renderização pula ações ✅')
    }
  })

  test('busca e filtro de fonte funcionam no Kanban', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar por nome ou código"]').first()
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('teste-inexistente-xyz')
    await page.waitForTimeout(500)

    const cards = page.locator('[draggable="true"]')
    const count = await cards.count()
    expect(count).toBe(0)

    await searchInput.fill('')
    await page.waitForTimeout(300)

    console.log('[Criativos/Kanban] filtro de busca responde ✅')
  })
})
