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

async function invokeFunction(name, body, token, method = 'POST') {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  return { status: res.status, data }
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

  // Test 1: bot-chat-synthesis with empty payload should return 400
  console.log('\n1️⃣ bot-chat-synthesis with empty payload')
  const synthEmpty = await invokeFunction('bot-chat-synthesis', {}, token)
  console.log('   Status:', synthEmpty.status)
  console.log('   Response:', JSON.stringify(synthEmpty.data, null, 2))

  // Test 2: bot-chat-synthesis with valid payload
  console.log('\n2️⃣ bot-chat-synthesis with valid payload')
  const synthValid = await invokeFunction('bot-chat-synthesis', {
    system_prompt: 'Você é um assistente conciso. Responda em uma frase.',
    messages: [{ role: 'user', content: 'Olá, tudo bem?' }],
    max_tokens: 100,
  }, token)
  console.log('   Status:', synthValid.status)
  if (synthValid.status === 200) {
    console.log('   ✅ Resposta gerada:', synthValid.data?.content?.slice(0, 100))
  } else {
    console.log('   Response:', JSON.stringify(synthValid.data, null, 2))
  }

  // Test 3: recuperacao-prefetch
  console.log('\n3️⃣ recuperacao-prefetch')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  const prefetch = await invokeFunction('recuperacao-prefetch', {}, token)
  clearTimeout(timeout)
  console.log('   Status:', prefetch.status)
  if (prefetch.status === 200) {
    console.log('   ✅ Pipelines encontrados:', Object.keys(prefetch.data?.pipelines || {}).length)
    console.log('   Leads em recuperação:', prefetch.data?.estatisticas?.problematicos || 0)
  } else {
    console.log('   Response:', JSON.stringify(prefetch.data, null, 2))
  }
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
