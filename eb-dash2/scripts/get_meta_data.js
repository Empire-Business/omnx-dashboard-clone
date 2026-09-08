import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
  'https://qzesffnkqgelmtfblzkr.supabase.co',
  'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
)

// Query: min/max date + total records
const { data: stats, error } = await supabase
  .from('meta_ads_insights')
  .select('date', { count: 'exact' })
  .order('date', { ascending: true })

if (error) {
  console.error('❌ Erro:', error.message)
  process.exit(1)
}

if (!stats || stats.length === 0) {
  console.log('⚠️  Nenhum dado encontrado em meta_ads_insights')
  process.exit(0)
}

const firstDate = stats[0]?.date
const lastDate = stats[stats.length - 1]?.date
const totalCount = stats.length

console.log(`📊 Dados de Tráfego Pago (Meta Ads):`)
console.log(`✅ Primeira data: ${firstDate}`)
console.log(`✅ Última data: ${lastDate}`)
console.log(`✅ Total de dias com dados: ${totalCount}`)
console.log(`✅ Período coberto: ${firstDate} até ${lastDate}`)
