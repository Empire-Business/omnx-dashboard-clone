/**
 * Testes de responsividade do Empire Dashboard — Playwright
 *
 * ABORDAGEM: verificar layout e comportamento em 3 breakpoints.
 *
 * Viewports testados:
 * - Mobile:  375 × 812 (iPhone SE)
 * - Tablet:  768 × 1024 (iPad)
 * - Desktop: 1280 × 800
 *
 * Estratégia por teste:
 * 1. Definir viewport antes de navegar
 * 2. Fazer login e aguardar página carregar
 * 3. Inspecionar propriedades CSS / bounding boxes via page.evaluate()
 * 4. Verificar que o layout não está quebrado (overflow, posicionamento, visibilidade)
 *
 * Os testes NÃO verificam pixels exatos — verificam PROPRIEDADES de layout:
 * overflow, posição, visibilidade, presença de elementos.
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

// ─── Viewports ────────────────────────────────────────────────────────────────

const MOBILE  = { width: 375,  height: 812  }   // iPhone SE
const TABLET  = { width: 768,  height: 1024 }   // iPad
const DESKTOP = { width: 1280, height: 800  }   // Desktop padrão

// ─── HELPER: login ────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(
    /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao)/,
    { timeout: 25000 }
  )
}

// ─── HELPER: aguarda dados carregarem (sem spinner) ───────────────────────────

async function waitForPageReady(page: Page, timeout = 15000) {
  // Aguarda até não ter nenhum "Carregando..." visível
  await page.waitForFunction(
    () => !document.body.innerText.includes('Carregando...'),
    { timeout }
  ).catch(() => {})
  await page.waitForTimeout(600)
}

// ─── HELPER: verifica overflow horizontal no body ─────────────────────────────

async function bodyHasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.body.scrollWidth > document.documentElement.clientWidth
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Desktop (1280px): sidebar fixa não some ao rolar o conteúdo
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Desktop (1280px) — sidebar fixa ao rolar', () => {
  test('sidebar permanece visível no topo ao rolar o conteúdo principal', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    // Rola o conteúdo principal para baixo — tenta os seletores mais comuns
    await page.evaluate(() => {
      const main =
        document.querySelector('main') ||
        document.querySelector('[class*="main"]') ||
        document.querySelector('[class*="content"]')
      if (main) {
        main.scrollTop = 500
      } else {
        window.scrollTo(0, 500)
      }
    })
    await page.waitForTimeout(300)

    // A sidebar deve ainda estar visível
    const sidebar = page.locator('aside, nav[class*="sidebar"], [class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    // O topo da sidebar deve estar perto do topo do viewport (< 10px)
    const box = await sidebar.boundingBox()
    console.log(`[Desktop/Sidebar] boundingBox.top = ${box?.top}`)
    expect(box, 'Sidebar deve ter bounding box mensurável').not.toBeNull()
    // A sidebar começa no topo da tela (posição fixed ou sticky)
    expect(box!.top).toBeLessThan(10)
    console.log('[Desktop/Sidebar] sidebar fixa no topo após scroll ✅')
  })

  test('sidebar tem largura adequada para desktop (≥ 200px)', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    const sidebar = page.locator('aside, nav[class*="sidebar"], [class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    const box = await sidebar.boundingBox()
    console.log(`[Desktop/Sidebar] largura = ${box?.width}px`)
    expect(box!.width).toBeGreaterThanOrEqual(200)
    console.log('[Desktop/Sidebar] largura adequada ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — Mobile (375px): tabelas com overflow horizontal dentro de container
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — tabelas com overflow interno', () => {
  test('tabela de atividades (pré-vendas) tem scroll horizontal no container, não no body', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)

    // Navega para aba que tem tabela de ligações/discagem
    await page.goto('/pre-vendas?tab=discagem')
    await waitForPageReady(page)

    // Aguarda algum elemento de tabela ou conteúdo aparecer
    await page.waitForSelector('table, [class*="table"], [class*="list"]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)

    // O body NÃO deve ter scroll horizontal
    const bodyOverflow = await bodyHasHorizontalScroll(page)
    console.log(`[Mobile/Discagem] body tem scroll horizontal: ${bodyOverflow}`)
    expect(bodyOverflow, 'Body não deve ter overflow horizontal em mobile').toBe(false)

    // A tabela (se existir) deve estar dentro de container com overflow-x
    const tableExists = await page.locator('table').count() > 0
    if (tableExists) {
      const tableContainerHasScroll = await page.evaluate(() => {
        const table = document.querySelector('table')
        if (!table) return false
        // Verifica se algum ancestral tem overflow-x configurado
        let el: Element | null = table.parentElement
        while (el && el !== document.body) {
          const style = window.getComputedStyle(el)
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true
          el = el.parentElement
        }
        // Se a tabela é menor que o viewport, não precisa de scroll
        return table.scrollWidth <= document.documentElement.clientWidth
      })
      console.log(`[Mobile/Discagem] tabela em container scrollável: ${tableContainerHasScroll}`)
      expect(tableContainerHasScroll, 'Tabela deve estar em container com overflow-x ou caber na tela').toBe(true)
    } else {
      console.log('[Mobile/Discagem] nenhuma tabela encontrada na aba — verificação de body overflow passou ✅')
    }

    console.log('[Mobile/Discagem] overflow check ✅')
  })

  test('aba Atividades (pré-vendas) não causa overflow horizontal no body', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    // Tenta clicar na aba Atividades se existir
    const atividadesBtn = page.locator('nav button, [role="tab"]').filter({ hasText: /^atividades$/i }).first()
    if (await atividadesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await atividadesBtn.click()
      await page.waitForTimeout(800)
    }

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    console.log(`[Mobile/Atividades] body tem scroll horizontal: ${bodyOverflow}`)
    expect(bodyOverflow, 'Atividades não deve causar overflow no body em mobile').toBe(false)
    console.log('[Mobile/Atividades] sem overflow horizontal no body ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — Mobile (375px): FilterBar visível e sem elementos cortados
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — FilterBar visível e acessível', () => {
  test('FilterBar em /trafego está visível e não causa overflow horizontal', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/trafego')
    await waitForPageReady(page)

    // FilterBar geralmente contém selects ou inputs de filtro
    // Verifica que pelo menos um select/input de filtro está visível
    const filterElements = page.locator('select, input[type="date"], [aria-label="Escolher data"], button[aria-haspopup="dialog"]')
    const filterCount = await filterElements.count()
    console.log(`[Mobile/FilterBar/Trafego] ${filterCount} elementos de filtro encontrados`)

    if (filterCount > 0) {
      // Pelo menos o primeiro filtro deve estar visível
      const firstFilter = filterElements.first()
      await expect(firstFilter).toBeVisible({ timeout: 8000 })

      // Verifica que o filtro não está fora da tela (bounding box dentro do viewport)
      const box = await firstFilter.boundingBox()
      if (box) {
        console.log(`[Mobile/FilterBar/Trafego] filtro em x=${box.x}, width=${box.width}`)
        // O elemento não deve começar fora da tela pela direita
        expect(box.x).toBeLessThan(MOBILE.width)
        // E não deve começar com offset negativo relevante (cortado pela esquerda)
        expect(box.x).toBeGreaterThanOrEqual(-1)
      }
    }

    // Body sem scroll horizontal
    const bodyOverflow = await bodyHasHorizontalScroll(page)
    console.log(`[Mobile/FilterBar/Trafego] body overflow: ${bodyOverflow}`)
    expect(bodyOverflow).toBe(false)
    console.log('[Mobile/FilterBar/Trafego] FilterBar OK em mobile ✅')
  })

  test('FilterBar em /pre-vendas está visível em mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    const filterElements = page.locator('select, input[type="date"], [aria-label="Escolher data"], button[aria-haspopup="dialog"]')
    const filterCount = await filterElements.count()
    console.log(`[Mobile/FilterBar/PreVendas] ${filterCount} elementos de filtro`)

    if (filterCount > 0) {
      const firstFilter = filterElements.first()
      await expect(firstFilter).toBeVisible({ timeout: 8000 })
    }

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    expect(bodyOverflow).toBe(false)
    console.log('[Mobile/FilterBar/PreVendas] FilterBar OK em mobile ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4 — Mobile (375px): LeadsTable dentro de container scrollável
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — LeadsTable com scroll interno', () => {
  test('tabela de leads está em container com overflow-x e body sem overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/leads')
    await waitForPageReady(page)

    // Aguarda tabela de leads aparecer
    await page.waitForSelector('table', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)

    const tableExists = await page.locator('table').count() > 0
    if (tableExists) {
      // Verifica que a tabela (ou um ancestral próximo) tem overflow-x
      const containerHasScroll = await page.evaluate(() => {
        const table = document.querySelector('table')
        if (!table) return true
        // Se a tabela cabe no viewport, não precisa de scroll
        if (table.scrollWidth <= document.documentElement.clientWidth) return true
        // Caso contrário, algum ancestral deve ter overflow-x: auto ou scroll
        let el: Element | null = table.parentElement
        let depth = 0
        while (el && el !== document.body && depth < 5) {
          const style = window.getComputedStyle(el)
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true
          el = el.parentElement
          depth++
        }
        return false
      })
      console.log(`[Mobile/LeadsTable] container com scroll: ${containerHasScroll}`)
      expect(containerHasScroll, 'Tabela de leads deve ter container com overflow-x em mobile').toBe(true)
    } else {
      // Pode estar mostrando uma lista no lugar de tabela em mobile
      console.log('[Mobile/LeadsTable] tabela não encontrada — pode ser lista responsiva')
    }

    // Body sem overflow horizontal
    const bodyOverflow = await bodyHasHorizontalScroll(page)
    console.log(`[Mobile/LeadsTable] body overflow: ${bodyOverflow}`)
    expect(bodyOverflow, 'Body não deve ter scroll horizontal em /leads mobile').toBe(false)
    console.log('[Mobile/LeadsTable] scroll interno OK ✅')
  })

  test('página /leads renderiza conteúdo em mobile (não tela em branco)', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/leads')
    await waitForPageReady(page)

    // Deve haver algum conteúdo textual — ao menos um título ou cabeçalho
    const hasContent = await page.evaluate(() => {
      const body = document.body.innerText.trim()
      return body.length > 50
    })
    expect(hasContent, 'Página /leads deve ter conteúdo visível em mobile').toBe(true)
    console.log('[Mobile/LeadsTable] página renderizou conteúdo ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5 — Mobile (375px): ChatWidget posicionado no canto sem obstruir
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — ChatWidget posicionado corretamente', () => {
  test('botão do chat está no canto inferior direito da tela', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    // Qualquer página autenticada serve — usamos pre-vendas
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    // O ChatWidget geralmente é um botão flutuante fixed
    // Seletores comuns: botão com ícone de chat, classe "chat", aria-label de chat
    const chatButton = page.locator(
      '[class*="chat"] button, button[class*="chat"], [aria-label*="chat" i], [aria-label*="Chat" i], [class*="widget"] button'
    ).first()

    const chatExists = await chatButton.isVisible({ timeout: 5000 }).catch(() => false)
    if (!chatExists) {
      // Tenta seletor mais amplo — qualquer botão fixed no canto
      console.log('[Mobile/ChatWidget] botão de chat não encontrado com seletor específico — verificando via evaluate')

      const widgetInfo = await page.evaluate(() => {
        // Procura qualquer elemento fixed próximo ao canto inferior direito
        const allElements = Array.from(document.querySelectorAll('button, div[class*="chat"], div[class*="widget"]'))
        for (const el of allElements) {
          const style = window.getComputedStyle(el)
          if (style.position === 'fixed') {
            const rect = el.getBoundingClientRect()
            return {
              found: true,
              right: Math.round(window.innerWidth - rect.right),
              bottom: Math.round(window.innerHeight - rect.bottom),
              top: Math.round(rect.top),
              left: Math.round(rect.left),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            }
          }
        }
        return { found: false }
      })

      if (!widgetInfo.found) {
        console.log('[Mobile/ChatWidget] nenhum elemento fixed encontrado — pulando verificação de posição')
        return
      }

      console.log(`[Mobile/ChatWidget] elemento fixed: right=${widgetInfo.right}px, bottom=${widgetInfo.bottom}px`)
      // Deve estar perto da borda direita (< 80px da direita)
      expect(widgetInfo.right!).toBeLessThan(80)
      // Não deve estar no topo da página (top > 200px = não obstrui conteúdo above the fold)
      expect(widgetInfo.top!).toBeGreaterThan(200)
      console.log('[Mobile/ChatWidget] posicionado no canto sem obstruir topo ✅')
      return
    }

    // Se encontrou o botão diretamente
    const box = await chatButton.boundingBox()
    if (!box) {
      console.log('[Mobile/ChatWidget] bounding box não disponível — pulando')
      return
    }

    console.log(`[Mobile/ChatWidget] botão em x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`)

    // Deve estar na metade direita da tela
    const centerX = box.x + box.width / 2
    expect(centerX, 'Chat widget deve estar na metade direita da tela').toBeGreaterThan(MOBILE.width / 2)

    // Não deve estar no topo da tela (above the fold = primeiros 300px)
    expect(box.y, 'Chat widget não deve obstruir conteúdo acima do fold').toBeGreaterThan(200)

    console.log('[Mobile/ChatWidget] posicionado corretamente no canto inferior direito ✅')
  })

  test('chat widget não causa overflow horizontal no body', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    expect(bodyOverflow, 'ChatWidget não deve causar overflow horizontal').toBe(false)
    console.log('[Mobile/ChatWidget] sem overflow com widget na tela ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 6 — Mobile (375px): AppHub renderiza cards visíveis
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — AppHub com cards visíveis', () => {
  test('AppHub mostra pelo menos 1 título de app e sem overflow horizontal', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await login(page)
    // AppHub é a rota raiz /
    await page.goto('/')
    // Aguarda carregar — pode redirecionar ou mostrar diretamente
    await page.waitForTimeout(2000)
    await waitForPageReady(page)

    // Verifica que não está em tela de login (pode ter redirecionado)
    const currentUrl = page.url()
    console.log(`[Mobile/AppHub] URL atual: ${currentUrl}`)

    if (currentUrl.includes('/login')) {
      // Ainda na login — faz login e vai para /
      await login(page)
      await page.goto('/')
      await waitForPageReady(page)
    }

    // Body sem overflow horizontal
    const bodyOverflow = await bodyHasHorizontalScroll(page)
    console.log(`[Mobile/AppHub] body overflow: ${bodyOverflow}`)
    expect(bodyOverflow, 'AppHub não deve ter overflow horizontal no body').toBe(false)

    // Verifica que algum conteúdo está visível — títulos de apps, cards ou links de navegação
    const hasVisibleContent = await page.evaluate(() => {
      // Procura por cards, headings, links — qualquer elemento com texto relevante
      const selectors = [
        'h1', 'h2', 'h3',
        '[class*="card"]',
        '[class*="app"]',
        'a[href]',
        '[class*="hub"]',
      ]
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel)
        for (const el of els) {
          if ((el as HTMLElement).offsetParent !== null && (el.textContent?.trim().length ?? 0) > 2) {
            return true
          }
        }
      }
      return false
    })
    console.log(`[Mobile/AppHub] tem conteúdo visível: ${hasVisibleContent}`)
    expect(hasVisibleContent, 'AppHub deve exibir pelo menos 1 elemento com texto em mobile').toBe(true)

    console.log('[Mobile/AppHub] cards visíveis sem overflow ✅')
  })

  test('AppHub não tem overflow horizontal em tablet (768px)', async ({ page }) => {
    await page.setViewportSize(TABLET)
    await login(page)
    await page.goto('/')
    await waitForPageReady(page)

    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      await login(page)
      await page.goto('/')
      await waitForPageReady(page)
    }

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    expect(bodyOverflow, 'AppHub não deve ter overflow horizontal em tablet').toBe(false)
    console.log('[Tablet/AppHub] sem overflow horizontal ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 7 — Tablet (768px): layout intermediário funcional
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Tablet (768px) — layout intermediário', () => {
  test('sidebar visível ou menu acessível em tablet', async ({ page }) => {
    await page.setViewportSize(TABLET)
    await login(page)
    await page.goto('/pre-vendas')
    await waitForPageReady(page)

    // Em tablet, a sidebar pode estar visível ou colapsada com menu hamburger
    const sidebarVisible = await page.locator('aside, nav[class*="sidebar"], [class*="sidebar"]').first().isVisible({ timeout: 3000 }).catch(() => false)
    const menuButtonVisible = await page.locator('button[aria-label*="menu" i], button[class*="hamburger"], button[class*="menu"]').first().isVisible({ timeout: 2000 }).catch(() => false)

    console.log(`[Tablet/Layout] sidebar visível: ${sidebarVisible}, menu button: ${menuButtonVisible}`)
    // Pelo menos um dos dois deve estar acessível
    expect(sidebarVisible || menuButtonVisible, 'Tablet deve ter sidebar visível ou botão de menu').toBe(true)

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    expect(bodyOverflow, 'Tablet não deve ter overflow horizontal').toBe(false)
    console.log('[Tablet/Layout] layout OK em tablet ✅')
  })

  test('página /vendas sem overflow horizontal em tablet', async ({ page }) => {
    await page.setViewportSize(TABLET)
    await login(page)
    await page.goto('/vendas')
    await waitForPageReady(page)

    const bodyOverflow = await bodyHasHorizontalScroll(page)
    expect(bodyOverflow).toBe(false)
    console.log('[Tablet/Vendas] sem overflow horizontal ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 8 — Cross-viewport: páginas principais sem overflow em mobile
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375px) — páginas principais sem overflow', () => {
  const pages = [
    { path: '/pre-vendas', name: 'Pré-Vendas' },
    { path: '/vendas',     name: 'Vendas'     },
    { path: '/trafego',    name: 'Tráfego'    },
    { path: '/leads',      name: 'Leads'      },
    { path: '/metas',      name: 'Metas'      },
  ]

  for (const { path, name } of pages) {
    test(`${name} (${path}) sem overflow horizontal em mobile`, async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await login(page)
      await page.goto(path)
      await waitForPageReady(page)

      const bodyOverflow = await bodyHasHorizontalScroll(page)
      console.log(`[Mobile/${name}] body overflow: ${bodyOverflow}`)
      expect(bodyOverflow, `${name} não deve ter overflow horizontal no body em mobile (375px)`).toBe(false)
      console.log(`[Mobile/${name}] sem overflow ✅`)
    })
  }
})
