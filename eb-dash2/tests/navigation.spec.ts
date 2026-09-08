/**
 * Testes de navegação do Empire Dashboard — Playwright
 *
 * Cobre:
 * 1. Login flow — credenciais válidas e inválidas
 * 2. AppHub — cards de apps visíveis e clicáveis
 * 3. Sidebar desktop — visível e fixa ao scroll
 * 4. Responsividade mobile — hamburger abre/fecha sidebar
 * 5. Tab navigation — clique nas tabs muda o ?tab= na URL
 * 6. Logout — redireciona para /login
 *
 * PADRÃO DE CÓDIGO: segue o mesmo estilo de filtros.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS = '8^_p0$H^oplJ*xam0GS+'

// ─── HELPER: login completo ──────────────────────────────────────────────────
//
// Preenche email e senha na tela de login e aguarda o redirect.
// Após o redirect, o usuário pode estar em "/" (AppHub) ou diretamente
// em um módulo caso tenha acesso a apenas 1 app.

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Aguarda qualquer rota autenticada — AppHub (/) ou módulo específico
  await page.waitForURL(
    (url) => url.pathname === '/' || /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia)/.test(url.pathname),
    { timeout: 30000 }
  )
}

// ─── HELPER: aguarda página de módulo carregar minimamente ───────────────────
//
// Espera que o spinner de "Carregando" suma para confirmar que os dados chegaram.

async function waitForModuleReady(page: Page, timeout = 20000) {
  // Aguarda que não haja mais textos de loading visíveis
  await page.waitForFunction(
    () => !document.body.innerText.includes('Autenticando'),
    { timeout }
  ).catch(() => {})
  await page.waitForTimeout(500) // pequena espera para hidratação do React
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Login flow
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Login — fluxo de autenticação', () => {
  test('login com credenciais válidas redireciona para app ou AppHub', async ({ page }) => {
    // Acessa a página de login
    await page.goto('/login')

    // Verifica que os campos de formulário existem
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()

    // Preenche as credenciais válidas
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASS)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Aguarda redirecionamento — pode ser AppHub (/) ou módulo direto
    await page.waitForURL(
      (url) =>
        url.pathname === '/' ||
        /\/(pre-vendas|vendas|aquisicao|organico|leads|trafego|metas|traqueamento|recuperacao|relatorios|sdr-ia)/.test(url.pathname),
      { timeout: 30000 }
    )

    // Confirma que saiu da página de login
    expect(page.url()).not.toContain('/login')
    console.log(`[Login/válido] redirecionado para: ${page.url()} ✅`)
  })

  test('login com senha errada exibe mensagem de erro', async ({ page }) => {
    await page.goto('/login')

    // Preenche email correto mas senha ERRADA
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill('senha_totalmente_errada_12345!')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // Aguarda a mensagem de erro aparecer (não deve redirecionar)
    const errorMsg = page.locator('text=Email ou senha incorretos').or(
      page.locator('[class*="danger"]').filter({ hasText: /incorretos|inválid|error/i })
    ).first()

    await expect(errorMsg).toBeVisible({ timeout: 10000 })

    // Confirma que ainda está na página de login
    expect(page.url()).toContain('/login')
    console.log('[Login/inválido] erro exibido e permanece no /login ✅')
  })

  test('página /login é acessível sem autenticação', async ({ page }) => {
    // Acessa diretamente sem estar logado
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#password')).toBeVisible()
    console.log('[Login/acesso] /login acessível sem auth ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — AppHub
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AppHub — seleção de apps', () => {
  test('AppHub exibe pelo menos 1 card de app com título', async ({ page }) => {
    await login(page)

    // Navega para "/" que é onde o AppHub vive
    await page.goto('/')
    await waitForModuleReady(page)

    // O AppHub pode exibir cards OU redirecionar automaticamente se há 1 app só.
    // Verificamos os dois cenários possíveis:
    const currentUrl = page.url()
    const isOnHub = new URL(currentUrl).pathname === '/'

    if (isOnHub) {
      // Usuário tem múltiplos apps — AppHub deve mostrar os cards
      // Cards são elementos com role="button" dentro de um grid
      const appCards = page.locator('[role="button"]').filter({
        has: page.locator('h3, [class*="CardTitle"], .text-base'),
      })

      // Aguarda pelo menos 1 card aparecer (os dados de permissões carregam async)
      await expect(appCards.first()).toBeVisible({ timeout: 15000 })
      const count = await appCards.count()
      expect(count).toBeGreaterThan(0)
      console.log(`[AppHub] ${count} card(s) de app visíveis ✅`)
    } else {
      // Usuário tem 1 app e foi redirecionado automaticamente — comportamento correto
      console.log(`[AppHub] usuário com 1 app — redirecionado para: ${currentUrl} ✅`)
    }
  })

  test('clicar em um card de app navega para a rota do app', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await waitForModuleReady(page)

    const isOnHub = new URL(page.url()).pathname === '/'

    if (!isOnHub) {
      // Usuário com app único — testa o link "Todos os apps" de dentro da sidebar
      // que existe no DashboardLayout → navega de volta para /
      console.log('[AppHub/click] usuário com 1 app — teste de card não aplicável, skip ✅')
      return
    }

    // Pega o primeiro card clicável
    const firstCard = page.locator('[role="button"]').filter({
      has: page.locator('h3, [class*="CardTitle"], .text-base'),
    }).first()

    await expect(firstCard).toBeVisible({ timeout: 15000 })

    // Captura o título do card para log
    const cardTitle = (await firstCard.locator('h3, [class*="CardTitle"], .text-base').first().textContent() ?? '').trim()
    console.log(`[AppHub/click] clicando no card: "${cardTitle}"`)

    // Clica no card
    await firstCard.click()

    // Deve navegar para uma rota de módulo (não ficar no /)
    await page.waitForURL(
      (url) => url.pathname !== '/',
      { timeout: 15000 }
    )

    expect(page.url()).not.toContain('/login')
    console.log(`[AppHub/click] navegou para: ${page.url()} ✅`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — Sidebar em desktop (viewport padrão ≥ 768px)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sidebar desktop — visibilidade e comportamento fixo', () => {
  // Garante viewport desktop para todos os testes deste grupo
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sidebar é visível em desktop após navegar para /aquisicao', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // O <aside> é renderizado dentro do DashboardLayout
    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })
    console.log('[Sidebar/desktop] aside visível ✅')
  })

  test('sidebar permanece fixa (não rola) quando o conteúdo principal é scrollado', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // Pega a posição inicial do topo da sidebar no viewport
    const sidebarWrapper = page.locator('.sticky.top-0.hidden.md\\:block').first()
    await expect(sidebarWrapper).toBeVisible({ timeout: 10000 })

    const topBefore = await sidebarWrapper.evaluate((el) => el.getBoundingClientRect().top)

    // Faz scroll do conteúdo principal (área <main>)
    await page.locator('main').first().evaluate((el) => {
      el.scrollTop = 500
    })
    await page.waitForTimeout(300)

    // Verifica que a sidebar NÃO se moveu — topo deve continuar no mesmo lugar
    const topAfter = await sidebarWrapper.evaluate((el) => el.getBoundingClientRect().top)

    // A diferença deve ser < 2px (tolerância de pixel de renderização)
    const diff = Math.abs(topAfter - topBefore)
    expect(diff, `Sidebar se moveu ${diff}px ao rolar — deveria permanecer fixa`).toBeLessThan(2)
    console.log(`[Sidebar/sticky] topo antes=${topBefore}px, depois=${topAfter}px, delta=${diff}px ✅`)
  })

  test('botão hamburger NÃO aparece em desktop (display: none via md:hidden)', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // O botão hamburger tem aria-label="Abrir menu" e a classe md:hidden
    // Em viewport desktop ≥ 768px, deve estar oculto (CSS md:hidden = display:none)
    const hamburger = page.locator('[aria-label="Abrir menu"]')
    const count = await hamburger.count()

    if (count > 0) {
      // Verifica que está realmente oculto no DOM (CSS display: none)
      const isHidden = await hamburger.first().evaluate((el) => {
        return window.getComputedStyle(el).display === 'none'
      })
      expect(isHidden, 'Hamburger deve estar oculto em desktop (md:hidden)').toBe(true)
    }
    // Se não existir no DOM, também está correto
    console.log('[Sidebar/hamburger-desktop] hamburger oculto em desktop ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4 — Responsividade mobile (375×812)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sidebar mobile — hamburger e slide-in', () => {
  // Simula iPhone SE / Android comum
  test.use({ viewport: { width: 375, height: 812 } })

  test('sidebar está oculta inicialmente em mobile', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // A sidebar mobile tem `translate-x-full` quando fechada (fora da tela à esquerda)
    // O wrapper div tem classe "fixed inset-y-0 left-0 z-50 md:hidden"
    const mobileSidebarWrapper = page.locator('.fixed.inset-y-0.left-0').first()
    await expect(mobileSidebarWrapper).toBeAttached({ timeout: 10000 })

    // Verifica que está fora da tela (transform: translateX(-100%))
    const isHidden = await mobileSidebarWrapper.evaluate((el) => {
      const style = window.getComputedStyle(el)
      const transform = style.transform || style.webkitTransform
      // -translate-x-full aplica translateX(-Npx) ou matrix(1,0,0,1,-N,0)
      return transform.includes('matrix') && !transform.endsWith(', 0)')
        || el.classList.contains('-translate-x-full')
        || transform === 'matrix(1, 0, 0, 1, -240, 0)'
        || transform === 'matrix(1, 0, 0, 1, -256, 0)'
        || parseFloat(transform.split(',')[4] ?? '0') < 0
    })

    // Alternativa mais robusta: verificar que o <aside> não está visível no viewport
    const aside = mobileSidebarWrapper.locator('aside')
    const rect = await aside.first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width }
    }).catch(() => null)

    if (rect) {
      // A sidebar está fora do viewport se right <= 0
      const isOutOfViewport = rect.right <= 0
      expect(
        isOutOfViewport || isHidden,
        `Sidebar mobile deve estar oculta/fora da tela. rect.right=${rect?.right}`
      ).toBe(true)
    }

    console.log('[Mobile/sidebar] sidebar fora da tela inicialmente ✅')
  })

  test('botão hamburger é visível em mobile', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    const hamburger = page.locator('[aria-label="Abrir menu"]')
    await expect(hamburger).toBeVisible({ timeout: 10000 })
    console.log('[Mobile/hamburger] botão hamburger visível ✅')
  })

  test('clicar no hamburger abre a sidebar mobile (slide-in)', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    const hamburger = page.locator('[aria-label="Abrir menu"]')
    await expect(hamburger).toBeVisible({ timeout: 10000 })

    // Clica no hamburger para abrir
    await hamburger.click()
    await page.waitForTimeout(400) // aguarda a animação de 300ms (duration-300)

    // O backdrop aparece quando mobile está aberta (div com bg-empire-void/50)
    const backdrop = page.locator('.fixed.inset-0[aria-hidden="true"]')
    await expect(backdrop).toBeVisible({ timeout: 5000 })

    // A sidebar mobile deve agora estar visível no viewport
    const mobileSidebarWrapper = page.locator('.fixed.inset-y-0.left-0').first()
    const aside = mobileSidebarWrapper.locator('aside')
    const rect = await aside.first().evaluate((el) => el.getBoundingClientRect())
    expect(rect.right, 'Sidebar deve estar dentro do viewport após abrir').toBeGreaterThan(0)

    console.log('[Mobile/open] sidebar deslizou para dentro do viewport ✅')
  })

  test('clicar em item do menu fecha a sidebar mobile automaticamente', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // Abre a sidebar
    const hamburger = page.locator('[aria-label="Abrir menu"]')
    await hamburger.click()
    await page.waitForTimeout(400)

    // Confirma que abriu (backdrop visível)
    const backdrop = page.locator('.fixed.inset-0[aria-hidden="true"]')
    await expect(backdrop).toBeVisible({ timeout: 5000 })

    // Clica em qualquer link dentro da sidebar mobile
    // O Sidebar chama onMobileClose via onLinkClick, que seta mobileOpen = false
    const mobileSidebarWrapper = page.locator('.fixed.inset-y-0.left-0').first()
    const firstNavLink = mobileSidebarWrapper.locator('nav a').first()
    await expect(firstNavLink).toBeVisible({ timeout: 5000 })
    await firstNavLink.click()

    await page.waitForTimeout(400) // aguarda animação de fechamento

    // O backdrop deve desaparecer quando a sidebar fecha
    await expect(backdrop).not.toBeVisible({ timeout: 5000 })
    console.log('[Mobile/close] sidebar fechou ao clicar em item do menu ✅')
  })

  test('clicar no backdrop fecha a sidebar mobile', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // Abre a sidebar
    await page.locator('[aria-label="Abrir menu"]').click()
    await page.waitForTimeout(400)

    const backdrop = page.locator('.fixed.inset-0[aria-hidden="true"]')
    await expect(backdrop).toBeVisible({ timeout: 5000 })

    // Clica no backdrop para fechar
    await backdrop.click({ position: { x: 300, y: 400 } })
    await page.waitForTimeout(400)

    // Backdrop deve sumir
    await expect(backdrop).not.toBeVisible({ timeout: 5000 })
    console.log('[Mobile/backdrop] sidebar fechou ao clicar no backdrop ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5 — Tab navigation em /pre-vendas
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Tab navigation — ?tab= na URL ao clicar nas abas', () => {
  // Tabs disponíveis no módulo Pré-Vendas conforme TABS array em PreVendasPage.tsx
  const PRE_VENDAS_TABS = [
    { key: 'discagem', label: 'Discagem' },
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'atividades', label: 'Atividades' },
    { key: 'mqls', label: 'MQLs' },
    { key: 'sdrs', label: 'SDRs' },
  ] as const

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/pre-vendas')
    await waitForModuleReady(page)
    // Aguarda as abas aparecerem
    await page.waitForSelector('nav button, nav a', { timeout: 15000 })
  })

  test('tabs de Pré-Vendas estão visíveis', async ({ page }) => {
    // As tabs são renderizadas em um elemento com role="tablist" (PageTabs)
    const tabsNav = page.locator('[role="tablist"]').first()

    await expect(tabsNav).toBeVisible({ timeout: 10000 })

    // Verifica que pelo menos 3 tabs estão presentes (podem ser <button> ou <a>)
    const tabButtons = tabsNav.locator('[role="tab"]')
    const count = await tabButtons.count()
    expect(count).toBeGreaterThanOrEqual(3)
    console.log(`[Tabs] ${count} abas visíveis em /pre-vendas ✅`)
  })

  for (const tab of PRE_VENDAS_TABS) {
    test(`clicar na tab "${tab.label}" muda URL para ?tab=${tab.key}`, async ({ page }) => {
      // Procura o botão com o texto exato da tab
      const tabBtn = page.locator('button').filter({ hasText: new RegExp(`^${tab.label}$`, 'i') }).first()
      const tabBtnAlt = page.locator('a').filter({ hasText: new RegExp(`^${tab.label}$`, 'i') }).first()

      // Tenta o botão primeiro, depois o link (PageTabs pode usar um ou outro)
      const targetElement = (await tabBtn.count()) > 0 ? tabBtn : tabBtnAlt

      await expect(targetElement).toBeVisible({ timeout: 10000 })
      await targetElement.click()

      // Aguarda URL atualizar com o parâmetro ?tab=
      await page.waitForURL((url) => url.searchParams.get('tab') === tab.key, { timeout: 10000 })

      const url = new URL(page.url())
      expect(url.searchParams.get('tab')).toBe(tab.key)
      console.log(`[Tabs] aba "${tab.label}" → ?tab=${tab.key} ✅`)
    })
  }

  test('URL mantém ?tab= ao navegar entre abas sem recarregar a página', async ({ page }) => {
    // Clica na tab Discagem
    const discagemBtn = page.locator('button').filter({ hasText: /^Discagem$/i }).first()
    await expect(discagemBtn).toBeVisible({ timeout: 10000 })
    await discagemBtn.click()
    await page.waitForURL((url) => url.searchParams.get('tab') === 'discagem', { timeout: 10000 })

    // Muda para Agendamentos
    const agendBtn = page.locator('button').filter({ hasText: /^Agendamentos$/i }).first()
    await agendBtn.click()
    await page.waitForURL((url) => url.searchParams.get('tab') === 'agendamentos', { timeout: 10000 })

    // Confirma que ainda está em /pre-vendas (não houve page load)
    expect(new URL(page.url()).pathname).toBe('/pre-vendas')
    expect(new URL(page.url()).searchParams.get('tab')).toBe('agendamentos')
    console.log('[Tabs] navegação entre tabs sem recarregar página ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 6 — Logout
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Logout — redireciona para /login', () => {
  test('botão Sair na sidebar desloga e redireciona para /login', async ({ page }) => {
    await login(page)

    // Vai para uma rota que use DashboardLayout (com sidebar)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // O botão de logout está na sidebar com aria-label="Sair"
    const logoutBtn = page.locator('[aria-label="Sair"]').first()
    await expect(logoutBtn).toBeVisible({ timeout: 10000 })

    await logoutBtn.click()

    // Aguarda redirect para /login
    await page.waitForURL(/\/login/, { timeout: 15000 })
    expect(page.url()).toContain('/login')
    console.log('[Logout] redirecionado para /login após logout ✅')
  })

  test('após logout, acessar rota protegida redireciona para /login', async ({ page }) => {
    await login(page)
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // Faz logout
    const logoutBtn = page.locator('[aria-label="Sair"]').first()
    await expect(logoutBtn).toBeVisible({ timeout: 10000 })
    await logoutBtn.click()
    await page.waitForURL(/\/login/, { timeout: 15000 })

    // Tenta acessar rota protegida depois do logout
    await page.goto('/pre-vendas')

    // Deve ser redirecionado para /login (o AuthContext protege as rotas)
    await page.waitForURL(/\/login/, { timeout: 10000 })
    expect(page.url()).toContain('/login')
    console.log('[Logout/proteção] rota protegida redireciona para /login após logout ✅')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 7 — Sanidade de navegação (smoke tests)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Sanidade — páginas carregam sem erro de JS', () => {
  const ROUTES_TO_CHECK = [
    { path: '/aquisicao', name: 'Aquisição' },
    { path: '/pre-vendas', name: 'Pré-Vendas' },
    { path: '/vendas', name: 'Vendas' },
    { path: '/leads', name: 'Leads' },
    { path: '/metas', name: 'Metas' },
  ]

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  for (const route of ROUTES_TO_CHECK) {
    test(`${route.name} (${route.path}) carrega sem erro crítico no console`, async ({ page }) => {
      // Coleta erros de JS durante a navegação
      const jsErrors: string[] = []
      page.on('pageerror', (err) => {
        jsErrors.push(err.message)
      })

      await page.goto(route.path)
      await waitForModuleReady(page)

      // Verifica que a página está em /path (não foi redirecionada para /login)
      const currentPath = new URL(page.url()).pathname
      expect(
        currentPath,
        `${route.name} deveria estar em ${route.path}, mas está em ${currentPath}`
      ).toBe(route.path)

      // Filtra erros críticos (ignora warnings de terceiros e network que são previsíveis)
      const criticalErrors = jsErrors.filter(
        (e) =>
          !e.includes('ResizeObserver') &&
          !e.includes('Network request failed') &&
          !e.includes('ChunkLoadError') &&
          !e.includes('Loading chunk')
      )

      expect(
        criticalErrors.length,
        `Erros de JS em ${route.path}: ${criticalErrors.join(' | ')}`
      ).toBe(0)

      console.log(`[Sanidade] ${route.name} carregou sem erros JS críticos ✅`)
    })
  }

  test('link "Todos os apps" na sidebar navega para AppHub (/)', async ({ page }) => {
    await page.goto('/aquisicao')
    await waitForModuleReady(page)

    // O link "Todos os apps" aparece na sidebar (apenas em desktop)
    const allAppsLink = page.locator('a').filter({ hasText: /Todos os apps/i }).first()
    await expect(allAppsLink).toBeVisible({ timeout: 10000 })

    await allAppsLink.click()

    // Deve navegar para "/" (AppHub)
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 })
    expect(new URL(page.url()).pathname).toBe('/')
    console.log('[Sanidade] link "Todos os apps" navega para AppHub (/) ✅')
  })
})
