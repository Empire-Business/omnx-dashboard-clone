/**
 * Diagnóstico da credencial OpenRouter usada pela Clara (somente leitura).
 *
 * Uso:
 *   node scripts/diagnostico-openrouter-clara.mjs
 *
 * Lê SUPABASE_URL (ou usa PROJECT_REF), SUPABASE_SERVICE_ROLE_KEY e
 * OPENROUTER_WORKSPACE_ID do ambiente (ver .env.local). NUNCA imprime a chave —
 * apenas checks booleanos, HTTP status e corpos de erro da OpenRouter.
 */

const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const SUPABASE_URL = (process.env.SUPABASE_URL || `https://${REF}.supabase.co`).replace(/\/$/, '')
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const WORKSPACE_ID = process.env.OPENROUTER_WORKSPACE_ID || '7909d02a-4d15-46ea-a7b8-5debeb6e8351'

if (!SRK) {
  console.error('SUPABASE_SERVICE_ROLE_KEY ausente no ambiente')
  process.exit(1)
}

async function rpc(name, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function openrouter(path, { method = 'GET', body, apiKey } = {}) {
  const res = await fetch(`https://openrouter.ai/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text.slice(0, 500) }
  return { status: res.status, data }
}

// 1. Resolve a credencial pelo mesmo caminho das edge functions
const meta = await rpc('get_workspace_credential_meta', {
  p_workspace_id: WORKSPACE_ID,
  p_provider: 'openrouter',
})
if (meta.status !== 200 || !meta.data) {
  console.log('FALHA meta:', meta.status, JSON.stringify(meta.data))
  process.exit(1)
}
const metaRow = Array.isArray(meta.data) ? meta.data[0] : meta.data
console.log('credencial meta: rotation_version =', metaRow.rotation_version)

const sec = await rpc('get_decrypted_secret', { p_secret_key_id: metaRow.secret_key_id })
if (sec.status !== 200 || typeof sec.data !== 'string' || !sec.data) {
  console.log('FALHA decrypt:', sec.status, JSON.stringify(sec.data))
  process.exit(1)
}
const apiKey = sec.data

// Sanity da chave — somente booleanos/comprimento, nunca o valor
console.log('chave: prefixo_sk-or-v1 =', apiKey.startsWith('sk-or-v1-'),
  '| len =', apiKey.length,
  '| tem_espaco_ou_quebra =', /\s/.test(apiKey))

// 2. A chave é válida perante a OpenRouter?
const keyCheck = await openrouter('/auth/key', { apiKey })
console.log('\n[1] GET /auth/key →', keyCheck.status)
console.log(JSON.stringify(keyCheck.data).slice(0, 400))

// 3. Chat completion mínimo com o modelo configurado na Clara
const settings = await fetch(
  `${SUPABASE_URL}/rest/v1/clara_workspace_settings?select=model_id&workspace_id=eq.${WORKSPACE_ID}`,
  { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } }
).then((r) => r.json())
const modelId = settings?.[0]?.model_id || '(sem settings)'
console.log('\nmodelo configurado na Clara:', modelId)

const chat = await openrouter('/chat/completions', {
  method: 'POST',
  apiKey,
  body: {
    model: modelId,
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Responda apenas: ok' }],
  },
})
console.log('[2] chat/completions (' + modelId + ') →', chat.status)
console.log(JSON.stringify(chat.data).slice(0, 600))

// 4. Se falhou, isolar: mesmo request com o modelo padrão da política
if (chat.status !== 200) {
  const fallback = await openrouter('/chat/completions', {
    method: 'POST',
    apiKey,
    body: {
      model: 'qwen/qwen3.6-plus',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
    },
  })
  console.log('[3] chat/completions (qwen/qwen3.6-plus) →', fallback.status)
  console.log(JSON.stringify(fallback.data).slice(0, 600))
}
