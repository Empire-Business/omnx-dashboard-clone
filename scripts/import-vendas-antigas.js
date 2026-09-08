#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_CSV = path.join(
  ROOT,
  'vendas antigas',
  'VENDAS-FALTANTES-UTM-COMPLETO - VENDAS-FALTANTES-UTM-COMPLETO.csv',
)
const ENV_FILE = path.join(ROOT, 'eb-dash2', '.env.local')

const PIPELINE_ID = 'ZWuCjEXM2VDyLCx8CtGU'
const PIPELINE_NAME = 'Vendas SQL'
const IMPORT_SOURCE = 'importacao_manual_vendas_antigas_2026_03_31'
const FALLBACK_STAGE_ID = '17b7de75-9d2f-441c-a4f7-b119d439b47f'

function loadEnvFile(filePath) {
  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function parseCsv(content) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]
    const next = content[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(field)
      field = ''

      if (row.some((value) => value !== '')) {
        rows.push(row)
      }

      row = []
      continue
    }

    field += char
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((value) => value !== '')) {
      rows.push(row)
    }
  }

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map((header, index) =>
    header && header.trim() ? header.trim() : `__col_${index}`,
  )

  return dataRows.map((dataRow) => {
    const item = {}
    headers.forEach((header, index) => {
      item[header] = (dataRow[index] ?? '').trim()
    })
    return item
  })
}

function hashStable(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 16)
}

function toNull(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function parseMoney(value) {
  const normalized = toNull(value)
  if (!normalized) return null

  return Number(
    normalized
      .replace(/\s+/g, '')
      .replace(/R\$/gi, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  )
}

function parseInteger(value) {
  const normalized = toNull(value)
  if (!normalized) return null
  const parsed = Number.parseInt(normalized, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function parseBrazilDate(value) {
  const normalized = toNull(value)
  if (!normalized) return null

  const [datePart] = normalized.split(' ')
  const [day, month, year] = datePart.split('/')
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseBrazilDateTimeToOffset(value) {
  const normalized = toNull(value)
  if (!normalized) return null

  const [datePart, timePart = '00:00'] = normalized.split(' ')
  const [day, month, year] = datePart.split('/')
  const [hour, minute] = timePart.split(':')

  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00-03:00`
}

function dateToOffsetStart(value) {
  const dateOnly = parseBrazilDate(value)
  return dateOnly ? `${dateOnly}T00:00:00-03:00` : null
}

function normalizeRow(raw, stageId) {
  const cliente = raw.CLIENTE
  const email = toNull(raw.EMAIL)
  const whatsapp = toNull(raw.WHATSAPP)
  const cpfCnpj = toNull(raw.CPF_CNPJ)
  const produto = raw.PRODUTO
  const paymentDate = dateToOffsetStart(raw.DATA_PG_ENTRADA)
  const paymentDateOnly = parseBrazilDate(raw.DATA_PG_ENTRADA)
  const leadDate =
    parseBrazilDateTimeToOffset(raw.DATA_OPORTUNIDADE_GHL) ??
    dateToOffsetStart(raw.DATA_PG_ENTRADA)

  const stableContactId = `manual-legacy-contact-${hashStable([
    cliente,
    email ?? '',
    whatsapp ?? '',
    cpfCnpj ?? '',
  ])}`
  const stableOpportunityId = toNull(raw.GHL_ID)
    ? raw.GHL_ID
    : `manual-legacy-opp-${hashStable([cliente, raw.DATA_PG_ENTRADA, produto])}`

  return {
    cliente,
    email,
    whatsapp,
    cpfCnpj,
    instagram: toNull(raw.INSTAGRAM),
    produto,
    vendedor: toNull(raw.VENDEDOR),
    nicho: toNull(raw.NICHO),
    formaPagamento: toNull(raw.FORMA_PAGAMENTO),
    ghlOpportunityId: stableOpportunityId,
    ghlContactId: stableContactId,
    syntheticOpportunityId: !toNull(raw.GHL_ID),
    paymentDate,
    paymentDateOnly,
    leadDate,
    utmSource: toNull(raw.utm_source),
    utmCampaign: toNull(raw.utm_campaing),
    valorFaturado: parseMoney(raw['FATURAMENTO BRUTO']),
    valorEntrada: parseMoney(raw.CAIXA),
    numeroParcelas: parseInteger(raw['NUMERO DE PARCELAS']),
    valorParcela: parseMoney(raw.VALOR_PARCELA),
    linkContrato: toNull(raw.LINK_CLICKSIGN),
    pipelineStageId: stageId,
  }
}

function summarizeRows(rows) {
  return {
    totalRows: rows.length,
    syntheticOpportunityIds: rows.filter((row) => row.syntheticOpportunityId).length,
    leadDateFallbacks: rows.filter((row, index) => row.leadDate === dateToOffsetStart(rows[index].paymentDateOnly ? rows[index].paymentDateOnly.split('-').reverse().join('/') : null)).length,
  }
}

async function inferSignedStageId(supabase) {
  const { data, error } = await supabase
    .from('vendas_fechamento')
    .select('oportunidades!inner(pipeline_id,pipeline_name,pipeline_stage_id)')
    .not('data_da_assinatura_do_contrato', 'is', null)
    .limit(1000)

  if (error) {
    throw new Error(`Falha ao inferir stage de assinada: ${error.message}`)
  }

  const counts = new Map()

  for (const row of data ?? []) {
    const oportunidade = row.oportunidades
    if (!oportunidade) continue
    if (oportunidade.pipeline_id !== PIPELINE_ID) continue
    if (oportunidade.pipeline_name !== PIPELINE_NAME) continue
    if (!oportunidade.pipeline_stage_id) continue

    counts.set(
      oportunidade.pipeline_stage_id,
      (counts.get(oportunidade.pipeline_stage_id) ?? 0) + 1,
    )
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? FALLBACK_STAGE_ID
}

async function fetchExistingOpportunities(supabase, opportunityIds) {
  const { data, error } = await supabase
    .from('oportunidades')
    .select('id,ghl_opportunity_id')
    .in('ghl_opportunity_id', opportunityIds)

  if (error) {
    throw new Error(`Falha ao verificar oportunidades existentes: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.ghl_opportunity_id, row.id]))
}

async function upsertContacts(supabase, rows) {
  const payload = rows.map((row) => ({
    ghl_id: row.ghlContactId,
    nome: row.cliente,
    email: row.email,
    telefone: row.whatsapp,
    date_created: row.leadDate,
    utm_source: row.utmSource,
    utm_campaign: row.utmCampaign,
    owner_name: row.vendedor,
    closer_name: row.vendedor,
    country: 'BR',
  }))

  const { data, error } = await supabase
    .from('contatos')
    .upsert(payload, { onConflict: 'ghl_id' })
    .select('id,ghl_id')

  if (error) {
    throw new Error(`Falha no upsert de contatos: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.ghl_id, row.id]))
}

async function upsertOpportunities(supabase, rows, contactIdByGhlId) {
  const payload = rows.map((row) => ({
    ghl_opportunity_id: row.ghlOpportunityId,
    contato_id: contactIdByGhlId.get(row.ghlContactId),
    nome_contato: row.cliente,
    email_contato: row.email,
    titulo: row.produto,
    valor: row.valorFaturado ?? 0,
    status: 'won',
    pipeline_id: PIPELINE_ID,
    pipeline_name: PIPELINE_NAME,
    pipeline_stage_id: row.pipelineStageId,
    opportunity_source: IMPORT_SOURCE,
    vendedor_closer: row.vendedor,
    data_lead_recebido: row.leadDate,
    data_fechado: row.paymentDateOnly,
    openclaw_notificado_em: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('oportunidades')
    .upsert(payload, { onConflict: 'ghl_opportunity_id' })
    .select('id,ghl_opportunity_id')

  if (error) {
    throw new Error(`Falha no upsert de oportunidades: ${error.message}`)
  }

  return new Map((data ?? []).map((row) => [row.ghl_opportunity_id, row.id]))
}

async function upsertSales(supabase, rows, contactIdByGhlId, opportunityIdByGhlId) {
  const payload = rows.map((row) => ({
    oportunidade_id: opportunityIdByGhlId.get(row.ghlOpportunityId),
    contato_id: contactIdByGhlId.get(row.ghlContactId),
    nome_contratante: row.cliente,
    cpf_cnpj_contratante: row.cpfCnpj,
    produto_vendido: row.produto,
    forma_pagamento: row.formaPagamento,
    valor_entrada: row.valorEntrada ?? 0,
    numero_parcelas: row.numeroParcelas ?? 0,
    valor_parcela: row.valorParcela ?? 0,
    data_pagamento_entrada: row.paymentDate,
    data_da_assinatura_do_contrato: row.paymentDateOnly,
    op_link_do_contrato_assinado: row.linkContrato,
  }))

  const { data, error } = await supabase
    .from('vendas_fechamento')
    .upsert(payload, { onConflict: 'oportunidade_id' })
    .select('id,oportunidade_id')

  if (error) {
    throw new Error(`Falha no upsert de vendas_fechamento: ${error.message}`)
  }

  return data ?? []
}

async function validateImport(supabase, rows) {
  const opportunityIds = rows.map((row) => row.ghlOpportunityId)

  const { data: oportunidades, error: oppError } = await supabase
    .from('oportunidades')
    .select('id,ghl_opportunity_id,pipeline_id,pipeline_name,pipeline_stage_id,data_lead_recebido,data_fechado,openclaw_notificado_em')
    .in('ghl_opportunity_id', opportunityIds)

  if (oppError) {
    throw new Error(`Falha na validacao de oportunidades: ${oppError.message}`)
  }

  const importedOppIds = (oportunidades ?? []).map((row) => row.id)

  const { data: vendas, error: salesError } = await supabase
    .from('vendas_fechamento')
    .select('oportunidade_id,data_pagamento_entrada,data_da_assinatura_do_contrato,valor_faturado')
    .in('oportunidade_id', importedOppIds)

  if (salesError) {
    throw new Error(`Falha na validacao de vendas: ${salesError.message}`)
  }

  return {
    oportunidades: oportunidades ?? [],
    vendas: vendas ?? [],
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const csvArg = process.argv.find((arg) => arg.endsWith('.csv'))
  const csvPath = csvArg ? path.resolve(csvArg) : DEFAULT_CSV

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV nao encontrado: ${csvPath}`)
  }

  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`Arquivo de ambiente nao encontrado: ${ENV_FILE}`)
  }

  const env = loadEnvFile(ENV_FILE)
  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes em eb-dash2/.env.local')
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const rawRows = parseCsv(csvContent)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const signedStageId = await inferSignedStageId(supabase)
  const rows = rawRows.map((raw) => normalizeRow(raw, signedStageId))
  const opportunityIds = rows.map((row) => row.ghlOpportunityId)
  const existingOpportunities = await fetchExistingOpportunities(supabase, opportunityIds)

  const preflight = {
    csvPath,
    totalRows: rows.length,
    existingOpportunities: existingOpportunities.size,
    syntheticOpportunityIds: rows.filter((row) => row.syntheticOpportunityId).length,
    leadDateFallbacks: rawRows.filter((row) => !toNull(row.DATA_OPORTUNIDADE_GHL)).length,
    signedStageId,
    apply,
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', preflight }, null, 2))
    return
  }

  const contactIdByGhlId = await upsertContacts(supabase, rows)
  const opportunityIdByGhlId = await upsertOpportunities(supabase, rows, contactIdByGhlId)
  const vendas = await upsertSales(supabase, rows, contactIdByGhlId, opportunityIdByGhlId)
  const validation = await validateImport(supabase, rows)

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        preflight,
        results: {
          contatosUpserted: contactIdByGhlId.size,
          oportunidadesUpserted: opportunityIdByGhlId.size,
          vendasUpserted: vendas.length,
          validatedOpportunities: validation.oportunidades.length,
          validatedSales: validation.vendas.length,
        },
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
