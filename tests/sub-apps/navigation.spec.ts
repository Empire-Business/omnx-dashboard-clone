import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'

test('Navegar entre apps via sidebar e hub', async ({ page }) => {
  await loginAs(page, 'admin_master')

  // Entra em um app que não é desativado pelos cenários paralelos
  await page.goto('/pre-vendas')
  await page.waitForSelector('text=Pré-Vendas', { timeout: 20000 })

  // Clica em "Todos os apps" na sidebar para voltar ao hub
  await page.getByRole('link', { name: 'Todos os apps' }).click()
  await page.waitForURL('/', { timeout: 10000 })
  expect(page.url()).toBe('http://localhost:3222/')

  // Volta para outro app pelo hub
  await page.getByRole('button', { name: 'Aquisição & Vendas' }).click()
  await page.waitForURL('/aquisicao*', { timeout: 10000 })

  // Troca de app pela sidebar novamente
  await page.getByRole('link', { name: 'Todos os apps' }).click()
  await page.waitForURL('/', { timeout: 10000 })
  await page.getByRole('button', { name: 'Metas' }).click()
  await page.waitForURL('/metas*', { timeout: 10000 })
})
