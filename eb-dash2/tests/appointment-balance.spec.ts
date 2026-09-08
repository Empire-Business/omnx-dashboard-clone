/**
 * Teste de regressão: Saldo de agendamentos no painel Cohort do Tráfego.
 *
 * Garante que NENHUM agendamento fica "Sem status": cada um cai numa categoria
 * real do GHL (Realizada / No-show / Cancelada / A acontecer / Aguardando desfecho)
 * e a decomposição fecha a conta com o total de Agendados do funil.
 *
 * Valida:
 *  1. "Agendamentos" (Saldo) == "Agendados" (funil).
 *  2. realizadas + no-shows + canceladas + a acontecer + aguardando desfecho = total.
 *  3. A linha "Conta:" exibe ✅ (não "(saldo N)").
 *  4. A página NÃO contém o rótulo "Sem status" (categoria eliminada).
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao)/, { timeout: 25000 })
}

test.describe('Tráfego / Cohort — Saldo de agendamentos', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/trafego?tab=painel-cohort')
    await expect(page.getByRole('heading', { name: /Funil de Convers/i })).toBeVisible({ timeout: 25000 })
    await expect(page.getByText(/Conta:\s*\d+\s*=\s*\d+\s*realizadas/i)).toBeVisible({ timeout: 30000 })
  })

  test('ninguém fica "Sem status" e a decomposição fecha a conta', async ({ page }) => {
    // 1. Funil: total de agendados
    const agendadosBtn = page.getByRole('button', { name: /Agendados\s*\d+/i }).first()
    await expect(agendadosBtn).toBeVisible({ timeout: 20000 })
    const funilText = (await agendadosBtn.textContent()) ?? ''
    const funilMatch = funilText.match(/Agendados\s*(\d[\d.]*)/i)
    if (!funilMatch) throw new Error(`Não achei "Agendados N" no funil: "${funilText}"`)
    const agendadosFunil = parseInt(funilMatch[1].replace(/\./g, ''), 10)

    // 2. Linha "Conta:" — fonte da verdade da decomposição
    const contaLinha = page.getByText(/Conta:\s*\d+\s*=\s*\d+\s*realizadas/i).first()
    const contaText = ((await contaLinha.textContent()) ?? '').trim()
    console.log(`[Conta] ${contaText}`)

    const m = contaText.match(
      /Conta:\s*(\d+)\s*=\s*(\d+)\s*realizadas\s*\+\s*(\d+)\s*no-shows(?:\s*\+\s*(\d+)\s*canceladas)?\s*\+\s*(\d+)\s*a acontecer(?:\s*\+\s*(\d+)\s*aguardando desfecho)?/i,
    )
    if (!m) throw new Error(`Não consegui parsear a linha Conta: "${contaText}"`)

    const total = parseInt(m[1], 10)
    const realizadas = parseInt(m[2], 10)
    const noShows = parseInt(m[3], 10)
    const canceladas = m[4] ? parseInt(m[4], 10) : 0
    const aAcontecer = parseInt(m[5], 10)
    const aguardando = m[6] ? parseInt(m[6], 10) : 0

    console.log(
      `[Saldo] funil.agendados=${agendadosFunil} | total=${total} ` +
        `realizadas=${realizadas} noShows=${noShows} canceladas=${canceladas} ` +
        `aAcontecer=${aAcontecer} aguardando=${aguardando}`,
    )

    // 3. Total bate com o funil
    expect(total, 'Total de agendamentos do Saldo deve ser > 0').toBeGreaterThan(0)
    expect(total, 'Agendamentos (Saldo) deve bater com Agendados (funil)').toBe(agendadosFunil)

    // 4. Decomposição exclusiva fecha a conta
    const soma = realizadas + noShows + canceladas + aAcontecer + aguardando
    expect(
      soma,
      `realizadas(${realizadas}) + noShows(${noShows}) + canceladas(${canceladas}) + aAcontecer(${aAcontecer}) + aguardando(${aguardando}) deve = total(${total})`,
    ).toBe(total)

    // 5. Linha "Conta:" mostra ✅ e não "(saldo N)"
    expect(contaText, 'Linha Conta deve exibir ✅').toMatch(/✅/)
    expect(contaText, 'Linha Conta NÃO deve exibir "(saldo N)"').not.toMatch(/\(saldo \d/i)

    // 6. O rótulo "Sem status" NÃO existe mais no bloco Saldo
    const saldoHeading = page.getByRole('heading', { name: 'Saldo de agendamentos' })
    const saldoBlock = saldoHeading.locator('xpath=ancestor::div[2]')
    const blockText = ((await saldoBlock.textContent()) ?? '').toLowerCase()
    expect(blockText, 'Bloco Saldo NÃO deve conter "sem status"').not.toContain('sem status')
  })
})
