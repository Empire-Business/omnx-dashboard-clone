import { createClient } from '@supabase/supabase-js'

const ANON_KEY = process.env.SUPABASE_ANON_KEY
if (!ANON_KEY) {
  console.error('Configure a variável de ambiente SUPABASE_ANON_KEY antes de executar este script.')
  process.exit(1)
}

const supabase = createClient(
  'https://qzesffnkqgelmtfblzkr.supabase.co',
  ANON_KEY
)

const { data, error } = await supabase
  .from('meta_ads_insights')
  .select('date')
  .order('date', { ascending: true })
  .limit(1)

if (error) {
  console.error('Erro:', error.message)
  process.exit(1)
}

const firstDate = data?.[0]?.date

const { data: lastData, error: lastError } = await supabase
  .from('meta_ads_insights')
  .select('date')
  .order('date', { ascending: false })
  .limit(1)

if (lastError) {
  console.error('Erro:', lastError.message)
  process.exit(1)
}

const lastDate = lastData?.[0]?.date

const { count, error: countError } = await supabase
  .from('meta_ads_insights')
  .select('*', { count: 'exact', head: true })

if (countError) {
  console.error('Erro:', countError.message)
  process.exit(1)
}

console.log(`Primeira data: ${firstDate}`)
console.log(`Última data: ${lastDate}`)
console.log(`Total de registros: ${count}`)
