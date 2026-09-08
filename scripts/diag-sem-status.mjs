// Diagnóstico: por que existem agendamentos "sem status"?
//
// "Sem status" = data_agendamento_reuniao preenchida, no passado (<= hoje),
// sem data_realizacao_vendas e sem data_no_show.
//
// Para cada opp sem status, chama a edge function sync-appointment-dates
// com include_debug=true e imprime os appointments REAIS do GHL (rawAppointments),
// incluindo cancelados/deletados, para entender o status verdadeiro.
//
// NÃO imprime secrets. Idempotente: a edge function re-sincroniza a opp com
// os mesmos dados do GHL (preserva valores já preenchidos).

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SB_SERVICE_ROLE_KEY
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nos .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L'

async function main() {
  // 1) Opps "sem status": agendadas, no passado, sem realizacao e sem no-show
  const { data: rows, error } = await supabase
    .from('oportunidades')
    .select('id, ghl_opportunity_id, pipeline_name, data_agendamento_reuniao, data_reuniao_agendada, data_realizacao_vendas, data_no_show, agendamento_origem, contatos!inner(ghl_id)')
    .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
    .not('data_agendamento_reuniao', 'is', null)
    .lte('data_agendamento_reuniao', today)
    .is('data_realizacao_vendas', null)
    .is('data_no_show', null)
    .order('data_agendamento_reuniao', { ascending: false })
    .limit(25)

  if (error) {
    console.error('Erro na query:', error.message)
    process.exit(1)
  }

  console.log(`Encontradas ${rows.length} opps "sem status" (agendadas, passado, sem realizacao/no-show). Hoje=${today}`)
  if (rows.length === 0) return

  // 2) Para cada uma, buscar appointments reais no GHL via edge function (debug)
  const statusCount = new Map()
  const samples = []

  for (const opp of rows.slice(0, 15)) {
    const contactGhl = opp.contatos?.ghl_id
    let raw = []
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-appointment-dates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ include_debug: true, opp_id: opp.id }),
      })
      const json = await res.json()
      raw = json?.debug?.[0]?.appointments_seen ?? []
    } catch (e) {
      console.log(`  opp=${opp.id} erro ao chamar edge: ${e.message}`)
    }

    const statuses = raw.flatMap((a) => (Array.isArray(a.statuses) ? a.statuses : []))
    const flags = raw.map((a) => `${a.canceled ? 'CANCEL' : ''}${a.deleted ? 'DEL' : ''}`).filter(Boolean)
    for (const s of statuses) statusCount.set(s, (statusCount.get(s) || 0) + 1)

    samples.push({
      opp: opp.id.slice(0, 8),
      pipeline: opp.pipeline_name,
      data: opp.data_agendamento_reuniao,
      origem: opp.agendamento_origem,
      ghl_statuses: [...new Set(statuses)],
      flags: [...new Set(flags)],
      n_appointments: raw.length,
    })
  }

  console.log('\n=== Distribuição de appointment_status no GHL (amostra) ===')
  for (const [s, c] of [...statusCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s || '(vazio)'}: ${c}`)
  }

  console.log('\n=== Amostra por opp ===')
  for (const s of samples) {
    console.log(
      `  ${s.opp} | ${s.pipeline} | ${s.data} | origem=${s.origem ?? '-'} | appts=${s.n_appointments} | status=[${s.ghl_statuses.join(',')}] | flags=[${s.flags.join(',')}]`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
