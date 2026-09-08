#!/usr/bin/env node
/**
 * Busca TODOS os MQLs de fevereiro 2026 no banco
 * e compara com o gabarito para entender a diferença
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('ANÁLISE COMPLETA: TODOS OS MQLs DE FEVEREIRO 2026')
  console.log('='.repeat(80))

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Query 1: Buscar TODOS os contatos com tag MQL em fevereiro
  console.log('\n🔍 Buscando TODOS os MQLs com data_lead_recebido em fevereiro/2026...\n')

  const { data: allMqls, error } = await supabase
    .from('oportunidades')
    .select(
      `
      id,
      contato_id,
      nome_contato,
      email_contato,
      data_lead_recebido,
      pipeline_name,
      contatos (
        id,
        nome,
        email,
        tags,
        utm_source,
        owner_name
      )
    `
    )
    .gte('data_lead_recebido', '2026-02-01T00:00:00-03:00')
    .lte('data_lead_recebido', '2026-02-28T23:59:59-03:00')
    .order('data_lead_recebido')

  if (error) {
    console.error('❌ Erro:', error.message)
    process.exit(1)
  }

  console.log(`📊 Total de oportunidades em fevereiro: ${allMqls?.length || 0}`)

  // Filtrar por tag MQL
  const mqlsWithTag = allMqls.filter((opp) => {
    const tags = (opp.contatos?.tags || '').toLowerCase()
    return tags.includes('mql')
  })

  console.log(`   Com tag MQL: ${mqlsWithTag.length}`)

  // Ler gabarito
  const gabarito = JSON.parse(fs.readFileSync('/tmp/mqls_gabarito.json', 'utf-8')).leads
  const gabaritroEmails = new Set(gabarito.map((l) => l.email.toLowerCase()))

  console.log(`\n📋 Gabarito manual: ${gabarito.length}`)

  // Separar:
  // 1. MQLs que estão no gabarito
  // 2. MQLs que não estão no gabarito
  const mqls_in_gabarito = mqlsWithTag.filter((opp) =>
    gabaritroEmails.has((opp.contatos?.email || '').toLowerCase())
  )

  const mqls_not_in_gabarito = mqlsWithTag.filter(
    (opp) => !gabaritroEmails.has((opp.contatos?.email || '').toLowerCase())
  )

  console.log(`\n📈 ANÁLISE:`)
  console.log(`   ✅ MQLs em ambos (gabarito + banco): ${mqls_in_gabarito.length}`)
  console.log(`   ❌ MQLs apenas no banco (NÃO no gabarito): ${mqls_not_in_gabarito.length}`)
  console.log(`   ⚠️  Diferença: ${Math.abs(mqlsWithTag.length - gabarito.length)}`)

  // Salvar detalhes dos MQLs não no gabarito
  if (mqls_not_in_gabarito.length > 0) {
    console.log(`\n🔍 ANÁLISE DOS ${mqls_not_in_gabarito.length} MQLs NÃO NO GABARITO:\n`)

    // Agrupar por padrão
    const byUtmSource = {}
    const byOwner = {}
    const byPipeline = {}

    for (const opp of mqls_not_in_gabarito) {
      const utm = opp.contatos?.utm_source || '(nenhum)'
      const owner = opp.contatos?.owner_name || '(sem owner)'
      const pipeline = opp.pipeline_name || '(sem pipeline)'

      byUtmSource[utm] = (byUtmSource[utm] || 0) + 1
      byOwner[owner] = (byOwner[owner] || 0) + 1
      byPipeline[pipeline] = (byPipeline[pipeline] || 0) + 1
    }

    console.log('📊 Distribuição por utm_source:')
    Object.entries(byUtmSource)
      .sort((a, b) => b[1] - a[1])
      .forEach(([utm, count]) => {
        console.log(`   ${utm}: ${count}`)
      })

    console.log('\n📊 Distribuição por owner_name:')
    Object.entries(byOwner)
      .sort((a, b) => b[1] - a[1])
      .forEach(([owner, count]) => {
        console.log(`   ${owner}: ${count}`)
      })

    console.log('\n📊 Distribuição por pipeline_name:')
    Object.entries(byPipeline)
      .sort((a, b) => b[1] - a[1])
      .forEach(([pipeline, count]) => {
        console.log(`   ${pipeline}: ${count}`)
      })

    // Mostrar amostra dos primeiros 10
    console.log(`\n📋 AMOSTRA de ${Math.min(10, mqls_not_in_gabarito.length)} leads não no gabarito:\n`)
    mqls_not_in_gabarito.slice(0, 10).forEach((opp, i) => {
      console.log(`${i + 1}. ${opp.contatos?.nome || opp.nome_contato}`)
      console.log(`   Email: ${opp.contatos?.email || opp.email_contato}`)
      console.log(`   utm_source: ${opp.contatos?.utm_source || '(nenhum)'}`)
      console.log(`   owner: ${opp.contatos?.owner_name || '(sem)'}`)
      console.log(`   pipeline: ${opp.pipeline_name}`)
      console.log(`   tags: ${(opp.contatos?.tags || 'nenhuma').substring(0, 60)}...`)
      console.log()
    })
  }

  // Salvar resultado
  const result = {
    data: new Date().toISOString(),
    resumo: {
      total_mqls_fevereiro: mqlsWithTag.length,
      total_gabarito: gabarito.length,
      em_ambos: mqls_in_gabarito.length,
      apenas_no_banco: mqls_not_in_gabarito.length,
      diferenca_percentual: ((mqls_not_in_gabarito.length / mqlsWithTag.length) * 100).toFixed(1) + '%'
    },
    em_ambos: mqls_in_gabarito.map((o) => ({
      email: o.contatos?.email,
      nome: o.contatos?.nome,
      utm_source: o.contatos?.utm_source,
      owner: o.contatos?.owner_name
    })),
    apenas_no_banco: mqls_not_in_gabarito.map((o) => ({
      email: o.contatos?.email,
      nome: o.contatos?.nome,
      utm_source: o.contatos?.utm_source,
      owner: o.contatos?.owner_name,
      pipeline: o.pipeline_name,
      data_lead: o.data_lead_recebido
    }))
  }

  fs.writeFileSync('/tmp/analise_mqls_completa.json', JSON.stringify(result, null, 2))
  console.log('\n💾 Resultado salvo em: /tmp/analise_mqls_completa.json')

  console.log('\n' + '='.repeat(80))
}

main().catch((err) => {
  console.error('❌ Erro:', err.message)
  process.exit(1)
})
