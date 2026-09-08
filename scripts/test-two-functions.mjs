import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function invokeFunction(name, body, token, timeoutMs = 20000) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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
  const { data: authData } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const token = authData.session.access_token
  const workspaceId = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'

  console.log('1️⃣ generate-creative-code')
  const r1 = await invokeFunction('generate-creative-code', { workspaceId, prefix: 'AN' }, token, 15000)
  console.log('   Status:', r1.status)
  console.log('   Response:', JSON.stringify(r1.data ?? r1.error ?? null, null, 2))

  console.log('\n2️⃣ sync-ghl-users')
  const r2 = await invokeFunction('sync-ghl-users', { workspace_id: workspaceId }, token, 30000)
  console.log('   Status:', r2.status)
  console.log('   Response:', JSON.stringify(r2.data ?? r2.error ?? null, null, 2).slice(0, 500))
}

main().catch(console.error)
