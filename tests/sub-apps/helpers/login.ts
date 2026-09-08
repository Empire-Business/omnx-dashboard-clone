import type { Page } from '@playwright/test'
import { TEST_USERS, type TestUserCredentials } from './users'

export interface LoginOptions {
  email: string
  password: string
}

/**
 * Realiza login no dashboard via email/senha.
 * Assume que a página de login está em /login e que o método padrão é senha.
 */
export async function login(page: Page, { email, password }: LoginOptions): Promise<void> {
  await page.goto('/login')

  const emailInput = page.locator('input#email')
  const passwordInput = page.locator('input#password')
  const submitButton = page.locator('button[type="submit"]')

  await emailInput.waitFor({ state: 'visible', timeout: 10000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)
  await submitButton.click()

  // Detecta credenciais inválidas rapidamente em vez de esperar o timeout
  const errorMessage = page.locator('text=Email ou senha incorretos')
  const navigation = page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30000,
  })

  const result = await Promise.race([
    navigation.then(() => 'success' as const),
    errorMessage.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'error' as const),
  ])

  if (result === 'error') {
    throw new Error(
      `Falha no login para ${email}. Verifique as credenciais em PLAYWRIGHT_TEST_USERS.`
    )
  }
}

/**
 * Login usando uma das personas predefinidas em TEST_USERS.
 */
export async function loginAs(
  page: Page,
  role: keyof typeof TEST_USERS
): Promise<void> {
  const credentials = TEST_USERS[role]
  return login(page, credentials)
}

/**
 * Encerra a sessão atual e volta para a tela de login.
 */
export async function logout(page: Page): Promise<void> {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
}
