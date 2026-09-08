import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function invokeFunction(name, body, token, method = 'POST', timeoutMs = 20000) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
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
  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .limit(1)

  const workspaceId = workspaces?.[0]?.workspace_id
  console.log('✅ Workspace:', workspaceId)

  // 1. notion-creatives-sync with correct request_source
  console.log('\n1️⃣ notion-creatives-sync (request_source: manual)')
  const r1 = await invokeFunction('notion-creatives-sync', {
    database_type: 'paid',
    request_source: 'manual',
  }, token, 'POST', 60000)
  console.log('   Status:', r1.status)
  console.log('   Response:', JSON.stringify(r1.data ?? r1.error ?? null, null, 2).slice(0, 300))

  // 2. generate-creative-code
  console.log('\n2️⃣ generate-creative-code')
  const r2 = await invokeFunction('generate-creative-code', {
    workspaceId,
    prefix: 'AN',
  }, token, 'POST', 15000)
  console.log('   Status:', r2.status)
  console.log('   Response:', JSON.stringify(r2.data ?? r2.error ?? null, null, 2).slice(0, 300))

  // 3. sync-ghl-users
  console.log('\n3️⃣ sync-ghl-users')
  const r3 = await invokeFunction('sync-ghl-users', { workspace_id: workspaceId }, token, 'POST', 30000)
  console.log('   Status:', r3.status)
  console.log('   Response:', JSON.stringify(r3.data ?? r3.error ?? null, null, 2).slice(0, 300))

  // 4. send-weekly-report-email with first schedule
  console.log('\n🔍 Buscando schedule_id real...')
  const { data: schedules } = await supabase
    .from('weekly_email_schedules')
    .select('id, name')
    .limit(1)

  if (schedules?.length) {
    console.log('   Schedule encontrado:', schedules[0].id, schedules[0].name)
    console.log('\n4️⃣ send-weekly-report-email')
    const r4 = await invokeFunction('send-weekly-report-email', {
      schedule_id: schedules[0].id,
    }, token, 'POST', 30000)
    console.log('   Status:', r4.status)
    console.log('   Response:', JSON.stringify(r4.data ?? r4.error ?? null, null, 2).slice(0, 300))
  } else {
    console.log('   Nenhum schedule encontrado — pulando teste')
  }
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
