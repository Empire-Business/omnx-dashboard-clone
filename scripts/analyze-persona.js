#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const EXPORTS_DIR = path.join(ROOT, 'exports')
const MQLS_CSV = path.join(EXPORTS_DIR, 'mqls-2026.csv')
const BUYERS_CSV = path.join(EXPORTS_DIR, 'comprantes-2026.csv')
const OUT_MQLS = path.join(EXPORTS_DIR, 'analise-persona-mqls-2026.md')
const OUT_BUYERS = path.join(EXPORTS_DIR, 'analise-persona-comprantes-2026.md')

// ─── CSV Parser robusto (suporta newlines em campos quoted) ──────────────────
function parseCSV(content) {
  // Usar Python via child_process seria mais robusto, mas vamos tratar os dados
  // sem suporte a newlines em campos — split simples
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"' && content[i+1] === '"') { current += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else current += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === '\n') { lines.push(current); current = '' }
      else if (ch === '\r') { /* skip */ }
      else current += ch
    }
  }
  if (current) lines.push(current)

  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length === 0) return []

  function parseLine(line) {
    const fields = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { fields.push(cur); cur = '' }
        else cur += ch
      }
    }
    fields.push(cur)
    return fields
  }

  const headers = parseLine(nonEmpty[0])
  const rows = []
  for (let i = 1; i < nonEmpty.length; i++) {
    if (!nonEmpty[i].trim()) continue
    const values = parseLine(nonEmpty[i])
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = values[idx] !== undefined ? values[idx] : '' })
    rows.push(obj)
  }
  return rows
}

// ─── Utilitários de análise ──────────────────────────────────────────────────
function pct(n, total) {
  if (!total) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

function topValues(rows, field, topN = 15) {
  const freq = {}
  for (const row of rows) {
    const v = (row[field] || '').trim()
    if (v) freq[v] = (freq[v] || 0) + 1
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, topN)
}

function countField(rows, field) {
  return rows.filter(r => (r[field] || '').trim()).length
}

function parseTags(tagsStr) {
  if (!tagsStr) return []
  return tagsStr.split(',').map(t => t.trim()).filter(Boolean)
}

function topTags(rows, topN = 20) {
  const freq = {}
  for (const row of rows) {
    for (const tag of parseTags(row.tags || '')) {
      const t = tag.toLowerCase()
      freq[t] = (freq[t] || 0) + 1
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, topN)
}

function funnelMetrics(rows, total) {
  const tentativa1 = countField(rows, 'data_tentativa_1')
  const conectado = countField(rows, 'data_conectado')
  const agendado = rows.filter(r => (r.data_agendamento_reuniao || '').trim() || (r.data_reuniao_agendada || '').trim()).length
  const realizado = countField(rows, 'data_realizacao_vendas')
  const agendadoVendas = countField(rows, 'data_agendamento_vendas')
  const fechado = countField(rows, 'data_fechado')
  const perdido = countField(rows, 'data_perdido') + countField(rows, 'data_perdido_vendas')
  const noShow = countField(rows, 'data_no_show') + countField(rows, 'data_no_show_vendas')

  return { tentativa1, conectado, agendado, realizado, agendadoVendas, fechado, perdido, noShow }
}

function sampleQuotes(rows, field, n = 6) {
  return rows.map(r => (r[field] || '').trim()).filter(v => v.length > 10).slice(0, n)
}

function diasEntre(d1, d2) {
  if (!d1 || !d2) return null
  const a = new Date(d1)
  const b = new Date(d2)
  if (isNaN(a) || isNaN(b)) return null
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24))
}

// ─── Gerador do relatório ─────────────────────────────────────────────────────
function generateReport(rows, label, isBuyers = false) {
  const total = rows.length
  if (total === 0) return `# Análise de Persona — ${label}\n\n> Nenhum dado encontrado.\n`

  const lines = []
  const h = (level, text) => lines.push(`${'#'.repeat(level)} ${text}\n`)
  const p = (text) => lines.push(text + '\n')
  const li = (text) => lines.push(`- ${text}`)
  const quote = (text) => lines.push(`> "${text}"`)
  const br = () => lines.push('')
  const separator = () => lines.push('---\n')

  h(1, `Análise de Persona — ${label}`)
  p(`**Total de registros analisados:** ${total}`)
  p(`**Data de geração:** ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`)
  br()
  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '1. INTRODUÇÃO — Perfil Geral e Resultados Desejados')
  br()

  h(3, 'Distribuição por País')
  for (const [v, cnt] of topValues(rows, 'country', 8)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Canal de Origem (utm_source) — De onde vêm esses leads?')
  for (const [v, cnt] of topValues(rows, 'utm_source', 12)) {
    li(`\`${v}\` — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Campanha de Origem (utm_campaign) — Qual campanha gerou mais leads?')
  for (const [v, cnt] of topValues(rows, 'utm_campaign', 12)) {
    li(`\`${v}\` — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Médio de Origem (utm_medium)')
  for (const [v, cnt] of topValues(rows, 'utm_medium', 8)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '2. CONEXÃO — Segmentação por Tags (Quem São Essas Pessoas?)')
  p('_As tags revelam a jornada, segmento e comportamento de cada lead._')
  br()

  h(3, 'Top tags mais presentes na base')
  for (const [tag, cnt] of topTags(rows, 20)) {
    li(`\`${tag}\` — ${cnt}x (${pct(cnt, total)} dos leads têm esta tag)`)
  }
  br()

  h(3, 'Pipeline de Origem (onde estão no funil)')
  for (const [v, cnt] of topValues(rows, 'pipeline_name', 10)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '3. OBSTÁCULOS — Jornada pelo Funil (Onde Travam?)')
  br()

  const fm = funnelMetrics(rows, total)

  h(3, 'Funil de Conversão — Taxa de Avanço em Cada Etapa')
  li(`**Total de leads:** ${total} (100%)`)
  li(`**Pelo menos 1 tentativa de contato:** ${fm.tentativa1} (${pct(fm.tentativa1, total)})`)
  li(`**Conectados (conseguiram falar):** ${fm.conectado} (${pct(fm.conectado, total)})`)
  li(`**Reunião MQL agendada:** ${fm.agendado} (${pct(fm.agendado, total)})`)
  li(`**Reunião de vendas realizada:** ${fm.realizado} (${pct(fm.realizado, total)})`)
  li(`**No-shows (MQL + Vendas):** ${fm.noShow} (${pct(fm.noShow, total)})`)
  li(`**Leads perdidos (MQL + Vendas):** ${fm.perdido} (${pct(fm.perdido, total)})`)
  if (fm.fechado > 0) li(`**Fechados:** ${fm.fechado} (${pct(fm.fechado, total)})`)
  br()

  h(3, 'Status Atual na Oportunidade')
  for (const [v, cnt] of topValues(rows, 'status', 8)) {
    li(`**${v}** — ${cnt} (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Motivos de Perda (lost_reason)')
  const lostRows = rows.filter(r => (r.lost_reason || '').trim())
  p(`_${lostRows.length} leads perdidos com motivo registrado (${pct(lostRows.length, total)} do total)_`)
  br()
  for (const [v, cnt] of topValues(rows, 'lost_reason', 15)) {
    li(`**"${v}"** — ${cnt}x`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '4. MEDOS — Análise de No-shows e Perdas')
  br()

  h(3, 'Análise de No-shows')
  const noShowMql = countField(rows, 'data_no_show')
  const noShowVendas = countField(rows, 'data_no_show_vendas')
  li(`No-shows pré-vendas (MQL): **${noShowMql}** (${pct(noShowMql, total)})`)
  li(`No-shows vendas: **${noShowVendas}** (${pct(noShowVendas, total)})`)
  li(`Total no-shows: **${noShowMql + noShowVendas}** (${pct(noShowMql + noShowVendas, total)})`)
  br()

  h(3, 'Canal com maior taxa de perda')
  const perdaBySource = {}
  for (const row of rows) {
    const src = (row.utm_source || 'desconhecido').trim()
    if (!perdaBySource[src]) perdaBySource[src] = { total: 0, perdido: 0 }
    perdaBySource[src].total++
    if ((row.data_perdido || '').trim() || (row.data_perdido_vendas || '').trim()) {
      perdaBySource[src].perdido++
    }
  }
  const perdaRanking = Object.entries(perdaBySource)
    .filter(([, v]) => v.total >= 20)
    .map(([src, v]) => ({ src, taxaPerda: v.perdido / v.total, ...v }))
    .sort((a, b) => b.taxaPerda - a.taxaPerda)
    .slice(0, 10)

  for (const item of perdaRanking) {
    li(`\`${item.src}\` — ${item.perdido}/${item.total} perdidos (${pct(item.perdido, item.total)} taxa de perda)`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '5. SUSPEITAS CONFIRMADAS — Análise de Atribuição TikTok vs Meta')
  br()

  const comTt = rows.filter(r => (r.tt_source || '').trim()).length
  const semTt = total - comTt
  p(`**Leads com atribuição TikTok:** ${comTt} (${pct(comTt, total)})`)
  p(`**Leads sem atribuição TikTok:** ${semTt} (${pct(semTt, total)})`)
  br()

  h(3, 'Origem TikTok (tt_source)')
  for (const [v, cnt] of topValues(rows, 'tt_source', 8)) {
    li(`\`${v}\` — ${cnt} (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Campanha TikTok (tt_campaign)')
  for (const [v, cnt] of topValues(rows, 'tt_campaign', 8)) {
    li(`\`${v}\` — ${cnt} (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Conteúdo que trouxe mais leads (utm_content)')
  for (const [v, cnt] of topValues(rows, 'utm_content', 12)) {
    li(`\`${v}\` — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '6. SONHOS — Perfil da Equipe de Atendimento')
  br()

  h(3, 'SDRs com mais leads (quem mais trabalhа esses leads?)')
  const sdrRows = rows.filter(r => (r.sdr_name || '').trim())
  p(`_${sdrRows.length} leads com SDR identificado (${pct(sdrRows.length, total)})_`)
  br()
  for (const [v, cnt] of topValues(rows, 'sdr_name', 10)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Closers (vendedores com mais leads acompanhados)')
  const closerRows = rows.filter(r => (r.vendedor_closer || '').trim())
  p(`_${closerRows.length} leads com closer identificado (${pct(closerRows.length, total)})_`)
  br()
  for (const [v, cnt] of topValues(rows, 'vendedor_closer', 10)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  h(3, 'Owners (SDRs/SS responsáveis pelo contato)')
  for (const [v, cnt] of topValues(rows, 'owner_name', 10)) {
    li(`**${v}** — ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  separator()

  // ═══════════════════════════════════════════════════════════
  h(2, '7. NOVA OPORTUNIDADE — Slide da Régua (Público-Alvo Ideal)')
  br()

  h(3, 'Perfil do Comprador Ideal — Convergência dos Dados')
  br()

  // Análise do canal que MAIS converte
  h(4, 'Canal que mais gera leads qualificados (top utm_source)')
  for (const [v, cnt] of topValues(rows, 'utm_source', 5)) {
    li(`**${v}** → ${cnt} leads (${pct(cnt, total)} da base)`)
  }
  br()

  // Análise temporal — quais meses tiveram mais leads
  h(4, 'Distribuição temporal — quando chegam os leads?')
  const byMonth = {}
  for (const row of rows) {
    const d = row.data_lead_recebido || row.data_pagamento_entrada || ''
    if (d) {
      const month = d.substring(0, 7)
      byMonth[month] = (byMonth[month] || 0) + 1
    }
  }
  for (const [month, cnt] of Object.entries(byMonth).sort()) {
    li(`**${month}:** ${cnt} leads (${pct(cnt, total)})`)
  }
  br()

  // ─── Seção exclusiva de comprantes ───────────────────────────────────────
  if (isBuyers) {
    separator()
    h(2, '8. COMPRANTES — Análise Financeira e Comportamental')
    br()

    h(3, 'Produtos Vendidos')
    for (const [v, cnt] of topValues(rows, 'produto_vendido', 10)) {
      li(`**${v}** — ${cnt}x (${pct(cnt, total)})`)
    }
    br()

    h(3, 'Formas de Pagamento')
    for (const [v, cnt] of topValues(rows, 'forma_pagamento', 8)) {
      li(`**${v}** — ${cnt}x (${pct(cnt, total)})`)
    }
    br()

    h(3, 'Estado (UF) dos Comprantes')
    for (const [v, cnt] of topValues(rows, 'estado_uf', 15)) {
      li(`**${v}** — ${cnt}x (${pct(cnt, total)})`)
    }
    br()

    h(3, 'Cidade dos Comprantes')
    for (const [v, cnt] of topValues(rows, 'municipio', 12)) {
      li(`**${v}** — ${cnt}x`)
    }
    br()

    // Métricas financeiras
    const valores = rows.map(r => Number(r.valor_faturado)).filter(v => v > 0)
    if (valores.length > 0) {
      const soma = valores.reduce((a, b) => a + b, 0)
      const media = soma / valores.length
      const sorted = [...valores].sort((a, b) => a - b)
      const mediana = sorted[Math.floor(sorted.length / 2)]
      const min = sorted[0]
      const max = sorted[sorted.length - 1]

      h(3, 'Métricas Financeiras')
      li(`Total faturado: **R$ ${soma.toLocaleString('pt-BR', {minimumFractionDigits:2})}**`)
      li(`Ticket médio: **R$ ${media.toLocaleString('pt-BR', {minimumFractionDigits:2})}**`)
      li(`Ticket mediana: **R$ ${mediana.toLocaleString('pt-BR', {minimumFractionDigits:2})}**`)
      li(`Ticket mínimo: **R$ ${min.toLocaleString('pt-BR', {minimumFractionDigits:2})}**`)
      li(`Ticket máximo: **R$ ${max.toLocaleString('pt-BR', {minimumFractionDigits:2})}**`)
      li(`Comprantes com valor registrado: **${valores.length}/${total}**`)
      br()

      // Distribuição por faixa de valor
      h(3, 'Distribuição por Faixa de Ticket')
      const faixas = [
        { label: 'Até R$5.000', min: 0, max: 5000 },
        { label: 'R$5.001–R$10.000', min: 5001, max: 10000 },
        { label: 'R$10.001–R$20.000', min: 10001, max: 20000 },
        { label: 'R$20.001–R$50.000', min: 20001, max: 50000 },
        { label: 'Acima de R$50.000', min: 50001, max: Infinity },
      ]
      for (const faixa of faixas) {
        const n = valores.filter(v => v >= faixa.min && v <= faixa.max).length
        if (n > 0) li(`**${faixa.label}** — ${n}x (${pct(n, valores.length)})`)
      }
      br()
    }

    h(3, 'Análise do Ciclo de Vendas (lead → pagamento)')
    const ciclos = rows
      .map(r => diasEntre(r.data_lead_recebido, r.data_pagamento_entrada))
      .filter(d => d !== null && d >= 0 && d <= 365)
    if (ciclos.length > 0) {
      const soma = ciclos.reduce((a, b) => a + b, 0)
      const media = Math.round(soma / ciclos.length)
      const sorted = [...ciclos].sort((a, b) => a - b)
      const mediana = sorted[Math.floor(sorted.length / 2)]
      li(`Ciclo médio lead→pagamento: **${media} dias**`)
      li(`Ciclo mediano lead→pagamento: **${mediana} dias**`)
      li(`Ciclo mínimo: **${sorted[0]} dias**`)
      li(`Ciclo máximo: **${sorted[sorted.length - 1]} dias**`)
      br()
    }

    h(3, 'Closer com mais fechamentos')
    for (const [v, cnt] of topValues(rows, 'vendedor_closer', 10)) {
      const vendas = rows.filter(r => r.vendedor_closer === v)
      const valoresCloser = vendas.map(r => Number(r.valor_faturado)).filter(v => v > 0)
      const totalCloser = valoresCloser.reduce((a, b) => a + b, 0)
      li(`**${v}** — ${cnt} vendas | Total: R$ ${totalCloser.toLocaleString('pt-BR', {minimumFractionDigits:2})}`)
    }
    br()

    h(3, 'Resumos IA e percepções dos closers (amostra)')
    for (const q of sampleQuotes(rows, 'resumo_ia', 5)) {
      quote(q)
      br()
    }
    for (const q of sampleQuotes(rows, 'percepcao_closer', 5)) {
      quote(q)
      br()
    }
  }

  separator()
  h(2, isBuyers ? '9. OBSERVAÇÕES FINAIS' : '8. OBSERVAÇÕES FINAIS')
  p('> **Nota sobre campos de pesquisa de persona:** Os campos de questionário detalhado (`visao_6_meses`, `obstaculos`, `preciso_ajuda_para`, `tipo_empresa`, `faturamento_anual`, etc.) existem nas colunas do banco de dados mas estão **vazios** — esses dados ainda não foram coletados via formulário de aplicação. Esta análise foi construída sobre os dados efetivamente disponíveis: atribuição de canal, comportamento no funil, tags, dados financeiros e percepção dos closers.')
  br()
  p(`> Para enriquecer futuras análises, é necessário implementar o formulário de aplicação e mapear as respostas para as colunas \`tipo_empresa\`, \`faturamento_anual\`, \`obstaculos\`, \`visao_6_meses\`, etc.`)

  return lines.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(MQLS_CSV)) {
    console.error(`❌ Arquivo não encontrado: ${MQLS_CSV}`)
    console.error('   Execute primeiro: node scripts/export-mqls-2026.js')
    process.exit(1)
  }
  if (!fs.existsSync(BUYERS_CSV)) {
    console.error(`❌ Arquivo não encontrado: ${BUYERS_CSV}`)
    console.error('   Execute primeiro: node scripts/export-buyers-2026.js')
    process.exit(1)
  }

  console.log('📊 Analisando MQLs de 2026...')
  const mqlContent = fs.readFileSync(MQLS_CSV, 'utf8')
  const mqlRows = parseCSV(mqlContent)
  console.log(`   ${mqlRows.length} MQLs carregados`)
  const mqlReport = generateReport(mqlRows, 'MQLs de 2026', false)
  fs.writeFileSync(OUT_MQLS, mqlReport, 'utf8')
  console.log(`   ✅ Relatório salvo: ${OUT_MQLS}`)

  console.log('\n📊 Analisando Comprantes de 2026...')
  const buyersContent = fs.readFileSync(BUYERS_CSV, 'utf8')
  const buyersRows = parseCSV(buyersContent)
  console.log(`   ${buyersRows.length} comprantes carregados`)
  const buyersReport = generateReport(buyersRows, 'Comprantes de 2026', true)
  fs.writeFileSync(OUT_BUYERS, buyersReport, 'utf8')
  console.log(`   ✅ Relatório salvo: ${OUT_BUYERS}`)

  console.log('\n✅ Análise de persona concluída!')
  console.log(`   - ${OUT_MQLS}`)
  console.log(`   - ${OUT_BUYERS}`)
}

main().catch(err => { console.error('❌ Erro:', err.message); process.exit(1) })
