import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './sub-apps/helpers/login'

// Fase 1 do plano de arquitetura de informação (2026-07-12, aprovada 2026-07-15):
// remoção de duplicações. Valida que as telas que perderam componentes seguem
// íntegras (sem tela em branco, sem erro de console/pageerror, sem quebra de
// layout) e que as telas "dono" mantiveram seus componentes.
//
// Estritamente somente-leitura: nenhum clique em ação que grava, nenhum form.

// Viewport alto de propósito: o app rola dentro de container (não no body),
// então fullPage captura só o viewport — altura maior cobre as seções removidas.
test.use({ viewport: { width: 1440, height: 2600 } })

const SHOTS = 'playwright-screenshots/fase1-arquitetura'

type ScreenDef = {
  name: string
  path: string
  // textos que DEVEM existir dentro de <main> (prova de que a tela renderizou)
  mustSee: string[]
  // textos que NÃO podem existir dentro de <main> (prova da remoção)
  mustNotSee: string[]
}

const SCREENS: ScreenDef[] = [
  // ── Telas que PERDERAM AppointmentOriginBreakdown + AppointmentBalance ──
  {
    name: 'trafego',
    path: '/trafego',
    mustSee: ['Indicadores'],
    mustNotSee: ['Origem dos eventos', 'Saldo de agendamentos'],
  },
  {
    name: 'aquisicao',
    path: '/aquisicao',
    mustSee: ['Segmentação'],
    mustNotSee: ['Origem dos eventos', 'Saldo de agendamentos'],
  },
  {
    name: 'organico', // reusa AquisicaoTab — mesma remoção vale aqui
    path: '/organico',
    mustSee: ['Segmentação'],
    mustNotSee: ['Origem dos eventos', 'Saldo de agendamentos'],
  },
  // ── Pré-Vendas perdeu a aba duplicada "Auditoria IA" ──
  {
    name: 'pre-vendas',
    path: '/pre-vendas',
    mustSee: ['Discagem', 'Agendamentos', 'Atividades'],
    mustNotSee: ['Auditoria IA'],
  },
  // ── Controles: telas-dono que MANTÊM os componentes ──
  {
    name: 'sdr-ia', // casa certa da Auditoria IA
    path: '/sdr-ia',
    mustSee: ['Auditoria IA'],
    mustNotSee: [],
  },
  {
    name: 'vendas', // mantém AppointmentOriginBreakdown + AppointmentBalance (variant vendas)
    path: '/vendas',
    mustSee: ['Origem dos eventos', 'Saldo de agendamentos'],
    mustNotSee: [],
  },
  {
    name: 'recuperacao-geral', // usa prevendas/tabs/GeralTab (arquivo preservado)
    path: '/recuperacao?tab=geral',
    mustSee: ['Visão Geral'],
    mustNotSee: [],
  },
]

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme)
}

async function assertThemeApplied(page: Page, theme: 'light' | 'dark') {
  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )
  expect(isDark, `tema ${theme} aplicado ao <html>`).toBe(theme === 'dark')
}

// Erros PRÉ-EXISTENTES comprovados por probe no HEAD (baseline) em 2026-07-16:
// mesmo conjunto de telas, sem as remoções da Fase 1, produziu exatamente estes
// console.errors. Qualquer erro fora desta lista falha o teste (erro novo).
const KNOWN_ERRORS_GLOBAL: RegExp[] = [
  // Ruído transitório de rede contra o Supabase de produção (auth/session fetch)
  /TypeError: Failed to fetch/,
]
const KNOWN_ERRORS_BY_SCREEN: Record<string, RegExp[]> = {
  'pre-vendas': [
    // 500 intermitente no endpoint de atividades + log do hook (visto no baseline)
    /Failed to load resource: the server responded with a status of 500/,
    /\[useLeadAtividades\] error/,
  ],
  'recuperacao-geral': [
    // validateDOMNesting pré-existente em prevendas/tabs/GeralTab (visto no baseline)
    /cannot contain a nested/,
    /cannot be a descendant of/,
  ],
}

for (const screen of SCREENS) {
  test(`${screen.name}: renderiza sem erros em light e dark`, async ({ page }) => {
    test.setTimeout(120000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
    })

    await loginAs(page, 'admin_master')

    for (const theme of ['light', 'dark'] as const) {
      await applyTheme(page, theme)
      await page.goto(screen.path, { waitUntil: 'domcontentloaded' })
      // networkidle é instável em páginas com realtime/polling — best-effort com fallback
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(2500)

      await assertThemeApplied(page, theme)

      // Não pode ser tela em branco: <main> precisa ter conteúdo visível
      const main = page.locator('main')
      await expect(main).toBeVisible()
      const mainText = (await main.innerText()).trim()
      expect(mainText.length, `<main> com conteúdo (${screen.name}/${theme})`).toBeGreaterThan(50)

      for (const text of screen.mustSee) {
        await expect(
          main.getByText(text, { exact: false }).first(),
          `"${text}" visível em ${screen.name} (${theme})`,
        ).toBeVisible({ timeout: 15000 })
      }
      for (const text of screen.mustNotSee) {
        await expect(
          main.getByText(text, { exact: false }),
          `"${text}" ausente em ${screen.name} (${theme})`,
        ).toHaveCount(0)
      }

      await page.screenshot({
        path: `${SHOTS}/${screen.name}-${theme}.png`,
        fullPage: true,
      })
    }

    // Link morto para a aba removida não pode existir em lugar nenhum (sidebar etc.)
    if (screen.name === 'pre-vendas') {
      await expect(page.locator('a[href="/pre-vendas?tab=auditoria_ia"]')).toHaveCount(0)
    }

    const known = [...KNOWN_ERRORS_GLOBAL, ...(KNOWN_ERRORS_BY_SCREEN[screen.name] ?? [])]
    const unexpected = errors.filter((e) => !known.some((re) => re.test(e)))
    const ignored = errors.filter((e) => known.some((re) => re.test(e)))
    if (ignored.length > 0) {
      console.log(`[${screen.name}] erros pré-existentes ignorados: ${ignored.length}`)
    }
    expect(errors.filter((e) => e.startsWith('[pageerror]')), 'sem pageerror').toEqual([])
    expect(unexpected, `sem console.error novo em ${screen.name}`).toEqual([])
  })
}
