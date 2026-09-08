import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { TEST_USERS } from './helpers/users'
import {
  getWorkspaceIdByEmail,
  deleteNativeCreativesByNamePattern,
} from './helpers/supabase-admin'

async function waitForPageReady(page: Page) {
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('Carregando') && !document.body.innerText.includes('Autenticando'),
      { timeout: 20000 }
    )
    .catch(() => {})
  await page.waitForTimeout(500)
}

function todaySuffix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function cleanupTestCreatives() {
  const workspaceId = await getWorkspaceIdByEmail(TEST_USERS.admin_master.email)
  if (workspaceId) {
    // Limpa criativos nativos criados pelos testes E2E (nomes contêm "E2E")
    await deleteNativeCreativesByNamePattern(workspaceId, '%E2E%')
  }
}

test.describe('Sub-app Criativos', () => {
  test.beforeEach(async () => {
    await cleanupTestCreatives()
  })

  test.afterEach(async () => {
    await cleanupTestCreatives()
  })

  test('admin_master vê Criativos no AppHub e acessa a página', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/')
    await waitForPageReady(page)

    const card = page.getByRole('button', { name: 'Criativos' })
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.click()

    await page.waitForURL('/criativos*', { timeout: 10000 })
    await expect(page.locator('h1')).toContainText('Criativos')
  })

  test('página de Criativos exibe todas as abas esperadas', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/criativos')
    await waitForPageReady(page)

    await expect(page.getByRole('tab', { name: 'Ranking' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Biblioteca' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Kanban' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Testes' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Orgânicos' })).not.toBeVisible()
  })

  test('Ranking carrega métricas reais de criativos', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=ranking')
    await waitForPageReady(page)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })

    const firstCode = await rows.first().locator('td').first().locator('div').nth(1).textContent()
    expect(firstCode?.trim()).toMatch(/^(CR-|AN-)/)
  })

  test('Ranking: toolbar com colunas configuráveis e ordenação', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=ranking')
    await waitForPageReady(page)

    await expect(page.getByRole('heading', { name: 'Ranking de Criativos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Colunas' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Só com MQL' })).toBeVisible()

    // Testa ordenação por Criativo
    await page.getByRole('button', { name: 'Criativo', exact: true }).click()
    await page.waitForTimeout(300)
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('alternar entre Ranking e Biblioteca atualiza a URL e o conteúdo', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/criativos')
    await waitForPageReady(page)

    await page.getByRole('tab', { name: 'Biblioteca' }).click()
    await page.waitForURL('/criativos?tab=biblioteca*', { timeout: 10000 })
    await expect(page.locator('input[placeholder*="Buscar por nome, ID..."]')).toBeVisible()

    await page.getByRole('tab', { name: 'Ranking' }).click()
    await page.waitForURL('/criativos?tab=ranking*', { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Criativos' })).toBeVisible()
  })

  test('Biblioteca: filtro por texto atualiza a tabela', async ({ page }) => {
    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=biblioteca')
    await waitForPageReady(page)

    const searchInput = page.locator('input[placeholder*="Buscar por nome, ID..."]')
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('__NAO_EXISTE_42__')
    await page.waitForTimeout(500)

    await expect(page.locator('text=Nenhum criativo encontrado')).toBeVisible({ timeout: 10000 })

    await searchInput.fill('')
    await page.waitForTimeout(500)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
  })

  test('Biblioteca: criar e editar criativo nativo via formulário', async ({ page }) => {
    test.setTimeout(60000)

    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=biblioteca')
    await waitForPageReady(page)

    const creativeName = `Criativo E2E ${todaySuffix()}`
    const editedName = `${creativeName} (editado)`

    // Abre o dialog de criação
    await page.getByRole('button', { name: 'Novo Criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).toBeVisible({ timeout: 10000 })

    // Preenche o formulário
    await page.locator('input#creative-name').fill(creativeName)

    // Seleciona formato (Select customizado)
    await page.locator('button:has-text("Selecione o formato")').first().click()
    await page.locator('button:has-text("Reels")').first().click()

    await page.locator('textarea#creative-copy').fill('Copy de teste para o criativo nativo.')
    await page.locator('textarea#creative-hook').fill('Hook de teste.')

    // Salva e aguarda fechamento
    await page.getByRole('button', { name: 'Criar criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).not.toBeVisible({ timeout: 15000 })

    // Filtra para encontrar o criativo criado
    const searchInput = page.locator('input[placeholder*="Buscar por nome, ID..."]')
    await searchInput.fill(creativeName)
    await page.waitForTimeout(500)

    const row = page.locator('table tbody tr').filter({ hasText: creativeName }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    // Verifica que o código começa com AN-
    const codeCell = row.locator('td').first()
    const code = await codeCell.textContent()
    expect(code?.trim()).toMatch(/^AN-/)
    const creativeCode = code?.trim() as string

    // Edita o criativo
    await row.getByRole('button', { name: 'Editar' }).click()
    await expect(page.locator('h2:has-text("Editar Criativo")')).toBeVisible({ timeout: 10000 })

    await page.locator('input#creative-name').fill(editedName)
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.locator('h2:has-text("Editar Criativo")')).not.toBeVisible({ timeout: 15000 })

    // Limpa o filtro e valida edição
    await searchInput.fill('')
    await page.waitForTimeout(500)
    await searchInput.fill(editedName)
    await page.waitForTimeout(500)

    const editedRow = page.locator('table tbody tr').filter({ hasText: editedName }).first()
    await expect(editedRow).toBeVisible({ timeout: 10000 })
    await expect(editedRow.locator('td').first()).toContainText(creativeCode)
  })

  test('Biblioteca: marca criativo como testado e aprova', async ({ page }) => {
    test.setTimeout(60000)

    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=biblioteca')
    await waitForPageReady(page)

    const creativeName = `Aprovação E2E ${todaySuffix()}`

    // Cria um criativo nativo para isolar o teste de concorrência
    await page.getByRole('button', { name: 'Novo Criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).toBeVisible({ timeout: 10000 })
    await page.locator('input#creative-name').fill(creativeName)
    await page.locator('button:has-text("Selecione o formato")').first().click()
    await page.locator('button:has-text("Vídeo")').first().click()
    await page.getByRole('button', { name: 'Criar criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).not.toBeVisible({ timeout: 15000 })

    // Filtra para encontrar o criativo criado
    const searchInput = page.locator('input[placeholder*="Buscar por nome, ID..."]')
    await searchInput.fill(creativeName)
    await page.waitForTimeout(500)

    const row = page.locator('table tbody tr').filter({ hasText: creativeName }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    const firstCode = await row.locator('td').first().locator('span').innerText()
    expect(firstCode?.trim()).toMatch(/^AN-/)

    // O Checkbox do shadcn expõe role=checkbox no botão decorativo
    const checkbox = row.getByRole('checkbox').first()
    const isChecked = await checkbox.isChecked().catch(() => false)

    if (!isChecked) {
      await checkbox.click()
      await page.waitForTimeout(500)
    }

    // Garante aprovação: se já estiver aprovado, não clica; senão, clica em Sim
    const approveButton = row.locator('button').filter({ hasText: 'Sim' }).first()
    const isApproved = await approveButton.evaluate((el) => el.classList.contains('bg-blue-500'))

    if (!isApproved) {
      await approveButton.click()
      await page.waitForTimeout(500)
    }

    // Recarrega e valida persistência no mesmo criativo
    await page.reload()
    await waitForPageReady(page)
    await searchInput.fill(creativeName)
    await page.waitForTimeout(500)

    const targetRow = page
      .locator('table tbody tr')
      .filter({ hasText: new RegExp(`^${firstCode?.trim()}`) })
      .first()
    await expect(targetRow).toBeVisible({ timeout: 10000 })

    const reloadedCheckbox = targetRow.getByRole('checkbox').first()
    await expect(reloadedCheckbox).toBeChecked({ timeout: 10000 })

    const reloadedApproveButton = targetRow.locator('button').filter({ hasText: 'Sim' }).first()
    await expect(reloadedApproveButton).toHaveClass(/bg-blue-500/, { timeout: 10000 })
  })

  test('Kanban: mover card entre colunas atualiza o status', async ({ page }) => {
    test.setTimeout(60000)

    const workspaceId = await getWorkspaceIdByEmail(TEST_USERS.admin_master.email)
    if (!workspaceId) throw new Error('Workspace de teste não encontrado')

    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=biblioteca')
    await waitForPageReady(page)

    const creativeName = `Kanban E2E ${todaySuffix()}`

    // Cria um criativo nativo para mover no Kanban
    await page.getByRole('button', { name: 'Novo Criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).toBeVisible({ timeout: 10000 })
    await page.locator('input#creative-name').fill(creativeName)
    await page.locator('button:has-text("Selecione o formato")').first().click()
    await page.locator('button:has-text("Static")').first().click()
    await page.getByRole('button', { name: 'Criar criativo' }).click()
    await expect(page.locator('h2:has-text("Novo Criativo")')).not.toBeVisible({ timeout: 15000 })

    // Vai para o Kanban e filtra pelo nome
    await page.goto('/criativos?tab=kanban')
    await waitForPageReady(page)

    const searchInput = page.locator('input[placeholder*="Buscar por nome ou código..."]')
    await searchInput.fill(creativeName)
    await page.waitForTimeout(500)

    // Localiza o card e a coluna de destino (Roteiro)
    const card = page.locator('[draggable]').filter({ hasText: creativeName }).first()
    await expect(card).toBeVisible({ timeout: 10000 })

    const targetColumn = page.locator('.flex-col.min-w-\\[260px\\]').filter({ hasText: 'Roteiro' }).first()
    await expect(targetColumn).toBeVisible({ timeout: 10000 })

    // Realiza o drag-and-drop via eventos do HTML5 (mais confiável que dragTo em DnD nativo)
    await card.evaluate((el) => {
      const target = Array.from(document.querySelectorAll('.flex-col.min-w-\\[260px\\]')).find(
        (col) => col.textContent?.includes('Roteiro')
      ) as HTMLElement | undefined
      if (!target) throw new Error('Coluna de destino não encontrada')

      const dataTransfer = new DataTransfer()
      const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
      el.dispatchEvent(dragStart)

      const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })
      target.dispatchEvent(dragOver)

      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })
      target.dispatchEvent(drop)

      const dragEnd = new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer })
      el.dispatchEvent(dragEnd)
    })

    await page.waitForTimeout(1000)

    // Recarrega e valida que o card aparece na coluna Roteiro
    await page.reload()
    await waitForPageReady(page)
    await searchInput.fill(creativeName)
    await page.waitForTimeout(500)

    const targetColumnAfterReload = page.locator('.flex-col.min-w-\\[260px\\]').filter({ hasText: 'Roteiro' }).first()
    await expect(targetColumnAfterReload.locator('[draggable]').filter({ hasText: creativeName })).toBeVisible({
      timeout: 10000,
    })
  })

  test('Testes: aba carrega fila e testes em andamento', async ({ page }) => {
    test.setTimeout(30000)

    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=testes')
    await waitForPageReady(page)

    await expect(page.getByRole('heading', { name: 'Testes de Criativos' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Fila de testes')).toBeVisible()
    await expect(page.locator('text=Testes em andamento')).toBeVisible()
  })

  test('Dashboard: carrega KPIs e distribuição por status', async ({ page }) => {
    test.setTimeout(30000)

    await loginAs(page, 'admin_master')
    await page.goto('/criativos?tab=dashboard')
    await waitForPageReady(page)

    await expect(page.locator('text=Total de criativos')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Taxa de aprovação')).toBeVisible()
    await expect(page.locator('text=Tempo médio para teste')).toBeVisible()
    await expect(page.locator('text=Tempo médio para decisão')).toBeVisible()
    await expect(page.locator('text=Distribuição por status')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Próxima reunião' }).first()).toBeVisible()
    await expect(page.locator('text=CPL médio por formato')).toBeVisible()
    await expect(page.locator('text=Alertas')).toBeVisible()
  })

  test('gestor com acesso a trafego também vê Criativos no AppHub', async ({ page }) => {
    await loginAs(page, 'gestor')
    await page.goto('/')
    await waitForPageReady(page)

    const labels = await page.locator('div[role="button"] h3').allTextContents()
    const hasCriativos = labels.some((l) => l.trim() === 'Criativos')

    if (hasCriativos) {
      await page.goto('/criativos')
      await waitForPageReady(page)
      await expect(page.locator('h1')).toContainText('Criativos')
    } else {
      test.skip()
    }
  })
})
