/**
 * Diagnóstico: lê um contato direto do GHL e inspeciona os blocos de attribution.
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/diagnostico-ghl-attribution.mjs <ghl_id>
 * Nunca imprime a chave — apenas os dados do contato.
 */
const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const SUPABASE_URL = `https://${REF}.supabase.co`
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const WORKSPACE_ID = process.env.GHL_WORKSPACE_ID || '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
const ghlId = process.argv[2]
if (!SRK || !ghlId) { console.error('uso: SUPABASE_SERVICE_ROLE_KEY=... node scripts/diagnostico-ghl-attribution.mjs <ghl_id>'); process.exit(1) }

const H = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' }
async function rpc(name, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(params) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${name}: ${JSON.stringify(data)}`)
  return data
}

const meta = await rpc('get_workspace_credential_meta', { p_workspace_id: WORKSPACE_ID, p_provider: 'ghl' })
const metaRow = Array.isArray(meta) ? meta[0] : meta
const apiKey = await rpc('get_decrypted_secret', { p_secret_key_id: metaRow.secret_key_id })

const res = await fetch(`https://services.leadconnectorhq.com/contacts/${ghlId}`, {
  headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' },
})
const body = await res.json().catch(() => null)
if (!res.ok) { console.log('GHL erro', res.status, JSON.stringify(body).slice(0, 300)); process.exit(1) }

const c = body.contact || body
console.log('nome:', c.firstName, c.lastName, '| source:', c.source)
console.log('attributionSource:', JSON.stringify(c.attributionSource, null, 1))
console.log('lastAttributionSource:', JSON.stringify(c.lastAttributionSource, null, 1))
const cf = c.customFields || c.customField || []
console.log('customFields:', JSON.stringify(cf, null, 1).slice(0, 2000))
