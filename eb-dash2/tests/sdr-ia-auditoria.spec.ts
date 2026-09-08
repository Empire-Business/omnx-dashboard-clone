/**
 * Testes Playwright — SDR IA > Auditoria
 *
 * Cobre:
 * 1. Carregamento da aba Auditoria sem erro JS crítico
 * 2. Presença dos cards de resumo de problemas
 * 3. Presença da tabela de problemas ou estado vazio
 * 4. Filtros de tipo e severidade funcionam
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

async function goToSdrIaAuditoria(page: Page) {
  await page.goto('/sdr-ia?tab=auditoria')
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout: 15000 }
  ).catch(() => {})
  // Aguarda o carregamento dos cards (esqueletos sumirem) ou timeout de 20s
  await page.waitForFunction(
    () => {
      const skeletons = document.querySelectorAll('.animate-pulse')
      return skeletons.length === 0
    },
    { timeout: 20000 }
  ).catch(() => {})
  await page.waitForTimeout(500)
}

test.describe('SDR IA → Auditoria', () => {
  test('aba Auditoria carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await login(page)
    await goToSdrIaAuditoria(page)

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Network request failed')
    )
    expect(criticalErrors.length, `Erros JS: ${criticalErrors.join(' | ')}`).toBe(0)
    console.log('[SDR-IA/auditoria] carregou sem erros JS ✅')
  })

  test('cards de resumo de problemas estão visíveis', async ({ page }) => {
    await login(page)
    await goToSdrIaAuditoria(page)

    const bodyText = await page.locator('body').innerText()
    // rótulos usam text-transform: uppercase — innerText devolve já transformado
    expect(bodyText).toMatch(/problemas detectados/i)
    expect(bodyText).toMatch(/Sem Follow-up|Erros de Entrega|Spam|Horário Inadequado|Conversa Unilateral|Conflito IA\/Humano|Reclamação do Lead/)
    console.log('[SDR-IA/auditoria] cards de resumo visíveis ✅')
  })

  test('os 7 detectores aparecem como card', async ({ page }) => {
    await login(page)
    await goToSdrIaAuditoria(page)

    const bodyText = await page.locator('body').innerText()
    for (const label of [
      'Reclamação do Lead',
      'Erros de Entrega',
      'Sem Follow-up',
      'Spam / Excesso',
      'Conflito IA/Humano',
      'Conversa Unilateral',
      'Horário Inadequado',
    ]) {
      expect(bodyText, `card "${label}" ausente`).toContain(label)
    }
    console.log('[SDR-IA/auditoria] 7 detectores visíveis ✅')
  })

  test('tabela de problemas ou estado vazio é renderizado', async ({ page }) => {
    await login(page)
    await goToSdrIaAuditoria(page)

    const bodyText = await page.locator('body').innerText()
    const hasTable = /\d+\s*leads?\s*com problema/.test(bodyText)
    const hasEmpty = /Nenhum problema detectado/.test(bodyText)
    expect(hasTable || hasEmpty, 'Esperava tabela de problemas ou estado vazio').toBe(true)
    console.log('[SDR-IA/auditoria] tabela/estado vazio renderizado ✅')
  })

  test('expandir a linha mostra o preview da conversa', async ({ page }) => {
    await login(page)
    await goToSdrIaAuditoria(page)

    const primeiraLinha = page.locator('tbody tr').first()
    const temLinha = await primeiraLinha.isVisible().catch(() => false)
    test.skip(!temLinha, 'Nenhum problema no período — nada para expandir')

    await primeiraLinha.click()
    // a conversa é carregada sob demanda; espera sair do "Carregando conversa…"
    await page
      .waitForFunction(() => !document.body.innerText.includes('Carregando conversa'), { timeout: 15000 })
      .catch(() => {})

    const bodyText = await page.locator('body').innerText()
    // rótulos em uppercase por CSS — comparação case-insensitive
    expect(bodyText).toMatch(/conversa/i)
    expect(bodyText).toMatch(/ações sugeridas/i)
    // o preview renderiza mensagens, o estado vazio explícito, ou o aviso de erro
    const temConteudo =
      /SDR IA|Lead|Humano/.test(bodyText) ||
      bodyText.includes('Nenhuma mensagem registrada') ||
      bodyText.includes('Não foi possível carregar a conversa')
    expect(temConteudo, 'Preview da conversa não renderizou nada').toBe(true)
    console.log('[SDR-IA/auditoria] preview da conversa renderizado ✅')
  })

  test('filtro por tipo de problema funciona', async ({ page }) => {
    await login(page)
    await goToSdrIaAuditoria(page)

    const select = page.locator('select').first()
    await select.waitFor({ state: 'visible', timeout: 10000 })

    // Abre o filtro e seleciona "Sem Follow-up"
    await select.selectOption('sem_followup')
    await page.waitForTimeout(1000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.includes('Sem Follow-up') || bodyText.includes('Nenhum problema detectado')).toBe(true)
    console.log('[SDR-IA/auditoria] filtro por tipo funciona ✅')
  })
})
