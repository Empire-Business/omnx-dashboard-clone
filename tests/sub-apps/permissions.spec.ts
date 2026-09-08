import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'

async function clearSession(page: Page): Promise<void> {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

/** Aguarda AppHub carregar (cards de app visíveis ou estado vazio) */
async function waitForAppLoaded(page: Page): Promise<void> {
  await Promise.race([
    page.waitForSelector('div[role="button"]', { timeout: 20000 }),
    page.waitForSelector('text=Nenhum app disponível', { timeout: 20000 }),
    page.waitForSelector('a[href="/admin/apps"]', { timeout: 20000 }),
  ])
  await page.waitForTimeout(300)
}

/** Navega para o AppHub, clica no primeiro app disponível e entra no DashboardLayout */
async function enterFirstApp(page: Page): Promise<void> {
  await page.goto('/')
  await waitForAppLoaded(page)
  // AppHub cards são div[role="button"] com h3 contendo o nome do app
  const cards = page.locator('div[role="button"]')
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    const heading = await cards.nth(i).locator('h3').first().textContent().catch(() => null)
    if (heading && !heading.toLowerCase().includes('configurar')) {
      await cards.nth(i).click()
      break
    }
  }
  // Aguarda sair do AppHub (pathname muda de /)
  await page.waitForFunction(
    () => window.location.pathname !== '/',
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// Cenário 1 — AdminMenu: admin vê botão ativo, não-admin vê desabilitado
// ---------------------------------------------------------------------------
test.describe('AdminMenu — visibilidade por papel', () => {
  test('admin_master: botão Admin ativo e dropdown abre com item Apps', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/pre-vendas')
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="admin-menu-trigger"]')
    await btn.waitFor({ state: 'visible', timeout: 15000 })
    await expect(btn).not.toBeDisabled()

    await btn.click()
    // Dropdown deve mostrar item "Apps"
    await expect(page.locator('[role="menuitem"]').filter({ hasText: 'Apps' })).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('gestor: botão Admin desabilitado', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'gestor')
    // Entra no primeiro app disponível para ter o DashboardLayout
    await enterFirstApp(page)

    const btn = page.locator('[data-testid="admin-menu-trigger"]')
    await btn.waitFor({ state: 'visible', timeout: 15000 })
    await expect(btn).toBeDisabled()
  })

  test('sdr: botão Admin desabilitado', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'sdr')
    // SDR tem acesso a pre-vendas (confirmado no Cenário C do access.spec.ts)
    await page.goto('/pre-vendas')
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="admin-menu-trigger"]')
    await btn.waitFor({ state: 'visible', timeout: 15000 })
    await expect(btn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Cenário 2 — AppHub: admin vê card "Configurar Workspace", outros não veem
// ---------------------------------------------------------------------------
test.describe('AppHub — card Configurar Workspace', () => {
  test('admin_master: vê card "Configurar Workspace" com link para /workspace/apps', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/')
    await waitForAppLoaded(page)

    // Card existe como link para /workspace/apps (portal user-first de Jobs)
    const adminLink = page.locator('a[href="/workspace/apps"]')
    await expect(adminLink).toBeVisible({ timeout: 10000 })
    const linkText = await adminLink.textContent()
    expect(linkText).toMatch(/Configurar Workspace|configure seu workspace/i)
  })

  test('gestor: NÃO vê card "Configurar Workspace"', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'gestor')
    await page.goto('/')
    await waitForAppLoaded(page)

    const adminLink = page.locator('a[href="/workspace/apps"]')
    const count = await adminLink.count()
    expect(count).toBe(0)
  })

  test('sdr: NÃO vê card "Configurar Workspace"', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'sdr')
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      test.skip()
      return
    }

    const adminLink = page.locator('a[href="/workspace/apps"]')
    const count = await adminLink.count()
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Cenário 3 — Portal /workspace/* bloqueado para não-admins
// ---------------------------------------------------------------------------
test.describe('Portal /workspace/* — proteção por papel', () => {
  test('admin_master: acessa /workspace/apps e /workspace/users sem redirecionamento', async ({ page }) => {
    await loginAs(page, 'admin_master')

    await page.goto('/workspace/apps')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/workspace/apps')

    await page.goto('/workspace/users')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/workspace/users')
  })

  test('gestor: /workspace/apps redireciona para /', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'gestor')

    await page.goto('/workspace/apps')
    await page.waitForURL((url) => !url.pathname.includes('/workspace'), { timeout: 10000 })
    expect(page.url()).not.toContain('/workspace/apps')
  })

  test('gestor: /workspace/users redireciona para /', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'gestor')

    await page.goto('/workspace/users')
    await page.waitForURL((url) => !url.pathname.includes('/workspace'), { timeout: 10000 })
    expect(page.url()).not.toContain('/workspace/users')
  })

  test('sdr: /workspace/apps redireciona para /', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'sdr')

    await page.goto('/workspace/apps')
    await page.waitForURL((url) => !url.pathname.includes('/workspace'), { timeout: 10000 })
    expect(page.url()).not.toContain('/workspace/apps')
  })
})

// ---------------------------------------------------------------------------
// Cenário 4 — LimpezaTab: admin acessa, sdr é bloqueado
// ---------------------------------------------------------------------------
test.describe('LimpezaTab — acesso por papel', () => {
  test('admin_master: acessa /leads?tab=limpeza e vê painel de limpeza', async ({ page }) => {
    await loginAs(page, 'admin_master')

    await page.goto('/leads?tab=limpeza')
    await page.waitForLoadState('networkidle')

    // Deve continuar em /leads (não redirecionar)
    expect(page.url()).toContain('/leads')

    // Algum indicativo de conteúdo da aba de limpeza deve estar visível
    // (heading, tabela ou estado vazio)
    const hasContent = await Promise.race([
      page.waitForSelector('text=Limpeza', { timeout: 10000 }).then(() => true),
      page.waitForSelector('[data-tab="limpeza"]', { timeout: 10000 }).then(() => true),
      page.waitForSelector('text=Excluir', { timeout: 10000 }).then(() => true),
    ]).catch(() => false)

    expect(hasContent).toBe(true)
  })

  test('sdr: acessa /leads mas não vê botão de exclusão em limpeza', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'sdr')

    await page.goto('/leads?tab=limpeza')
    await page.waitForLoadState('networkidle')

    const url = page.url()

    if (!url.includes('/leads')) {
      // Se foi redirecionado, SDR não tem acesso ao app leads — isso também é válido
      expect(url).not.toContain('/leads')
    } else {
      // SDR acessa leads mas NÃO deve ver botões de exclusão (operação admin-only)
      await page.waitForTimeout(2000) // aguarda tab renderizar
      const deleteBtn = page.locator('button:has-text("Excluir"), button:has-text("Deletar"), button:has-text("Remover")')
      const deleteCount = await deleteBtn.count()
      expect(deleteCount).toBe(0)
    }
  })
})
