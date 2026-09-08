// ─── Formatadores de exibição ─────────────────────────────────────────────────
//
// Regra de tipos:
//   colunas DATE (data_conectado, data_fechado, etc.) → string "YYYY-MM-DD" do banco
//   colunas TIMESTAMPTZ (data_lead_recebido, date_created) → string ISO completa do banco
//
// fmtDate() é inteligente: detecta o tipo pelo comprimento da string.

// "2026-02-21" → "21/02/2026"   (DATE — sem conversão de timezone)
// "2026-02-21T00:04:11.514Z" → "20/02/2026"   (TIMESTAMPTZ — converte para SP)
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  if (d.length === 10) {
    // Coluna DATE: "YYYY-MM-DD" — inversão simples, sem timezone
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }
  // Coluna TIMESTAMPTZ: extrai data no fuso São Paulo
  return new Date(d).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// "2026-02-21T00:04:11.514Z" → "20/02/2026 21:04"
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Timestamps do GHL (date_created) têm sufixo Z mas o valor já é BRT.
// Esta função exibe sem converter fuso — mostra o horário exatamente como o GHL gravou.
export function fmtDateTimeGHL(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "2026-02-21T00:04:11.514Z" → "20/02 21:04"  (sem ano — para listas de mensagens)
export function fmtMsgDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Helpers de data no fuso São Paulo ───────────────────────────────────────

// Hoje como YYYY-MM-DD no fuso São Paulo
export function spToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

// N dias atrás como YYYY-MM-DD no fuso São Paulo
export function spDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

// Converter ISO TIMESTAMPTZ para data "YYYY-MM-DD" no fuso São Paulo
// Usado em useCohort e computeCostPerMqlSeries para agrupar por data
export function tsToSPDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

// ─── Helpers para queries com data_lead_recebido (TIMESTAMPTZ) ────────────────
// Necessários porque data_lead_recebido continua TIMESTAMPTZ.
// Um lead que chegou às 00:30Z = 21:30 SP do dia anterior → filtro precisa de offset -03:00

export function toSPISOStart(date: string): string {
  return `${date}T00:00:00-03:00`
}

export function toSPISOEnd(date: string): string {
  return `${date}T23:59:59-03:00`
}

export function parseTags(raw: unknown): string[] | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const tags = trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0)
    return tags.length > 0 ? tags : null
  }
  if (Array.isArray(raw)) {
    const tags = raw.filter(t => typeof t === 'string' && t.trim().length > 0)
    return tags.length > 0 ? tags : null
  }
  return null
}
