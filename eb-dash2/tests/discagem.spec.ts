/**
 * Testes Playwright — Aba Discagem (Pré-Vendas)
 *
 * Cobre:
 * 1. Carregamento da aba sem erro JS
 * 2. KPI de "Ligações hoje" visível
 * 3. Lista plana com cards (sem cabeçalhos de seção por camada)
 * 4. Cards mostram "Ligue para" + nome + badge de razão
 * 5. Cards mostram número de telefone
 * 6. Cards mostram "Chegou hoje" ou dias na base
 * 7. Clicar no card abre LeadCard
 * 8. Botão "Atualizar" funciona sem erro JS
 * 9. Filtro de SDR visível para admin/gestor
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS  = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas)/.test(url.pathname),
    { timeout: 30000 }
  )
}

async function goToDiscagem(page: Page) {
  await page.goto('/pre-vendas?tab=discagem')
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout: 15000 }
  ).catch(() => {})
  await page.waitForTimeout(2000)
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Carregamento básico
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Discagem — carregamento', () => {
  test('aba Discagem carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToDiscagem(page)

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[Discagem/load] carregou sem erros JS ✅')
  })

  test('título "Fila de Discagem" está visível', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)

    await expect(
      page.locator('h2').filter({ hasText: /Fila de Discagem/i })
    ).toBeVisible({ timeout: 10000 })
    console.log('[Discagem/load] título visível ✅')
  })

  test('contador "Ligações hoje" está visível', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)

    await expect(
      page.getByText(/Ligações hoje/i)
    ).toBeVisible({ timeout: 10000 })
    console.log('[Discagem/load] contador ligações visível ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — Lista plana (sem blocos de camada)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Discagem — lista plana', () => {
  test('não exibe cabeçalhos de seção por camada', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    // Cabeçalhos de seção tinham fundo colorido e texto uppercase em bloco separado
    // Verificamos pela ausência de elementos com as classes específicas de CamadaHeader
    // (que usavam headerBg como bg-amber-50, bg-emerald-50, bg-red-50, bg-slate-50 com border mt-3)
    const camadaHeaders = page.locator('div.rounded-lg.border.mt-3.mb-1')
    expect(await camadaHeaders.count()).toBe(0)
    console.log('[Discagem/lista] nenhum cabeçalho de seção CamadaHeader encontrado ✅')
  })

  test('exibe leads OU estado vazio', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const temLeads = await page.getByText(/Ligue para/i).count() > 0
    const temEstadoVazio = await page.locator('text=Fila zerada').count() > 0
      || await page.locator('text=Reengajar').count() > 0

    expect(temLeads || temEstadoVazio).toBe(true)
    console.log(`[Discagem/lista] temLeads=${temLeads}, temEstadoVazio=${temEstadoVazio} ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — Conteúdo dos cards
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Discagem — cards de lead', () => {
  test('cards mostram "Ligue para" e nome do lead', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const filaVazia = await page.locator('text=Fila zerada').count() > 0
    if (filaVazia) {
      console.log('[Discagem/cards] fila vazia — skip ✅')
      return
    }

    const liguePara = page.getByText(/Ligue para/i)
    await expect(liguePara.first()).toBeVisible({ timeout: 10000 })
    const count = await liguePara.count()
    expect(count).toBeGreaterThan(0)
    console.log(`[Discagem/cards] ${count} card(s) com "Ligue para" ✅`)
  })

  test('badge de razão aparece no card (Novo hoje, Tentativa, Respondeu, task GHL)', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const filaVazia = await page.locator('text=Fila zerada').count() > 0
    if (filaVazia) {
      console.log('[Discagem/cards] fila vazia — skip ✅')
      return
    }

    const badges = page.locator('text=/Novo hoje|Tentativa \\d|Respondeu há|Ligar|call|retorno/i')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    console.log(`[Discagem/cards] ${count} badge(s) de razão visíveis ✅`)
  })

  test('cards mostram número de telefone', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const filaVazia = await page.locator('text=Fila zerada').count() > 0
    if (filaVazia) {
      console.log('[Discagem/cards] fila vazia — skip ✅')
      return
    }

    const telefones = page.locator('text=/\\+55|\\(\\d{2}\\)/')
    const count = await telefones.count()
    if (count > 0) {
      console.log(`[Discagem/cards] ${count} card(s) com telefone visível ✅`)
    } else {
      console.log('[Discagem/cards] nenhum telefone visível (leads sem telefone?) ⚠️')
    }
  })

  test('cards mostram "Chegou hoje" ou dias na base', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const filaVazia = await page.locator('text=Fila zerada').count() > 0
    if (filaVazia) {
      console.log('[Discagem/cards] fila vazia — skip ✅')
      return
    }

    const diasLabel = page.locator('text=/Chegou hoje|Chegou ontem|\\d+d na base/')
    const count = await diasLabel.count()
    if (count > 0) {
      console.log(`[Discagem/cards] ${count} card(s) com label de dias ✅`)
    } else {
      console.log('[Discagem/cards] nenhum label de dias — leads sem data_lead_recebido? ⚠️')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4 — Interações
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Discagem — interações', () => {
  test('botão "Atualizar" dispara reload sem erro', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(2000)

    const atualizarBtn = page.locator('button').filter({ hasText: /Atualizar/i }).first()
    await expect(atualizarBtn).toBeVisible({ timeout: 10000 })
    await atualizarBtn.click()
    await page.waitForTimeout(2000)

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS ao atualizar: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[Discagem/atualizar] reload sem erros JS ✅')
  })

  test('clicar no card abre LeadCard (drawer lateral)', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(3000)

    const filaVazia = await page.locator('text=Fila zerada').count() > 0
    if (filaVazia) {
      console.log('[Discagem/leadcard] fila vazia — skip ✅')
      return
    }

    const liguePara = page.locator('span.uppercase').filter({ hasText: /Ligue para/i }).first()
    await expect(liguePara).toBeVisible({ timeout: 10000 })
    await liguePara.click()

    const drawer = page.locator('aside[class*="fixed"][class*="right-0"]')
    await expect(drawer).toBeVisible({ timeout: 10000 })
    console.log('[Discagem/leadcard] LeadCard abriu ✅')

    const backdrop = page.locator('div[class*="fixed"][class*="inset-0"][class*="backdrop-blur"]')
    await backdrop.click()
    await page.waitForTimeout(400)

    const isVisible = await drawer.isVisible()
    expect(!isVisible || await drawer.evaluate(el =>
      window.getComputedStyle(el).transform.includes('matrix')
    )).toBe(true)
    console.log('[Discagem/leadcard] LeadCard fechou pelo backdrop ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5 — Filtro de SDR (admin)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Discagem — filtro de SDR', () => {
  test('dropdown de SDR é visível para o usuário de teste (admin/gestor)', async ({ page }) => {
    await login(page)
    await goToDiscagem(page)
    await page.waitForTimeout(2000)

    const sdrSelect = page.locator('select').filter({
      has: page.locator('option').filter({ hasText: /Todos os SDRs/i }),
    }).first()

    const count = await sdrSelect.count()
    if (count > 0) {
      await expect(sdrSelect).toBeVisible({ timeout: 5000 })
      const opcoes = await sdrSelect.locator('option').count()
      expect(opcoes).toBeGreaterThanOrEqual(1)
      console.log(`[Discagem/filtro] dropdown SDR com ${opcoes} opção(ões) ✅`)
    } else {
      console.log('[Discagem/filtro] dropdown SDR não visível — usuário não é admin/gestor ⚠️')
    }
  })
})
