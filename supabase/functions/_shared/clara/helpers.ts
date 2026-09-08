// Helpers compartilhados entre as edge functions da Clara

export const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L'

export interface OppRow {
  id: string
  contato_id: string
  sdr_name: string | null
  vendedor_closer: string | null
  pipeline_id: string | null
  data_lead_recebido: string | null
  data_conectado: string | null
  data_agendamento_reuniao: string | null
  data_realizacao_vendas: string | null
  data_qualificado: string | null
  data_negociacao: string | null
  data_fechado: string | null
  contatos: {
    tags: string | null
    utm_source: string | null
    utm_campaign: string | null
    owner_name: string | null
  } | null
}

export function isMqlByTag(contato: OppRow['contatos']): boolean {
  if (!contato?.tags) return false
  const raw = contato.tags
  let tags: string[]
  if (Array.isArray(raw)) {
    tags = raw.map(String)
  } else {
    try {
      const parsed = JSON.parse(raw)
      tags = Array.isArray(parsed) ? parsed.map(String) : raw.split(',').map((t) => t.trim())
    } catch {
      tags = raw.split(',').map((t) => t.trim())
    }
  }
  return tags.some((t) => t.toLowerCase() === 'mql')
}

export async function paginatedOpps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  buildFilter: (q: any) => any
): Promise<OppRow[]> {
  const PAGE = 1000
  const all: OppRow[] = []
  let page = 0
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('oportunidades')
      .select(
        'id, contato_id, sdr_name, vendedor_closer, pipeline_id, data_lead_recebido, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_qualificado, data_negociacao, data_fechado, contatos(tags, utm_source, utm_campaign, owner_name)'
      )
      .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
      .order('id')
      .range(page * PAGE, (page + 1) * PAGE - 1)
    q = buildFilter(q)
    const { data, error } = await q
    if (error) throw new Error(`Query error: ${error.message}`)
    all.push(...((data as OppRow[]) ?? []))
    if ((data?.length ?? 0) < PAGE) break
    page++
  }
  return all
}

export async function paginatedMetaAds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  start_date: string,
  end_date: string
): Promise<{ campaign_name: string; spend: number }[]> {
  const PAGE = 1000
  const all: { campaign_name: string; spend: number }[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('meta_ads_insights')
      .select('campaign_name, spend')
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date')
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(`meta_ads query error: ${error.message}`)
    all.push(...((data ?? []) as { campaign_name: string; spend: number }[]))
    if ((data?.length ?? 0) < PAGE) break
    page++
  }
  return all
}

export async function getClosedRevenue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  oppIds: string[]
): Promise<{ closedSet: Set<string>; revenueMap: Map<string, number> }> {
  const closedSet = new Set<string>()
  const revenueMap = new Map<string, number>()
  if (!oppIds.length) return { closedSet, revenueMap }
  for (let i = 0; i < oppIds.length; i += 500) {
    const batch = oppIds.slice(i, i + 500)
    const { data } = await supabase
      .from('vendas_fechamento')
      .select('oportunidade_id, valor_faturado, valor_entrada')
      .in('oportunidade_id', batch)
      .not('data_pagamento_entrada', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data ?? []) {
      closedSet.add(r.oportunidade_id)
      revenueMap.set(
        r.oportunidade_id,
        (revenueMap.get(r.oportunidade_id) ?? 0) + (r.valor_faturado ?? 0)
      )
    }
  }
  return { closedSet, revenueMap }
}

export function fmtBRL(n: number) {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function classifyComplexity(message: string): 'complex' | 'simple' {
  const complex = ['cpmql', 'roas', 'cohort', 'produtividade', 'campanha', 'funil', 'criativo', 'sdr', 'performance', 'ranking', 'leaderboard', 'breakdown', 'segmento']
  const lower = message.toLowerCase()
  if (complex.some((kw) => lower.includes(kw)) || message.length > 120) return 'complex'
  return 'simple'
}
