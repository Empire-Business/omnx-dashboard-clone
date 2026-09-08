import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://qzesffnkqgelmtfblzkr.supabase.co',
  'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
)

const { data: firstData } = await supabase
  .from('meta_ads_insights')
  .select('date')
  .order('date', { ascending: true })
  .limit(1)

const { data: lastData } = await supabase
  .from('meta_ads_insights')
  .select('date')
  .order('date', { ascending: false })
  .limit(1)

const { count } = await supabase
  .from('meta_ads_insights')
  .select('*', { count: 'exact', head: true })

console.log('📊 Meta Ads Insights — Data Range')
console.log('─'.repeat(40))
console.log(`Primeira data: ${firstData?.[0]?.date || '—'}`)
console.log(`Última data:   ${lastData?.[0]?.date || '—'}`)
console.log(`Total:         ${count} registros`)
