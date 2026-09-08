/**
 * Diagnóstico READ-ONLY: leads novos não contabilizados na conta default.
 *
 * O que este script faz:
 *  1. Lista workspaces e ghl_integration_settings (quem é a conta default?)
 *  2. Conta webhooks recebidos nos últimos 7 dias (leads estão chegando?)
 *  3. Conta contatos/oportunidades criados nos últimos 7 dias, por workspace
 *     (estão sendo gravados? em qual workspace?)
 *  4. Verifica se webhook_unresolved existe em produção (dead-letter da Fase 2)
 *
 * NUNCA altera dado — só SELECT. Credenciais lidas de .env.local pelo próprio
 * script (valores nunca são impressos).
 */
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Carrega .env.local sem imprimir valores
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const URL = `https://${REF}.supabase.co`
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY não encontrada em .env.local')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const since7d = new Date(Date.now() - 7 * 86400e3).toISOString()
const since30d = new Date(Date.now() - 30 * 86400e3).toISOString()

async function main() {
  console.log(`🔍 Diagnóstico read-only em produção (${REF}) — ${new Date().toISOString()}\n`)

  // 1. Workspaces
  const { data: ws, error: wsErr } = await sb.from('workspaces').select('*')
  console.log('== WORKSPACES ==')
  if (wsErr) console.log('erro:', wsErr.message)
  else
    for (const w of ws || [])
      console.log(` ${w.id} | ${w.name} | criado: ${w.created_at} | status: ${w.status ?? '-'} | suspended_at: ${w.suspended_at ?? '-'}`)

  // 2. Integrações GHL por workspace
  const { data: ghl, error: ghlErr } = await sb.from('ghl_integration_settings').select('*')
  console.log('\n== GHL_INTEGRATION_SETTINGS ==')
  if (ghlErr) console.log('erro:', ghlErr.message)
  else
    for (const g of ghl || [])
      console.log(
        ` workspace: ${g.workspace_id} | location: ${g.ghl_location_id ?? '-'} | ativo: ${g.active ?? g.is_active ?? '-'} | atualizado: ${g.updated_at ?? g.created_at}`
      )

  // 3. Webhooks recebidos (7d e 30d)
  console.log('\n== WEBHOOKS_GHL (chegada de eventos) ==')
  for (const [label, since] of [['últimos 7 dias', since7d], ['últimos 30 dias', since30d]]) {
    const { count, error } = await sb
      .from('webhooks_ghl')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since)
    console.log(` ${label}: ${error ? 'erro: ' + error.message : count} eventos`)
  }
  const { data: lastHook } = await sb
    .from('webhooks_ghl')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  console.log(` webhook mais recente: ${lastHook?.[0]?.created_at ?? 'nenhum'}`)

  // 4. Contatos criados recentemente (date_created = criação no GHL)
  console.log('\n== CONTATOS (date_created) ==')
  const { count: c7, error: cErr } = await sb
    .from('contatos')
    .select('*', { count: 'exact', head: true })
    .gte('date_created', since7d)
  const { data: ultContato } = await sb
    .from('contatos')
    .select('date_created, workspace_id')
    .order('date_created', { ascending: false })
    .limit(1)
  if (cErr) console.log('erro:', cErr.message)
  else {
    console.log(` com date_created nos últimos 7 dias: ${c7}`)
    console.log(` date_created mais recente: ${ultContato?.[0]?.date_created ?? 'nenhum'} (workspace ${ultContato?.[0]?.workspace_id})`)
  }

  // 5. Oportunidades por data_lead_recebido
  console.log('\n== OPORTUNIDADES (data_lead_recebido) ==')
  const { data: opps7, error: oErr } = await sb
    .from('oportunidades')
    .select('id, data_lead_recebido, workspace_id, pipeline_id')
    .gte('data_lead_recebido', since7d)
    .order('data_lead_recebido', { ascending: false })
    .limit(5000)
  if (oErr) console.log('erro:', oErr.message)
  else {
    const porWs = {}
    for (const o of opps7 || []) porWs[o.workspace_id ?? 'NULL'] = (porWs[o.workspace_id ?? 'NULL'] || 0) + 1
    console.log(` com data_lead_recebido nos últimos 7 dias: ${opps7?.length ?? 0}`)
    for (const [k, v] of Object.entries(porWs)) console.log(`  workspace ${k}: ${v}`)
    console.log(` data_lead_recebido mais recente: ${opps7?.[0]?.data_lead_recebido ?? 'nenhuma'}`)
  }

  // 6. Dead-letter: existe? o que está caindo lá?
  console.log('\n== WEBHOOK_UNRESOLVED (dead-letter da Fase 2) ==')
  const { data: dl, error: dlErr } = await sb
    .from('webhook_unresolved')
    .select('id, created_at, source, location_id, reason, reprocess_attempts')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (dlErr) console.log(` tabela NÃO existe em produção (${dlErr.code ?? dlErr.message})`)
  else {
    console.log(` total lido: ${dl?.length ?? 0} registros`)
    const porReason = {}
    const porLoc = {}
    for (const r of dl || []) {
      porReason[r.reason ?? '?'] = (porReason[r.reason ?? '?'] || 0) + 1
      porLoc[r.location_id ?? 'NULL'] = (porLoc[r.location_id ?? 'NULL'] || 0) + 1
    }
    console.log(' por reason:', JSON.stringify(porReason))
    console.log(' por location_id:', JSON.stringify(porLoc))
    console.log(` mais antigo: ${dl?.[dl.length - 1]?.created_at ?? '-'} | mais recente: ${dl?.[0]?.created_at ?? '-'}`)
    // amostra das 3 mais recentes
    for (const r of (dl || []).slice(0, 3))
      console.log(`  amostra: ${r.created_at} | ${r.reason} | loc=${r.location_id} | source=${r.source} | reprocess=${r.reprocess_attempts}`)
  }

  // 7. Webhooks por hora nas últimas 48h (quando parou?)
  console.log('\n== WEBHOOKS_GHL por dia (últimos 7 dias) ==')
  const { data: hooks7 } = await sb
    .from('webhooks_ghl')
    .select('created_at')
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(10000)
  const porDia = {}
  for (const h of hooks7 || []) {
    const dia = h.created_at.slice(0, 13) + ':00Z'
    porDia[dia] = (porDia[dia] || 0) + 1
  }
  for (const [dia, n] of Object.entries(porDia).sort()) console.log(` ${dia}  ${n}`)

  console.log('\n✅ Fim do diagnóstico (nenhuma escrita foi feita).')
}

main().catch((e) => {
  console.error('Falha:', e.message)
  process.exit(1)
})
