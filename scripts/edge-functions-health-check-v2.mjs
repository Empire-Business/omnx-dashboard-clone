import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

// Secrets opcionais para testar funções protegidas por secret compartilhado.
// Nunca commite valores reais aqui — passe via env vars no ambiente de teste.
const OMNX_DESK_BRIDGE_SECRET =
  process.env.OMNX_DESK_BRIDGE_SECRET || process.env.EMPIREDESK_BRIDGE_SECRET || ''
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars')
  process.exit(1)
}

const PAYLOADS = {
  'discover-ghl-config': (ctx) => ({ workspace_id: ctx.workspaceId }),
  'setup-ghl-integration': (ctx) => ({ workspace_id: ctx.workspaceId, ghl_location_id: ctx.locationId || 'test-location-id' }),
  'workspace-apps': (ctx) => ({ workspace_id: ctx.workspaceId }),
  'invite-user': (ctx) => ({ workspace_id: ctx.workspaceId, email: 'test.invite@example.com', role: 'member' }),
  'bot-chat': (ctx) => ({ workspace_id: ctx.workspaceId, message: 'Olá', session_id: 'test-session' }),
  'bot-chat-data': (ctx) => ({ workspace_id: ctx.workspaceId, message: 'Olá', tools: [{ type: 'function', function: { name: 'noop', description: 'noop' } }] }),
  'bot-chat-synthesis': () => ({ system_prompt: 'Responda em uma palavra.', messages: [{ role: 'user', content: 'Oi' }], max_tokens: 10 }),
  'compute-weekly-reports': (ctx) => ({ workspace_id: ctx.workspaceId }),
  'generate-creative-code': (ctx) => ({ workspaceId: ctx.workspaceId, prefix: 'AN' }),
  'notion-creatives-sync': (ctx) => ({ database_type: 'paid', request_source: 'manual' }),
  'prevendas-ai': (ctx) => ({ workspace_id: ctx.workspaceId, leads: [] }),
  'send-weekly-report-email': (ctx) => ({ schedule_id: ctx.weeklyScheduleId || 'test-schedule' }),
  'crm-buscar-lead': (ctx) => ({ telefone: '+5511999999999' }),
  'crm-registrar-venda': (ctx) => ({
    oportunidade_id: ctx.oportunidadeId,
    pagamentos: [{ data: '2026-06-30', valor: 1000, forma: 'pix', sinal: 'entrada' }],
  }),
  'sync-ghl-conversations': (ctx) => ({ mode: 'backfill_by_contact', offset: 0, batch_size: 1 }),
  'sync-meta-ads-backfill': (ctx) => ({ data_inicio: '2026-06-28', data_fim: '2026-06-30', max_dias: 1, dry_run: true }),
  'sync-appointment-dates': (ctx) => ({ batch_size: 1, max_cycles: 1 }),
}

const FUNCTION_CONFIG = {
  'discover-ghl-config': { expectedStatus: [200, 400] },
  'setup-ghl-integration': { expectedStatus: [200] },
  'workspace-apps': { expectedStatus: [200, 400] },
  'invite-user': { expectedStatus: [200, 400, 403] },
  'bot-chat': { expectedStatus: [200, 400], timeout: 30000 },
  'bot-chat-data': { expectedStatus: [200, 400], timeout: 30000 },
  'bot-chat-synthesis': { expectedStatus: [200], timeout: 30000 },
  'recuperacao-prefetch': { expectedStatus: [200], timeout: 30000 },
  'diag-ghl': { expectedStatus: [200, 400] },
  'compute-weekly-reports': { expectedStatus: [200, 400] },
  'prevendas-ai': { expectedStatus: [200, 400], timeout: 30000 },
  'send-weekly-report-email': { expectedStatus: [200, 400] },
  'notion-creatives-sync': { expectedStatus: [200, 400], timeout: 60000 },
  'generate-creative-code': { expectedStatus: [200, 400] },
  'ghl-api-worker': { expectedStatus: [200], timeout: 60000 },
  'sync-ad-permalinks': { expectedStatus: [200], timeout: 60000 },
  'sync-appointment-dates': { expectedStatus: [200], timeout: 30000 },
  'sync-contact-tasks': { expectedStatus: [200], timeout: 60000 },
  'sync-ghl-conversations': { expectedStatus: [200], timeout: 30000 },
  'sync-meta-ads-backfill': { expectedStatus: [200], timeout: 60000 },
  'crm-buscar-lead': { expectedStatus: [200], needsSecret: 'OMNX_DESK_BRIDGE_SECRET' },
  'crm-registrar-venda': { expectedStatus: [200], needsSecret: 'OMNX_DESK_BRIDGE_SECRET' },
  'webhook-ghl': { expectedStatus: [200], needsSecret: 'WEBHOOK_SECRET' },
}

const DEFAULT_TIMEOUT = 10000

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function getExtraHeaders(name) {
  const headers = {}
  if ((name === 'crm-buscar-lead' || name === 'crm-registrar-venda') && OMNX_DESK_BRIDGE_SECRET) {
    headers['x-omnx-desk-secret'] = OMNX_DESK_BRIDGE_SECRET
  }
  if (name === 'webhook-ghl' && WEBHOOK_SECRET) {
    headers['x-webhook-secret'] = WEBHOOK_SECRET
  }
  return headers
}

async function callFunction(name, body, token, timeoutMs, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text.slice(0, 200)
    }

    return { status: res.status, data }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return { status: 'TIMEOUT', error: `No response within ${timeoutMs}ms` }
    }
    return { status: 'NETWORK_ERROR', error: err.message }
  }
}

function isHealthy(name, status, hasSecret) {
  const config = FUNCTION_CONFIG[name]
  if (!config) return status >= 200 && status < 300
  if (status === 'TIMEOUT') return false
  if (status === 'NETWORK_ERROR') return false
  if (config.needsSecret && !hasSecret && status === 401) return false
  return config.expectedStatus.includes(status)
}

async function main() {
  console.log('🔐 Logging in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })

  if (authError) {
    console.error('❌ Login failed:', authError.message)
    process.exit(1)
  }

  const token = authData.session.access_token
  console.log('✅ Logged in as', authData.user?.email)

  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .limit(1)

  const workspaceId = workspaces?.[0]?.workspace_id
  console.log('✅ Workspace:', workspaceId)

  const { data: ghlSettings } = await supabase
    .from('ghl_integration_settings')
    .select('ghl_location_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const locationId = ghlSettings?.ghl_location_id
  if (locationId) {
    console.log('✅ GHL Location ID:', locationId.slice(0, 6) + '...')
  }

  // Busca um schedule real para testar send-weekly-report-email
  const { data: schedules } = await supabase
    .from('weekly_email_schedules')
    .select('id')
    .limit(1)
  const weeklyScheduleId = schedules?.[0]?.id

  // Busca uma oportunidade real para crm-registrar-venda
  const { data: opps } = await supabase
    .from('oportunidades')
    .select('id')
    .limit(1)
  const oportunidadeId = opps?.[0]?.id

  // List functions from repo
  const fs = await import('fs')
  const path = await import('path')
  const functionsDir = '/Users/bguzela/Desenvolvimento/GHL-SUPABASE/supabase/functions'
  const functions = fs.readdirSync(functionsDir)
    .filter((name) => name !== '_shared' && fs.statSync(path.join(functionsDir, name)).isDirectory())
    .sort()

  const ctx = { workspaceId, userId: authData.user.id, locationId, weeklyScheduleId, oportunidadeId }
  const results = []

  console.log(`\n🚀 Testing ${functions.length} edge functions...\n`)

  for (const name of functions) {
    const config = FUNCTION_CONFIG[name]
    const needsSecret = config?.needsSecret
    const hasSecret = needsSecret
      ? (needsSecret === 'OMNX_DESK_BRIDGE_SECRET' && !!OMNX_DESK_BRIDGE_SECRET) ||
        (needsSecret === 'WEBHOOK_SECRET' && !!WEBHOOK_SECRET)
      : true

    // send-weekly-report-email precisa de dados reais
    if (name === 'send-weekly-report-email' && !weeklyScheduleId) {
      results.push({ name, status: 'SKIP', reason: 'nenhum schedule em weekly_email_schedules' })
      console.log(`⏭️  ${name} — SKIP (nenhum schedule em weekly_email_schedules)`)
      continue
    }

    // crm-registrar-venda precisa de uma oportunidade real
    if (name === 'crm-registrar-venda' && !oportunidadeId) {
      results.push({ name, status: 'SKIP', reason: 'nenhuma oportunidade disponível' })
      console.log(`⏭️  ${name} — SKIP (nenhuma oportunidade disponível)`)
      continue
    }

    const payloadFn = PAYLOADS[name]
    const body = payloadFn ? payloadFn(ctx) : {}
    const timeoutMs = config?.timeout || DEFAULT_TIMEOUT
    const extraHeaders = getExtraHeaders(name)

    const result = await callFunction(name, body, token, timeoutMs, extraHeaders)
    results.push({ name, ...result, hasSecret })

    const healthy = isHealthy(name, result.status, hasSecret)
    const icon = healthy ? '✅' : result.status === 'TIMEOUT' ? '⏱️' : needsSecret && !hasSecret && result.status === 401 ? '🔒' : '❌'
    console.log(`${icon} ${name} — ${result.status}`)
    if (!healthy && result.data?.error) {
      console.log(`   ${String(result.data.error).slice(0, 120)}`)
    }
    if (needsSecret && !hasSecret && result.status === 401) {
      console.log(`   ℹ️  Requer ${needsSecret} para testar autenticação completa`)
    }
  }

  const healthy = results.filter((r) => isHealthy(r.name, r.status, r.hasSecret))
  const skipped = results.filter((r) => r.status === 'SKIP')
  const unhealthy = results.filter((r) => r.status !== 'SKIP' && !isHealthy(r.name, r.status, r.hasSecret))

  console.log('\n📊 Summary:')
  console.log(`   ✅ Healthy: ${healthy.length}/${functions.length}`)
  console.log(`   ⏭️  Skipped: ${skipped.length}/${functions.length}`)
  console.log(`   ❌ Problems: ${unhealthy.length}/${functions.length}`)

  if (skipped.length > 0) {
    console.log('\n⏭️  Skipped functions:')
    for (const r of skipped) {
      console.log(`   - ${r.name}: ${r.reason}`)
    }
  }

  if (unhealthy.length > 0) {
    console.log('\n❌ Unhealthy functions:')
    for (const r of unhealthy) {
      console.log(`   - ${r.name}: ${r.status}`)
      if (r.data?.error) console.log(`     ${String(r.data.error).slice(0, 150)}`)
      if (r.error) console.log(`     ${r.error}`)
    }
  }
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
