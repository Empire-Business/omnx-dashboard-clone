// Backfill robusto de appointment_status via edge function sync-appointment-dates.
// - Timeout por chamada (AbortController) para não travar.
// - Retry em erro/timeout.
// - Batch pequeno para não estourar o tempo da edge function.
// NÃO imprime secrets.

import fs from 'node:fs'

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = { ...loadEnv('eb-dash2/.env.local'), ...loadEnv('.env.local') }
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Faltam SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const URL = `${SUPABASE_URL}/functions/v1/sync-appointment-dates`
const MAX_RODADAS = 40
const CALL_TIMEOUT_MS = 90_000
const BATCH = 40

async function callOnce() {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS)
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      body: JSON.stringify({ backfill: true, batch_size: BATCH, max_cycles: 1 }),
      signal: ctrl.signal,
    })
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function callWithRetry(rodada) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await callOnce()
      if (r && !r.error) return r
      console.log(`  rodada ${rodada} tentativa ${attempt}: erro da função: ${r?.error ?? 'desconhecido'}`)
    } catch (e) {
      console.log(`  rodada ${rodada} tentativa ${attempt}: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return null
}

async function main() {
  let totalProcessed = 0
  let totalUpdated = 0
  let emptyStreak = 0

  for (let i = 1; i <= MAX_RODADAS; i++) {
    const r = await callWithRetry(i)
    if (!r) {
      console.log(`rodada ${i}: falhou após retries — parando.`)
      break
    }
    totalProcessed += r.processed ?? 0
    totalUpdated += r.updated ?? 0
    console.log(
      `rodada ${i}: processed=${r.processed} updated=${r.updated} cleared=${r.cleared} ` +
        `no_appt=${r.no_appointment} not_found=${r.not_found} api_errors=${r.api_errors}`,
    )
    if ((r.processed ?? 0) === 0) {
      emptyStreak++
      if (emptyStreak >= 2) {
        console.log('Nada mais a processar (2 rodadas vazias).')
        break
      }
    } else {
      emptyStreak = 0
    }
  }
  console.log(`\nTOTAL: processed=${totalProcessed} updated=${totalUpdated}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
