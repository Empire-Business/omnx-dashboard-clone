/**
 * Dados de usuários de teste para os cenários de controle de acesso de sub-apps.
 *
 * As credenciais podem ser sobrescritas via variável de ambiente
 * PLAYWRIGHT_TEST_USERS (JSON) ou via variáveis individuais:
 *   - PLAYWRIGHT_ADMIN_MASTER_EMAIL / PLAYWRIGHT_ADMIN_MASTER_PASSWORD
 *   - PLAYWRIGHT_GESTOR_EMAIL / PLAYWRIGHT_GESTOR_PASSWORD
 *   - PLAYWRIGHT_SDR_EMAIL / PLAYWRIGHT_SDR_PASSWORD
 *
 * Valores padrão são *placeholders* e não funcionam em ambientes reais.
 * Configure as credenciais reais antes de rodar os testes.
 */

export interface TestUserCredentials {
  email: string
  password: string
}

export interface TestUsers {
  admin_master: TestUserCredentials
  gestor: TestUserCredentials
  sdr: TestUserCredentials
}

function getEnvCredentials(): Partial<TestUsers> {
  if (process.env.PLAYWRIGHT_TEST_USERS) {
    try {
      const parsed = JSON.parse(process.env.PLAYWRIGHT_TEST_USERS)
      return {
        admin_master: parsed.admin_master,
        gestor: parsed.gestor,
        sdr: parsed.sdr,
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[sub-apps] PLAYWRIGHT_TEST_USERS inválido; usando placeholders')
    }
  }

  return {
    admin_master: {
      email: process.env.PLAYWRIGHT_ADMIN_MASTER_EMAIL,
      password: process.env.PLAYWRIGHT_ADMIN_MASTER_PASSWORD,
    },
    gestor: {
      email: process.env.PLAYWRIGHT_GESTOR_EMAIL,
      password: process.env.PLAYWRIGHT_GESTOR_PASSWORD,
    },
    sdr: {
      email: process.env.PLAYWRIGHT_SDR_EMAIL,
      password: process.env.PLAYWRIGHT_SDR_PASSWORD,
    },
  }
}

const defaults: TestUsers = {
  admin_master: {
    email: 'admin.master@omnx.dev',
    password: '__PLACEHOLDER_ADMIN_MASTER_PASSWORD__',
  },
  gestor: {
    email: 'gestor@omnx.dev',
    password: '__PLACEHOLDER_GESTOR_PASSWORD__',
  },
  sdr: {
    email: 'sdr@omnx.dev',
    password: '__PLACEHOLDER_SDR_PASSWORD__',
  },
}

const envCredentials = getEnvCredentials()

export const TEST_USERS: TestUsers = {
  admin_master: {
    email: envCredentials.admin_master?.email || defaults.admin_master.email,
    password: envCredentials.admin_master?.password || defaults.admin_master.password,
  },
  gestor: {
    email: envCredentials.gestor?.email || defaults.gestor.email,
    password: envCredentials.gestor?.password || defaults.gestor.password,
  },
  sdr: {
    email: envCredentials.sdr?.email || defaults.sdr.email,
    password: envCredentials.sdr?.password || defaults.sdr.password,
  },
}

export function isPlaceholderCredentials(): boolean {
  return Object.values(TEST_USERS).some(
    (user) =>
      user.email.includes('@example.com') ||
      user.email.includes('@omnx.dev') ||
      user.password.startsWith('__PLACEHOLDER')
  )
}
