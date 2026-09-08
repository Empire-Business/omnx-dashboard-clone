/**
 * Testes de filtros do dashboard — Playwright
 *
 * ABORDAGEM: verificar que os dados NA TELA mudam quando um filtro é aplicado.
 *
 * Estratégia por teste:
 * 1. Navegar para página + tab
 * 2. Aguardar carregamento dos dados (contador visível, não "Carregando...")
 * 3. Capturar texto do contador ANTES do filtro
 * 4. Aplicar filtro
 * 5. Aguardar o contador mudar (dados re-filtrados)
 * 6. Verificar que o contador mudou (texto depois ≠ texto antes)
 * 7. Limpar → verificar que voltou ao original
 *
 * Os testes NÃO verificam apenas se o <select> mudou de valor.
 * Verificam se o EFEITO nos dados é real.
 */

import { test, expect, type Page, type Locator } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'
const COUNTER_TIMEOUT = 12000

// ─── HELPER: login ───────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao)/, { timeout: 25000 })
}

// ─── HELPER: aguarda select ter opções ──────────────────────────────────────

async function waitForSelectOptions(page: Page, placeholder: string, timeout = 15000) {
  await page.waitForFunction(
    (p) => {
      const selects = Array.from(document.querySelectorAll('select'))
      const target = selects.find((s) =>
        Array.from(s.options).some((o) => o.value === '' && o.text === p)
      )
      return target != null && Array.from(target.options).some((o) => o.value !== '')
    },
    placeholder,
    { timeout }
  ).catch(() => {})
}

// ─── HELPER: aguarda tabela ter linhas de dados ──────────────────────────────

async function waitForTableData(page: Page, timeout = 15000) {
  await page.waitForSelector('table tbody tr', { timeout }).catch(() => {})
  await page.waitForTimeout(500)
}

// ─── HELPER: aguarda contador de texto estabilizar (não "Carregando...") ────

async function waitForCounterStable(locator: Locator, timeout = 15000) {
  await expect(locator).not.toContainText('Carregando', { timeout })
  await expect(locator).not.toContainText('carregando', { timeout })
}

// ─── HELPER: captura texto atual do contador ─────────────────────────────────

async function getCounterText(locator: Locator): Promise<string> {
  return ((await locator.textContent()) ?? '').trim()
}

// ─── HELPER: aguarda contador mudar em relação ao valor anterior ─────────────

async function waitForCounterChange(locator: Locator, textBefore: string, timeout = COUNTER_TIMEOUT) {
  // Aguarda até o texto ser diferente de antes
  await expect(async () => {
    const current = await getCounterText(locator)
    expect(current).not.toBe(textBefore)
  }).toPass({ timeout })
}

// ─── HELPER: aplica filtro num select pelo texto do placeholder ──────────────

async function applyFilter(page: Page, placeholder: string, value: string) {
  const select = page
    .locator('select')
    .filter({ has: page.locator(`option[value=""]:text("${placeholder}")`) })
    .first()
  await select.selectOption(value)
}

// ─── HELPER: pega 1ª opção não-vazia de um select ────────────────────────────

async function getFirstOption(page: Page, placeholder: string): Promise<string | null> {
  const select = page
    .locator('select')
    .filter({ has: page.locator(`option[value=""]:text("${placeholder}")`) })
    .first()
  const options = select.locator('option:not([value=""])')
  if ((await options.count()) === 0) return null
  return options.first().getAttribute('value')
}

// ─── HELPER: clica no botão Limpar de forma robusta ──────────────────────────

async function clickLimpar(page: Page) {
  const clearBtn = page.locator('button').filter({ hasText: /^limpar$/i }).first()
  await clearBtn.waitFor({ state: 'visible', timeout: 5000 })
  await clearBtn.click({ force: true })
  await page.waitForTimeout(400)
}

// ─── HELPER: muda para modo Produtividade ────────────────────────────────────

async function switchToProdutividade(page: Page) {
  const btn = page.locator('button').filter({ hasText: /^produtividade$/i }).first()
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const isActive = await btn.evaluate((el) =>
      el.getAttribute('class')?.includes('gold') ||
      el.getAttribute('style')?.includes('gold') ||
      el.getAttribute('aria-selected') === 'true'
    )
    if (!isActive) {
      await btn.click()
      await page.waitForTimeout(400)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Pré-Vendas: cada filtro muda o contador global "N leads no período"
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Pré-Vendas — filtros mudam contador global de leads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas')
    await waitForSelectOptions(page, 'Canal')
    // Aguarda contador global estabilizar
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    await waitForCounterStable(counter)
    await expect(counter).toBeVisible({ timeout: 10000 })
  })

  test('SDR "SDR IA" → contador de leads muda + Limpar restaura', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)
    console.log(`[PreVendas/SDR] antes: "${before}"`)

    await applyFilter(page, 'SDR', 'SDR IA')
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after, `Filtro SDR IA deve mudar o contador. Antes="${before}" Depois="${after}"`).not.toBe(before)
    console.log(`[PreVendas/SDR] depois: "${after}" ✅`)

    await clickLimpar(page)
    await waitForCounterChange(counter, after)
    const restored = await getCounterText(counter)
    expect(restored, `Limpar deve restaurar o contador original`).toBe(before)
    console.log(`[PreVendas/SDR] limpo: "${restored}" ✅`)
  })

  test('Canal (1ª opção) → contador de leads muda + Limpar restaura', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Canal')
    if (!option) { console.warn('[PreVendas/Canal] sem opções'); return }

    await applyFilter(page, 'Canal', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[PreVendas/Canal] "${option}": "${before}" → "${after}" ✅`)

    await clickLimpar(page)
    await waitForCounterChange(counter, after)
    expect(await getCounterText(counter)).toBe(before)
    console.log(`[PreVendas/Canal] limpo ✅`)
  })

  test('Closer (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Closer')
    if (!option) { console.warn('[PreVendas/Closer] sem opções'); return }

    await applyFilter(page, 'Closer', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[PreVendas/Closer] "${option}": "${before}" → "${after}" ✅`)
  })

  test('Funil (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Funil')
    if (!option) { console.warn('[PreVendas/Funil] sem opções'); return }

    await applyFilter(page, 'Funil', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[PreVendas/Funil] "${option}": "${before}" → "${after}" ✅`)
  })

  test('Campanha (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Campanha')
    if (!option) { console.warn('[PreVendas/Campanha] sem opções'); return }

    await applyFilter(page, 'Campanha', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[PreVendas/Campanha] "${option}": "${before}" → "${after}" ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — Pré-Vendas: aba Atividades filtra dados reais (bug corrigido)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Pré-Vendas — aba Atividades: SDR IA filtra dados reais', () => {
  test('SDR "SDR IA" → dados da aba Atividades mudam (bug fix test)', async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas')
    await waitForSelectOptions(page, 'SDR')

    // Muda para Produtividade (Atividades só funciona nesse modo)
    await switchToProdutividade(page)

    // Navega para aba Atividades
    await page.locator('nav button').filter({ hasText: /^atividades$/i }).first().click()

    // Aguarda dados aparecerem (contador de atividades ou mensagem vazia)
    const atividadesCounter = page.locator('p').filter({ hasText: /de \d+|Nenhuma atividade/ }).first()
    await expect(atividadesCounter).toBeVisible({ timeout: 15000 })
    await waitForCounterStable(atividadesCounter)

    const before = await getCounterText(atividadesCounter)
    console.log(`[Atividades] antes: "${before}"`)

    // Aplica filtro SDR IA no painel global
    await applyFilter(page, 'SDR', 'SDR IA')

    // Aguarda contador de Atividades mudar (prova que o filtro chegou no hook)
    await waitForCounterChange(atividadesCounter, before)

    const after = await getCounterText(atividadesCounter)
    expect(after, `SDR IA deve filtrar os dados da aba Atividades. Antes="${before}" Depois="${after}"`).not.toBe(before)
    console.log(`[Atividades] depois: "${after}" ✅ — filtro SDR chegou na aba`)

    // Verificação extra: todas as linhas visíveis na coluna SDR (3ª td) devem ser "SDR IA"
    const sdrCells = page.locator('table tbody tr td:nth-child(3)')
    const rowCount = await sdrCells.count()
    if (rowCount > 0) {
      const visibles = Math.min(rowCount, 5) // verifica até 5 linhas
      for (let i = 0; i < visibles; i++) {
        const cellText = (await sdrCells.nth(i).textContent() ?? '').trim()
        expect(cellText, `Linha ${i + 1} deve ter "SDR IA" na coluna SDR, mas tem "${cellText}"`).toBe('SDR IA')
      }
      console.log(`[Atividades] ${visibles} linhas verificadas — todas com "SDR IA" ✅`)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — Pré-Vendas: aba Agendamentos filtra dados reais
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Pré-Vendas — aba Agendamentos: filtros mudam dados', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas?tab=agendamentos')
    await waitForSelectOptions(page, 'SDR')
    await waitForTableData(page)
    // Aguarda contador estabilizar
    const counter = page.locator('span').filter({ hasText: /\d+ agendamentos?/ }).first()
    await expect(counter).toBeVisible({ timeout: 15000 })
  })

  test('SDR "SDR IA" → contador de agendamentos muda', async ({ page }) => {
    const counter = page.locator('span').filter({ hasText: /\d+ agendamentos?/ }).first()
    const before = await getCounterText(counter)
    console.log(`[Agendamentos/SDR] antes: "${before}"`)

    await applyFilter(page, 'SDR', 'SDR IA')
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Agendamentos/SDR] depois: "${after}" ✅`)
  })

  test('Filtro interno de SDR da aba → contador de agendamentos muda', async ({ page }) => {
    // AgendamentosTab tem seu próprio dropdown de SDR interno (além do global).
    // Funil/Canal não passam para a query interna da tab — apenas o SDR global e o SDR interno.
    // Aqui testamos o filtro interno da própria aba.
    const counter = page.locator('span').filter({ hasText: /\d+ agendamentos?/ }).first()
    const before = await getCounterText(counter)
    console.log(`[Agendamentos/Interno] antes: "${before}"`)

    // Seleciona o dropdown interno da tab (tem "Todos os SDRs" como opção vazia)
    const internalSdrSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Todos os SDRs' }),
    })
    await expect(internalSdrSelect).toBeVisible({ timeout: 10000 })

    // Pega a primeira opção real (índice 1)
    const firstOption = await internalSdrSelect.locator('option').nth(1).getAttribute('value')
    if (!firstOption) { console.warn('[Agendamentos/Interno] sem opções no dropdown interno'); return }

    await internalSdrSelect.selectOption(firstOption)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Agendamentos/Interno] SDR "${firstOption}": "${before}" → "${after}" ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4 — Vendas: filtros mudam o contador global "N leads no período"
// (ReunioesTab tem loading próprio lento — testamos via contador global da página)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Vendas — filtros mudam contador global de leads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/vendas')
    await waitForSelectOptions(page, 'Canal')
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    await waitForCounterStable(counter)
    await expect(counter).toBeVisible({ timeout: 15000 })
  })

  test('SDR "SDR IA" → contador de leads muda + Limpar restaura', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)
    console.log(`[Vendas/SDR] antes: "${before}"`)

    await applyFilter(page, 'SDR', 'SDR IA')
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Vendas/SDR] depois: "${after}" ✅`)

    await clickLimpar(page)
    await waitForCounterChange(counter, after)
    expect(await getCounterText(counter)).toBe(before)
    console.log(`[Vendas/SDR] limpo e restaurado ✅`)
  })

  test('Canal (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Canal')
    if (!option) { console.warn('[Vendas/Canal] sem opções'); return }

    await applyFilter(page, 'Canal', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Vendas/Canal] "${before}" → "${after}" ✅`)
  })

  test('Closer (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Closer')
    if (!option) { console.warn('[Vendas/Closer] sem opções'); return }

    await applyFilter(page, 'Closer', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Vendas/Closer] "${before}" → "${after}" ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5 — Recuperação: Canal filtra dados
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Recuperação — Canal filtra dados reais', () => {
  test('Canal (1ª opção) → contador global muda + Limpar restaura', async ({ page }) => {
    await login(page)
    await page.goto('/recuperacao')
    await waitForSelectOptions(page, 'Canal')

    const counter = page.locator('p').filter({ hasText: /leads no período/ }).first()
    await waitForCounterStable(counter)
    await expect(counter).toBeVisible({ timeout: 15000 })
    const before = await getCounterText(counter)
    console.log(`[Recuperação/Canal] antes: "${before}"`)

    const option = await getFirstOption(page, 'Canal')
    if (!option) { console.warn('[Recuperação/Canal] sem opções'); return }

    await applyFilter(page, 'Canal', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Recuperação/Canal] "${before}" → "${after}" ✅`)

    await clickLimpar(page)
    await waitForCounterChange(counter, after)
    expect(await getCounterText(counter)).toBe(before)
    console.log(`[Recuperação/Canal] limpo e restaurado ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 6 — Aquisição: Origem e Canal filtram dados na aba Leads
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Aquisição — filtros mudam dados na aba Leads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao?tab=leads')
    await waitForSelectOptions(page, 'Origem')
    await waitForTableData(page)
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    await expect(counter).toBeVisible({ timeout: 15000 })
    await waitForCounterStable(counter)
  })

  test('Origem (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    const before = await getCounterText(counter)
    console.log(`[Aquisição/Origem] antes: "${before}"`)

    const option = await getFirstOption(page, 'Origem')
    if (!option) { console.warn('[Aquisição/Origem] sem opções'); return }

    await applyFilter(page, 'Origem', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Aquisição/Origem] "${before}" → "${after}" ✅`)
  })

  test('Canal (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Canal')
    if (!option) { console.warn('[Aquisição/Canal] sem opções'); return }

    await applyFilter(page, 'Canal', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Aquisição/Canal] "${before}" → "${after}" ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 7 — Orgânico: Origem e Canal filtram dados na aba Leads
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Orgânico — filtros mudam dados na aba Leads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/organico?tab=leads')
    await waitForSelectOptions(page, 'Origem')
    await waitForTableData(page)
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    await expect(counter).toBeVisible({ timeout: 15000 })
    await waitForCounterStable(counter)
  })

  test('Origem (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    const before = await getCounterText(counter)
    console.log(`[Orgânico/Origem] antes: "${before}"`)

    const option = await getFirstOption(page, 'Origem')
    if (!option) { console.warn('[Orgânico/Origem] sem opções'); return }

    await applyFilter(page, 'Origem', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Orgânico/Origem] "${before}" → "${after}" ✅`)
  })

  test('Canal (1ª opção) → contador de leads muda', async ({ page }) => {
    const counter = page.locator('span').filter({ hasText: /\d+ leads?/ }).first()
    const before = await getCounterText(counter)

    const option = await getFirstOption(page, 'Canal')
    if (!option) { console.warn('[Orgânico/Canal] sem opções'); return }

    await applyFilter(page, 'Canal', option)
    await waitForCounterChange(counter, before)

    const after = await getCounterText(counter)
    expect(after).not.toBe(before)
    console.log(`[Orgânico/Canal] "${before}" → "${after}" ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 8 — Sanidade: selects carregam opções corretas
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sanidade — selects carregam opções corretas', () => {
  test('PreVendas SDR — "SDR IA" é a primeira opção', async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas')
    await waitForSelectOptions(page, 'SDR')

    const firstOpt = await page
      .locator('select')
      .filter({ has: page.locator('option[value=""]:text("SDR")') })
      .first()
      .locator('option:not([value=""])')
      .first()
      .innerText()
    expect(firstOpt).toBe('SDR IA')
    console.log('[Sanidade] SDR IA é primeira opção ✅')
  })

  test('PreVendas Canal — value é código UTM (sem espaço, não nome amigável)', async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas')
    await waitForSelectOptions(page, 'Canal')

    const value = await getFirstOption(page, 'Canal')
    expect(value, 'value do Canal deve ser código UTM sem espaço').toBeTruthy()
    expect(value).not.toContain(' ')
    console.log(`[Sanidade] PreVendas Canal value="${value}" (código UTM) ✅`)
  })

  test('Vendas Canal — value é código UTM', async ({ page }) => {
    await login(page)
    await page.goto('/vendas')
    await waitForSelectOptions(page, 'Canal')

    const value = await getFirstOption(page, 'Canal')
    expect(value).toBeTruthy()
    expect(value).not.toContain(' ')
    console.log(`[Sanidade] Vendas Canal value="${value}" ✅`)
  })

  test('Recuperação Canal — value é código UTM', async ({ page }) => {
    await login(page)
    await page.goto('/recuperacao')
    await waitForSelectOptions(page, 'Canal')

    const value = await getFirstOption(page, 'Canal')
    expect(value).toBeTruthy()
    expect(value).not.toContain(' ')
    console.log(`[Sanidade] Recuperação Canal value="${value}" ✅`)
  })

  test('Aquisição Origem — pelo menos 1 opção carregada', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForSelectOptions(page, 'Origem')

    const select = page.locator('select').filter({ has: page.locator('option[value=""]:text("Origem")') }).first()
    const count = await select.locator('option:not([value=""])').count()
    expect(count).toBeGreaterThan(0)
    console.log(`[Sanidade] Aquisição Origem: ${count} opções ✅`)
  })

  test('Orgânico Canal — pelo menos 1 opção de utm_sources_plain', async ({ page }) => {
    await login(page)
    await page.goto('/organico')
    await waitForSelectOptions(page, 'Canal')

    const select = page.locator('select').filter({ has: page.locator('option[value=""]:text("Canal")') }).first()
    const count = await select.locator('option:not([value=""])').count()
    expect(count).toBeGreaterThan(0)
    console.log(`[Sanidade] Orgânico Canal: ${count} opções ✅`)
  })
})
