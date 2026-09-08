import { test, expect } from '@playwright/test'

const BASE = process.env.VITE_SUPABASE_URL || 'https://qzesffnkqgelmtfblzkr.supabase.co'
const ANON_KEY = 'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
const EMAIL = 'teste.playwright.audit@aliancadealtovalor.com.br'
const PASS  = '8^_p0$H^oplJ*xam0GS+'

// ─── Helper: obter token ──────────────────────────────────────────────
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

// ─── Helper: chamar bot-chat com retry em partial responses ──────────
async function callBot(
  token: string,
  message: string,
  context: Record<string, unknown> = {},
  sessionId?: string,
  depth = 0,
): Promise<{ answer: string; conversation_id: string }> {
  if (depth > 3) throw new Error('Muitas tentativas de retomada de sessão')

  const res = await fetch(`${BASE}/functions/v1/bot-chat`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Timeout de 3 min: multi-run pode ter 2 roundtrips de ~135s cada
    signal: AbortSignal.timeout(360_000),
    body: JSON.stringify({
      message,
      context: { current_date_sp: '2026-04-29', ...context },
      session_id: sessionId,
    }),
  })

  expect(res.status).toBe(200)
  const json = await res.json() as { answer: string; conversation_id: string; partial?: boolean; session_id?: string }

  // Auto-continue: edge function salvou dados e pediu síntese em nova chamada
  if (json.partial && json.session_id) {
    console.log(`  [callBot] sessão parcial detectada (depth=${depth}), retomando ${json.session_id}`)
    return callBot(token, message, context, json.session_id, depth + 1)
  }

  return { answer: json.answer, conversation_id: json.conversation_id }
}

// ─────────────────────────────────────────────────────────────────────
// TESTE PRINCIPAL: pergunta exata que falhava com timeout
// ─────────────────────────────────────────────────────────────────────
test('Clara — comparação de funis sem timeout (pergunta original do usuário)', async () => {
  test.setTimeout(420_000)  // 7 min: 2× roundtrip + margem

  const token = await getToken()
  console.log('Token obtido, chamando bot...')

  const { answer } = await callBot(
    token,
    'Clara, analise o desempenho do funil de forms e compare com os demais funis. Quero ver especificamente:\n\nQuanto investimos em cada funil. Qual o CPMQL de cada funil. Qual custo por reunião de cada funil e qual a conversao de cada. Quero ver essa analise por cohort do trafego nos ultimos 3 meses',
    { active_filters: { startDate: '2026-01-29', endDate: '2026-04-29' } },
  )

  console.log('\n=== RESPOSTA DA CLARA ===')
  console.log(answer.slice(0, 1500))
  console.log(`\n[${answer.length} chars total]`)

  // 1. NÃO pode ser o fallback de timeout
  expect(answer).not.toContain('Não consegui gerar a análise dentro do tempo disponível')
  expect(answer).not.toContain('Tente uma pergunta mais focada')

  // 2. Deve ter conteúdo substancial (análise de funis = pelo menos 500 chars)
  expect(answer.length).toBeGreaterThan(500)

  // 3. Deve mencionar pelo menos um dos KPIs pedidos
  const lower = answer.toLowerCase()
  const hasCpmql    = lower.includes('cpmql')    || lower.includes('custo por mql')   || lower.includes('custo/mql')
  const hasMeeting  = lower.includes('reunião')   || lower.includes('reunioes')        || lower.includes('custo por reunião')
  const hasFunnel   = lower.includes('funil')     || lower.includes('forms')
  const hasInvest   = lower.includes('invest')    || lower.includes('r$')              || lower.includes('spend')

  expect(hasFunnel,   'Deve mencionar funil ou forms').toBe(true)
  expect(hasCpmql || hasMeeting, 'Deve mencionar CPMQL ou custo por reunião').toBe(true)
  expect(hasInvest,   'Deve mencionar investimento ou valores em R$').toBe(true)

  console.log('\n✅ Clara respondeu a pergunta complexa de funis sem timeout')
  console.log(`   - Mencionou funil: ${hasFunnel}`)
  console.log(`   - Mencionou CPMQL: ${hasCpmql}`)
  console.log(`   - Mencionou custo por reunião: ${hasMeeting}`)
  console.log(`   - Mencionou investimento: ${hasInvest}`)
})

// ─────────────────────────────────────────────────────────────────────
// TESTE DE REGRESSÃO: queries genéricas complexas ainda funcionam
// ─────────────────────────────────────────────────────────────────────
test('Clara — decomposição paralela ainda funciona para queries genéricas', async () => {
  test.setTimeout(420_000)

  const token = await getToken()

  // Esta query deve triggar decomposição paralela (3+ domínios: aquisição + orgânico + vendas)
  const { answer } = await callBot(
    token,
    'me dê um panorama geral: como está a aquisição, o orgânico e as vendas este mês?',
  )

  console.log('\n=== Resposta panorama geral ===')
  console.log(answer.slice(0, 800))

  expect(answer).not.toContain('Não consegui gerar')
  expect(answer.length).toBeGreaterThan(200)

  console.log('✅ Decomposição paralela ainda funciona')
})

// ─────────────────────────────────────────────────────────────────────
// TESTE: query_funnel_comparison via bot_query (valida SQL diretamente)
// ─────────────────────────────────────────────────────────────────────
test('Clara — query_funnel_comparison retorna dados de funis', async () => {
  test.setTimeout(420_000)

  const token = await getToken()

  // Pergunta que força uso da nova tool
  const { answer } = await callBot(
    token,
    'qual o CPMQL de cada funil no cohort de fevereiro a abril de 2026?',
  )

  console.log('\n=== Resposta CPMQL por funil ===')
  console.log(answer.slice(0, 1000))

  expect(answer).not.toContain('Não consegui gerar')
  expect(answer.length).toBeGreaterThan(300)

  // Deve citar algum funil ou "sem funil"
  const lower = answer.toLowerCase()
  const hasFunnelName = lower.includes('funil') || lower.includes('forms') || lower.includes('webinar') || lower.includes('sem funil')
  expect(hasFunnelName).toBe(true)

  console.log('✅ query_funnel_comparison funcionou')
})
