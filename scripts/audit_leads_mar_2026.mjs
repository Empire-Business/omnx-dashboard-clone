import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const CSV_PATH = path.join(ROOT, 'Leads mar:26', '820ccff9-010b-4e7e-836a-6c01771aac5d.csv')
const REPORT_JSON_PATH = path.join(ROOT, 'docs', 'LEADS-MAR-2026-DATAS-OPORTUNIDADES-report.json')
const REPORT_MD_PATH = path.join(ROOT, 'docs', 'LEADS-MAR-2026-DATAS-OPORTUNIDADES.md')
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')

const MODE = process.argv.includes('--apply') ? 'apply' : 'audit'
const DRY_RUN = process.argv.includes('--dry-run')
const MAX_MINUTES_OK = 10

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return Object.fromEntries(
    raw
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=')
        if (idx === -1) return null
        return [line.slice(0, idx), line.slice(idx + 1)]
      })
      .filter(Boolean),
  )
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function normalizeEmail(value = '') {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePhone(value = '') {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function normalizeName(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function monthFromShortName(shortName) {
  const map = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  }

  return map[shortName.toLowerCase()] ?? null
}

function parseSubmissionDate(raw) {
  const match = raw.match(
    /^([A-Za-z]{3})\s+(\d+)(?:st|nd|rd|th)\s+(\d{4}),\s+(\d+):(\d+)\s+(am|pm)$/i,
  )

  if (!match) return null

  const [, mon, day, year, hourRaw, minute, meridiem] = match
  const month = monthFromShortName(mon)
  if (!month) return null

  let hour = Number(hourRaw)
  if (meridiem.toLowerCase() === 'pm' && hour !== 12) hour += 12
  if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0

  // O relatório do formulário usa o horário operacional do funil em BRT.
  // A coluna "Timezone" descreve o fuso do lead, mas não o timezone em que a
  // string de "Submission Date" foi serializada. Usar esse campo gera falsos
  // positivos exatos de 60/120/180/240 minutos.
  const offset = '-03:00'
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(
    hour,
  ).padStart(2, '0')}:${minute}:00${offset}`
  const date = new Date(iso)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatIsoLocal(date) {
  return date?.toISOString?.() ?? null
}

function minutesBetween(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  return Math.abs(a.getTime() - b.getTime()) / 60000
}

function escapeFilterValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function isoNowBrt() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(new Date())
    .replace(' ', ' ')
}

function buildLeadRows() {
  const csv = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseCsv(csv)
  const header = rows[0]
  const getIndex = (column) => {
    const idx = header.indexOf(column)
    if (idx === -1) throw new Error(`Coluna não encontrada no CSV: ${column}`)
    return idx
  }

  const idxName = getIndex('Qual é o seu nome completo?')
  const idxPhone = getIndex('Whastapp (com DDD)')
  const idxEmail = getIndex('Seu e-mail corporativo')
  const idxSubmission = getIndex('Submission Date')
  const idxTimezone = getIndex('Timezone')

  return rows.slice(1).map((row, index) => {
    const submissionAt = parseSubmissionDate(row[idxSubmission] ?? '')

    return {
      rowNumber: index + 2,
      name: row[idxName] ?? '',
      normalizedName: normalizeName(row[idxName] ?? ''),
      phone: row[idxPhone] ?? '',
      normalizedPhone: normalizePhone(row[idxPhone] ?? ''),
      email: row[idxEmail] ?? '',
      normalizedEmail: normalizeEmail(row[idxEmail] ?? ''),
      submissionRaw: row[idxSubmission] ?? '',
      submissionTimezone: row[idxTimezone] ?? '',
      submissionAt,
      submissionAtIso: formatIsoLocal(submissionAt),
    }
  })
}

function contactScore(lead, contact) {
  let score = 0

  if (normalizeEmail(contact.email) === lead.normalizedEmail) score += 70
  if (normalizePhone(contact.telefone) === lead.normalizedPhone) score += 70
  if (normalizeName(contact.nome) === lead.normalizedName) score += 20

  const contactCreatedAt = contact.date_created ? new Date(contact.date_created) : null
  const diffMinutes = minutesBetween(lead.submissionAt, contactCreatedAt)
  if (diffMinutes <= 10) score += 20
  else if (diffMinutes <= 60) score += 10
  else if (diffMinutes <= 1440) score += 3

  return score
}

function opportunityScore(lead, contact, opportunity) {
  let score = contactScore(lead, contact)

  if (normalizeEmail(opportunity.email_contato) === lead.normalizedEmail) score += 20
  if (normalizeName(opportunity.nome_contato) === lead.normalizedName) score += 10

  const updatedAt = opportunity.updated_at ? new Date(opportunity.updated_at) : null
  const dataLead = opportunity.data_lead_recebido ? new Date(opportunity.data_lead_recebido) : null

  const diffUpdatedMinutes = minutesBetween(lead.submissionAt, updatedAt)
  const diffLeadMinutes = minutesBetween(lead.submissionAt, dataLead)

  if (diffUpdatedMinutes <= 10) score += 25
  else if (diffUpdatedMinutes <= 60) score += 15
  else if (diffUpdatedMinutes <= 1440) score += 5

  if (diffLeadMinutes <= 5) score += 10
  else if (diffLeadMinutes <= 60) score += 4

  score -= Math.min(diffUpdatedMinutes, 10000) * 0.03
  score -= Math.min(diffLeadMinutes, 10000) * 0.01

  return score
}

async function fetchMatches(supabase, lead) {
  const orFilters = []
  if (lead.normalizedEmail) orFilters.push(`email.eq.${escapeFilterValue(lead.normalizedEmail)}`)
  if (lead.normalizedPhone) orFilters.push(`telefone.eq.${escapeFilterValue(`+${lead.normalizedPhone}`)}`)

  if (!orFilters.length) return { contatos: [], oportunidadesPorContato: new Map() }

  const { data: contatos, error: contatosError } = await supabase
    .from('contatos')
    .select('id, nome, email, telefone, date_created, updated_at')
    .or(orFilters.join(','))

  if (contatosError) {
    throw new Error(`Falha ao buscar contatos da linha ${lead.rowNumber}: ${contatosError.message}`)
  }

  const oportunidadesPorContato = new Map()
  for (const contato of contatos ?? []) {
    const { data: oportunidades, error: oppsError } = await supabase
      .from('oportunidades')
      .select(
        'id, contato_id, ghl_opportunity_id, nome_contato, email_contato, pipeline_name, status, data_lead_recebido, updated_at',
      )
      .eq('contato_id', contato.id)

    if (oppsError) {
      throw new Error(
        `Falha ao buscar oportunidades do contato ${contato.id} da linha ${lead.rowNumber}: ${oppsError.message}`,
      )
    }

    oportunidadesPorContato.set(contato.id, oportunidades ?? [])
  }

  return { contatos: contatos ?? [], oportunidadesPorContato }
}

function chooseBestMatch(lead, contatos, oportunidadesPorContato) {
  let best = null

  for (const contato of contatos) {
    const oportunidades = oportunidadesPorContato.get(contato.id) ?? []
    for (const oportunidade of oportunidades) {
      const score = opportunityScore(lead, contato, oportunidade)
      const dataLeadAt = oportunidade.data_lead_recebido ? new Date(oportunidade.data_lead_recebido) : null
      const updatedAt = oportunidade.updated_at ? new Date(oportunidade.updated_at) : null
      const contactCreatedAt = contato.date_created ? new Date(contato.date_created) : null

      const candidate = {
        lead,
        contato,
        oportunidade,
        score,
        diffLeadMinutes: minutesBetween(lead.submissionAt, dataLeadAt),
        diffUpdatedMinutes: minutesBetween(lead.submissionAt, updatedAt),
        diffContactMinutes: minutesBetween(lead.submissionAt, contactCreatedAt),
      }

      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best
}

function isMismatch(match) {
  return match.diffLeadMinutes > MAX_MINUTES_OK
}

async function buildAudit() {
  const env = parseEnvFile(ENV_PATH)
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const leads = buildLeadRows()

  const results = []
  for (const lead of leads) {
    const { contatos, oportunidadesPorContato } = await fetchMatches(supabase, lead)
    const best = chooseBestMatch(lead, contatos, oportunidadesPorContato)

    if (!best) {
      results.push({
        status: 'sem_match',
        rowNumber: lead.rowNumber,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        submissionRaw: lead.submissionRaw,
        submissionAtIso: lead.submissionAtIso,
      })
      continue
    }

    results.push({
      status: isMismatch(best) ? 'divergente' : 'ok',
      rowNumber: lead.rowNumber,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      submissionRaw: lead.submissionRaw,
      submissionAtIso: lead.submissionAtIso,
      contatoId: best.contato.id,
      contatoNome: best.contato.nome,
      contatoEmail: best.contato.email,
      contatoTelefone: best.contato.telefone,
      contatoDateCreated: best.contato.date_created,
      oportunidadeId: best.oportunidade.id,
      ghlOpportunityId: best.oportunidade.ghl_opportunity_id,
      pipelineName: best.oportunidade.pipeline_name,
      oportunidadeStatus: best.oportunidade.status,
      oportunidadeUpdatedAt: best.oportunidade.updated_at,
      dbDataLeadRecebido: best.oportunidade.data_lead_recebido,
      diffLeadMinutes: Number(best.diffLeadMinutes.toFixed(3)),
      diffUpdatedMinutes: Number(best.diffUpdatedMinutes.toFixed(3)),
      diffContactMinutes: Number(best.diffContactMinutes.toFixed(3)),
      score: Number(best.score.toFixed(3)),
    })
  }

  const divergentes = results.filter((row) => row.status === 'divergente')
  const semMatch = results.filter((row) => row.status === 'sem_match')
  const ok = results.filter((row) => row.status === 'ok')

  const oppFrequency = new Map()
  for (const row of results) {
    if (!row.oportunidadeId) continue
    oppFrequency.set(row.oportunidadeId, (oppFrequency.get(row.oportunidadeId) ?? 0) + 1)
  }

  const divergentesSeguros = []
  const divergentesAmbiguos = []
  for (const row of divergentes) {
    const frequency = oppFrequency.get(row.oportunidadeId) ?? 0
    const enriched = { ...row, duplicateRowsForSameOpportunity: frequency }
    if (frequency > 1) divergentesAmbiguos.push(enriched)
    else divergentesSeguros.push(enriched)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    sourceCsv: path.relative(ROOT, CSV_PATH),
    toleranceMinutes: MAX_MINUTES_OK,
    totalRows: results.length,
    ok: ok.length,
    divergentes: divergentes.length,
    divergentesSeguros: divergentesSeguros.length,
    divergentesAmbiguos: divergentesAmbiguos.length,
    semMatch: semMatch.length,
  }

  return {
    summary,
    results,
    divergentes,
    divergentesSeguros,
    divergentesAmbiguos,
    semMatch,
    ok,
    supabase,
  }
}

function writeReport({ summary, divergentes, divergentesSeguros, divergentesAmbiguos, semMatch }) {
  const payload = { summary, divergentes, divergentesSeguros, divergentesAmbiguos, semMatch }
  fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`)

  const lines = []
  lines.push('# Auditoria de datas das oportunidades - Leads mar/26')
  lines.push('')
  lines.push(`Atualizado em: ${isoNowBrt()} BRT`)
  lines.push('')
  lines.push(`- Fonte: \`${path.relative(ROOT, CSV_PATH)}\``)
  lines.push(`- Tolerância para considerar correto: até ${MAX_MINUTES_OK} minutos entre formulário e \`oportunidades.data_lead_recebido\``)
  lines.push(`- Total de linhas auditadas: ${summary.totalRows}`)
  lines.push(`- Corretas: ${summary.ok}`)
  lines.push(`- Divergentes: ${summary.divergentes}`)
  lines.push(`- Divergentes seguras para update automático: ${summary.divergentesSeguros}`)
  lines.push(`- Divergentes ambíguas (mesma oportunidade apareceu em mais de uma linha): ${summary.divergentesAmbiguos}`)
  lines.push(`- Sem match confiável: ${summary.semMatch}`)
  lines.push('')

  if (divergentesSeguros.length) {
    lines.push('## Registros divergentes seguros para update')
    lines.push('')
    lines.push('| Linha CSV | Nome | Email | Pipeline | Submission Date (ISO) | Banco atual | Diferença (min) | oportunidade_id |')
    lines.push('|---|---|---|---|---|---|---:|---|')
    for (const row of divergentesSeguros) {
      lines.push(
        `| ${row.rowNumber} | ${row.name} | ${row.email || row.phone} | ${row.pipelineName || ''} | ${row.submissionAtIso || ''} | ${row.dbDataLeadRecebido || ''} | ${row.diffLeadMinutes} | ${row.oportunidadeId} |`,
      )
    }
    lines.push('')
  }

  if (divergentesAmbiguos.length) {
    lines.push('## Registros divergentes ambíguos')
    lines.push('')
    lines.push('| Linha CSV | Nome | Email | Pipeline | Submission Date (ISO) | Banco atual | Diferença (min) | oportunidade_id | Repetições |')
    lines.push('|---|---|---|---|---|---|---:|---|---:|')
    for (const row of divergentesAmbiguos) {
      lines.push(
        `| ${row.rowNumber} | ${row.name} | ${row.email || row.phone} | ${row.pipelineName || ''} | ${row.submissionAtIso || ''} | ${row.dbDataLeadRecebido || ''} | ${row.diffLeadMinutes} | ${row.oportunidadeId} | ${row.duplicateRowsForSameOpportunity} |`,
      )
    }
    lines.push('')
  }

  if (semMatch.length) {
    lines.push('## Linhas sem match confiável')
    lines.push('')
    lines.push('| Linha CSV | Nome | Email | Telefone | Submission Date (ISO) |')
    lines.push('|---|---|---|---|---|')
    for (const row of semMatch) {
      lines.push(
        `| ${row.rowNumber} | ${row.name} | ${row.email || ''} | ${row.phone || ''} | ${row.submissionAtIso || ''} |`,
      )
    }
    lines.push('')
  }

  lines.push(`Relatório bruto em \`${path.relative(ROOT, REPORT_JSON_PATH)}\`.`)
  lines.push('')

  fs.writeFileSync(REPORT_MD_PATH, `${lines.join('\n')}\n`)
}

async function applyFixes(audit) {
  const targets = audit.divergentesSeguros.filter((row) => row.submissionAtIso && row.oportunidadeId)

  const applied = []
  for (const row of targets) {
    if (DRY_RUN) {
      applied.push({
        oportunidadeId: row.oportunidadeId,
        oldValue: row.dbDataLeadRecebido,
        newValue: row.submissionAtIso,
        updated: false,
      })
      continue
    }

    const { error } = await audit.supabase
      .from('oportunidades')
      .update({ data_lead_recebido: row.submissionAtIso })
      .eq('id', row.oportunidadeId)

    if (error) {
      throw new Error(`Falha ao atualizar oportunidade ${row.oportunidadeId}: ${error.message}`)
    }

    applied.push({
      oportunidadeId: row.oportunidadeId,
      oldValue: row.dbDataLeadRecebido,
      newValue: row.submissionAtIso,
      updated: true,
    })
  }

  return applied
}

async function main() {
  const audit = await buildAudit()
  writeReport(audit)

  let applied = []
  if (MODE === 'apply') {
    applied = await applyFixes(audit)
  }

  const output = {
    summary: audit.summary,
    reportJson: path.relative(ROOT, REPORT_JSON_PATH),
    reportMd: path.relative(ROOT, REPORT_MD_PATH),
    applied,
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
