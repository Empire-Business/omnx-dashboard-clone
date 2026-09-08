import { test, expect } from '@playwright/test'

// ── Helpers de luminância WCAG ─────────────────────────────────────────────

function getLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  const rgb = clean.match(/\w\w/g)!.map((x) => parseInt(x, 16) / 255)
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1) + 0.05
  const l2 = getLuminance(hex2) + 0.05
  return Math.max(l1, l2) / Math.min(l1, l2)
}

function normalizeColor(color: string): string | null {
  if (!color) return null
  color = color.trim().toLowerCase()

  // Hex curto → longo
  if (color.startsWith('#')) {
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    }
    if (color.length === 7) return color
    return null
  }

  // rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbMatch) {
    const toHex = (n: string) => parseInt(n).toString(16).padStart(2, '0')
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`
  }

  // Design system tokens comuns (Magalu)
  const tokens: Record<string, string> = {
    '#0086ff': '#0086ff',
    '#0075e2': '#0075e2',
    '#ffffff': '#ffffff',
    '#f0f3f4': '#f0f3f4',
    '#1e2428': '#1e2428',
    '#697277': '#697277',
    '#e3e8ea': '#e3e8ea',
    '#b8c1c4': '#b8c1c4',
    '#d30d31': '#d30d31',
    '#08a022': '#08a022',
    '#949ea2': '#949ea2',
  }

  return tokens[color] || null
}

// ── Testes de contraste ────────────────────────────────────────────────────

test.describe('contraste WCAG AA (ratio mínimo 4.5:1)', () => {
  const cases = [
    { fg: '#1e2428', bg: '#ffffff', expectedPass: true, desc: 'Text sobre Surface (~15.7:1)' },
    { fg: '#697277', bg: '#ffffff', expectedPass: true, desc: 'Text Muted sobre Surface (~4.9:1)' },
    { fg: '#ffffff', bg: '#0075e2', expectedPass: true, desc: 'Branco sobre Action (~4.5:1)' },
    { fg: '#ffffff', bg: '#0086ff', expectedPass: false, desc: 'Branco sobre Primary (~3.6:1 — deve falhar, usar só em grandes)' },
    { fg: '#949ea2', bg: '#ffffff', expectedPass: false, desc: '#949ea2 sobre Surface (~2.7:1 — deve falhar, usar só em grandes)' },
    { fg: '#b8c1c4', bg: '#ffffff', expectedPass: false, desc: 'Border Input sobre Surface (~1.8:1 — deve falhar)' },
  ]

  for (const { fg, bg, expectedPass, desc } of cases) {
    test(`${desc}: ${fg} / ${bg}`, () => {
      const ratio = getContrastRatio(fg, bg)
      if (expectedPass) {
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      } else {
        expect(ratio).toBeLessThan(4.5)
      }
    })
  }
})

test.describe('contraste em páginas reais — eb-dash2', () => {
  test('nenhum texto em #b8c1c4 sobre #ffffff', async ({ page }) => {
    await page.goto('http://localhost:3224/login')
    await page.waitForLoadState('networkidle')

    const badTexts = await page.evaluate(() => {
      const elems = Array.from(document.querySelectorAll('*'))
      const bad: Array<{ tag: string; text: string; color: string; bg: string }> = []

      function getBg(el: Element): string {
        const style = window.getComputedStyle(el)
        let bg = style.backgroundColor
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
          if (el.parentElement) return getBg(el.parentElement)
        }
        return bg
      }

      for (const el of elems) {
        const style = window.getComputedStyle(el)
        const color = style.color.toLowerCase()
        const bg = getBg(el).toLowerCase()

        if (
          (color.includes('184, 193, 196') || color === '#b8c1c4' || color === 'rgb(184,193,196)') &&
          (bg.includes('255, 255, 255') || bg === '#ffffff' || bg === 'rgb(255,255,255)')
        ) {
          bad.push({
            tag: el.tagName,
            text: (el.textContent || '').slice(0, 80),
            color,
            bg,
          })
        }
      }
      return bad
    })

    expect(badTexts, `Encontrados ${badTexts.length} textos em #b8c1c4 sobre branco`).toHaveLength(0)
  })
})

