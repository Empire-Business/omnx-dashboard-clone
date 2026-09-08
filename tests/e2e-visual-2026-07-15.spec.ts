import { test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { loginAs } from './sub-apps/helpers/login'

/**
 * Validação E2E visual (SOMENTE-LEITURA) da varredura de design system de 2026-07-15
 * (cores hardcoded → tokens em componentes de gráfico).
 *
 * - Nenhuma mutação: apenas navegação GET, hover em tooltips e toggle de tema.
 * - O app usa container com scroll interno (não window), então fullPage só pega
 *   o topo: capturamos uma série de screenshots rolando o container.
 * - Artefatos em playwright-screenshots/e2e-2026-07-15/.
 *   (Não usar playwright-report/: o HTML reporter limpa essa pasta ao fim do run.)
 */

const OUT_DIR = 'playwright-screenshots/e2e-2026-07-15'

interface ScreenDef {
  slug: string
  url: string
  /** hover no centro do primeiro svg de gráfico (tooltip/crosshair) antes da série */
  hoverChart?: boolean
  /** seletor extra para aguardar antes do screenshot */
  waitFor?: string
}

const SCREENS: ScreenDef[] = [
  { slug: '01-dashboard-trafego', url: '/trafego', hoverChart: true },
  { slug: '02-metas', url: '/metas' },
  { slug: '02b-metas-acompanhamento', url: '/metas?tab=tracking', waitFor: 'svg' },
  { slug: '03-organico-meta', url: '/organico?tab=meta', hoverChart: true },
  { slug: '04-relatorios-tendencias', url: '/relatorios?tab=tendencias', hoverChart: true },
  { slug: '05-disparos', url: '/disparos' },
  { slug: '06-vendas-reunioes', url: '/vendas?tab=reunioes', waitFor: 'table' },
  { slug: '07-vendas-geral', url: '/vendas', waitFor: 'svg' },
  { slug: '08-traqueamento', url: '/traqueamento' },
]

interface ConsoleError {
  kind: 'console' | 'pageerror'
  text: string
  location?: string
}

const errorsByScreen: Record<string, ConsoleError[]> = {}
let currentErrors: ConsoleError[] = []

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1440, height: 900 } })

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'))
}

async function setTheme(page: Page, target: 'light' | 'dark') {
  if ((await isDark(page)) === (target === 'dark')) return
  const toggle = page
    .getByRole('button', { name: /Ativar modo (claro|escuro)/ })
    .first()
  await toggle.click()
  await page.waitForTimeout(600)
}

async function hoverChartCenter(page: Page) {
  // Escolhe o maior svg com polyline visível na página (o gráfico principal),
  // rola até ele e faz hover no centro — dispara tooltip/crosshair.
  const target = await page.evaluateHandle(() => {
    const svgs = Array.from(document.querySelectorAll('main svg'))
    let best: Element | null = null
    let bestArea = 0
    for (const s of svgs) {
      if (!s.querySelector('polyline, path[stroke]')) continue
      const r = s.getBoundingClientRect()
      const area = r.width * r.height
      if (r.width > 200 && r.height > 100 && area > bestArea) {
        best = s
        bestArea = area
      }
    }
    return best
  })
  const el = target.asElement()
  if (!el) return
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const box = await el.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 6 })
  await page.waitForTimeout(800)
}

/** Marca o container scrollável do layout e retorna se existe. */
async function findScrollContainer(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const prev = document.getElementById('__e2e_scroll__')
    if (prev) prev.removeAttribute('id')
    const candidates = Array.from(document.querySelectorAll('main, main *'))
    let best: Element | null = null
    let bestH = 0
    for (const c of candidates) {
      const el = c as HTMLElement
      const overflow = getComputedStyle(el).overflowY
      if (
        (overflow === 'auto' || overflow === 'scroll') &&
        el.scrollHeight > el.clientHeight + 200 &&
        el.clientHeight > 300 &&
        el.scrollHeight > bestH
      ) {
        best = el
        bestH = el.scrollHeight
      }
    }
    if (!best) return false
    best.id = '__e2e_scroll__'
    return true
  })
}

/** Série de screenshots rolando o container interno (ou window como fallback). */
async function captureScrollSeries(page: Page, base: string, maxShots = 9) {
  const hasContainer = await findScrollContainer(page)
  // volta ao topo
  await page.evaluate(() => {
    const el = document.getElementById('__e2e_scroll__')
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(400)

  for (let i = 0; i < maxShots; i++) {
    await page.screenshot({ path: `${base}-p${i + 1}.png` })
    const atEnd = await page.evaluate(() => {
      const el = document.getElementById('__e2e_scroll__')
      const vh = window.innerHeight
      if (el) {
        const before = el.scrollTop
        el.scrollTop = before + vh * 0.9
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 5
      }
      const before = window.scrollY
      window.scrollBy(0, vh * 0.9)
      return window.scrollY === before
    })
    await page.waitForTimeout(600)
    if (atEnd) {
      // última captura já mostra o fim? garante um shot do rodapé
      await page.screenshot({ path: `${base}-p${i + 2}.png` })
      break
    }
  }
}

test('varredura visual design system 2026-07-15 (read-only)', async ({ page }) => {
  test.setTimeout(600000)
  mkdirSync(OUT_DIR, { recursive: true })

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      currentErrors.push({
        kind: 'console',
        text: msg.text().slice(0, 500),
        location: msg.location()?.url,
      })
    }
  })
  page.on('pageerror', (err) => {
    currentErrors.push({ kind: 'pageerror', text: String(err).slice(0, 500) })
  })

  await loginAs(page, 'admin_master')
  await page.waitForTimeout(1500)

  const extra: Record<string, unknown> = {}

  for (const screen of SCREENS) {
    currentErrors = []
    await page.goto(screen.url, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
    if (screen.waitFor) {
      await page
        .locator(screen.waitFor)
        .first()
        .waitFor({ state: 'visible', timeout: 20000 })
        .catch(() => {})
    }
    // tempo extra para queries (Supabase real) e render dos SVGs
    await page.waitForTimeout(4000)

    if (screen.slug === '06-vendas-reunioes') {
      // Toggle de modo de visualização (UI state) — a tabela de reuniões
      // (coluna Gravação) só existe no modo Produtividade
      await page
        .locator('button:has-text("Produtividade")')
        .first()
        .click()
        .catch(() => {})
      await page
        .locator('table')
        .first()
        .waitFor({ state: 'visible', timeout: 20000 })
        .catch(() => {})
      await page.waitForTimeout(3000)

      // evidência estrutural da coluna Gravação (sem clicar em nada)
      extra['vendas-reunioes'] = await page.evaluate(() => {
        const table = document.querySelector('table')
        if (!table) return { table: false }
        const headers = Array.from(table.querySelectorAll('th')).map((h) =>
          h.textContent?.trim()
        )
        const gravacaoIdx = headers.findIndex((h) => h === 'Gravação')
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
        const dashCount = bodyRows.filter(
          (r) => r.children[gravacaoIdx]?.textContent?.trim() === '—'
        ).length
        const links = Array.from(
          table.querySelectorAll(`tbody td:nth-child(${gravacaoIdx + 1}) a`)
        ).map((a) => a.textContent?.trim())
        return {
          table: true,
          headers,
          rows: bodyRows.length,
          gravacaoIdx,
          dashCount,
          linkCount: links.length,
          linkSamples: links.slice(0, 5),
        }
      })
    }

    if (screen.slug === '05-disparos') {
      // Seleção local (setState) — apenas revela funil/KPIs, sem mutação
      await page
        .locator('table tbody tr')
        .first()
        .click()
        .catch(() => {})
      await page.waitForTimeout(2000)
    }

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme)
      if (screen.hoverChart) {
        await hoverChartCenter(page)
        await page.screenshot({ path: `${OUT_DIR}/${screen.slug}-${theme}-hover.png` })
        await page.mouse.move(10, 10)
        await page.waitForTimeout(300)
      }
      await captureScrollSeries(page, `${OUT_DIR}/${screen.slug}-${theme}`)

      if (screen.slug === '06-vendas-reunioes') {
        // Rola o container horizontal da tabela até o fim para evidenciar
        // a coluna Gravação (última coluna)
        const scrolled = await page.evaluate(() => {
          const table = document.querySelector('table')
          if (!table) return false
          let el: HTMLElement | null = table.parentElement
          while (el) {
            const ox = getComputedStyle(el).overflowX
            if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth) {
              el.scrollLeft = el.scrollWidth
              return true
            }
            el = el.parentElement
          }
          return false
        })
        if (scrolled) {
          await page.waitForTimeout(400)
          await page.screenshot({ path: `${OUT_DIR}/${screen.slug}-${theme}-coluna-gravacao.png` })
        }
      }
    }

    errorsByScreen[screen.slug] = currentErrors
  }

  writeFileSync(
    `${OUT_DIR}/console-errors.json`,
    JSON.stringify(errorsByScreen, null, 2),
    'utf-8'
  )
  writeFileSync(`${OUT_DIR}/extra-evidence.json`, JSON.stringify(extra, null, 2), 'utf-8')
})
