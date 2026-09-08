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

  console.log('✅ Logged in as', authData.user?.email)

  const url = `${SUPABASE_URL}/functions/v1/admin-cron-health`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authData.session.access_token}`,
    },
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  console.log('\n📊 Cron Health Status:', res.status)
  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
