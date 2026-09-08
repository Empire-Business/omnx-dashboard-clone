import { chromium } from 'playwright'

const browser = await chromium.launch({ 
  headless: true,
  executablePath: '/Users/bguzela/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
})
const page = await browser.newPage()

let consoleErrors = []
let ownerNameLogs = []
page.on('console', msg => {
  const text = msg.text()
  if (msg.type() === 'error') {
    consoleErrors.push(text)
  }
  if (text.includes('owner_name') || text.includes('contatos') || text.includes('drilldown') || text.includes('leadIds')) {
    ownerNameLogs.push(text)
  }
})

try {
  console.log('Launching browser...')
  await page.goto('http://localhost:3222', { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(2000)
  
  console.log('Page loaded')
  
  // Click on Pré-Vendas nav
  const prevendasNav = page.locator('text=Pré-Vendas').first()
  if (await prevendasNav.isVisible()) {
    await prevendasNav.click()
    await page.waitForTimeout(1000)
    console.log('Clicked Pré-Vendas')
  }
  
  // Click on Estatísticas nav  
  const estatisticasNav = page.locator('text=Estatísticas').first()
  if (await estatisticasNav.isVisible()) {
    await estatisticasNav.click()
    await page.waitForTimeout(4000)
    console.log('Clicked Estatísticas')
  }
  
  // Check if table exists
  const table = page.locator('table').first()
  if (await table.isVisible()) {
    console.log('Table is visible')
    
    // Count rows
    const rows = await table.locator('tbody tr').count()
    console.log('Table rows:', rows)
    
    // Click on first cell with data > 0
    for (const metric of ['Leads', 'MQLs', 'Agendamentos', 'Vendas']) {
      const cell = table.locator(`td.cursor-pointer:has-text("${metric}")`).first()
      if (await cell.isVisible().catch(() => false)) {
        console.log('Found metric cell for:', metric)
      }
    }
    
    // Try to click on first clickable cell that has a number > 0
    const firstCellWithData = page.locator('td.cursor-pointer').filter({ hasText: /^[1-9]/ }).first()
    if (await firstCellWithData.isVisible().catch(() => false)) {
      const text = await firstCellWithData.textContent()
      console.log('Clicking cell with data:', text?.trim())
      await firstCellWithData.click()
      await page.waitForTimeout(2000)
      console.log('Clicked on cell')
      
      // Check for modal content
      const modalTable = page.locator('[class*="overflow-y-auto"]').first()
      if (await modalTable.isVisible().catch(() => false)) {
        const tableText = await modalTable.textContent()
        console.log('Modal table content:', tableText?.slice(0, 500))
      }
      
      // Check for any modal/dialog
      const allText = await page.textContent('body')
      const hasLeadsInBody = allText?.includes('Leads')
      console.log('Body has "Leads":', hasLeadsInBody)
    }
  } else {
    console.log('Table NOT visible')
    const bodyText = await page.locator('body').textContent()
    console.log('Body preview:', bodyText?.slice(0, 300))
  }
  
  if (consoleErrors.length > 0) {
    console.log('\nConsole errors:')
    consoleErrors.forEach(e => console.log(' -', e))
  }
  
  if (ownerNameLogs.length > 0) {
    console.log('\nDebug logs (owner_name/contatos/drilldown):')
    ownerNameLogs.forEach(l => console.log(' -', l))
  }
  
} catch(e) {
  console.error('Test error:', e.message)
} finally {
  await browser.close()
}
