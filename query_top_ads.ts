import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    env[match[1].trim()] = match[2].trim()
  }
})

const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL'] || '',
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || ''
)

async function run() {
  const { data, error } = await supabase
    .from('contatos')
    .select('utm_term')
    .not('utm_term', 'is', null)
    .gte('created_at', '2026-02-01T00:00:00-03:00')
    .lte('created_at', '2026-02-28T23:59:59-03:00')
    .limit(10000)

  if (error) {
    console.error('Erro:', error.message)
    process.exit(1)
  }

  const adCounts: Record<string, number> = {}
  ;(data || []).forEach(row => {
    if (row.utm_term) {
      adCounts[row.utm_term] = (adCounts[row.utm_term] || 0) + 1
    }
  })

  const sorted = Object.entries(adCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  console.log('\n🎯 Anúncios com mais leads em Fevereiro/2026:\n')
  sorted.forEach(([ad, count], i) => {
    console.log(`${String(i + 1).padStart(2)} · ${ad.padEnd(40)} → ${count} leads`)
  })
  console.log(`\n📊 Total de anúncios distintos: ${Object.keys(adCounts).length}`)
}

run()
