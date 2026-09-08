#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://qzesffnkqgelmtfblzkr.supabase.co',
  'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
)

async function main() {
  // Buscar uma linha para verificar colunas
  const { data, error } = await supabase
    .from('contatos')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Erro:', error.message)
    return
  }

  if (data && data.length > 0) {
    const colunas = Object.keys(data[0])
    console.log('Colunas em contatos:')
    colunas.forEach(col => console.log(`  - ${col}`))
  } else {
    console.log('Tabela contatos vazia')
  }

  // Também verificar oportunidades
  const { data: oppData, error: oppError } = await supabase
    .from('oportunidades')
    .select('*')
    .limit(1)

  if (oppData && oppData.length > 0) {
    const oppCols = Object.keys(oppData[0])
    console.log('\nColunas em oportunidades:')
    oppCols.forEach(col => console.log(`  - ${col}`))
  }
}

main()
