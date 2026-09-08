import { test, expect } from '@playwright/test'
import { BASE_URL, TEST_EMAIL, login } from './helpers'

test.describe('Relatórios Semanais — Automações de e-mail', () => {
  test.setTimeout(120000)

  test('criar automação de relatório semanal e enviar teste', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/relatorios?tab=automacoes`)
    await page.waitForLoadState('networkidle')

    // Abre formulário
    await page.locator('button:has-text("Nova automação")').first().click()
    await expect(page.locator('text=Nova Automação de E-mail')).toBeVisible()

    // Preenche nome
    await page.locator('input#name').fill('Automação de teste - Tráfego e Vendas')

    // Seleciona módulos
    await page.locator('button:has-text("Tráfego")').first().click()
    await page.locator('button:has-text("Vendas")').first().click()

    // Tipo de relatório
    await page.locator('button:has-text("Produtividade")').first().click()

    // Assunto
    await page.locator('input#subject').fill('Relatório de teste - Empire Business')

    // Destinatário
    await page.locator('textarea[placeholder*="e-mails"]').fill(TEST_EMAIL)
    await page.locator('button:has-text("Adicionar")').first().click()

    // Cria
    await page.locator('button:has-text("Criar automação")').first().click()

    // Verifica se apareceu na lista
    await expect(page.locator('text=Automação de teste - Tráfego e Vendas')).toBeVisible()
    await expect(page.locator('text=1 destinatário')).toBeVisible()

    // Envia teste
    await page.locator('input[type="email"][placeholder*="teste"]').first().fill(TEST_EMAIL)
    await page.locator('button:has-text("Testar")').first().click()

    // Aguarda processamento
    await page.waitForTimeout(3000)

    // Abre histórico
    await page.locator('button:has-text("Histórico")').first().click()
    await expect(
      page.locator('text=Pendente').or(page.locator('text=Enviado')).or(page.locator('text=Falhou'))
    ).toBeVisible()
  })

  test('desativar e excluir automação', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/relatorios?tab=automacoes`)
    await page.waitForLoadState('networkidle')

    // Cria uma automação simples
    await page.locator('button:has-text("Nova automação")').first().click()
    await page.locator('input#name').fill('Automação para excluir')
    await page.locator('textarea[placeholder*="e-mails"]').fill(TEST_EMAIL)
    await page.locator('button:has-text("Adicionar")').first().click()
    await page.locator('button:has-text("Criar automação")').first().click()

    await expect(page.locator('text=Automação para excluir')).toBeVisible()

    // Desativa
    await page.locator('input[type="checkbox"]').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Inativo').first()).toBeVisible()

    // Exclui
    page.on('dialog', (dialog: any) => dialog.accept())
    await page.locator('button[title="Excluir"]').first().click()
    await page.waitForTimeout(1000)
    await expect(page.locator('text=Automação para excluir')).not.toBeVisible()
  })
})
