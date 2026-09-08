import { test, expect } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────

function pxToNumber(px: string | null): number {
  if (!px) return 0
  const match = px.match(/([\d.]+)/)
  return match ? parseFloat(match[1]) : 0
}

// ── Testes de legibilidade ─────────────────────────────────────────────────

test.describe('legibilidade — eb-dash2', () => {
  test('nenhum elemento com font-size < 11px', async ({ page }) => {
    await page.goto('http://localhost:3224/login')
    await page.waitForLoadState('networkidle')

    const smallFonts = await page.evaluate(() => {
      const elems = Array.from(document.querySelectorAll('*'))
      const bad: Array<{ tag: string; text: string; fontSize: string }> = []

      for (const el of elems) {
        const style = window.getComputedStyle(el)
        const fontSize = style.fontSize
        const sizePx = parseFloat(fontSize)
        if (sizePx > 0 && sizePx < 11) {
          bad.push({
            tag: el.tagName,
            text: (el.textContent || '').slice(0, 80),
            fontSize,
          })
        }
      }
      return bad
    })

    expect(smallFonts, `Encontrados ${smallFonts.length} elementos com fonte < 11px`).toHaveLength(0)
  })

  test('inputs têm height mínimo 44px (touch target)', async ({ page }) => {
    await page.goto('http://localhost:3224/login')
    await page.waitForLoadState('networkidle')

    const smallInputs = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input, textarea, select, [contenteditable]')
      )
      const bad: Array<{ tag: string; type?: string; height: number }> = []

      for (const el of inputs) {
        const rect = el.getBoundingClientRect()
        if (rect.height > 0 && rect.height < 44) {
          bad.push({
            tag: el.tagName,
            type: (el as HTMLInputElement).type,
            height: rect.height,
          })
        }
      }
      return bad
    })

    expect(smallInputs, `Encontrados ${smallInputs.length} inputs com height < 44px`).toHaveLength(0)
  })

  test('botões têm padding adequado', async ({ page }) => {
    await page.goto('http://localhost:3224/login')
    await page.waitForLoadState('networkidle')

    const badButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      const bad: Array<{ tag: string; text: string; padding: string }> = []

      for (const el of buttons) {
        const style = window.getComputedStyle(el)
        const paddingTop = parseFloat(style.paddingTop)
        const paddingBottom = parseFloat(style.paddingBottom)
        const paddingLeft = parseFloat(style.paddingLeft)
        const paddingRight = parseFloat(style.paddingRight)

        // Mínimo: 8px vertical, 12px horizontal
        if (paddingTop < 8 || paddingBottom < 8 || paddingLeft < 12 || paddingRight < 12) {
          bad.push({
            tag: el.tagName,
            text: (el.textContent || '').slice(0, 40),
            padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
          })
        }
      }
      return bad
    })

    expect(badButtons, `Encontrados ${badButtons.length} botões com padding insuficiente`).toHaveLength(0)
  })
})
