/**
 * Compara MQLs do gabarito com dados do banco de dados
 * Executa query SQL e analisa discrepâncias
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

interface GabaritolLead {
  email: string
  nome: string
  whatsapp: string
  data_formulario: string
  utm_source: string
}

interface BankLead {
  id: string
  nome: string
  email: string
  tags: string | null
  whatsapp: string | null
  ghl_opportunity_id: string | null
  data_lead_recebido: string | null
  pipeline_name: string | null
}

interface ComparisonResult {
  email_gabarito: string
  nome_gabarito: string
  encontrado_banco: boolean
  status: 'OK' | 'SEM_TAG' | 'NAO_ENCONTRADO'
  tags_banco: string | null
  nome_banco: string | null
  motivo: string
}

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('ANÁLISE DE DISCREPÂNCIA MQLs — FASE 2: BUSCA NO BANCO')
  console.log('='.repeat(80))

  if (!SUPABASE_ANON_KEY) {
    console.error(
      '\n❌ ERRO: Variável SUPABASE_ANON_KEY não definida\n' +
      'Execute: export SUPABASE_ANON_KEY="sua-chave-aqui"\n' +
      'Encontre em: https://supabase.com/dashboard/project/qzesffnkqgelmtfblzkr/settings/api\n'
    )
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Ler gabarito
  const gabaritoBefore = JSON.parse(fs.readFileSync('/tmp/mqls_gabarito.json', 'utf-8'))
  const gabarito: GabaritolLead[] = gabaritoBefore.leads
  const emails = gabarito.map((l: GabaritolLead) => l.email)

  console.log(`\n📧 Buscando ${emails.length} leads no banco de dados...`)

  // Query para buscar leads
  const { data: bankData, error } = await supabase
    .from('contatos')
    .select(
      `
      id,
      nome,
      email,
      tags,
      whatsapp,
      oportunidades (
        ghl_opportunity_id,
        data_lead_recebido,
        pipeline_name
      )
    `
    )
    .in('email', emails)
    .order('email')

  if (error) {
    console.error('❌ Erro ao buscar contatos:', error)
    process.exit(1)
  }

  console.log(`✅ Retornados ${bankData?.length || 0} contatos do banco`)

  // Preparar dados para comparação
  const bankMap = new Map<string, any>()
  if (bankData) {
    for (const contact of bankData) {
      bankMap.set(contact.email.toLowerCase(), contact)
    }
  }

  // FASE 3: Comparação
  console.log('\n' + '='.repeat(80))
  console.log('FASE 3: COMPARAÇÃO')
  console.log('='.repeat(80))

  const results: ComparisonResult[] = []
  let encontrados = 0
  let comTag = 0
  let semTag = 0
  let naoEncontrados = 0

  for (const lead of gabarito) {
    const bankLead = bankMap.get(lead.email.toLowerCase())

    if (!bankLead) {
      // Não encontrado
      results.push({
        email_gabarito: lead.email,
        nome_gabarito: lead.nome,
        encontrado_banco: false,
        status: 'NAO_ENCONTRADO',
        tags_banco: null,
        nome_banco: null,
        motivo: 'Lead não localizado no banco (webhook não chegou ou falhou)'
      })
      naoEncontrados++
      continue
    }

    encontrados++

    // Extrair tags
    const tags = bankLead.tags?.toLowerCase() || ''
    const hasMqlTag = tags.includes('mql')

    if (hasMqlTag) {
      comTag++
      results.push({
        email_gabarito: lead.email,
        nome_gabarito: lead.nome,
        encontrado_banco: true,
        status: 'OK',
        tags_banco: bankLead.tags,
        nome_banco: bankLead.nome,
        motivo: 'Tags sincronizadas corretamente ✅'
      })
    } else {
      semTag++
      results.push({
        email_gabarito: lead.email,
        nome_gabarito: lead.nome,
        encontrado_banco: true,
        status: 'SEM_TAG',
        tags_banco: bankLead.tags,
        nome_banco: bankLead.nome,
        motivo: 'Lead existe mas tag MQL não foi sincronizada ⚠️'
      })
    }
  }

  // RESUMO
  console.log('\n📊 RESUMO EXECUTIVO')
  console.log('-'.repeat(80))
  console.log(`Total no gabarito:        ${gabarito.length}`)
  console.log(`Encontrados no banco:     ${encontrados} (${((encontrados / gabarito.length) * 100).toFixed(1)}%)`)
  console.log(`  ✅ Com tag MQL:         ${comTag} (${((comTag / gabarito.length) * 100).toFixed(1)}%)`)
  console.log(`  ⚠️  Sem tag MQL:        ${semTag} (${((semTag / gabarito.length) * 100).toFixed(1)}%)`)
  console.log(`❌ Não encontrados:       ${naoEncontrados} (${((naoEncontrados / gabarito.length) * 100).toFixed(1)}%)`)

  // Salvar resultados
  const output = {
    data_analise: new Date().toISOString(),
    resumo: {
      total_gabarito: gabarito.length,
      encontrados_banco: encontrados,
      com_tag_mql: comTag,
      sem_tag_mql: semTag,
      nao_encontrados: naoEncontrados,
      taxa_sucesso: `${((comTag / gabarito.length) * 100).toFixed(1)}%`,
      taxa_discrepancia: `${((semTag / gabarito.length) * 100).toFixed(1)}%`,
      taxa_nao_chegou: `${((naoEncontrados / gabarito.length) * 100).toFixed(1)}%`
    },
    detalhes: results
  }

  const outputPath = '/tmp/mql_comparison_result.json'
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\n💾 Resultados salvos em: ${outputPath}`)

  // DETALHES DE DISCREPÂNCIAS
  if (semTag > 0 || naoEncontrados > 0) {
    console.log('\n' + '='.repeat(80))
    console.log(`⚠️  DISCREPÂNCIAS (${semTag + naoEncontrados} leads)`)
    console.log('='.repeat(80))

    const problematicos = results.filter((r) => r.status !== 'OK')

    for (const item of problematicos) {
      console.log(`\n📍 ${item.email_gabarito}`)
      console.log(`   Nome gabarito:  ${item.nome_gabarito}`)
      if (item.encontrado_banco) {
        console.log(`   Nome banco:     ${item.nome_banco}`)
        console.log(`   Tags banco:     ${item.tags_banco || '(nenhuma)'}`)
      }
      console.log(`   Motivo:         ${item.motivo}`)
    }
  }

  // Recomendações
  console.log('\n' + '='.repeat(80))
  console.log('💡 RECOMENDAÇÕES')
  console.log('='.repeat(80))

  if (naoEncontrados > 0) {
    console.log(
      `\n1️⃣  [${naoEncontrados} leads não chegaram ao banco]\n` +
      '   • Verificar se webhooks do GHL estão ativados\n' +
      '   • Conferir se leads estão em pipeline correto (não filtrados)\n' +
      '   • Testar novo formulário para garantir webhook disparo'
    )
  }

  if (semTag > 0) {
    console.log(
      `\n2️⃣  [${semTag} leads existem mas sem tag MQL]\n` +
      '   • Verificar edge function sync-contact-tags (cron 15 min)\n' +
      '   • Checar webhook "tag.created" no GHL\n' +
      '   • Validar se tag "MQL" foi aplicada manualmente nos contatos\n' +
      '   • Rodar sync manual: POST /functions/v1/sync-contact-tags?batch_size=100'
    )
  }

  if (comTag === gabarito.length) {
    console.log('\n✅ PERFEITO: Todos os 48 MQLs estão com tag sincronizada!')
  }

  console.log('\n' + '='.repeat(80))
}

main().catch((err) => {
  console.error('❌ Erro:', err)
  process.exit(1)
})
