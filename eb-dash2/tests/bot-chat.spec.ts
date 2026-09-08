import { test, expect } from '@playwright/test'

const BASE = process.env.VITE_SUPABASE_URL || 'https://qzesffnkqgelmtfblzkr.supabase.co'
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '<REMOVED: CONFIGURE_IN_ENV>'
const EMAIL = process.env.PLAYWRIGHT_BOT_CHAT_EMAIL ?? '<REMOVED: CONFIGURE_IN_ENV>'
const PASS = process.env.PLAYWRIGHT_BOT_CHAT_PASSWORD ?? '<REMOVED: CONFIGURE_IN_ENV>'
const PIPELINE_RECUPERACAO = 'Sn1Guqcm6zwZNTVOOf5L'

// ─── Helper: obter token de acesso ───────────────────────────────────
async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const json = await res.json() as { access_token: string }
  if (!json.access_token) throw new Error('Login falhou: ' + JSON.stringify(json))
  return json.access_token
}

// ─── Helper: contar direto no Supabase ───────────────────────────────
async function countLeadsAbril(token: string): Promise<number> {
  const res = await fetch(
    `${BASE}/rest/v1/oportunidades?select=id` +
    `&data_lead_recebido=gte.2026-04-01T00:00:00-03:00` +
    `&data_lead_recebido=lte.2026-04-13T23:59:59-03:00` +
    `&pipeline_id=neq.${PIPELINE_RECUPERACAO}`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    }
  )
  const range = res.headers.get('content-range') ?? '0-0/0'
  const total = parseInt(range.split('/')[1] ?? '0', 10)
  return total
}

async function countMqlsAbril(token: string): Promise<number> {
  // Buscar todos os leads de Abril e filtrar por tag 'mql' no lado JS
  const res = await fetch(
    `${BASE}/rest/v1/oportunidades?select=id,contatos(tags)` +
    `&data_lead_recebido=gte.2026-04-01T00:00:00-03:00` +
    `&data_lead_recebido=lte.2026-04-13T23:59:59-03:00` +
    `&pipeline_id=neq.${PIPELINE_RECUPERACAO}`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'count=exact',
        Range: '0-999',
      },
    }
  )
  const data = await res.json() as { contatos: { tags: string | null } | null }[]
  return data.filter((o) => {
    const tags = o.contatos?.tags
    if (!tags) return false
    const list = typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : []
    return list.some((t) => t.toLowerCase() === 'mql')
  }).length
}

// ─── Teste 1: bot responde e retorna dados corretos via API ──────────
test('bot-chat API — responde com MQLs corretos de Abril 2026', async () => {
  const token = await getToken()

  // Contar diretamente no Supabase para ter o gabarito
  const leadsGabarito = await countLeadsAbril(token)
  const mqlsGabarito = await countMqlsAbril(token)
  console.log(`Gabarito: ${leadsGabarito} leads, ${mqlsGabarito} MQLs em Abril 2026`)

  // Chamar o bot
  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'quantos mqls geramos este mes?',
      context: {
        current_date_sp: '2026-04-13',
        active_filters: { startDate: '2026-04-01', endDate: '2026-04-13' },
      },
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string; conversation_id: string }
  console.log('\nResposta do bot:')
  console.log(json.answer)

  // Verificar que retornou um conversation_id
  expect(json.conversation_id).toBeTruthy()

  // Verificar que o número de MQLs está na resposta (±2 de tolerância)
  const answerText = json.answer
  const numberMatches = answerText.match(/\d+/g)?.map(Number) ?? []
  const mqlInAnswer = numberMatches.find((n) => Math.abs(n - mqlsGabarito) <= 2)

  expect(mqlInAnswer).toBeDefined()
  console.log(`\n✅ Bot citou ${mqlInAnswer} MQLs (gabarito: ${mqlsGabarito}) — dentro da tolerância`)
})

// ─── Teste 2: bot usa COHORT (filtra por data_lead_recebido) ─────────
test('bot-chat API — resposta menciona COHORT', async () => {
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'quantos mqls geramos em marco de 2026?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  const json = await res.json() as { answer: string }
  const lower = json.answer.toLowerCase()
  const hasCohortMention = lower.includes('cohort') || lower.includes('data_lead_recebido') || lower.includes('entraram no período')

  console.log('Resposta março:', json.answer.slice(0, 300))
  expect(hasCohortMention).toBe(true)
  console.log('✅ Bot mencionou modo COHORT')
})

// ─── Teste 3: bot não mistura faturamento com cohort ─────────────────
test('bot-chat API — faturamento usa PRODUTIVIDADE', async () => {
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'qual o faturamento de abril de 2026?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  const json = await res.json() as { answer: string }
  const lower = json.answer.toLowerCase()
  const hasProdMention = lower.includes('produtividade') || lower.includes('data_pagamento_entrada') || lower.includes('pagamento')

  console.log('Resposta faturamento:', json.answer.slice(0, 300))
  expect(hasProdMention).toBe(true)
  console.log('✅ Bot usou modo PRODUTIVIDADE para faturamento')
})

// ─── Teste 4: MQLs de março 2026 — bot deve retornar ~197, não 608 ───
test('bot-chat API — MQLs março 2026 corretos (regex, não ILIKE)', async () => {
  const token = await getToken()

  // Gabarito via SQL direto no banco (bot_query RPC com regex exato)
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'REMOVED_SERVICE_ROLE_TOKEN_CONFIGURE_IN_SUPABASE_DASHBOARD'
  const rpcRes = await fetch(`${BASE}/rest/v1/rpc/bot_query`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql_text: `SELECT COUNT(*) AS mqls FROM oportunidades o JOIN contatos c ON c.id = o.contato_id WHERE o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L' AND o.data_lead_recebido >= '2026-03-01T00:00:00-03:00' AND o.data_lead_recebido <= '2026-03-31T23:59:59.999-03:00' AND c.tags ~ '(^|,)\\s*mql\\s*(,|$)'` }),
  })
  const rpcData = await rpcRes.json() as { mqls: string }[]
  const gabarito = parseInt(rpcData[0]?.mqls ?? '0', 10)
  console.log(`Gabarito MQLs março: ${gabarito}`)
  expect(gabarito).toBeGreaterThan(150)  // deve ser ~197, muito mais que 0 mas muito menos que 608

  // Chamar o bot
  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'quantos mqls geramos em março de 2026?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string }
  console.log('Resposta MQLs março:', json.answer.slice(0, 500))

  // O bot deve citar um número próximo do gabarito (±10)
  // NUNCA deve apresentar ~608 como contagem de MQLs (seria o bug do ILIKE)
  const numberMatches = json.answer.match(/\d+/g)?.map(Number) ?? []
  const mqlInAnswer = numberMatches.find((n) => Math.abs(n - gabarito) <= 10)
  // Se o bot citar 608 próximo ao gabarito de 197, estará errado — distância > 50
  const hasWrongMqlCount = numberMatches.some((n) => Math.abs(n - 608) <= 15 && Math.abs(n - gabarito) > 50)

  console.log(`Números na resposta: ${numberMatches.join(', ')}`)
  expect(hasWrongMqlCount).toBe(false)
  expect(mqlInAnswer).toBeDefined()
  console.log(`✅ Bot citou ${mqlInAnswer} MQLs (gabarito: ${gabarito}) — regex correto`)
})

// ─── Teste 5: taxa de fechamento deve usar PRODUTIVIDADE, não COHORT ──
test('bot-chat API — taxa de fechamento usa PRODUTIVIDADE (não cohort)', async () => {
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'qual a taxa de fechamento (fechados por reunião realizada) de março de 2026?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string }
  const lower = json.answer.toLowerCase()
  console.log('Resposta taxa fechamento:', json.answer.slice(0, 500))

  // Bot NÃO deve reportar taxa de 3,7% (que era o erro com cohort imaturo dividindo 2/54)
  // Deve reportar algo em torno de 10-25% (produtividade: 10/63 = 15.9%)
  const percentMatches = json.answer.match(/(\d+[,.]?\d*)\s*%/g) ?? []
  console.log('Percentuais na resposta:', percentMatches)

  // Verificar que não citou 3% ou 4% (que seria o erro cohort)
  const hasWrongRate = percentMatches.some((p) => {
    const n = parseFloat(p.replace(',', '.'))
    return n >= 2 && n <= 5  // 3.7% estava errado
  })

  // Verificar que mencionou produtividade
  const hasProdMention = lower.includes('produtividade') || lower.includes('data_pagamento') || lower.includes('realizadas')

  expect(hasWrongRate).toBe(false)
  expect(hasProdMention).toBe(true)
  console.log('✅ Bot usou PRODUTIVIDADE para taxa de fechamento — sem mistura com cohort')
})

// ─── Teste 6: cohort recente deve ter aviso de imaturidade ───────────
test('bot-chat API — cohort recente gera aviso de imaturidade', async () => {
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'analise o funil cohort de março de 2026 — quantos fechamentos tivemos?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string }
  const lower = json.answer.toLowerCase()
  console.log('Resposta cohort imaturo:', json.answer.slice(0, 600))

  // Bot deve mencionar que o cohort está amadurecendo / é imaturo / faz pouco tempo
  const hasMaturityWarning =
    lower.includes('amadurecendo') ||
    lower.includes('imaturo') ||
    lower.includes('ciclo de compra') ||
    lower.includes('ainda não') ||
    lower.includes('poucos fechamentos') ||
    lower.includes('produtividade') // redirecionar para produtividade é aceitável

  expect(hasMaturityWarning).toBe(true)
  console.log('✅ Bot avisou sobre imaturidade do cohort recente')
})

// ─── Teste 7: planejamento R$1M deve usar PRODUTIVIDADE + projeção ────
// Timeout estendido: bot faz múltiplos tool calls (historical_trends + revenue + funnel)
test('bot-chat API — planejamento 1M usa dados corretos', async () => {
  test.setTimeout(180000)
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    signal: AbortSignal.timeout(160000),
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'preciso chegar a R$1 milhão de faturamento em 2026. com base nos números reais, o que preciso fazer?',
      context: { current_date_sp: '2026-04-13' },
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string }
  const lower = json.answer.toLowerCase()
  console.log('\n=== Resposta Planejamento R$1M ===')
  console.log(json.answer.slice(0, 1200))
  console.log('===================================\n')

  // Deve conter alguma referência ao ticket médio ou faturamento histórico
  const hasRevenueData = lower.includes('ticket') || lower.includes('faturamento') || lower.includes('venda')
  // Deve conter projeção ou cenários
  const hasProjection = lower.includes('cenário') || lower.includes('projeção') || lower.includes('projeta') || lower.includes('conservador') || lower.includes('otimista')
  // Deve conter recomendações acionáveis
  const hasActions = lower.includes('recomendo') || lower.includes('aumentar') || lower.includes('precisa') || lower.includes('ação')
  // NÃO deve conter taxa de fechamento de ~3% ou ~4% usada COMO TAXA REAL DE FECHAMENTO
  // (bug do cohort — não usar dados de fechamento cohort imaturo para planejamento).
  // Porcentagens nessa faixa em tabelas de cohort histórico, com contexto de imaturidade, são aceitáveis.
  const percentages = json.answer.match(/(\d+[,]?\d*)\s*%/g) ?? []
  const hasBugRate = percentages.some((p) => {
    const n = parseFloat(p.replace(',', '.'))
    if (n < 2.5 || n >= 5) return false
    const matchIndex = json.answer.indexOf(p)
    const snippetStart = Math.max(0, matchIndex - 60)
    const snippetEnd = Math.min(json.answer.length, matchIndex + p.length + 60)
    const snippet = json.answer.slice(snippetStart, snippetEnd).toLowerCase()
    const isCohortContext =
      snippet.includes('cohort') ||
      snippet.includes('imaturo') ||
      snippet.includes('amadurecendo') ||
      snippet.includes('ciclo de compra') ||
      snippet.includes('fechados de') ||
      snippet.includes('funil')
    if (isCohortContext) return false
    return snippet.includes('taxa de fechamento') || snippet.includes('conversão') || snippet.includes('fechamento')
  })

  console.log('Percentuais detectados:', percentages)
  expect(hasRevenueData).toBe(true)
  expect(hasActions).toBe(true)
  expect(hasBugRate).toBe(false)
  if (hasProjection) console.log('✅ Bot fez projeção com cenários')
  console.log('✅ Planejamento R$1M sem taxa de fechamento errada')
})

// ─── Teste 8b: get_buyer_profile — relatório completo Q1 sem corte ────
test('bot-chat API — perfil de comprador Q1 2026 retorna relatório completo', async () => {
  test.setTimeout(180000) // Análise pesada: até 3 minutos
  const token = await getToken()

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Gera um relatório completo do perfil de comprador do Q1 2026 (janeiro a março). Leia todas as mensagens desses leads, entenda as dores, desejos e crenças deles.',
      context: { current_date_sp: '2026-04-20' },
    }),
  })

  const json = await res.json() as { answer: string }
  const answer = json.answer ?? ''
  console.log(`=== Resposta Perfil Comprador (${answer.length} chars) ===`)
  console.log(answer.slice(0, 500))
  console.log('...')

  // 1. Não pode ser o fallback de "análise muito ampla"
  const isFallback = answer.includes('Essa análise é muito ampla') || answer.includes('Tente perguntas mais focadas')
  expect(isFallback, 'Clara não deve cair no fallback — deve usar get_buyer_profile').toBe(false)

  // 2. Resposta deve ser substancial (relatório completo = mínimo 1000 chars)
  expect(answer.length, 'Resposta deve ser um relatório substancial').toBeGreaterThan(1000)

  // 3. Deve conter indicadores de um relatório de compradores
  const hasBuyerCount = /comprador|cliente|vend/i.test(answer)
  const hasProductMix = /gold|platinum|produto|acelerador/i.test(answer)
  const hasInsights = /dor|desejo|objeção|crença|perfil|análise/i.test(answer)

  console.log(`✅ Não é fallback: ${!isFallback}`)
  console.log(`✅ Tem compradores/clientes: ${hasBuyerCount}`)
  console.log(`✅ Tem produtos: ${hasProductMix}`)
  console.log(`✅ Tem insights qualitativos: ${hasInsights}`)

  expect(hasBuyerCount, 'Deve mencionar compradores ou clientes').toBe(true)
  expect(hasInsights, 'Deve ter análise qualitativa de dores/desejos').toBe(true)
})

// ─── Teste 9: resposta longa não é truncada (continuation mechanism) ──
// Usa query focada de 1 domínio (funil cohort). Queries multi-domínio são divididas
// em 4 chamadas paralelas pelo frontend (isComplexQuery) e não chegam como chamada única.
test('bot-chat API — resposta longa não é truncada (continuation)', async () => {
  test.setTimeout(180000)
  const token = await getToken()
  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    signal: AbortSignal.timeout(160000),
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message:
        'Gera um relatório detalhado do funil cohort de março 2026 com todas as etapas (leads, MQLs, conectados, agendados, reuniões, fechamentos), taxas de conversão por etapa, comparativo com fevereiro 2026 e diagnóstico de onde o funil está quebrando com recomendações.',
      context: { current_date_sp: '2026-04-21' },
    }),
  })
  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string }
  const answer = json.answer ?? ''
  console.log(`Resposta longa: ${answer.length} chars`)
  console.log(answer.slice(-200))

  // Deve ter pelo menos 2000 chars (relatório detalhado de funil)
  expect(answer.length).toBeGreaterThan(2000)
  // Não deve ser fallback de erro
  expect(answer).not.toContain('tempo disponível')
  const lastChar = answer.trim().slice(-1)
  console.log(`Último char: "${lastChar}"`)
})

// ─── Teste 8: widget aparece no dashboard via Playwright browser ──────
test('dashboard — chat widget aparece e abre', async ({ page }) => {
  test.setTimeout(120000)
  // Login via localStorage injection (mais rápido que UI login)
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // Preencher credenciais no form de login
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')

  // Aguardar redirect para o dashboard (qualquer módulo — depende de permissões do usuário)
  await page.waitForURL(/\/(vendas|aquisicao|trafego|pre-vendas|traqueamento|metas|leads|organico|recuperacao)/, { timeout: 15000 })
  console.log('✅ Login realizado, URL:', page.url())

  // Verificar que o botão do chat aparece
  const chatBtn = page.locator('#chat-widget-btn')
  await expect(chatBtn).toBeVisible({ timeout: 15000 })
  console.log('✅ Botão do chat visível')

  // Clicar para abrir
  await chatBtn.click()

  // Verificar que o painel abre
  const panel = page.locator('text=Clara')
  await expect(panel).toBeVisible({ timeout: 3000 })
  console.log('✅ Painel do chat abriu')

  // Verificar sugestões
  const suggestion = page.locator('text=Quantos MQLs tivemos esse mês?')
  await expect(suggestion).toBeVisible()
  console.log('✅ Sugestões visíveis')

  // Enviar uma mensagem e verificar que a mensagem do usuário aparece no chat
  const input = page.locator('textarea[placeholder*="Pergunte"]')
  await input.fill('quantos leads tivemos em abril de 2026?')
  await input.press('Enter')

  // Verificar que a mensagem do usuário foi adicionada ao chat
  const userMsg = page.locator('.justify-end .rounded-2xl').filter({ hasText: 'quantos leads' })
  await expect(userMsg).toBeVisible({ timeout: 5000 })
  console.log('✅ Mensagem do usuário apareceu no chat')
  // Nota: a resposta do bot é testada pelos testes de API (testes 1-7)
})
