import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { TEST_USERS } from './helpers/users'
import { getWorkspaceIdByEmail, deleteGoalsByApp } from './helpers/supabase-admin'

function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

test.describe('Sub-apps — Metas vinculadas a app', () => {
  test('Cadastrar meta com app vinculado e filtrar por app', async ({ page }) => {
    // Limpa metas anteriores do app para evitar conflito de período.
    const workspaceId = await getWorkspaceIdByEmail(TEST_USERS.admin_master.email)
    if (workspaceId) {
      await deleteGoalsByApp(workspaceId, 'pre-vendas')
    }

    await loginAs(page, 'admin_master')

    const today = new Date()
    const future = new Date(today)
    future.setDate(today.getDate() + 30)

    const appLabel = 'Pré-Vendas'
    const appSlugValue = 'pre-vendas'
    const targetValue = '100'

    // Aba "Metas" para cadastro
    await page.goto('/metas?tab=registry')
    await page.waitForSelector('text=Cadastro e governança', { timeout: 20000 })

    await page.getByRole('button', { name: 'Nova Meta' }).first().click()
    await expect(page.getByText('Cadastrar meta no módulo unificado')).toBeVisible()

    // Seleciona o app vinculado (independente da área)
    await page.getByLabel('App vinculado').selectOption(appSlugValue)

    // Preenche alvo e vigência
    // Usa seletor CSS porque o label usa <span> aninhado (não é associação for/id)
    await page.locator('label:has-text("Alvo") input[type="number"]').fill(targetValue)
    await page
      .locator('label:has-text("Data Inicial") input[type="date"]')
      .fill(formatDateInput(today))
    await page
      .locator('label:has-text("Data Final") input[type="date"]')
      .fill(formatDateInput(future))

    await page.getByRole('button', { name: 'Salvar Meta' }).click({ force: true })

    // Aguarda fechamento do dialog e recarregamento da lista
    await expect(page.getByText('Cadastrar meta no módulo unificado')).not.toBeVisible({
      timeout: 15000,
    })

    // Aplica filtro por app
    await page
      .locator('label:has-text("App") select')
      .first()
      .selectOption(appSlugValue)

    // Verifica que a meta recém-criada aparece na tabela filtrada
    const table = page.locator('table').first()
    await expect(table).toContainText(appLabel)
    await expect(table).toContainText(targetValue)
  })
})
