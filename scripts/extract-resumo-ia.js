#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const EXPORTS_DIR = path.join(ROOT, 'exports')
const OUTPUT_CSV = path.join(EXPORTS_DIR, 'resumos-ia-parsed.csv')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    console.log(`   Página ${page + 1}: ${data.length} registros`)
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

// ---------------------------------------------------------------------------
// Parsers de resumo_ia
// ---------------------------------------------------------------------------

function extrairFaturamento(texto) {
  if (!texto) return ''
  // "faturamento anual de R$ X" ou "faturamento anual entre R$ X e Y"
  const r1 = texto.match(/faturamento anual (?:de |entre )([^.]{3,60})/i)
  if (r1) return r1[1].trim().replace(/\s+/g, ' ')
  // fallback: qualquer menção a faturamento seguida de valor
  const r2 = texto.match(/faturamento[^.]{0,30}R\$[^.]{3,50}/i)
  if (r2) return r2[0].trim().replace(/\s+/g, ' ')
  return ''
}

function extrairInvestimentoTrafego(texto) {
  if (!texto) return ''
  // "investimento em tráfego de R$ X" ou "investindo R$ X em tráfego"
  const r1 = texto.match(/investimento[^e]*em tráfego ([^.]{3,60})/i)
  if (r1) return r1[1].trim().replace(/\s+/g, ' ')
  const r2 = texto.match(/investindo ([^e]{3,50}) em tráfego/i)
  if (r2) return r2[1].trim().replace(/\s+/g, ' ')
  // "tráfego de R$ X" ou "tráfego pago de R$ X"
  const r3 = texto.match(/tráfego[^d]{0,10}de ([^.]{3,50})/i)
  if (r3) return r3[1].trim().replace(/\s+/g, ' ')
  // fallback: "R$ X mensais" próximo a tráfego
  const r4 = texto.match(/tráfego[^.]{0,60}(R\$[^.]{3,40}mensais)/i)
  if (r4) return r4[1].trim().replace(/\s+/g, ' ')
  return ''
}

function extrairSegmento(texto) {
  if (!texto) return ''
  // "atuando no segmento de X" ou "atuando em X"
  const r1 = texto.match(/(?:atuando (?:no segmento de|no segmento|em)|é um[a]? |oferece |especialista em )([^,\.]{5,60})/i)
  if (r1) return r1[1].trim().replace(/\s+/g, ' ')
  // fallback: "empresa de X" ou "negócio de X"
  const r2 = texto.match(/(?:empresa|negócio|consultoria|agência|serviço)[^d]{0,5}de ([^,\.]{5,50})/i)
  if (r2) return r2[1].trim().replace(/\s+/g, ' ')
  return ''
}

function extrairObjetivo(texto) {
  if (!texto) return ''
  const r1 = texto.match(/(?:busca|objetivo[^é]*é|quer|deseja) ([^.]{10,80})/i)
  if (r1) return r1[1].trim().replace(/\s+/g, ' ')
  return ''
}

function extrairEngajamento(texto) {
  if (!texto) return ''
  const r1 = texto.match(/(?:engajamento|maturidade|potencial) (alto|moderado|baixo|alta|média|média-alta|baixa)/i)
  if (r1) return r1[1].trim().toLowerCase()
  return ''
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsv(val) {
  if (val == null) return ''
  const s = String(val)
  // Se contém vírgula, aspas ou quebra de linha, envolve em aspas e escapa aspas internas
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function rowToCsv(cols) {
  return cols.map(escapeCsv).join(',')
}

// ---------------------------------------------------------------------------
// Frequência helpers
// ---------------------------------------------------------------------------

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

function normalizarFaturamento(texto) {
  if (!texto) return ''
  // Normaliza para agrupar variações similares
  return texto
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/r\$\s*/g, 'R$ ')
    .trim()
    .slice(0, 60)
}

function normalizarSegmento(texto) {
  if (!texto) return ''
  return texto
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  // Garantir que a pasta exports existe
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true })
  }

  console.log('🔍 Buscando resumos IA...')

  const SELECT = [
    'id',
    'resumo_ia',
    'percepcao_closer',
    'nome_contato',
    'email_contato',
    'pipeline_name',
    'status',
    'lost_reason',
    'sdr_name',
    'vendedor_closer',
    'data_lead_recebido',
    'data_fechado',
    'contatos(ghl_id, nome, email, utm_source, utm_campaign, tags, country, date_created)',
  ].join(', ')

  const rows = await fetchAllPages(sb, 'oportunidades', SELECT, (q) =>
    q.not('resumo_ia', 'is', null).neq('resumo_ia', '')
  )

  console.log(`✅ ${rows.length} resumos encontrados`)

  // ---------------------------------------------------------------------------
  // Parsear cada registro
  // ---------------------------------------------------------------------------

  const parsed = []
  const faturamentoFreq = new Map()
  const segmentoFreq = new Map()

  for (const row of rows) {
    const resumo = row.resumo_ia || ''
    const contato = row.contatos || {}

    const faturamento = extrairFaturamento(resumo)
    const investimento = extrairInvestimentoTrafego(resumo)
    const segmento = extrairSegmento(resumo)
    const objetivo = extrairObjetivo(resumo)
    const engajamento = extrairEngajamento(resumo)

    // Frequências
    if (faturamento) {
      const key = normalizarFaturamento(faturamento)
      faturamentoFreq.set(key, (faturamentoFreq.get(key) || 0) + 1)
    }
    if (segmento) {
      const key = normalizarSegmento(segmento)
      segmentoFreq.set(key, (segmentoFreq.get(key) || 0) + 1)
    }

    parsed.push({
      nome_contato: row.nome_contato || contato.nome || '',
      email_contato: row.email_contato || contato.email || '',
      ghl_id: contato.ghl_id || '',
      pipeline_name: row.pipeline_name || '',
      status: row.status || '',
      utm_source: contato.utm_source || '',
      utm_campaign: contato.utm_campaign || '',
      tags: contato.tags || '',
      country: contato.country || '',
      data_lead_recebido: row.data_lead_recebido || '',
      faturamento_extraido: faturamento,
      investimento_trafego: investimento,
      segmento_negocio: segmento,
      objetivo_lead: objetivo,
      nivel_engajamento: engajamento,
      resumo_ia_completo: resumo,
    })
  }

  // ---------------------------------------------------------------------------
  // Gravar CSV
  // ---------------------------------------------------------------------------

  const COLUNAS = [
    'nome_contato',
    'email_contato',
    'ghl_id',
    'pipeline_name',
    'status',
    'utm_source',
    'utm_campaign',
    'tags',
    'country',
    'data_lead_recebido',
    'faturamento_extraido',
    'investimento_trafego',
    'segmento_negocio',
    'objetivo_lead',
    'nivel_engajamento',
    'resumo_ia_completo',
  ]

  const lines = [rowToCsv(COLUNAS)]
  for (const p of parsed) {
    lines.push(rowToCsv(COLUNAS.map((col) => p[col])))
  }

  fs.writeFileSync(OUTPUT_CSV, lines.join('\n'), 'utf8')

  // ---------------------------------------------------------------------------
  // Estatísticas
  // ---------------------------------------------------------------------------

  const comFaturamento = parsed.filter((p) => p.faturamento_extraido).length
  const comInvestimento = parsed.filter((p) => p.investimento_trafego).length
  const comSegmento = parsed.filter((p) => p.segmento_negocio).length
  const comObjetivo = parsed.filter((p) => p.objetivo_lead).length
  const comEngajamento = parsed.filter((p) => p.nivel_engajamento).length

  const pct = (n, total) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%'

  console.log('')
  console.log('📊 ESTATÍSTICAS DE EXTRAÇÃO')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`   Total registros:           ${rows.length}`)
  console.log(`   Com faturamento:           ${comFaturamento} (${pct(comFaturamento, rows.length)})`)
  console.log(`   Com investimento tráfego:  ${comInvestimento} (${pct(comInvestimento, rows.length)})`)
  console.log(`   Com segmento:              ${comSegmento} (${pct(comSegmento, rows.length)})`)
  console.log(`   Com objetivo:              ${comObjetivo} (${pct(comObjetivo, rows.length)})`)
  console.log(`   Com engajamento:           ${comEngajamento} (${pct(comEngajamento, rows.length)})`)
  console.log('')

  const top10Fat = topN(faturamentoFreq, 10)
  if (top10Fat.length > 0) {
    console.log('💰 TOP 10 FAIXAS DE FATURAMENTO MAIS FREQUENTES')
    console.log('───────────────────────────────────────────────────────')
    for (const [label, count] of top10Fat) {
      console.log(`   ${String(count).padStart(4)}x  ${label}`)
    }
    console.log('')
  }

  const top10Seg = topN(segmentoFreq, 10)
  if (top10Seg.length > 0) {
    console.log('🏢 TOP 10 SEGMENTOS MAIS FREQUENTES')
    console.log('───────────────────────────────────────────────────────')
    for (const [label, count] of top10Seg) {
      console.log(`   ${String(count).padStart(4)}x  ${label}`)
    }
    console.log('')
  }

  console.log(`📄 CSV salvo em: ${OUTPUT_CSV}`)
}

main().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})
