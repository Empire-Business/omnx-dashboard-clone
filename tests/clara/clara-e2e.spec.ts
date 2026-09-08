import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3224'
const TEST_EMAIL = process.env.TEST_EMAIL || 'clara-qa-test@omnx.dev'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'ClaraQA2026!Test'

async function login(page: any) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  const emailField = page.locator('input[type="email"], input[name="email"]').first()
  const passwordField = page.locator('input[type="password"], input[name="password"]').first()

  if ((await emailField.count()) > 0 && (await passwordField.count()) > 0) {
    await emailField.fill(TEST_EMAIL)
    await passwordField.fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForLoadState('networkidle')
  }
}

async function openClara(page: any) {
  // Abre o widget flutuante da Clara
  const chatBtn = page.locator('#chat-widget-btn')
  await expect(chatBtn).toBeVisible({ timeout: 10000 })
  await chatBtn.click()

  // Aguarda o painel do chat abrir
  const textarea = page.locator('textarea[placeholder*="Pergunte sobre seus dados"]').first()
  await expect(textarea).toBeVisible({ timeout: 10000 })
  return textarea
}

async function askClara(page: any, textarea: any, question: string) {
  // Captura logs do console para debug
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      console.log(`[browser error] ${msg.text()}`)
    }
  })

  await textarea.fill(question)
  await textarea.press('Enter')

  // Aguarda o estado de carregamento aparecer
  await page.locator('text=Consultando dados...').first().waitFor({ timeout: 10000 })
  // Aguarda sumir (pode demorar para queries complexas)
  await page.locator('text=Consultando dados...').first().waitFor({ state: 'hidden', timeout: 90000 })

  // Retorna o texto da última mensagem da Clara
  const messages = page.locator('.group.flex.flex-col.items-start').last()
  await messages.waitFor({ timeout: 10000 })
  return await messages.innerText()
}

test.describe('Clara — módulos faltantes', () => {
  test.setTimeout(120000)
  test('vendas por closer/produto/pagamento', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Quem foi o closer que mais vendeu em maio de 2026?')

    // Dados reais: a maior parte das vendas pode estar sem closer cadastrado ou com Larissa/Gabrielle
    expect(answer).toMatch(/Larissa Theophilo|Gabrielle Oliveira|Sem closer/)
    expect(answer).toMatch(/R\$\s*[\d.]+/)
    // Anti-invenção: não deve criar closers fictícios
    expect(answer).not.toMatch(/João|Maria|Pedro|Ana|Carla|Lucas/)
  })

  test('pré-vendas — reuniões, no-shows e comparecimento', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Quantos no-shows tivemos em maio de 2026?')

    expect(answer).toMatch(/no.show/i)
    expect(answer).toMatch(/\d+/)
  })

  test('traqueamento — ranking de criativos', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Qual criativo teve melhor ROAS em maio de 2026?')

    expect(answer).toContain('CR-')
    expect(answer).toMatch(/ROAS/)
  })

  test('traqueamento — listar canais de tráfego pago', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Quais canais de tráfego pago estão cadastrados?')

    expect(answer).toMatch(/iads-\d+|inads-\d+/)
  })

  test('traqueamento — desempenho de canal específico', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Qual o investimento do canal iads-28 em maio de 2026?')

    // A Clara deve citar o canal solicitado. Pode responder com dados ou dizer que não encontrou.
    expect(answer).toContain('iads-28')
  })

  test('orgânico — canais com nome e código', async ({ page }) => {
    await login(page)
    const textarea = await openClara(page)
    const answer = await askClara(page, textarea, 'Liste os canais orgânicos e quantos MQLs cada um trouxe em maio de 2026.')

    // Deve retornar ao menos um nome amigável de canal orgânico conhecido ou "Sem canal/source"
    expect(answer).toMatch(/Instagram Orgânico|Indicação|YouTube|Google Orgânico|LinkedIn|WhatsApp|Blog|Evento|Parceria|Sem canal|Sem source|@aceleradordeaudiencia|@odavilouback|@empirebusiness|Venda direta|Importados GHL/i)
    // Não deve inventar códigos de canal pago
    expect(answer).not.toMatch(/fads-|gads-|tads-|iads-/)
  })
})
