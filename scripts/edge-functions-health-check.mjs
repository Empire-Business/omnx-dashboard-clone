import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars')
  process.exit(1)
}

const FUNCTIONS = [
  'setup-ghl-integration',
  'discover-ghl-config',
  'webhook-ghl',
  'compute-weekly-reports',
  'sync-appointment-dates',
  'workspace-apps',
  'invite-user',
  'sync-ghl-users',
  'sync-meta-ads',
  'generate-creative-code',
  'notion-creatives-sync',
  'webhook-compras',
  'bot-chat',
  'bot-chat-synthesis',
  'bot-chat-data',
  'sync-ghl-conversations',
  'send-weekly-report-email',
  'sync-meta-ads-backfill',
  'crm-registrar-venda',
  'crm-buscar-lead',
  'telegram-bot',
  'sync-opp-sdr',
  'sync-contact-tasks',
  'sync-contact-tags',
  'sync-contact-opportunities',
  'sync-contact-attribution',
  'reconcile-contact-opportunities',
  'prevendas-ai',
  'ghl-api-worker',
  'sync-ad-permalinks',
  'sync-opp-pipelines',
  'sync-opp-dates',
  'recuperacao-corrigir',
  'diag-ghl',
  'sync-recuperacao-stages',
  'recuperacao-prefetch',
]

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function callFunction(name, token) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
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

    return { status: res.status, error: data?.error || data?.message || text.slice(0, 100) }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return { status: 'TIMEOUT', error: 'Function did not respond within 15s' }
    }
    return { status: 'NETWORK_ERROR', error: err.message }
  }
}

function statusCategory(status) {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return 'expected'
  if (status >= 500 || status === 'NETWORK_ERROR') return 'fail'
  return 'warning'
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
  console.log(`\n🚀 Testing ${FUNCTIONS.length} edge functions...\n`)

  const results = []
  for (const name of FUNCTIONS) {
    const result = await callFunction(name, token)
    results.push({ name, ...result })
    const cat = statusCategory(result.status)
    const icon = cat === 'ok' ? '✅' : cat === 'expected' ? '⚠️' : '❌'
    console.log(`${icon} ${name} — ${result.status}`)
  }

  const ok = results.filter((r) => statusCategory(r.status) === 'ok')
  const expected = results.filter((r) => statusCategory(r.status) === 'expected')
  const fail = results.filter((r) => statusCategory(r.status) === 'fail')

  console.log('\n📊 Summary:')
  console.log(`   ✅ OK/Healthy: ${ok.length}`)
  console.log(`   ⚠️  Expected errors (auth/validation): ${expected.length}`)
  console.log(`   ❌ Potential problems (5xx/network): ${fail.length}`)

  if (fail.length > 0) {
    console.log('\n❌ Functions with potential problems:')
    for (const r of fail) {
      console.log(`   - ${r.name}: ${r.status} — ${r.error}`)
    }
  }

  console.log('\nℹ️  Expected errors (401/403/400/404) usually mean the function is alive but needs specific payload/permissions.')
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
