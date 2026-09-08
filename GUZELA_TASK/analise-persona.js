#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.join(__dirname, '..')
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const MQL_CSV = path.join(__dirname, 'mqls-2026.csv')
const COMP_CSV = path.join(__dirname, 'compradores-2026.csv')
const OUT_MQL = path.join(__dirname, 'analise-persona-mqls.md')
const OUT_COMP = path.join(__dirname, 'analise-persona-compradores.md')

// ───────────────────────────────────────────────────────────
// Utilitários CSV
// ───────────────────────────────────────────────────────────

// Parser CSV robusto — trata campos multi-linha corretamente
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const headers = []
  const rows = []

  let i = 0
  let isHeader = true
  let currentRow = []
  let field = ''
  let inQuotes = false

  const len = content.length
  while (i < len) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') { field += '"'; i += 2 }
      else if (ch === '"') { inQuotes = false; i++ }
      else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++ }
      else if (ch === ',') { currentRow.push(field); field = ''; i++ }
      else if (ch === '\r' && content[i + 1] === '\n') {
        currentRow.push(field); field = ''
        if (isHeader) { headers.push(...currentRow); isHeader = false }
        else {
          const obj = {}
          headers.forEach((h, idx) => { obj[h] = currentRow[idx] ?? '' })
          rows.push(obj)
        }
        currentRow = []; i += 2
      } else if (ch === '\n') {
        currentRow.push(field); field = ''
        if (isHeader) { headers.push(...currentRow); isHeader = false }
        else {
          const obj = {}
          headers.forEach((h, idx) => { obj[h] = currentRow[idx] ?? '' })
          rows.push(obj)
        }
        currentRow = []; i++
      } else { field += ch; i++ }
    }
  }
  // última linha sem newline final
  if (field || currentRow.length) {
    currentRow.push(field)
    if (!isHeader && currentRow.some(v => v)) {
      const obj = {}
      headers.forEach((h, idx) => { obj[h] = currentRow[idx] ?? '' })
      rows.push(obj)
    }
  }
  return rows
}

// ───────────────────────────────────────────────────────────
// Helpers de análise
// ───────────────────────────────────────────────────────────

function freq(arr) {
  const map = {}
  for (const v of arr) {
    if (!v || !v.trim()) continue
    map[v.trim()] = (map[v.trim()] || 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

function topN(entries, n = 10) {
  return entries.slice(0, n)
}

function pct(num, total) {
  if (!total) return '0%'
  return Math.round((num / total) * 100) + '%'
}

function extractTexts(rows, ...fields) {
  const texts = []
  for (const row of rows) {
    for (const f of fields) {
      const v = row[f]
      if (v && v.trim() && v.length > 10) texts.push(v.trim())
    }
  }
  return texts
}

function sampleTexts(texts, n = 40) {
  if (texts.length <= n) return texts
  const step = Math.floor(texts.length / n)
  return texts.filter((_, i) => i % step === 0).slice(0, n)
}

function extractAllFollowUps(rows) {
  const texts = []
  for (const row of rows) {
    for (let i = 1; i <= 15; i++) {
      const v = row[`follow_up_${i}`]
      if (v && v.trim() && v.length > 10) texts.push(v.trim())
    }
  }
  return texts
}

function avg(arr) {
  const nums = arr.filter(v => v && !isNaN(parseFloat(v))).map(parseFloat)
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function formatMoney(val) {
  return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function buildFreqSection(label, entries, total) {
  if (!entries.length) return `_Nenhum dado disponível_\n`
  return entries.map(([v, c]) => `- **${v}** — ${c}x (${pct(c, total)})`).join('\n') + '\n'
}

// ───────────────────────────────────────────────────────────
// Busca mensagens inbound do Supabase
// ───────────────────────────────────────────────────────────

// Busca os UUIDs de contatos a partir dos ghl_ids (TEXT) e depois busca mensagens
async function fetchInboundMessages(sb, ghlIds, maxPerGroup = 200) {
  if (!ghlIds.length) return []

  // 1. Resolver ghl_id → contato UUID (lotes de 50)
  const contaIdUUIDs = []
  const BATCH_ID = 50
  for (let i = 0; i < ghlIds.length; i += BATCH_ID) {
    const batch = ghlIds.slice(i, i + BATCH_ID)
    const { data, error } = await sb.from('contatos').select('id').in('ghl_id', batch)
    if (!error && data) contaIdUUIDs.push(...data.map(d => d.id))
    if (contaIdUUIDs.length >= 300) break // coletar até 300 UUIDs
  }
  if (!contaIdUUIDs.length) return []

  // 2. Buscar mensagens em lotes de 50 UUIDs por vez
  const messages = []
  const BATCH_UUID = 50
  for (let i = 0; i < contaIdUUIDs.length && messages.length < maxPerGroup; i += BATCH_UUID) {
    const batch = contaIdUUIDs.slice(i, i + BATCH_UUID)
    // Inclui direction=inbound e direction IS NULL (mensagens antigas sem classificação)
    const { data } = await sb
      .from('comunicacoes')
      .select('mensagem_body')
      .in('contato_id', batch)
      .or('direction.eq.inbound,direction.is.null')
      .in('channel', ['whatsapp', 'sms'])
      .not('mensagem_body', 'is', null)
      .order('data_comunicacao', { ascending: false })
      .limit(200)
    if (data) messages.push(...data.map(d => d.mensagem_body).filter(m => m && m.trim().length > 15))
  }
  return messages.slice(0, maxPerGroup)
}

// ───────────────────────────────────────────────────────────
// Gerador do relatório Markdown
// ───────────────────────────────────────────────────────────

function buildReport(label, rows, messages) {
  const total = rows.length
  if (!total) return `# Análise de Persona — ${label}\n\n_Nenhum dado encontrado._\n`

  // --- Quantitativos ---
  const statusFreq   = freq(rows.map(r => r.status))
  const pipelineFreq = freq(rows.map(r => r.pipeline_name))
  const sdrFreq      = freq(rows.map(r => r.sdr_name || r.owner_name))
  const lostFreq     = freq(rows.map(r => r.lost_reason).filter(Boolean))
  const utmFreq      = freq(rows.map(r => r.utm_source))
  const campFreq     = freq(rows.map(r => r.utm_campaign))
  const tagsAll      = rows.flatMap(r => (r.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
  const tagFreq      = freq(tagsAll)
  const faturFreq    = freq(rows.map(r => r.faturamento_anual))
  const tipoEmpFreq  = freq(rows.map(r => r.tipo_empresa))
  const conheceuFreq = freq(rows.map(r => r.como_nos_conheceu))
  const prodFreq     = freq(rows.map(r => r.produto_vendido).filter(Boolean))

  // Ticket médio (só compradores têm valor_faturado)
  const ticketMedio = avg(rows.map(r => r.valor_faturado))

  // --- Qualitativos ---
  const situacaoTexts   = sampleTexts(extractTexts(rows, 'situacao_atual'), 30)
  const obstaculosTexts = sampleTexts(extractTexts(rows, 'obstaculos'), 30)
  const visaoTexts      = sampleTexts(extractTexts(rows, 'visao_6_meses'), 30)
  const ajudaTexts      = sampleTexts(extractTexts(rows, 'preciso_ajuda_para'), 30)
  const objecoesTexts   = sampleTexts(extractTexts(rows, 'possiveis_objecoes'), 25)
  const followUps       = sampleTexts(extractAllFollowUps(rows), 30)
  const resumoTexts     = sampleTexts(extractTexts(rows, 'resumo_ia'), 20)
  const percepcaoTexts  = sampleTexts(extractTexts(rows, 'percepcao_closer'), 20)
  const errosTexts      = sampleTexts(extractTexts(rows, 'comunicacao_erros_atuais'), 20)
  const tendenciaTexts  = sampleTexts(extractTexts(rows, 'comunicacao_tendencia_mercado'), 15)
  const obsVendaTexts   = sampleTexts(extractTexts(rows, 'observacoes_venda'), 20)
  const msgsTexts       = sampleTexts(messages, 30)

  const data = new Date().toLocaleDateString('pt-BR')

  const lines = []

  lines.push(`# Análise de Persona — ${label}`)
  lines.push(`\n> Gerado em ${data} | Base: **${total} registros**\n`)
  lines.push(`---\n`)

  // ── INTRODUÇÃO ──────────────────────────────────────────
  lines.push(`## 1. INTRODUÇÃO — Slide do Título\n`)
  lines.push(`### O que esta audiência QUER alcançar (resultado desejado)\n`)
  lines.push(`_Extraído de: \`visao_6_meses\` + \`preciso_ajuda_para\`_\n`)
  if (visaoTexts.length) {
    lines.push(`**Visão de 6 meses declarada pelos leads:**\n`)
    visaoTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  if (ajudaTexts.length) {
    lines.push(`\n**O que precisam de ajuda para fazer:**\n`)
    ajudaTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n### O que esta audiência TEME (maior medo)\n`)
  lines.push(`_Extraído de: \`obstaculos\` + \`possiveis_objecoes\`_\n`)
  if (obstaculosTexts.length) {
    lines.push(`**Obstáculos declarados:**\n`)
    obstaculosTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n---\n`)

  // ── CONEXÃO COM A AUDIÊNCIA ──────────────────────────────
  lines.push(`## 2. CONEXÃO COM A AUDIÊNCIA\n`)

  // 2.1 Justifique suas falhas
  lines.push(`### 2.1 Justifique suas falhas\n`)
  lines.push(`_O que eles tentaram antes e por que não funcionou_\n`)
  lines.push(`_Extraído de: \`obstaculos\` + \`follow_up_*\` + mensagens inbound_\n`)
  if (obstaculosTexts.length) {
    lines.push(`**Obstáculos / tentativas anteriores:**\n`)
    obstaculosTexts.slice(0, 15).forEach(t => lines.push(`> "${t}"\n`))
  }
  if (followUps.length) {
    lines.push(`\n**Objeções e bloqueios nos follow-ups:**\n`)
    followUps.slice(0, 15).forEach(t => lines.push(`> "${t}"\n`))
  }
  if (msgsTexts.length) {
    lines.push(`\n**Trechos de mensagens reais (inbound WhatsApp/SMS):**\n`)
    msgsTexts.slice(0, 10).forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n`)

  // 2.2 Acalme seus medos
  lines.push(`### 2.2 Acalme seus medos\n`)
  lines.push(`_O que eles temem antes de investir_\n`)
  lines.push(`_Extraído de: \`possiveis_objecoes\` + \`situacao_atual\`_\n`)
  if (objecoesTexts.length) {
    lines.push(`**Objeções antecipadas / medos declarados:**\n`)
    objecoesTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  if (situacaoTexts.length) {
    lines.push(`\n**Situação atual (contexto de vida/negócio):**\n`)
    situacaoTexts.slice(0, 15).forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n`)

  // 2.3 Jogue pedras nos inimigos
  lines.push(`### 2.3 Jogue pedras nos inimigos\n`)
  lines.push(`_Obstáculos externos percebidos — o que está impedindo o sucesso deles_\n`)
  lines.push(`_Extraído de: \`comunicacao_erros_atuais\` + \`estudo_concorrentes\` + \`swot_ameacas\`_\n`)
  if (errosTexts.length) {
    lines.push(`**Erros atuais de comunicação / marketing:**\n`)
    errosTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  const ameacasTexts = sampleTexts(extractTexts(rows, 'swot_ameacas'), 15)
  if (ameacasTexts.length) {
    lines.push(`\n**Ameaças identificadas (SWOT):**\n`)
    ameacasTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  const concTexts = sampleTexts(extractTexts(rows, 'estudo_concorrentes'), 10)
  if (concTexts.length) {
    lines.push(`\n**Panorama competitivo percebido:**\n`)
    concTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n`)

  // 2.4 Confirme suas suspeitas
  lines.push(`### 2.4 Confirme suas suspeitas\n`)
  lines.push(`_O que eles já suspeitavam sobre o mercado antes de encontrar a solução_\n`)
  lines.push(`_Extraído de: \`comunicacao_tendencia_mercado\` + tags + resumo IA_\n`)
  if (tendenciaTexts.length) {
    lines.push(`**Tendências de mercado percebidas:**\n`)
    tendenciaTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  if (tagFreq.length) {
    lines.push(`\n**Tags mais frequentes (classificação do lead):**\n`)
    topN(tagFreq, 15).forEach(([v, c]) => lines.push(`- \`${v}\` — ${c}x`))
    lines.push(``)
  }
  if (resumoTexts.length) {
    lines.push(`\n**Resumo IA do lead (síntese do contexto):**\n`)
    resumoTexts.slice(0, 10).forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n`)

  // 2.5 Incentive seus sonhos
  lines.push(`### 2.5 Incentive seus sonhos\n`)
  lines.push(`_Aspirações declaradas e como a solução se conecta a elas_\n`)
  lines.push(`_Extraído de: \`visao_6_meses\` + \`plano_meta\` + \`preciso_ajuda_para\`_\n`)
  if (visaoTexts.length) {
    lines.push(`**Visão de 6 meses:**\n`)
    visaoTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  const planoTexts = sampleTexts(extractTexts(rows, 'plano_meta'), 15)
  if (planoTexts.length) {
    lines.push(`\n**Planos e metas declaradas:**\n`)
    planoTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  if (percepcaoTexts.length) {
    lines.push(`\n**Percepção do closer (o que o lead quer de verdade):**\n`)
    percepcaoTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  if (obsVendaTexts.length) {
    lines.push(`\n**Observações da venda (motivação de compra):**\n`)
    obsVendaTexts.forEach(t => lines.push(`> "${t}"\n`))
  }
  lines.push(`\n---\n`)

  // ── NOVA OPORTUNIDADE ────────────────────────────────────
  lines.push(`## 3. NOVA OPORTUNIDADE — Slide da Régua\n`)
  lines.push(`_Para quem é este produto / webinar / oferta_\n`)

  lines.push(`### 3.1 Perfil Demográfico e de Negócio\n`)
  if (faturFreq.length) {
    lines.push(`**Faturamento anual:**\n`)
    lines.push(buildFreqSection('faturamento_anual', topN(faturFreq, 8), total))
  }
  if (tipoEmpFreq.length) {
    lines.push(`**Tipo de empresa:**\n`)
    lines.push(buildFreqSection('tipo_empresa', topN(tipoEmpFreq, 8), total))
  }
  if (conheceuFreq.length) {
    lines.push(`**Como nos conheceu:**\n`)
    lines.push(buildFreqSection('como_nos_conheceu', topN(conheceuFreq, 8), total))
  }

  lines.push(`### 3.2 Maturidade Digital\n`)
  const investFreq = freq(rows.map(r => r.investe_trafego))
  if (investFreq.length) {
    lines.push(`**Investe em tráfego pago:**\n`)
    lines.push(buildFreqSection('investe_trafego', topN(investFreq, 5), total))
  }
  const treinFreq = freq(rows.map(r => r.treinamento_marketing))
  if (treinFreq.length) {
    lines.push(`**Já fez treinamento de marketing:**\n`)
    lines.push(buildFreqSection('treinamento_marketing', topN(treinFreq, 5), total))
  }
  const tempoFreq = freq(rows.map(r => r.tempo_usa_internet))
  if (tempoFreq.length) {
    lines.push(`**Tempo usando internet para negócios:**\n`)
    lines.push(buildFreqSection('tempo_usa_internet', topN(tempoFreq, 5), total))
  }

  lines.push(`### 3.3 Canal de Origem\n`)
  if (utmFreq.length) {
    lines.push(`**UTM Source (canal):**\n`)
    lines.push(buildFreqSection('utm_source', topN(utmFreq, 10), total))
  }
  if (campFreq.length) {
    lines.push(`**UTM Campaign (campanha):**\n`)
    lines.push(buildFreqSection('utm_campaign', topN(campFreq, 10), total))
  }
  lines.push(`\n---\n`)

  // ── DADOS QUANTITATIVOS ──────────────────────────────────
  lines.push(`## 4. DADOS QUANTITATIVOS\n`)
  lines.push(`**Total de registros:** ${total}\n`)

  if (ticketMedio > 0) {
    lines.push(`**Ticket médio:** ${formatMoney(ticketMedio)}\n`)
    const totalFat = rows.reduce((acc, r) => acc + (parseFloat(r.valor_faturado) || 0), 0)
    lines.push(`**Faturamento total (2026):** ${formatMoney(totalFat)}\n`)
  }

  if (statusFreq.length) {
    lines.push(`\n**Distribuição por Status:**\n`)
    lines.push(buildFreqSection('status', topN(statusFreq), total))
  }
  if (pipelineFreq.length) {
    lines.push(`\n**Distribuição por Pipeline:**\n`)
    lines.push(buildFreqSection('pipeline', topN(pipelineFreq, 8), total))
  }
  if (sdrFreq.length) {
    lines.push(`\n**Distribuição por SDR:**\n`)
    lines.push(buildFreqSection('sdr', topN(sdrFreq, 8), total))
  }
  if (lostFreq.length) {
    lines.push(`\n**Top motivos de perda:**\n`)
    lines.push(buildFreqSection('lost_reason', topN(lostFreq, 10), total))
  }
  if (prodFreq.length) {
    lines.push(`\n**Produto vendido:**\n`)
    lines.push(buildFreqSection('produto_vendido', topN(prodFreq, 8), total))
  }

  // SWOT síntese
  const forcasTexts = sampleTexts(extractTexts(rows, 'swot_forcas'), 10)
  const fraqTexts   = sampleTexts(extractTexts(rows, 'swot_fraquezas'), 10)
  const opTexts     = sampleTexts(extractTexts(rows, 'swot_oportunidades'), 10)
  if (forcasTexts.length || fraqTexts.length) {
    lines.push(`\n---\n`)
    lines.push(`## 5. SÍNTESE SWOT DA AUDIÊNCIA\n`)
    if (forcasTexts.length) {
      lines.push(`### Forças (o que eles já têm)\n`)
      forcasTexts.forEach(t => lines.push(`> "${t}"\n`))
    }
    if (fraqTexts.length) {
      lines.push(`\n### Fraquezas (onde precisam de ajuda)\n`)
      fraqTexts.forEach(t => lines.push(`> "${t}"\n`))
    }
    if (opTexts.length) {
      lines.push(`\n### Oportunidades percebidas\n`)
      opTexts.forEach(t => lines.push(`> "${t}"\n`))
    }
    if (ameacasTexts.length) {
      lines.push(`\n### Ameaças percebidas\n`)
      ameacasTexts.forEach(t => lines.push(`> "${t}"\n`))
    }
  }

  // Mensagens inbound
  if (msgsTexts.length) {
    lines.push(`\n---\n`)
    lines.push(`## 6. VOZ REAL DA AUDIÊNCIA — Mensagens WhatsApp/SMS (inbound)\n`)
    lines.push(`_Transcrições reais de como este público se comunica e o que fala_\n`)
    msgsTexts.forEach(t => lines.push(`> "${t}"\n`))
  }

  lines.push(`\n---\n`)
  lines.push(`_Fim do relatório — ${label} — ${total} registros analisados_\n`)

  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(ENV_PATH)) throw new Error(`Arquivo de ambiente não encontrado: ${ENV_PATH}`)
  if (!fs.existsSync(MQL_CSV)) throw new Error(`CSV de MQLs não encontrado. Rode export-mqls.js primeiro.`)
  if (!fs.existsSync(COMP_CSV)) throw new Error(`CSV de compradores não encontrado. Rode export-compradores.js primeiro.`)

  const env = {}
  for (const rawLine of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('Credenciais Supabase não encontradas no .env.local')
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  console.log('📊 Lendo CSVs exportados...')
  const mqlRows  = parseCSV(MQL_CSV)
  const compRows = parseCSV(COMP_CSV)
  console.log(`   MQLs: ${mqlRows.length} | Compradores: ${compRows.length}`)

  // Buscar ghl_ids únicos de cada grupo
  const mqlGhlIds  = [...new Set(mqlRows.map(r => r.ghl_id).filter(Boolean))]
  const compGhlIds = [...new Set(compRows.map(r => r.ghl_id).filter(Boolean))]

  console.log('\n💬 Buscando mensagens inbound dos MQLs no Supabase...')
  const mqlMsgs = await fetchInboundMessages(sb, mqlGhlIds, 200)
  console.log(`   ${mqlMsgs.length} mensagens de MQLs coletadas`)

  console.log('\n💬 Buscando mensagens inbound dos compradores no Supabase...')
  const compMsgs = await fetchInboundMessages(sb, compGhlIds, 200)
  console.log(`   ${compMsgs.length} mensagens de compradores coletadas`)

  console.log('\n✍️  Gerando relatório de persona — MQLs...')
  const reportMql = buildReport('MQLs 2026', mqlRows, mqlMsgs)
  fs.writeFileSync(OUT_MQL, reportMql, 'utf8')
  console.log(`   ✅ Salvo em: ${OUT_MQL}`)

  console.log('\n✍️  Gerando relatório de persona — Compradores...')
  const reportComp = buildReport('Compradores 2026', compRows, compMsgs)
  fs.writeFileSync(OUT_COMP, reportComp, 'utf8')
  console.log(`   ✅ Salvo em: ${OUT_COMP}`)

  console.log('\n🎉 Análise de persona concluída!\n')
}

main().catch(err => { console.error('❌ Erro:', err.message, err.stack); process.exit(1) })
