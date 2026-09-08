#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const TZ = 'America/Sao_Paulo'

function readEnvFile(filePath) {
  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const idx = line.indexOf('=')
    if (idx === -1) continue

    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    env[key] = value
  }

  return env
}

function formatCurrency(value) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num)
}

function formatNumber(value) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return new Intl.NumberFormat('pt-BR').format(num)
}

async function fetchAllPages(sb, table, select, filtersFn) {
  const PAGE_SIZE = 1000
  let all = []
  let page = 0
  while (true) {
    let query = sb.from(table).select(select).order('id', { ascending: true })
    query = filtersFn(query)
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Arquivo de ambiente nao encontrado: ${ENV_PATH}`)
  }

  const env = readEnvFile(ENV_PATH)
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('VITE_SUPABASE_URL/SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY sao obrigatorios')
  }

  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const START_DATE = '2026-01-01'
  const END_DATE = '2026-12-31'

  console.log('🔍 Consultando dados do Supabase...\n')

  // --- 1. Gastos por mês no Meta Ads (com paginação obrigatória) ---
  console.log('1/4 Buscando gastos em meta_ads_insights...')
  const gastosMensais = await fetchAllPages(sb, 'meta_ads_insights', 'date,spend', (q) =>
    q.gte('date', START_DATE).lte('date', END_DATE)
  )

  console.log(`   ✓ ${gastosMensais.length} registros de gasto encontrados`)

  const gastosPorMes = {}
  let totalGasto = 0
  for (const row of gastosMensais) {
    const mes = row.date.substring(0, 7)
    const spend = Number(row.spend) || 0
    gastosPorMes[mes] = (gastosPorMes[mes] || 0) + spend
    totalGasto += spend
  }
  console.log(`   ✓ Total acumulado em gastos: ${formatCurrency(totalGasto)}`)

  // --- 2. Leads (oportunidades) de tráfego pago por mês ---
  console.log('\n2/4 Buscando utm_sources de tráfego pago...')
  const { data: utmSourcesPago, error: utmError } = await sb
    .from('utm_sources')
    .select('utm_source')

  if (utmError) throw utmError

  const sourcesPago = (utmSourcesPago ?? []).map(s => s.utm_source).filter(Boolean)
  console.log(`   ✓ ${sourcesPago.length} fontes de tráfego pago encontradas`)

  console.log('\n3/4 Buscando oportunidades de 2026...')
  const oportunidades = await fetchAllPages(
    sb,
    'oportunidades',
    'id,contato_id,data_lead_recebido',
    (q) => q.gte('data_lead_recebido', START_DATE + 'T00:00:00-03:00').lte('data_lead_recebido', END_DATE + 'T23:59:59-03:00')
  )

  console.log(`   ✓ ${oportunidades.length} oportunidades encontradas`)

  const contatoIds = [...new Set(oportunidades.map(o => o.contato_id).filter(Boolean))]
  console.log(`   ✓ ${contatoIds.length} contatos únicos para consultar`)

  let contatosMap = new Map()
  if (contatoIds.length > 0) {
    const BATCH_SIZE = 100
    console.log(`   → Consultando contatos em batches de ${BATCH_SIZE}...`)
    for (let i = 0; i < contatoIds.length; i += BATCH_SIZE) {
      const batch = contatoIds.slice(i, i + BATCH_SIZE)
      const { data: contatosBatch, error: contatosError } = await sb
        .from('contatos')
        .select('id,utm_source,tags')
        .in('id', batch)

      if (contatosError) throw contatosError

      for (const c of contatosBatch ?? []) {
        contatosMap.set(c.id, c)
      }
    }
    console.log(`   ✓ ${contatosMap.size} contatos carregados`)
  }

  console.log('\n4/4 Calculando métricas por mês...')
  const leadsPorMes = {}
  let totalLeads = 0
  const oportunidadesTrafegoPago = []

  for (const opp of oportunidades) {
    const contato = contatosMap.get(opp.contato_id)
    if (!contato) continue

    const utmSource = contato.utm_source
    const isTrafegoPago = sourcesPago.includes(utmSource)

    if (isTrafegoPago) {
      const dataLead = opp.data_lead_recebido
      if (dataLead) {
        const mes = dataLead.substring(0, 7)
        leadsPorMes[mes] = (leadsPorMes[mes] || 0) + 1
        totalLeads += 1
        oportunidadesTrafegoPago.push({ ...opp, contato })
      }
    }
  }
  console.log(`   ✓ ${totalLeads} leads de tráfego pago identificados`)

  // --- 3. MQLs por mês ---
  const mqlsPorMes = {}
  let totalMQLs = 0

  for (const opp of oportunidadesTrafegoPago) {
    const tags = opp.contato.tags || ''
    const isMQL = String(tags).toLowerCase().includes('mql')

    if (isMQL) {
      const dataLead = opp.data_lead_recebido
      const mes = dataLead.substring(0, 7)
      mqlsPorMes[mes] = (mqlsPorMes[mes] || 0) + 1
      totalMQLs += 1
    }
  }
  console.log(`   ✓ ${totalMQLs} MQLs identificados`)

  // --- 4. Calcular CPL e CPMQL por mês ---
  const todosMeses = [...new Set([...Object.keys(gastosPorMes), ...Object.keys(leadsPorMes), ...Object.keys(mqlsPorMes)])].sort()

  console.log('\n')
  console.log('📊 RELATÓRIO CPL E CPMQL — 2026')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const resultadosMensais = []

  for (const mes of todosMeses) {
    const [ano, mesNum] = mes.split('-')
    const nomeMes = new Date(Number(ano), Number(mesNum) - 1, 1).toLocaleString('pt-BR', { month: 'long', timeZone: TZ })
    const capitalizedMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)

    const gasto = gastosPorMes[mes] || 0
    const leads = leadsPorMes[mes] || 0
    const mqls = mqlsPorMes[mes] || 0
    const cpl = leads > 0 ? gasto / leads : 0
    const cpmql = mqls > 0 ? gasto / mqls : 0

    resultadosMensais.push({
      mes,
      nomeMes: capitalizedMes,
      gasto,
      leads,
      mqls,
      cpl,
      cpmql,
    })

    console.log(`${capitalizedMes}/${ano}`)
    console.log(`  💰 Gasto:        ${formatCurrency(gasto)}`)
    console.log(`  👥 Leads:        ${formatNumber(leads)}`)
    console.log(`  🎯 MQLs:         ${formatNumber(mqls)}`)
    console.log(`  📌 CPL:          ${formatCurrency(cpl)}`)
    console.log(`  📌 CPMQL:        ${formatCurrency(cpmql)}`)
    console.log('')
  }

  const mesesComGasto = todosMeses.filter(m => (gastosPorMes[m] || 0) > 0)
  const mesesComLeads = todosMeses.filter(m => (leadsPorMes[m] || 0) > 0)
  const mesesComMQLs = todosMeses.filter(m => (mqlsPorMes[m] || 0) > 0)

  const cplMedio = totalLeads > 0 ? totalGasto / totalLeads : 0
  const cpmqlMedio = totalMQLs > 0 ? totalGasto / totalMQLs : 0

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('📈 TOTAIS E MÉDIAS — 2026')
  console.log('═══════════════════════════════════════════════════════════════\n')
  console.log(`💰 Total gasto em anúncios:       ${formatCurrency(totalGasto)}`)
  console.log(`👥 Total de leads (tráfego pago): ${formatNumber(totalLeads)}`)
  console.log(`🎯 Total de MQLs:                 ${formatNumber(totalMQLs)}`)
  console.log(`📅 Meses com gasto:               ${mesesComGasto.length}`)
  console.log(`📅 Meses com leads:               ${mesesComLeads.length}`)
  console.log(`📅 Meses com MQLs:                ${mesesComMQLs.length}`)
  console.log('')
  console.log(`📌 CPL MÉDIO 2026:                ${formatCurrency(cplMedio)}`)
  console.log(`📌 CPMQL MÉDIO 2026:              ${formatCurrency(cpmqlMedio)}`)
  console.log('')

  // Tabela resumo em formato Markdown
  console.log('\n📋 TABELA RESUMO (Markdown)')
  console.log('───────────────────────────────────────────────────────────────')
  console.log('| Mês | Gasto | Leads | MQLs | CPL | CPMQL |')
  console.log('| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const r of resultadosMensais) {
    console.log(`| ${r.nomeMes} | ${formatCurrency(r.gasto)} | ${r.leads} | ${r.mqls} | ${formatCurrency(r.cpl)} | ${formatCurrency(r.cpmql)} |`)
  }
  console.log(`| **Total/Médio** | **${formatCurrency(totalGasto)}** | **${totalLeads}** | **${totalMQLs}** | **${formatCurrency(cplMedio)}** | **${formatCurrency(cpmqlMedio)}** |`)
  console.log('')

  // JSON resumido para uso externo
  const resumoJSON = {
    periodo: '2026',
    total_gasto: totalGasto,
    total_leads: totalLeads,
    total_mqls: totalMQLs,
    cpl_medio: cplMedio,
    cpmql_medio: cpmqlMedio,
    meses_com_dados: todosMeses.length,
    detalhamento_mensal: resultadosMensais.map(r => ({
      mes: r.mes,
      gasto: r.gasto,
      leads: r.leads,
      mqls: r.mqls,
      cpl: r.cpl,
      cpmql: r.cpmql,
    })),
  }

  console.log('\n📝 JSON RESUMIDO:')
  console.log(JSON.stringify(resumoJSON, null, 2))
}

main().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})
