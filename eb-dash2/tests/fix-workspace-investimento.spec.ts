/**
 * SPEC TEMPORÁRIA — validação do fix de isolamento de investimento Meta Ads por workspace.
 *
 * Cenário: o workspace "Burn-in Interno" mostrava R$ 38.490,93 de Investimento
 * no Painel Cohort, valor que pertence ao workspace "Default" (único com spend).
 * Após o fix (queries de meta_ads_insights/meta_ads_account_daily filtrando por
 * workspace_id nos hooks), espera-se:
 *   - Default:         Investimento > 0 (em torno de R$ 38 mil, período 30d)
 *   - Burn-in Interno: Investimento = R$ 0,00 ou "—"
 *
 * LIMITAÇÃO CONSTATADA (2026-07-20): a conta de teste
 * (teste.playwright.audit@...) é membro APENAS do workspace Default
 * (verificado via REST workspace_members com o token dela). Por isso:
 *   - o WorkspaceSelector nunca renderiza para ela (resolveTenancyMode = single-tenant);
 *   - setar localStorage 'eb:selected_workspace_id' = Burn-in é rejeitado por
 *     getWorkspaceId() (isWorkspaceMember falha → fallback para o 1º workspace).
 * A validação UI do estado Burn-in exige login como ferramentas@aliancadealtovalor.com.br
 * (owner, membro dos 2 workspaces) — credencial não disponível nesta sessão.
 *
 * O que esta spec valida:
 *   1. Default segue mostrando o investimento (~R$ 38 mil, 30d) — screenshot.
 *   2. Guarda de tenancy: forçar o id do Burn-in no localStorage NÃO vaza/seleciona
 *      outro workspace — o app derruba a seleção e cai no Default.
 *
 * Apaga-se após a validação (ou manter com nome claro). NÃO commitar.
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'
const SHOTS = 'playwright-screenshots'
const WS_DEFAULT = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
const WS_BURNIN = '15cacbe4-8c3d-4af7-a028-e2eda7b569f4' // docs/ROADMAP-MULTI-TENANT.md (2026-07-14)
const LS_KEY = 'eb:selected_workspace_id'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) =>
      url.pathname === '/' ||
      /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|disparos|sdr-ia|traqueamento)/.test(url.pathname),
    { timeout: 30000 }
  )
}

/** Navega ao Painel Cohort (Tráfego) e garante período "30d". */
async function gotoPainelCohort30d(page: Page) {
  await page.goto('/trafego?tab=painel-cohort')
  await expect(page.getByText('Indicadores').first()).toBeVisible({ timeout: 30000 })

  const btn30d = page.getByRole('button', { name: '30d', exact: true }).first()
  if (await btn30d.count()) {
    await btn30d.click()
    await page.waitForTimeout(500)
  }
}

/** Lê o valor do card "Investimento" na seção Indicadores (aguarda skeleton sumir). */
async function readInvestimento(page: Page): Promise<string> {
  const card = page
    .locator('div.rounded-lg.border')
    .filter({ has: page.locator('span', { hasText: /^Investimento$/ }) })
    .first()
  await expect(card).toBeVisible({ timeout: 30000 })

  const valueSpan = card.locator('span.font-mono').first()
  await expect(valueSpan).toBeVisible({ timeout: 30000 })
  await expect(valueSpan).not.toHaveText('', { timeout: 30000 })
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  return ((await valueSpan.textContent()) ?? '').trim()
}

function parseCurrency(text: string): number {
  if (!text || text === '—') return 0
  const match = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/)
  if (!match) return NaN
  return parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
}

test('Fix isolamento workspace: Default mostra investimento e guarda de tenancy bloqueia override', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)

  // ── Estado 1: workspace Default (único acessível a esta conta) ──
  await gotoPainelCohort30d(page)

  // Registra se o seletor de workspace existe para esta conta (esperado: não)
  const selectorCount = await page.getByTestId('workspace-selector-trigger').count()
  console.log(`WorkspaceSelector visível para a conta de teste? ${selectorCount > 0 ? 'SIM' : 'NÃO (conta single-workspace)'}`)

  const investDefault = await readInvestimento(page)
  console.log(`[Default] Investimento (30d): ${investDefault}`)
  await page.screenshot({ path: `${SHOTS}/fix-workspace-default.png`, fullPage: true })

  // ── Estado 2: tentativa de override para Burn-in via localStorage ──
  // A conta não é membro do Burn-in: getWorkspaceId() deve rejeitar a seleção,
  // limpar o localStorage e cair no Default. Se o card continuar mostrando o
  // investimento do Default após o fallback, comprovamos que NÃO foi possível
  // operar no contexto do Burn-in com esta conta (guarda funciona).
  await page.evaluate(
    ([key, id]) => window.localStorage.setItem(key, id),
    [LS_KEY, WS_BURNIN] as const
  )
  await page.reload() // reload real: hooks reavaliam o workspace a partir do localStorage

  // getWorkspaceId() é async (auth.getUser + isWorkspaceMember): em testes manuais
  // a limpeza acontece ~2s após o reload. Aguarda explicitamente.
  let clearedByApp = true
  try {
    await page.waitForFunction(
      (key) => window.localStorage.getItem(key) === null,
      LS_KEY,
      { timeout: 20000 }
    )
  } catch {
    clearedByApp = false
  }
  console.log(`App limpou o LS com id inválido (sem membership)? ${clearedByApp ? 'SIM' : 'NÃO'}`)

  await gotoPainelCohort30d(page)

  const lsAfter = await page.evaluate((key) => window.localStorage.getItem(key), LS_KEY)
  console.log(`localStorage ${LS_KEY} após reload com id do Burn-in forçado: ${lsAfter ?? '(limpo pelo app)'}`)

  const investAposOverride = await readInvestimento(page)
  console.log(`[Após override p/ Burn-in] Investimento exibido: ${investAposOverride} (contexto resolvido = Default, ${WS_DEFAULT})`)
  await page.screenshot({ path: `${SHOTS}/fix-workspace-burnin.png`, fullPage: true })

  // ── Veredito ─────────────────────────────────────────────
  const vDefault = parseCurrency(investDefault)
  console.log(`Parsed → Default: R$ ${vDefault}`)

  expect(!Number.isNaN(vDefault), `Card Investimento (Default) sem valor em R$: "${investDefault}"`).toBe(true)
  expect(vDefault, 'Default deve continuar mostrando o investimento (> 0)').toBeGreaterThan(0)

  // Guarda de tenancy: o app deve ter limpado a seleção inválida (sem membership)
  expect(
    clearedByApp && (lsAfter === null || lsAfter === WS_DEFAULT),
    `App aceitou workspace sem membership! cleared=${clearedByApp} localStorage=${lsAfter}`
  ).toBe(true)

  console.log('✅ Default validado + guarda de tenancy confirmada (override para Burn-in rejeitado)')
})
