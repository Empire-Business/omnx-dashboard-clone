/**
 * Diagnóstico READ-ONLY (rodada 2): compara o webhook_secret gravado em
 * ghl_integration_settings com o digest do secret global WEBHOOK_SECRET
 * (edge functions) — SEM imprimir nenhum valor de segredo.
 */
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const sb = createClient(`https://${REF}.supabase.co`, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Digest mostrado por `supabase secrets list` para WEBHOOK_SECRET (SHA-256 do valor)
const DIGEST_WEBHOOK_SECRET_GLOBAL = '25e88108674b3e9c5b34f191c05f5a8ae4fa8418f3bbc765b1912e082031de44'

async function main() {
  const { data, error } = await sb
    .from('ghl_integration_settings')
    .select('workspace_id, ghl_location_id, is_active, webhook_secret, updated_at')

  if (error) {
    console.error('erro:', error.message)
    process.exit(1)
  }

  console.log('Comparação de segredos (apenas hashes SHA-256 são impressos):\n')
  console.log(`Digest do WEBHOOK_SECRET global (edge env): ${DIGEST_WEBHOOK_SECRET_GLOBAL}\n`)

  for (const row of data || []) {
    const s = row.webhook_secret
    if (!s) {
      console.log(`workspace ${row.workspace_id} (${row.ghl_location_id}): webhook_secret = NULL`)
      continue
    }
    const sha = crypto.createHash('sha256').update(s, 'utf8').digest('hex')
    const shaTrim = crypto.createHash('sha256').update(s.trim(), 'utf8').digest('hex')
    console.log(`workspace ${row.workspace_id} (${row.ghl_location_id}) ativo=${row.is_active} atualizado=${row.updated_at}`)
    console.log(`  length: ${s.length}`)
    console.log(`  sha256: ${sha}`)
    console.log(`  == global? ${sha === DIGEST_WEBHOOK_SECRET_GLOBAL ? 'SIM ✅' : shaTrim === DIGEST_WEBHOOK_SECRET_GLOBAL ? 'SIM, mas com espaços nas pontas ⚠️' : 'NÃO ❌'}`)
    console.log('')
  }
}

main().catch((e) => {
  console.error('Falha:', e.message)
  process.exit(1)
})

// Rodada 3: metadados das credenciais por workspace (NUNCA o segredo em si)
async function round3() {
  const { data, error } = await sb
    .from('workspace_integration_credentials')
    .select('workspace_id, provider, is_active, rotation_version, created_at, updated_at')
    .order('created_at', { ascending: true })
  console.log('\n== WORKSPACE_INTEGRATION_CREDENTIALS (metadados, sem segredo) ==')
  if (error) console.log('erro:', error.message)
  else if (!data?.length) console.log(' NENHUMA credencial cadastrada em nenhum workspace ⚠️')
  else for (const r of data)
    console.log(` workspace ${r.workspace_id} | ${r.provider} | ativo=${r.is_active} | rot_v=${r.rotation_version} | criado=${r.created_at} | atualizado=${r.updated_at}`)
}
round3().catch((e) => console.error('round3 falhou:', e.message))
