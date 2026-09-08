import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'

/**
 * Catálogo canônico de sub-apps. Manter sincronizado com
 * `eb-dash2/src/types/apps.ts` e `docs/SUB-APPS-MODULARES.md`.
 */
const APP_CATALOG = [
  { slug: 'aquisicao-vendas', label: 'Aquisição & Vendas' },
  { slug: 'traqueamento', label: 'Traqueamento' },
  { slug: 'pre-vendas', label: 'Pré-Vendas' },
  { slug: 'relatorios', label: 'Relatórios' },
  { slug: 'sdr-ia', label: 'SDR IA' },
  { slug: 'metas', label: 'Metas' },
  { slug: 'leads', label: 'Leads' },
] as const

async function getHubAppLabels(page: Page): Promise<string[]> {
  // Cards do AppHub têm role="button" e contêm o título (h3) com o label do app
  const cards = page.locator('div[role="button"]')
  const count = await cards.count()
  const labels: string[] = []

  for (let i = 0; i < count; i++) {
    const heading = cards.nth(i).locator('h3').first()
    const text = await heading.textContent().catch(() => null)
    if (text) labels.push(text.trim())
  }

  return labels
}

async function openAppSelector(page: Page): Promise<void> {
  const selectorButton = page.locator('[data-testid="app-selector-trigger"]')
  await selectorButton.waitFor({ state: 'visible', timeout: 10000 })
  await selectorButton.click()
}

async function getSelectorAppLabels(page: Page): Promise<string[]> {
  await openAppSelector(page)
  // Aguarda o dropdown renderizar
  await page.waitForSelector('[role="menuitem"]', { timeout: 5000 })
  // Itens do dropdown, exceto "Todos os apps"
  const items = page.locator('[role="menuitem"]')
  const count = await items.count()
  const labels: string[] = []

  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent()
    const trimmed = text?.trim() ?? ''
    if (trimmed && trimmed !== 'Todos os apps') labels.push(trimmed)
  }

  return labels
}

async function closeAppSelector(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role="menuitem"]', { state: 'hidden', timeout: 3000 }).catch(() => {})
}

async function clearSession(page: Page): Promise<void> {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

async function waitForAppsLoaded(page: Page): Promise<void> {
  // Aguarda os cards do hub ou o estado vazio aparecerem
  await Promise.race([
    page.waitForSelector('div[role="button"]', { timeout: 20000 }),
    page.waitForSelector('text=Nenhum app disponível', { timeout: 20000 }),
  ])
  // Pequena estabilização para re-renders do React Query
  await page.waitForTimeout(500)
}

test.describe('Sub-apps — Controle de acesso', () => {
  test('Cenário A — Admin master vê todos os apps e consegue ativar/desativar', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/')
    await waitForAppsLoaded(page)

    const hubLabels = await getHubAppLabels(page)
    for (const app of APP_CATALOG) {
      expect(hubLabels).toContain(app.label)
    }

    // O seletor de apps fica no header interno dos apps, não no AppHub.
    // Navega para um app para validar o seletor.
    await page.goto('/metas')
    await page.waitForSelector('text=Metas', { timeout: 20000 })

    const selectorLabels = await getSelectorAppLabels(page)
    await closeAppSelector(page)
    for (const app of APP_CATALOG) {
      expect(selectorLabels).toContain(app.label)
    }

    // Acessa configuração de apps
    await page.goto('/admin/apps')
    await expect(page.locator('h1')).toContainText('Apps do Workspace')

    // Escolhe o app "Leads" para alternar (baixo impacto operacional)
    const targetApp = APP_CATALOG.find((app) => app.slug === 'leads')!
    const appCard = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${targetApp.label}`) })
      .filter({ has: page.locator('button[role="switch"]') })
      .first()
    const toggle = appCard.locator('button[role="switch"]')

    // Garante que o app está ativo antes de desativar
    const initialState = await toggle.getAttribute('aria-checked')
    if (initialState !== 'true') {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
    }

    // Desativa
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // Verifica que o app desativado some do seletor
    await page.goto('/metas')
    await page.waitForSelector('text=Metas', { timeout: 20000 })
    const selectorLabelsAfterDisable = await getSelectorAppLabels(page)
    await closeAppSelector(page)
    expect(selectorLabelsAfterDisable).not.toContain(targetApp.label)

    // Cleanup: reativa o app
    await page.goto('/admin/apps')
    const appCardAfter = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${targetApp.label}`) })
      .filter({ has: page.locator('button[role="switch"]') })
      .first()
    const toggleAfter = appCardAfter.locator('button[role="switch"]')
    await toggleAfter.click()
    await expect(toggleAfter).toHaveAttribute('aria-checked', 'true')
  })

  test('Cenário B — Gestor vê apenas apps permitidos e não acessa /admin/apps', async ({ page }) => {
    await loginAs(page, 'gestor')
    await page.goto('/')
    await waitForAppsLoaded(page)

    const hubLabels = await getHubAppLabels(page)
    expect(hubLabels.length).toBeGreaterThan(0)

    // Tenta acessar configuração de apps diretamente
    await page.goto('/admin/apps')
    // Sem permissão, PermissionRoute redireciona para /
    await page.waitForURL('/', { timeout: 10000 })
    expect(page.url()).not.toContain('/admin/apps')
  })

  test('Cenário C — SDR vê pré-vendas, mas não vendas/relatórios, e /vendas redireciona', async ({ page }) => {
    await loginAs(page, 'sdr')
    await page.goto('/')
    await waitForAppsLoaded(page)

    const hubLabels = await getHubAppLabels(page)
    expect(hubLabels).toContain('Pré-Vendas')

    // Validações que dependem da configuração real de permissões do SDR
    expect(hubLabels).not.toContain('Aquisição & Vendas')
    expect(hubLabels).not.toContain('Relatórios')

    // Acesso direto a /vendas deve ser bloqueado
    await page.goto('/vendas')
    await page.waitForURL('/', { timeout: 10000 })
    expect(page.url()).toMatch(/\/$/)
  })

  test('Cenário D — App desativado pelo admin desaparece para outro usuário', async ({ page }) => {
    // Passo 1: gestor faz login e anota apps permitidos
    await loginAs(page, 'gestor')
    await page.goto('/')
    await waitForAppsLoaded(page)
    const initialLabels = await getHubAppLabels(page)

    // Escolhe um app que o gestor consegue ver, mas que não é usado pelo cenário A
    const candidateSlugs = ['sdr-ia', 'traqueamento', 'relatorios']
    const targetSlug = candidateSlugs.find((slug) =>
      APP_CATALOG.some(
        (app) => app.slug === slug && initialLabels.includes(app.label)
      )
    )

    // Se o gestor não vê nenhum dos candidatos, desativa "leads" mesmo assim
    // e apenas verifica que ele continua não aparecendo.
    const targetApp = APP_CATALOG.find(
      (app) => app.slug === (targetSlug ?? 'leads')
    )!

    // Passo 2: admin desativa o app escolhido
    await clearSession(page)
    await loginAs(page, 'admin_master')
    await page.goto('/admin/apps')
    await expect(page.locator('h1')).toContainText('Apps do Workspace')

    const appCard = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${targetApp.label}`) })
      .filter({ has: page.locator('button[role="switch"]') })
      .first()
    const toggle = appCard.locator('button[role="switch"]')

    const initialState = await toggle.getAttribute('aria-checked')
    const shouldReactivate = initialState === 'true'

    if (shouldReactivate) {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
    }

    // Passo 3: gestor verifica que o app não aparece
    await clearSession(page)
    await loginAs(page, 'gestor')
    await page.goto('/')
    await page.reload()
    await waitForAppsLoaded(page)
    const labelsAfterDisable = await getHubAppLabels(page)
    expect(labelsAfterDisable).not.toContain(targetApp.label)

    // Cleanup: admin reativa o app
    await clearSession(page)
    await loginAs(page, 'admin_master')
    await page.goto('/admin/apps')
    const appCardAfter = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${targetApp.label}`) })
      .filter({ has: page.locator('button[role="switch"]') })
      .first()
    const toggleAfter = appCardAfter.locator('button[role="switch"]')
    const currentState = await toggleAfter.getAttribute('aria-checked')
    if (currentState !== 'true') {
      await toggleAfter.click()
      await expect(toggleAfter).toHaveAttribute('aria-checked', 'true')
    }
  })
})
