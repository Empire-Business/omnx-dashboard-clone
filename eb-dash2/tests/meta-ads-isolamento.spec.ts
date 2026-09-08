import { test, expect } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|disparos|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

function parseCurrency(text: string | null): number {
  if (!text) return NaN
  const match = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/)
  if (!match) return NaN
  const raw = match[1].replace(/\./g, '').replace(',', '.')
  return parseFloat(raw)
}

test('Dashboard de Tráfego exibe investimento Meta Ads maior que zero', async ({ page }) => {
  await login(page)

  // Navega diretamente para a aba de tráfego (painel cohort, período padrão 30d)
  await page.goto('/trafego')
  await page.waitForURL('/trafego', { timeout: 30000 })

  // Aguarda o carregamento inicial
  await expect(page.getByText('Visão geral')).toBeVisible({ timeout: 30000 })

  // Seleciona o card cujo label é exatamente "Investimento"
  const investimentoCard = page
    .locator('div.rounded-lg.border')
    .filter({ has: page.locator('span', { hasText: /^Investimento$/ }) })
    .first()
  await expect(investimentoCard).toBeVisible({ timeout: 30000 })

  // Aguarda o valor carregar (esqueleto some)
  const valueSpan = investimentoCard.locator('span.font-mono').first()
  await expect(valueSpan).not.toHaveText('', { timeout: 30000 })

  const valueText = await valueSpan.textContent()
  console.log('Valor bruto do card Investimento:', valueText)

  const investimento = parseCurrency(valueText)
  console.log(`Investimento Meta Ads exibido: R$ ${investimento.toFixed(2)}`)

  expect(!Number.isNaN(investimento), `Card de investimento não mostra valor em R$: ${valueText}`).toBe(true)
  expect(investimento, 'Investimento Meta Ads deve ser maior que zero no período padrão 30d').toBeGreaterThan(0)

  // Valida que o card de CPMQL também existe e carregou
  const cpmqlCard = page
    .locator('div.rounded-lg.border')
    .filter({ has: page.locator('span', { hasText: /^CPMQL$/ }) })
    .first()
  await expect(cpmqlCard).toBeVisible({ timeout: 10000 })
  await expect(cpmqlCard.locator('span.font-mono').first()).not.toHaveText('', { timeout: 10000 })

  console.log('✅ Dashboard de tráfego mostra investimento Meta Ads > 0 após isolamento multi-tenant')
})
