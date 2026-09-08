#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const OUTPUT_DIR = path.join(ROOT, 'relatorio')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'cp-form-fb-relatorio.md')
const OUTPUT_CSV = path.join(OUTPUT_DIR, 'cp-form-fb-leads.csv')
const TAG_FILTER = '[cp] form-fb'
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

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatDateOnly(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-')
    return `${day}/${month}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    dateStyle: 'short',
  }).format(date)
}

function formatNumber(value) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return new Intl.NumberFormat('pt-BR').format(num)
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

function escapeCsv(value) {
  const normalized = value == null ? '' : String(value)
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

function escapeMarkdownCell(value) {
  return String(value == null || value === '' ? '—' : value).replace(/\|/g, '\\|')
}

function toBoolLabel(value) {
  return value ? 'Sim' : 'Nao'
}

function compactIso(value) {
  if (!value) return ''
  return String(value)
}

function pickLatestOpportunity(opps) {
  return [...opps].sort((a, b) => {
    const aTs = a.data_lead_recebido ? new Date(a.data_lead_recebido).getTime() : -Infinity
    const bTs = b.data_lead_recebido ? new Date(b.data_lead_recebido).getTime() : -Infinity
    if (aTs !== bTs) return bTs - aTs

    const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : -Infinity
    const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : -Infinity
    return bUpdated - aUpdated
  })[0] ?? null
}

function uniqueNonEmpty(values) {
  return [...new Set(values.filter(Boolean))]
}

function hasTag(tags, target) {
  if (!tags) return false
  const normalizedTarget = String(target).trim().toLowerCase()
  return String(tags)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedTarget)
}

function buildLeadRows({ contatos, oppsByContato, salesByOpp, commsByContato }) {
  return contatos
    .map((contato) => {
      const opps = oppsByContato.get(contato.id) ?? []
      const latestOpp = pickLatestOpportunity(opps)
      const comms = commsByContato.get(contato.id) ?? []
      const inboundComms = comms.filter((item) => item.direction === 'inbound')
      const whatsappComms = comms.filter((item) => item.channel === 'whatsapp')
      const outboundComms = comms.filter((item) => item.direction === 'outbound')

      const connectedOpps = opps.filter((item) => item.data_conectado)
      const scheduledOpps = opps.filter((item) => item.data_reuniao_agendada || item.data_agendamento_reuniao)
      const realizedOpps = opps.filter((item) => item.data_realizacao_vendas || item.data_reuniao_realizada)

      const sales = opps
        .flatMap((opp) => salesByOpp.get(opp.id) ?? [])
        .filter((sale) => sale.data_pagamento_entrada)

      const latestInbound = inboundComms[0] ?? null
      const latestWhatsapp = whatsappComms[0] ?? null
      const latestSale = [...sales].sort((a, b) => {
        const aTs = a.data_pagamento_entrada ? new Date(a.data_pagamento_entrada).getTime() : -Infinity
        const bTs = b.data_pagamento_entrada ? new Date(b.data_pagamento_entrada).getTime() : -Infinity
        return bTs - aTs
      })[0] ?? null

      const currentPipeline = latestOpp?.pipeline_name ?? ''
      const currentStatus = latestOpp?.status ?? ''
      const hasPhone = Boolean(contato.telefone)

      let currentSituation = 'Sem atividade'
      if (latestSale) currentSituation = 'Venda paga'
      else if (realizedOpps.length) currentSituation = 'Reuniao realizada'
      else if (scheduledOpps.length) currentSituation = 'Reuniao marcada'
      else if (connectedOpps.length) currentSituation = 'Conectado'
      else if (inboundComms.length) currentSituation = 'Respondeu'
      else if (outboundComms.length) currentSituation = 'Abordado sem resposta'

      return {
        contato_id: contato.id,
        nome: contato.nome ?? '',
        email: contato.email ?? '',
        telefone: contato.telefone ?? '',
        tags: contato.tags ?? '',
        is_mql: hasTag(contato.tags, 'mql'),
        oportunidades_total: opps.length,
        pipeline_atual: currentPipeline,
        status_atual: currentStatus,
        data_lead_atual: latestOpp?.data_lead_recebido ?? '',
        sdr_name: latestOpp?.sdr_name ?? '',
        closer_name: latestOpp?.vendedor_closer ?? '',
        respondeu: inboundComms.length > 0,
        qtd_respostas_inbound: inboundComms.length,
        ultima_resposta_em: latestInbound?.data_comunicacao ?? '',
        foi_conectado: connectedOpps.length > 0,
        primeira_data_conectado: [...connectedOpps]
          .map((item) => item.data_conectado)
          .sort()[0] ?? '',
        ultima_data_conectado: [...connectedOpps]
          .map((item) => item.data_conectado)
          .sort()
          .at(-1) ?? '',
        tem_reuniao_marcada: scheduledOpps.length > 0,
        ultima_data_reuniao_marcada: uniqueNonEmpty([
          ...scheduledOpps.map((item) => item.data_reuniao_agendada),
          ...scheduledOpps.map((item) => item.data_agendamento_reuniao),
        ]).sort().at(-1) ?? '',
        reuniao_realizada: realizedOpps.length > 0,
        ultima_data_reuniao_realizada: uniqueNonEmpty([
          ...realizedOpps.map((item) => item.data_realizacao_vendas),
          ...realizedOpps.map((item) => item.data_reuniao_realizada),
        ]).sort().at(-1) ?? '',
        tem_venda: sales.length > 0,
        data_pagamento_entrada: latestSale?.data_pagamento_entrada ?? '',
        valor_faturado: latestSale?.valor_faturado ?? '',
        produto_vendido: latestSale?.produto_vendido ?? '',
        tem_telefone_cadastrado: hasPhone,
        tem_conversa_whatsapp: whatsappComms.length > 0,
        ultima_interacao_whatsapp_em: latestWhatsapp?.data_comunicacao ?? '',
        canais_comunicacao: uniqueNonEmpty(comms.map((item) => item.channel)).join(', '),
        situacao_resumida: currentSituation,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function buildMarkdown(rows, generatedAt) {
  const total = rows.length
  const count = (predicate) => rows.filter(predicate).length
  const pct = (value) => (total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%')

  const respondeu = count((row) => row.respondeu)
  const mqls = count((row) => row.is_mql)
  const conectados = count((row) => row.foi_conectado)
  const reunioesMarcadas = count((row) => row.tem_reuniao_marcada)
  const reunioesRealizadas = count((row) => row.reuniao_realizada)
  const vendas = count((row) => row.tem_venda)
  const telefone = count((row) => row.tem_telefone_cadastrado)
  const whatsapp = count((row) => row.tem_conversa_whatsapp)
  const semResposta = rows.filter((row) => !row.respondeu)
  const semConexao = rows.filter((row) => !row.foi_conectado)
  const semReuniao = rows.filter((row) => !row.tem_reuniao_marcada)
  const comVenda = rows.filter((row) => row.tem_venda)
  const multiplasOpps = rows.filter((row) => row.oportunidades_total > 1)
  const abordadosSemResposta = rows.filter(
    (row) => row.situacao_resumida === 'Abordado sem resposta',
  )

  const headline = [
    `${mqls}/${total} sao MQLs`,
    `${respondeu}/${total} responderam`,
    `${conectados}/${total} foram conectados`,
    `${reunioesMarcadas}/${total} tiveram reuniao marcada`,
    `${vendas}/${total} tiveram venda paga`,
  ].join(', ')

  const insightLines = []
  insightLines.push(`- A base atual tem **${total} leads** com a tag \`${TAG_FILTER}\`.`)
  insightLines.push(`- Desses, **${mqls} leads** estao marcados como **MQL** pela tag \`mql\`.`)
  insightLines.push(`- O grupo esta concentrado em topo e meio de funil: **${pct(respondeu)}** respondeu e **${pct(conectados)}** chegou ao marco de conexao.`)
  insightLines.push(`- Reuniao ainda nao avancou nesse recorte: **${reunioesMarcadas} leads** com reuniao marcada, **${reunioesRealizadas}** com reuniao realizada e **${vendas}** com venda paga.`)
  insightLines.push(`- Em WhatsApp, **${telefone}** têm telefone cadastrado e **${whatsapp}** já possuem conversa registrada no canal.`)
  if (abordadosSemResposta.length) {
    insightLines.push(`- Ha **${abordadosSemResposta.length} leads abordados sem resposta**, que sao o principal grupo para follow-up operacional.`)
  }
  if (multiplasOpps.length) {
    insightLines.push(`- **${multiplasOpps.length} leads** possuem multiplas oportunidades; o snapshot abaixo usa a oportunidade mais recente e preserva os eventos historicos do lead.`)
  }

  const lines = []
  lines.push(`# Relatorio de Leads ${TAG_FILTER}`)
  lines.push('')
  lines.push(`Gerado em: ${formatDateTime(generatedAt)}`)
  lines.push('')
  lines.push('## Resumo Executivo')
  lines.push('')
  lines.push(headline)
  lines.push('')
  lines.push('## Totais')
  lines.push('')
  lines.push('| Metrica | Quantidade | Percentual |')
  lines.push('| --- | ---: | ---: |')
  lines.push(`| Leads | ${total} | 100.0% |`)
  lines.push(`| MQLs | ${mqls} | ${pct(mqls)} |`)
  lines.push(`| Responderam | ${respondeu} | ${pct(respondeu)} |`)
  lines.push(`| Nao responderam | ${total - respondeu} | ${pct(total - respondeu)} |`)
  lines.push(`| Conectados | ${conectados} | ${pct(conectados)} |`)
  lines.push(`| Nao conectados | ${total - conectados} | ${pct(total - conectados)} |`)
  lines.push(`| Reuniao marcada | ${reunioesMarcadas} | ${pct(reunioesMarcadas)} |`)
  lines.push(`| Reuniao realizada | ${reunioesRealizadas} | ${pct(reunioesRealizadas)} |`)
  lines.push(`| Venda paga | ${vendas} | ${pct(vendas)} |`)
  lines.push('')
  lines.push('## WhatsApp')
  lines.push('')
  lines.push('| Metrica | Quantidade | Percentual |')
  lines.push('| --- | ---: | ---: |')
  lines.push(`| Com telefone cadastrado | ${telefone} | ${pct(telefone)} |`)
  lines.push(`| Sem telefone cadastrado | ${total - telefone} | ${pct(total - telefone)} |`)
  lines.push(`| Com conversa em WhatsApp | ${whatsapp} | ${pct(whatsapp)} |`)
  lines.push(`| Sem conversa em WhatsApp | ${total - whatsapp} | ${pct(total - whatsapp)} |`)
  lines.push('')
  lines.push('## Analise')
  lines.push('')
  lines.push(...insightLines)
  lines.push('')
  lines.push('## Lista Nominal')
  lines.push('')
  lines.push('| Lead | Pipeline atual | Situacao | Respondeu | Conectado | Reuniao | Venda | WhatsApp |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')

  for (const row of rows) {
    const whatsappLabel = row.tem_conversa_whatsapp
      ? 'Conversa'
      : row.tem_telefone_cadastrado
        ? 'Telefone'
        : 'Nao'
    lines.push(
      `| ${escapeMarkdownCell(row.nome || '(sem nome)')} | ${escapeMarkdownCell(row.pipeline_atual)} | ${escapeMarkdownCell(row.situacao_resumida)} | ${toBoolLabel(row.respondeu)} | ${toBoolLabel(row.foi_conectado)} | ${toBoolLabel(row.tem_reuniao_marcada)} | ${toBoolLabel(row.tem_venda)} | ${escapeMarkdownCell(whatsappLabel)} |`,
    )
  }

  const renderLeadList = (title, subset, itemRenderer) => {
    lines.push('')
    lines.push(`## ${title}`)
    lines.push('')
    if (!subset.length) {
      lines.push('Nenhum lead neste grupo.')
      return
    }

    for (const row of subset) {
      lines.push(itemRenderer(row))
    }
  }

  renderLeadList('Sem Resposta', semResposta, (row) =>
    `- ${row.nome || '(sem nome)'} | pipeline: ${row.pipeline_atual || '—'} | situacao: ${row.situacao_resumida}`,
  )
  renderLeadList('Sem Conexao', semConexao, (row) =>
    `- ${row.nome || '(sem nome)'} | pipeline: ${row.pipeline_atual || '—'} | respondeu: ${toBoolLabel(row.respondeu)}`,
  )
  renderLeadList('Sem Reuniao Marcada', semReuniao, (row) =>
    `- ${row.nome || '(sem nome)'} | conectado: ${toBoolLabel(row.foi_conectado)} | situacao: ${row.situacao_resumida}`,
  )
  renderLeadList('Com Venda Paga', comVenda, (row) =>
    `- ${row.nome || '(sem nome)'} | produto: ${row.produto_vendido || '—'} | valor: ${formatCurrency(row.valor_faturado)} | pagamento: ${formatDateTime(row.data_pagamento_entrada)}`,
  )

  return `${lines.join('\n')}\n`
}

function buildCsv(rows) {
  const headers = [
    'contato_id',
    'nome',
    'email',
    'telefone',
    'tags',
    'is_mql',
    'oportunidades_total',
    'pipeline_atual',
    'status_atual',
    'data_lead_atual',
    'sdr_name',
    'closer_name',
    'respondeu',
    'qtd_respostas_inbound',
    'ultima_resposta_em',
    'foi_conectado',
    'primeira_data_conectado',
    'ultima_data_conectado',
    'tem_reuniao_marcada',
    'ultima_data_reuniao_marcada',
    'reuniao_realizada',
    'ultima_data_reuniao_realizada',
    'tem_venda',
    'data_pagamento_entrada',
    'valor_faturado',
    'produto_vendido',
    'tem_telefone_cadastrado',
    'tem_conversa_whatsapp',
    'ultima_interacao_whatsapp_em',
    'canais_comunicacao',
    'situacao_resumida',
  ]

  const body = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header]
        if (typeof value === 'boolean') return escapeCsv(toBoolLabel(value))
        return escapeCsv(value)
      })
      .join(','),
  )

  return `${headers.join(',')}\n${body.join('\n')}\n`
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

  const { data: contatos, error: contatosError } = await sb
    .from('contatos')
    .select('id,nome,email,telefone,tags')
    .ilike('tags', `%${TAG_FILTER}%`)
    .order('nome', { ascending: true })

  if (contatosError) throw contatosError
  if (!contatos?.length) throw new Error(`Nenhum contato encontrado com a tag ${TAG_FILTER}`)

  const contatoIds = contatos.map((item) => item.id)

  const { data: oportunidades, error: oppsError } = await sb
    .from('oportunidades')
    .select([
      'id',
      'contato_id',
      'pipeline_name',
      'status',
      'updated_at',
      'data_lead_recebido',
      'data_conectado',
      'data_agendamento_reuniao',
      'data_reuniao_agendada',
      'data_realizacao_vendas',
      'data_reuniao_realizada',
      'data_fechado',
      'data_perdido_vendas',
      'data_no_show_vendas',
      'sdr_name',
      'vendedor_closer',
    ].join(','))
    .in('contato_id', contatoIds)

  if (oppsError) throw oppsError

  const oppsByContato = new Map()
  for (const opp of oportunidades ?? []) {
    const items = oppsByContato.get(opp.contato_id) ?? []
    items.push(opp)
    oppsByContato.set(opp.contato_id, items)
  }

  const opportunityIds = (oportunidades ?? []).map((item) => item.id)
  const salesByOpp = new Map()
  if (opportunityIds.length) {
    const { data: sales, error: salesError } = await sb
      .from('vendas_fechamento')
      .select('oportunidade_id,data_pagamento_entrada,valor_faturado,produto_vendido')
      .in('oportunidade_id', opportunityIds)

    if (salesError) throw salesError

    for (const sale of sales ?? []) {
      const items = salesByOpp.get(sale.oportunidade_id) ?? []
      items.push(sale)
      salesByOpp.set(sale.oportunidade_id, items)
    }
  }

  const { data: comms, error: commsError } = await sb
    .from('comunicacoes')
    .select('contato_id,channel,direction,data_comunicacao')
    .in('contato_id', contatoIds)
    .order('data_comunicacao', { ascending: false })

  if (commsError) throw commsError

  const commsByContato = new Map()
  for (const comm of comms ?? []) {
    const items = commsByContato.get(comm.contato_id) ?? []
    items.push(comm)
    commsByContato.set(comm.contato_id, items)
  }

  const generatedAt = new Date().toISOString()
  const rows = buildLeadRows({
    contatos,
    oppsByContato,
    salesByOpp,
    commsByContato,
  })

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_CSV, buildCsv(rows), 'utf8')
  fs.writeFileSync(OUTPUT_MD, buildMarkdown(rows, generatedAt), 'utf8')

  const summary = {
    generated_at: compactIso(generatedAt),
    tag: TAG_FILTER,
    total_leads: rows.length,
    mqls: rows.filter((row) => row.is_mql).length,
    respondeu: rows.filter((row) => row.respondeu).length,
    conectados: rows.filter((row) => row.foi_conectado).length,
    reuniao_marcada: rows.filter((row) => row.tem_reuniao_marcada).length,
    reuniao_realizada: rows.filter((row) => row.reuniao_realizada).length,
    venda_paga: rows.filter((row) => row.tem_venda).length,
    telefone_cadastrado: rows.filter((row) => row.tem_telefone_cadastrado).length,
    conversa_whatsapp: rows.filter((row) => row.tem_conversa_whatsapp).length,
    output_md: path.relative(ROOT, OUTPUT_MD),
    output_csv: path.relative(ROOT, OUTPUT_CSV),
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
