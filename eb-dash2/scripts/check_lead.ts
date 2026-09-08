import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const env: Record<string, string> = {}
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) env[key] = rest.join('=')
})

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
)

async function check() {
  console.log(`\n=== Procurando "mariaclara" ===\n`)
  
  const { data: contatos } = await supabase
    .from('contatos')
    .select('id, email, nome, date_created')
    .ilike('email', '%mariaclara%')
  
  if (!contatos?.length) {
    console.log('❌ Nenhum contato encontrado')
    return
  }
  
  console.log(`✅ ${contatos.length} contato(s) encontrado(s):\n`)
  
  for (const c of contatos) {
    console.log(`📧 ${c.email}`)
    console.log(`Nome: ${c.nome}`)
    console.log(`Criado: ${c.date_created?.split('T')[0]}\n`)
    
    const { data: opps } = await supabase
      .from('oportunidades')
      .select('pipeline_name, data_lead_recebido, status, valor')
      .eq('contato_id', c.id)
    
    if (!opps?.length) {
      console.log('  ⚠️ Sem oportunidades\n')
      continue
    }
    
    for (const o of opps) {
      console.log(`  Pipeline: ${o.pipeline_name}`)
      console.log(`  Data Lead: ${o.data_lead_recebido}`)
      
      if (o.data_lead_recebido) {
        const d = new Date(o.data_lead_recebido)
        const mes = d.getMonth() + 1
        const isMQL = o.pipeline_name === 'Pré-Vendas MQL'
        const isMarco = mes === 3
        
        if (isMQL && isMarco) {
          console.log(`  ✅ MQL em MARÇO`)
        } else if (!isMQL) {
          console.log(`  ❌ Não é MQL (${o.pipeline_name})`)
        } else if (!isMarco) {
          console.log(`  ❌ Não é março (mês ${mes})`)
        }
      } else {
        console.log(`  ❌ Sem data_lead_recebido`)
      }
      console.log()
    }
  }
}

check().catch(e => {
  console.error('ERRO:', e.message)
  process.exit(1)
})
