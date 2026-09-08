import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages, fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { applyRecuperacaoFilter, RECUPERACAO_MODE_DEFAULT, type RecuperacaoMode, type RecuperacaoQueryLike } from '@/lib/constants'
import { spToday, spDaysAgo, toSPISOStart, toSPISOEnd, tsToSPDate } from '@/lib/utils/dates'
import { getWorkspaceId } from '@/lib/workspace'
import type { FilterValues } from '@/types/filters'
import { isFilterActive, applyFilterValue, normalizeAttribution, withSemAtribuicao } from '@/types/filters'

export { spToday, spDaysAgo }

// ─── Types ────────────────────────────────────────────────────

export interface TrafegoFilters {
  startDate: string   // YYYY-MM-DD SP
  endDate: string     // YYYY-MM-DD SP
  campaigns: FilterValues   // meta_ads campaign_name
  adsets: FilterValues
  ads: FilterValues
  channels: FilterValues    // utm_sources.utm_source (= contatos.utm_source)
  mediums: FilterValues     // utm_mediums.utm_medium (= contatos.utm_medium)
  funilTags: FilterValues   // funnels.nome
  cpTags: FilterValues      // utm_campaigns.nome
  mqlFilter: 'all' | 'mql'
  sdrs: FilterValues        // pré-vendedor: oportunidades.sdr_name (fallback contatos.owner_name)
  closers: FilterValues     // oportunidades.vendedor_closer (vazio = SEM_ATRIBUICAO)
  // Fase 15: filtro opcional por conta Meta (account_id). null/undefined =
  // "Todas (somado)" — nenhuma query muda. Com valor, as queries que leem
  // meta_ads_insights / meta_ads_account_daily ganham .eq('account_id', ...).
  // Leads (oportunidades) não têm account_id — não são afetados por design.
  metaAccountId?: string | null
}

export interface OppRow {
  id: string
  contato_id: string | null
  ghl_opportunity_id: string | null
  pipeline_name: string | null
  pipeline_id: string | null
  pipeline_stage_id?: string | null  // na prática guarda o nome do estágio (ex: "Conectado")
  lost_reason: string | null
  vendedor_closer: string | null
  status: string | null
  data_lead_recebido: string | null
  data_conectado: string | null
  data_qualificado: string | null
  data_no_show: string | null
  data_agendamento_reuniao: string | null
  data_reuniao_agendada: string | null
  data_realizacao_vendas: string | null
  data_fechado: string | null
  data_perdido: string | null
  data_perdido_vendas: string | null
  data_negociacao: string | null
  data_no_show_vendas: string | null
  data_agendamento_vendas: string | null
  appointment_status: string | null
  data_pendencias_preenchimento: string | null
  data_auto_agendamento: string | null
  resumo_ia: string | null
  percepcao_closer: string | null
  sdr_name: string | null

  // Origem do agendamento (IA vs humano)
  agendamento_origem: string | null
  agendamento_por_user_id: string | null
  agendamento_por_user_nome: string | null
  agendamento_por_user_email: string | null
  agendamento_calendar_id: string | null
  agendamento_calendar_name: string | null
  agendamento_assigned_user_id: string | null
  agendamento_assigned_user_nome: string | null

  contatos: {
    ghl_id: string
    nome: string | null
    email: string | null
    telefone: string | null
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_term: string | null
    utm_content: string | null
    fbclid: string | null
    gclid: string | null
    tt_source: string | null
    tt_campaign: string | null
    tt_medium: string | null
    tt_term: string | null
    tt_content: string | null
    owner_name: string | null
    owner_email: string | null
    closer_name?: string | null
    closer_email?: string | null
    date_created: string | null
    como_nos_conheceu: string | null
    faturamento_anual: string | null
    perfil_inteligente: string | null
    // Extended fields — only fetched in detail view (fetchLeadWithVendas)
    primeiro_nome?: string | null
    ultimo_nome?: string | null
    country?: string | null
    descricao_negocio?: string | null
    tipo_empresa?: string | null
    investe_trafego?: string | null
    treinamento_marketing?: string | null
    tempo_usa_internet?: string | null
    super_heroi_favorito?: string | null
    disponibilidade_barra?: string | null
    print_instagram?: string | null
    tags?: string | null
    contact_source?: string | null
    situacao_atual?: string | null
    preciso_ajuda_para?: string | null
    obstaculos?: string | null
    visao_6_meses?: string | null
    plano_meta?: string | null
    situacao_investimentos?: string | null
    possiveis_objecoes?: string | null
    swot_forcas?: string | null
    swot_fraquezas?: string | null
    swot_oportunidades?: string | null
    swot_ameacas?: string | null
    follow_up_1?: string | null
    follow_up_2?: string | null
    follow_up_3?: string | null
    follow_up_4?: string | null
    follow_up_5?: string | null
    follow_up_6?: string | null
    follow_up_7?: string | null
    follow_up_8?: string | null
    follow_up_9?: string | null
    follow_up_10?: string | null
    follow_up_11?: string | null
    follow_up_12?: string | null
    follow_up_13?: string | null
    follow_up_14?: string | null
    follow_up_15?: string | null
    comunicacao_veredito?: string | null
    comunicacao_erros_atuais?: string | null
    comunicacao_tendencia_mercado?: string | null
    analise_oferta_principal?: string | null
    banco_ideias_conteudo?: string | null
    canais_venda_recomendados?: string | null
    analise_gap_pontos_fracos?: string | null
    estudo_concorrentes?: string | null
    estrategia_antibrjection_scripts?: string | null
    plano_acao_passo_a_passo?: string | null
    id_analise?: string | null
    link_analise?: string | null
    status_analise?: string | null
    data_analise?: string | null
    // Campos GHL sem correspondência no vocabulário fixo do Empire — exibição
    // passiva no LeadCard, nunca entra em métrica/funil (docs/GHL-CAMPOS-EXTRAS.md).
    custom_fields?: Record<string, string> | null
  } | null
}

// Total oficial de investimento por dia (level=account da Meta). Fonte de
// verdade para "Investimento Total" — NUNCA somar MetaRow.spend para o total,
// pois a soma por anúncio pode superestimar bastante o gasto real da conta
// (ver docs/BUG-FIX-META-ADS-TIME-INCREMENT.md).
export interface MetaAccountDailyRow {
  date: string
  spend: number | null
}

export interface MetaRow {
  spend: number | null
  impressions: number | null
  clicks: number | null
  ctr: number | null
  cpm: number | null
  landing_page_views: number | null
  video_views: number | null
  link_clicks: number | null
  leads: number | null
  actions: unknown
  campaign_name: string | null
  adset_name: string | null
  ad_name: string | null
  date: string | null
}

/** Item do cronograma de pagamentos enviado pelo omnx-desk (jsonb `pagamentos`). */
export interface PagamentoVenda {
  data?: string | null      // 'YYYY-MM-DD'
  valor?: number | string | null
  sinal?: string | null     // 'Entrada', 'Parcela 1', ...
  forma?: string | null
  plataforma?: string | null
}

export interface RevenueRow {
  oportunidade_id: string
  valor_faturado: number | null
  valor_entrada: number | null
  data_pagamento_entrada: string | null
  link_gravacao_call_vendas?: string | null
  /** Cronograma completo. Só as vendas vindas do omnx-desk têm; do GHL vem vazio. */
  pagamentos?: PagamentoVenda[] | null
  // Campos de contrato — usados pelo card "Sem contrato assinado" (Vendas → Geral).
  // A venda entra no faturamento assim que tem `data_pagamento_entrada`; a assinatura
  // é acompanhada em separado, sem descontar nada do total.
  nome_contratante?: string | null
  produto_vendido?: string | null
  origem?: string | null
  op_link_do_contrato_assinado?: string | null
  data_da_assinatura_do_contrato?: string | null
  /** Status do contrato no omnx-desk (rascunho/ativo/concluido/cancelado/pausado). */
  contrato_status?: string | null
}

export interface ChannelOption {
  nome: string
  slug: string
  publicCode?: string | null
}

export interface MediumOption {
  nome: string
  code: string
}

export interface FilterOptions {
  campaigns: string[]
  adsets: string[]
  ads: string[]
  channels: ChannelOption[]
  mediums: { code: string; nome: string }[]
  funilTags: string[]
  cpTags: string[]
  // Fase 15: contas Meta ativas do workspace (fonte: workspace_meta_ad_accounts).
  metaAccounts: string[]
  // Pré-vendedor (SDR) e Closer — cadastrados em ghl_users (papeis 'sdr'/'closer').
  // Sempre inclui o sentinela SEM_ATRIBUICAO (ver types/filters.ts) por último.
  sdrs: string[]
  closers: string[]
}

export interface SyncStatus {
  lastSync: string | null
  status: string | null
  recordsFetched: number | null
}

export interface TrafegoData {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  filterOptions: FilterOptions
  syncStatus: SyncStatus
  loading: boolean
  error: string | null
  excludedCount: number
  missingPageCodeFunnel: boolean
  missingCampaignMapping: boolean
}

export interface TrafegoDataset {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  excludedCount: number
  missingPageCodeFunnel: boolean
  missingCampaignMapping: boolean
}

// Internal: utm_campaigns cross-reference entry
interface UtmCampaignEntry {
  nome: string
  utm_campaign: string
  funnels: unknown
  page_code: string | null
}

// ─── Tag helpers ──────────────────────────────────────────────

export function parseTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Ignore JSON parse failures and fall back to CSV parsing.
    }
    return raw.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}

export function extractTagsByPrefix(tags: string[], prefix: string): string[] {
  return tags.filter((t) => t.startsWith(prefix))
}

// ─── MQL Detection (Tag-Based) ───────────────────────────────────

/**
 * Detecta se um contato é MQL verificando a TAG "MQL" no campo tags.
 * Um lead com TAG "MQL" é sempre MQL, independente do pipeline.
 *
 * @param contato - Contato (pode ter tags) ou null/undefined
 * @returns true se o contato tem a tag "MQL"
 */
export function isMqlByTag(contato: OppRow['contatos'] | null | undefined): boolean {
  if (!contato?.tags) return false
  const tags = parseTags(contato.tags)
  return tags.some((t) => t.toLowerCase() === 'mql')
}

// ─── Closer / Pré-vendedor (SDR) resolution ──────────────────────
// Pré-vendedor = SDR. Fonte primária: oportunidades.sdr_name (por
// oportunidade, via GHL Followers API). Fallback obrigatório:
// contatos.owner_name (regra "SDR Name Mandatory Fallback" do CLAUDE.md) —
// evita mostrar "sem atribuição" só porque o sync de followers ainda não
// rodou para aquele lead.
export function resolveSdrName(opp: {
  sdr_name?: string | null
  contatos?: { owner_name?: string | null } | null
}): string {
  return (opp.sdr_name || opp.contatos?.owner_name || '').trim()
}

// Closer = oportunidades.vendedor_closer. Sem fallback: diferente do SDR,
// não há regra de negócio equivalente para inferir o closer de outro campo —
// oportunidades sem closer atribuído são tratadas como "Sem atribuição"
// (ver SEM_ATRIBUICAO em types/filters.ts).
export function resolveCloserName(opp: { vendedor_closer?: string | null }): string {
  return (opp.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
}

export function isVendaExterna(o: { contatos?: { contact_source?: string | null; tags?: string | null } | null }): boolean {
  // contact_source vem com casing inconsistente no GHL ("Vendas Externas" vs
  // "vendas externas") — comparar case-insensitive para não perder vendas diretas.
  const src = (o.contatos?.contact_source ?? '').trim().toLowerCase()
  return (
    src === 'vendas externas' ||
    parseTags(o.contatos?.tags).some((t) => t.toLowerCase() === 'venda externa')
  )
}

// ─── Lead date filter ────────────────────────────────────────────
// Régua de período = data do LEAD (oportunidades.data_lead_recebido).
//
// Até 2026-07-31 o filtro usava a data de criação do CONTATO
// (contatos.date_created), com a intenção de manter o lead reciclado no
// mês em que entrou originalmente. Na prática isso escondia campanha:
// quando uma campanha pega base antiga, o contato "nasceu" fora do
// período e o lead sumia do painel — foi o que fez a campanha
// [cp] codigo-audiencia-08-26 mostrar 21 pessoas no dash contra 48 no CRM
// (27 delas eram contatos antigos que geraram oportunidade nova no mês).
//
// data_lead_recebido é a data canônica do lead segundo o CONCEITOS-NEGOCIO
// (COHORT filtra por ela) e é preenchida via API GHL pela sync-opp-dates.
// Fallback para date_created do contato só quando ela estiver nula, para
// não sumir com lead cujo sync ainda não rodou.
//
// Decisão do dono em 2026-07-31 (alcance global: Tráfego, Aquisição,
// Orgânico e Pré-Vendas). Ver docs/MUDANCAS.md.

export function filterByLeadDate(opps: OppRow[], startDate: string, endDate: string): OppRow[] {
  return opps.filter((r) => {
    const ref = r.data_lead_recebido ?? r.contatos?.date_created
    if (!ref) return true // sem nenhuma das duas datas: fallback inclusivo
    const refDate = tsToSPDate(ref)
    return refDate >= startDate && refDate <= endDate
  })
}

// ─── MQL deduplication helpers ──────────────────────────────────
// MQL é uma classificação do CONTATO (tag), não da oportunidade.
// Um contato com 2 opps deve contar como 1 MQL, não 2.
// Sempre usar estas funções ao contar ou listar MQLs nos dashboards.

/** Conta MQLs únicos por contato_id (ignora múltiplas opps do mesmo contato) */
export function countUniqueMqls(opps: OppRow[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const o of opps) {
    if (!isMqlByTag(o.contatos)) continue
    const key = o.contato_id ?? o.id
    if (seen.has(key)) continue
    seen.add(key)
    count++
  }
  return count
}

/** Filtra MQLs únicos por contato_id — usa a primeira opp do contato encontrada */
export function filterUniqueMqls(opps: OppRow[]): OppRow[] {
  const seen = new Set<string>()
  return opps.filter((o) => {
    if (!isMqlByTag(o.contatos)) return false
    const key = o.contato_id ?? o.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Campaign → Funnels Map ───────────────────────────────────
// Mapeia utm_campaign (código numérico) → array de nomes de funis,
// usando a coluna `funnels` JSONB de utm_campaigns.
// Usar isso para agrupar leads por funil, em vez de parseTags(contato.tags).
export function buildCampaignFunnelMap(
  campaigns: { utm_campaign: string | number | null; funnels: unknown }[]
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const c of campaigns) {
    if (c.utm_campaign == null) continue
    const key = String(c.utm_campaign)
    const funnels = parseTags(c.funnels)
    if (funnels.length > 0) {
      map.set(key, funnels)
    }
  }
  return map
}

// ─── Campaign → Name Map ─────────────────────────────────────
// Mapeia utm_campaign (código numérico) → nome amigável cadastrado em utm_campaigns.
export function buildCampaignNameMap(
  campaigns: { utm_campaign: string | number | null; nome: string | null }[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of campaigns) {
    if (c.utm_campaign == null || !c.nome) continue
    map.set(String(c.utm_campaign), c.nome)
  }
  return map
}

// ─── Main hook ────────────────────────────────────────────────

export async function loadTrafegoDataset(
  filters: TrafegoFilters,
  recuperacaoMode: RecuperacaoMode = RECUPERACAO_MODE_DEFAULT,
): Promise<TrafegoDataset> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const startISO = toSPISOStart(filters.startDate)
  const endISO = toSPISOEnd(filters.endDate)

  const [sourcesRes, campaignsRes] = await Promise.all([
    supabase.from('utm_sources').select('utm_source, public_code').eq('workspace_id', wid),
    supabase.from('utm_campaigns').select('nome, utm_campaign, funnels, page_code').eq('workspace_id', wid),
  ])

  if (sourcesRes.error) throw sourcesRes.error
  if (campaignsRes.error) throw campaignsRes.error

  const sourcesData = (sourcesRes.data ?? []) as { utm_source: string; public_code: string | null }[]
  const utmCampaigns = (campaignsRes.data ?? []) as UtmCampaignEntry[]
  const pagoSources = sourcesData.map((source) => source.utm_source).filter(Boolean)
  const sourcePublicCode = new Map(
    sourcesData
      .filter((source) => source.utm_source && source.public_code)
      .map((source) => [source.utm_source, source.public_code!])
  )

  const META_PAGE_SIZE = 1000
  // Builder novo a cada página: os do supabase-js são de uso único e as páginas
  // agora vão em paralelo (ver src/lib/supabase/paginate.ts).
  const makeMetaQuery = () => {
    let q = supabase
      .from('meta_ads_insights')
      .select('spend, impressions, clicks, ctr, cpm, actions, campaign_name, adset_name, ad_name, date, landing_page_views, video_views, link_clicks, leads')
      .eq('workspace_id', wid)
      .gte('date', filters.startDate)
      .lte('date', filters.endDate)
      .order('date', { ascending: true })
      // desempate único: (date, ad_id) é UNIQUE — sem isso a paginação
      // por range é instável e pode pular/duplicar linhas no corte da página
      .order('ad_id', { ascending: true })

    if (filters.metaAccountId) q = q.eq('account_id', filters.metaAccountId)
    if (filters.campaigns.include.length > 0) q = q.in('campaign_name', filters.campaigns.include)
    if (filters.adsets.include.length > 0) q = q.in('adset_name', filters.adsets.include)
    if (filters.ads.include.length > 0) q = q.in('ad_name', filters.ads.include)
    return q
  }

  let allMetaRows = await fetchAllPages<MetaRow>(makeMetaQuery, { pageSize: META_PAGE_SIZE })

  // Apply meta-ads exclude filters client-side after fetch
  if (filters.campaigns.exclude.length > 0) {
    const excSet = new Set(filters.campaigns.exclude)
    allMetaRows = allMetaRows.filter((r) => !excSet.has(r.campaign_name ?? ''))
  }
  if (filters.adsets.exclude.length > 0) {
    const excSet = new Set(filters.adsets.exclude)
    allMetaRows = allMetaRows.filter((r) => !excSet.has(r.adset_name ?? ''))
  }
  if (filters.ads.exclude.length > 0) {
    const excSet = new Set(filters.ads.exclude)
    allMetaRows = allMetaRows.filter((r) => !excSet.has(r.ad_name ?? ''))
  }

  // Total oficial de investimento (level=account da Meta) — só é válido como
  // TOTAL quando não há filtro de campanha/adset/ad (o level=account não tem
  // como ser quebrado por campanha). Com filtro de granularidade ativo, fica
  // vazio de propósito e os chamadores caem no fallback de somar por anúncio.
  const hasBreakdownFilter =
    filters.campaigns.include.length > 0 || filters.campaigns.exclude.length > 0 ||
    filters.adsets.include.length > 0 || filters.adsets.exclude.length > 0 ||
    filters.ads.include.length > 0 || filters.ads.exclude.length > 0

  let accountDailyRows: MetaAccountDailyRow[] = []
  if (!hasBreakdownFilter) {
    accountDailyRows = await fetchAllPages<MetaAccountDailyRow>(
      () => {
        let q = supabase
          .from('meta_ads_account_daily')
          .select('date, spend')
          .eq('workspace_id', wid)
          .gte('date', filters.startDate)
          .lte('date', filters.endDate)
          .order('date', { ascending: true })
        if (filters.metaAccountId) q = q.eq('account_id', filters.metaAccountId)
        return q
      },
      { pageSize: META_PAGE_SIZE },
    )
  }

  const PAGE_SIZE = 1000
  const OPP_SELECT = `
    id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
    lost_reason, vendedor_closer, status, sdr_name,
    data_lead_recebido, data_conectado, data_qualificado,
    data_no_show, data_agendamento_reuniao,
    data_realizacao_vendas, data_fechado,
    data_perdido, data_perdido_vendas, data_negociacao,
    data_no_show_vendas, data_agendamento_vendas,
    appointment_status,
    data_pendencias_preenchimento,
    resumo_ia, percepcao_closer,
    agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
    agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
    agendamento_assigned_user_id, agendamento_assigned_user_nome,
    contatos!inner(
      ghl_id, nome, email, telefone,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbclid, gclid,
      tt_source, tt_campaign, tt_medium, tt_term, tt_content,
      owner_name, owner_email, date_created, print_instagram,
      como_nos_conheceu, faturamento_anual, perfil_inteligente,
      tags,
      workspace_id
    )
  `

  // Cursor por data (não OFFSET): páginas profundas com este select estouravam o
  // statement_timeout — 500 no PostgREST.
  const allRows = await fetchAllPagesByTimeCursor<OppRow>(
    (cursor) =>
      (() => {
        const base = supabase
          .from('oportunidades')
          .select(OPP_SELECT)
          .eq('workspace_id', wid)
          .gte('data_lead_recebido', cursor ?? startISO)
          .lte('data_lead_recebido', endISO)
        return (
          applyRecuperacaoFilter(base as unknown as RecuperacaoQueryLike, recuperacaoMode) as unknown as typeof base
        )
          .order('data_lead_recebido', { ascending: true })
          .order('id', { ascending: true }) as never
      })(),
    { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
  )

  let rows = allRows
  let excludedCount = 0

  if (pagoSources.length > 0) {
    const pagoSet = new Set(pagoSources)
    const paid = rows.filter((row) => {
      const source = row.contatos?.utm_source
      return source != null && source !== '' && pagoSet.has(source)
    })
    excludedCount = rows.length - paid.length
    rows = paid
  }

  if (isFilterActive(filters.channels)) {
    rows = rows.filter((row) => {
      const src = row.contatos?.utm_source ?? ''
      if (filters.channels.exclude.includes(src)) return false
      if (filters.channels.include.length > 0) return filters.channels.include.includes(src)
      return true
    })
  }

  if (isFilterActive(filters.mediums)) {
    rows = rows.filter((row) => {
      const medium = row.contatos?.utm_medium ?? ''
      if (filters.mediums.exclude.includes(medium)) return false
      if (filters.mediums.include.length > 0) return filters.mediums.include.includes(medium)
      return true
    })
  }

  if (isFilterActive(filters.funilTags)) {
    const includeCodes = filters.funilTags.include.length > 0
      ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f))).map((c) => String(c.utm_campaign)))
      : null
    const excludeCodes = filters.funilTags.exclude.length > 0
      ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f))).map((c) => String(c.utm_campaign)))
      : null
    if (includeCodes !== null && includeCodes.size === 0) {
      rows = []
    } else {
      rows = rows.filter((row) => {
        const uc = row.contatos?.utm_campaign
        const code = uc != null ? String(uc) : ''
        if (excludeCodes && excludeCodes.has(code)) return false
        if (includeCodes !== null) return includeCodes.has(code)
        return true
      })
    }
  }

  if (isFilterActive(filters.cpTags)) {
    const includeCodes = filters.cpTags.include.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.cpTags.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
      : null
    const excludeCodes = filters.cpTags.exclude.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.cpTags.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
      : null
    if (includeCodes !== null && includeCodes.size === 0) {
      rows = []
    } else {
      rows = rows.filter((row) => {
        const uc = row.contatos?.utm_campaign
        const code = uc != null ? String(uc) : ''
        if (excludeCodes && excludeCodes.has(code)) return false
        if (includeCodes !== null) return includeCodes.has(code)
        return true
      })
    }
  }

  if (isFilterActive(filters.ads)) {
    rows = rows.filter((row) => {
      const term = row.contatos?.utm_term ?? ''
      if (filters.ads.exclude.includes(term)) return false
      if (filters.ads.include.length > 0) return filters.ads.include.includes(term)
      return true
    })
  }

  let isMissingCampaignMapping = false
  if (isFilterActive(filters.campaigns)) {
    const includeCodes = filters.campaigns.include.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.campaigns.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
      : null
    const excludeCodes = filters.campaigns.exclude.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.campaigns.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
      : null
    if (includeCodes !== null && includeCodes.size === 0) {
      rows = []
      isMissingCampaignMapping = true
    } else {
      rows = rows.filter((row) => {
        const uc = row.contatos?.utm_campaign
        const code = uc != null ? String(uc) : ''
        if (excludeCodes && excludeCodes.has(code)) return false
        if (includeCodes !== null) return includeCodes.has(code)
        return true
      })
    }
  }

  const filteredOppIdsSet = new Set(rows.map((row) => row.id))
  let revenueRows: RevenueRow[] = []
  if (filteredOppIdsSet.size > 0) {
    const REV_PAGE_SIZE = 1000
    const allRevenueRaw = await fetchAllPages<RevenueRow>(
      () =>
        supabase
          .from('vendas_fechamento')
          .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas')
          .eq('workspace_id', wid)
          .gte('data_pagamento_entrada', startISO)
          .order('oportunidade_id', { ascending: true }) as unknown as {
          range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }>
        },
      { pageSize: REV_PAGE_SIZE },
    )
    revenueRows = allRevenueRaw.filter((row) => filteredOppIdsSet.has(row.oportunidade_id))
  }

  let finalMetaRows = allMetaRows
  if (isFilterActive(filters.channels)) {
    const includePCs = filters.channels.include.map((ch) => sourcePublicCode.get(ch)).filter(Boolean) as string[]
    const excludePCs = filters.channels.exclude.map((ch) => sourcePublicCode.get(ch)).filter(Boolean) as string[]
    if (includePCs.length > 0) {
      finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePCs.some((pc) => r.ad_name!.includes(pc)))
    }
    if (excludePCs.length > 0) {
      finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePCs.some((pc) => r.ad_name!.includes(pc)))
    }
  }

  let isMissingPageCode = false
  if (isFilterActive(filters.funilTags)) {
    const includePageCodes = filters.funilTags.include.length > 0
      ? utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f)) && c.page_code).map((c) => c.page_code!)
      : null
    const excludePageCodes = filters.funilTags.exclude.length > 0
      ? utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f)) && c.page_code).map((c) => c.page_code!)
      : []
    if (includePageCodes !== null) {
      if (includePageCodes.length > 0) {
        finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePageCodes.some((pc) => r.ad_name!.includes(pc)))
      } else {
        finalMetaRows = []
        isMissingPageCode = rows.length > 0
      }
    }
    if (excludePageCodes.length > 0) {
      finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePageCodes.some((pc) => r.ad_name!.includes(pc)))
    }
  }

  if (isFilterActive(filters.cpTags)) {
    if (filters.cpTags.include.length > 0) {
      const includePCs = utmCampaigns.filter((c) => filters.cpTags.include.includes(c.nome) && c.page_code).map((c) => c.page_code!)
      if (includePCs.length > 0) {
        finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePCs.some((pc) => r.ad_name!.includes(pc)))
      }
    }
    if (filters.cpTags.exclude.length > 0) {
      const excludePCs = utmCampaigns.filter((c) => filters.cpTags.exclude.includes(c.nome) && c.page_code).map((c) => c.page_code!)
      if (excludePCs.length > 0) {
        finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePCs.some((pc) => r.ad_name!.includes(pc)))
      }
    }
  }

  return {
    opps: rows,
    metaRows: finalMetaRows,
    accountDailyRows,
    revenueRows,
    excludedCount,
    missingPageCodeFunnel: isMissingPageCode,
    missingCampaignMapping: isMissingCampaignMapping,
  }
}

/**
 * Retorna uma referência estável para `value` que só muda quando `serialized`
 * muda — evita refetch quando o caller recria o objeto a cada render com o
 * mesmo conteúdo.
 */
function useDeepCompareValue<T>(value: T, serialized: string): T {
  const [stable, setStable] = useState<{ json: string; value: T }>({ json: serialized, value })
  if (stable.json !== serialized) {
    setStable({ json: serialized, value })
  }
  return stable.value
}

/** O que o dataset principal do Tráfego devolve — agora cacheado pelo TanStack Query. */
interface TrafegoQueryResult {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  excludedCount: number
  missingPageCodeFunnel: boolean
  missingCampaignMapping: boolean
}

const EMPTY_TRAFEGO_RESULT: TrafegoQueryResult = {
  opps: [],
  metaRows: [],
  accountDailyRows: [],
  revenueRows: [],
  excludedCount: 0,
  missingPageCodeFunnel: false,
  missingCampaignMapping: false,
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return (err as { message?: string })?.message ?? JSON.stringify(err)
}

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  campaigns: [],
  adsets: [],
  ads: [],
  channels: [],
  mediums: [],
  funilTags: [],
  cpTags: [],
  metaAccounts: [],
  sdrs: [],
  closers: [],
}

const EMPTY_SYNC_STATUS: SyncStatus = {
  lastSync: null,
  status: null,
  recordsFetched: null,
}

export function useTrafego(
  filters: TrafegoFilters,
  recuperacaoMode: RecuperacaoMode = RECUPERACAO_MODE_DEFAULT,
): TrafegoData {
  // Ref for cross-reference without causing re-renders
  const utmCampaignsRef = useRef<UtmCampaignEntry[]>([])
  const sourcePublicCodeRef = useRef<Map<string, string>>(new Map())

  // Opções de filtro (campanhas/adsets/ads do período) — também cacheadas.
  // A chave depende só do período e da conta Meta: mudar um filtro de canal não
  // precisa rebuscar a lista de opções.
  const optionsQuery = useQuery({
    queryKey: ['trafego', 'filter-options', filters.startDate, filters.endDate, filters.metaAccountId ?? null],
    queryFn: async (): Promise<{ options: FilterOptions; sync: SyncStatus } | null> => {
      {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useTrafego] No workspace found')
          return null
        }

        // Meta: paginar apenas campanhas com dados no período selecionado
        const META_PAGE_SIZE = 1000
        type MetaOptionRow = { campaign_name: string | null; adset_name: string | null; ad_name: string | null }
        const allMetaOptions = await fetchAllPages<MetaOptionRow>(
          () => {
            let q = supabase
              .from('meta_ads_insights')
              .select('campaign_name, adset_name, ad_name')
              .eq('workspace_id', wid)
              .not('campaign_name', 'is', null)
              .gte('date', filters.startDate)
              .lte('date', filters.endDate)
              // ordenação estável obrigatória para paginação por range
              .order('date', { ascending: true })
              .order('ad_id', { ascending: true })
            if (filters.metaAccountId) q = q.eq('account_id', filters.metaAccountId)
            return q
          },
          { pageSize: META_PAGE_SIZE },
        )

        const [sourcesRes, mediumsRes, funnelsRes, campaignsRes, syncRes, sdrUsersRes, closerUsersRes] = await Promise.all([
          supabase
            .from('utm_sources')
            .select('nome, utm_source, public_code')
            .eq('workspace_id', wid),
          supabase
            .from('utm_mediums')
            .select('nome, utm_medium')
            .eq('workspace_id', wid),
          supabase
            .from('funnels')
            .select('nome')
            .eq('workspace_id', wid),
          supabase
            .from('utm_campaigns')
            .select('nome, utm_campaign, funnels, page_code')
            .eq('workspace_id', wid),
          supabase
            .from('meta_ads_sync_log')
            .select('started_at, status, records_fetched')
            .eq('workspace_id', wid)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          // Pré-vendedor (SDR) e Closer — mesma fonte canônica usada em
          // Pré-Vendas/Vendas/Recuperação (ghl_users.papeis), para manter os
          // dropdowns consistentes entre abas.
          supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
          supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
        ])

        // Fase 15: contas Meta ativas do workspace (fonte de verdade do
        // vínculo conta ↔ workspace; legível por membros via RLS). O client
        // do app não usa tipos gerados (createClient sem Database), então o
        // shape é conferido pelo cast local abaixo — se os tipos forem
        // regerados (supabase gen types), revisitar esta query.
        // Fora do Promise.all de propósito: falha aqui NÃO derruba as demais
        // opções — sem a lista, o filtro "Conta Meta" simplesmente não aparece.
        const metaAccountsRes = await supabase
          .from('workspace_meta_ad_accounts')
          .select('account_id')
          .eq('workspace_id', wid)
          .eq('is_active', true)
        if (metaAccountsRes.error) {
          console.warn('[useTrafego] meta accounts error', metaAccountsRes.error)
        }


        // Meta campaigns / adsets / ads
        const campaigns = [...new Set(allMetaOptions.map((r) => r.campaign_name).filter(Boolean))] as string[]
        const adsets = [...new Set(allMetaOptions.map((r) => r.adset_name).filter(Boolean))] as string[]
        const ads = [...new Set(allMetaOptions.map((r) => r.ad_name).filter(Boolean))] as string[]

        // Channels from utm_sources
        const channels = ((sourcesRes.data ?? []) as { nome: string; utm_source: string; public_code: string | null }[])
          .filter((r) => r.utm_source)
          .map((r) => ({ nome: r.nome || r.utm_source, slug: r.utm_source, publicCode: r.public_code }))
          .sort((a, b) => a.nome.localeCompare(b.nome))

        // Mediums from utm_mediums
        const mediums = ((mediumsRes.data ?? []) as { nome: string; utm_medium: number | string | null }[])
          .filter((r) => r.utm_medium != null)
          .map((r) => ({ nome: r.nome || String(r.utm_medium), code: String(r.utm_medium) }))
          .sort((a, b) => a.nome.localeCompare(b.nome))

        // Funil tags from funnels table
        const funilTags = ((funnelsRes.data ?? []) as { nome: string }[])
          .map((r) => r.nome)
          .filter(Boolean)
          .sort() as string[]

        // Campaign [cp] tags from utm_campaigns
        const utmCampaignsData = (campaignsRes.data ?? []) as UtmCampaignEntry[]
        utmCampaignsRef.current = utmCampaignsData
        const cpTags = utmCampaignsData.map((r) => r.nome).filter(Boolean).sort() as string[]

        // Contas Meta ativas (Fase 15) — opções do filtro "Conta Meta"
        const metaAccounts = ((metaAccountsRes.data ?? []) as { account_id: string }[])
          .map((r) => r.account_id)
          .filter(Boolean)
          .sort()

        const sdrs = withSemAtribuicao([
          'SDR IA',
          ...((sdrUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean) as string[]),
        ])
        const closers = withSemAtribuicao([
          ...new Set((closerUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean)),
        ] as string[])

        // Sync status
        const syncData = syncRes.data as {
          started_at: string | null
          status: string | null
          records_fetched: number | null
        } | null

        return {
          options: {
            campaigns: campaigns.sort(),
            adsets: adsets.sort(),
            ads: ads.sort(),
            channels,
            mediums,
            funilTags,
            cpTags,
            metaAccounts,
            sdrs,
            closers,
          },
          sync: {
            lastSync: syncData?.started_at ?? null,
            status: syncData?.status ?? null,
            recordsFetched: syncData?.records_fetched ?? null,
          },
        }
      }
    },
  })

  // `utmCampaignsRef`/`sourcePublicCodeRef` são preenchidos dentro das queries e lidos
  // pelos cálculos — mantidos como refs para não disparar render a cada leitura.
  const filterOptions = optionsQuery.data?.options ?? EMPTY_FILTER_OPTIONS
  const syncStatus = optionsQuery.data?.sync ?? EMPTY_SYNC_STATUS

  // Fetch main data when date/dimension filters change
  // Referência estável dos filtros que disparam o fetch (compara por conteúdo)
  const filtersStable = useDeepCompareValue(
    filters,
    JSON.stringify({
      s: filters.startDate,
      e: filters.endDate,
      ca: filters.campaigns,
      ast: filters.adsets,
      ad: filters.ads,
      ch: filters.channels,
      me: filters.mediums,
      ft: filters.funilTags,
      ct: filters.cpTags,
      mql: filters.mqlFilter,
      sdr: filters.sdrs,
      cl: filters.closers,
      ma: filters.metaAccountId ?? null,
    }),
  )

  // Dataset principal via TanStack Query: o resultado fica em cache por `staleTime`
  // (5 min, definido em main.tsx). Antes isto era um useEffect cru — sair da aba e
  // voltar refazia TODAS as buscas, mesmo com os dados tendo chegado segundos antes.
  const dataQuery = useQuery({
    queryKey: ['trafego', 'dataset', filtersStable, recuperacaoMode],
    queryFn: async (): Promise<TrafegoQueryResult> => {
      const filters = filtersStable
      const wid = await getWorkspaceId()
      if (!wid) {
        console.warn('[useTrafego] No workspace found')
        return EMPTY_TRAFEGO_RESULT
      }

      {
        let excluded = 0
        const startISO = toSPISOStart(filters.startDate)
        const endISO = toSPISOEnd(filters.endDate)

        // ── Phase 1a: fetch utm_sources and utm_campaigns first ──
        const [sourcesRes, campaignsRes2] = await Promise.all([
          supabase.from('utm_sources').select('utm_source, public_code').eq('workspace_id', wid),
          supabase.from('utm_campaigns').select('nome, utm_campaign, funnels, page_code').eq('workspace_id', wid),
        ])


        // utm_sources tem RLS — se retornar erro ou vazio, não podemos filtrar tráfego pago.
        // Lançar erro é mais seguro do que mostrar TODOS os leads por engano.
        if (sourcesRes.error) throw sourcesRes.error

        const utmCampaignsLocal = (campaignsRes2.data ?? []) as UtmCampaignEntry[]
        utmCampaignsRef.current = utmCampaignsLocal

        // ── Phase 1b: fetch meta with pagination ──
        // PostgREST max_rows=1000, so pagination is mandatory
        const META_PAGE_SIZE = 1000
        const makeMetaQueryHook = () => {
          let q = supabase
            .from('meta_ads_insights')
            .select('spend, impressions, clicks, ctr, cpm, actions, campaign_name, adset_name, ad_name, date, landing_page_views, video_views, link_clicks, leads')
            .eq('workspace_id', wid)
            .gte('date', filters.startDate)
            .lte('date', filters.endDate)
            .order('date', { ascending: true })
            // desempate único: (date, ad_id) é UNIQUE — sem isso a paginação
            // por range é instável e pode pular/duplicar linhas no corte da página
            .order('ad_id', { ascending: true })

          if (filters.metaAccountId) q = q.eq('account_id', filters.metaAccountId)
          if (filters.campaigns.include.length > 0) q = q.in('campaign_name', filters.campaigns.include)
          if (filters.adsets.include.length > 0) q = q.in('adset_name', filters.adsets.include)
          if (filters.ads.include.length > 0) q = q.in('ad_name', filters.ads.include)
          return q
        }

        let allMetaRows = await fetchAllPages<MetaRow>(makeMetaQueryHook, { pageSize: META_PAGE_SIZE })

        // Apply meta-ads exclude filters client-side after fetch
        if (filters.campaigns.exclude.length > 0) {
          const excSet = new Set(filters.campaigns.exclude)
          allMetaRows = allMetaRows.filter((r) => !excSet.has(r.campaign_name ?? ''))
        }
        if (filters.adsets.exclude.length > 0) {
          const excSet = new Set(filters.adsets.exclude)
          allMetaRows = allMetaRows.filter((r) => !excSet.has(r.adset_name ?? ''))
        }
        if (filters.ads.exclude.length > 0) {
          const excSet = new Set(filters.ads.exclude)
          allMetaRows = allMetaRows.filter((r) => !excSet.has(r.ad_name ?? ''))
        }

        const metaRes = { data: allMetaRows, error: null }

        // Total oficial de investimento (level=account da Meta) — só válido
        // como TOTAL sem filtro de campanha/adset/ad/cpTags (level=account
        // não quebra por campanha). Ver mesmo padrão em loadTrafegoDataset.
        const hasBreakdownFilterHook =
          filters.campaigns.include.length > 0 || filters.campaigns.exclude.length > 0 ||
          filters.adsets.include.length > 0 || filters.adsets.exclude.length > 0 ||
          filters.ads.include.length > 0 || filters.ads.exclude.length > 0 ||
          isFilterActive(filters.cpTags)

        let accDailyRowsLocal: MetaAccountDailyRow[] = []
        if (!hasBreakdownFilterHook) {
          accDailyRowsLocal = await fetchAllPages<MetaAccountDailyRow>(
            () => {
              let q = supabase
                .from('meta_ads_account_daily')
                .select('date, spend')
                .eq('workspace_id', wid)
                .gte('date', filters.startDate)
                .lte('date', filters.endDate)
                .order('date', { ascending: true })
              if (filters.metaAccountId) q = q.eq('account_id', filters.metaAccountId)
              return q
            },
            { pageSize: META_PAGE_SIZE },
          )
        }

        // Build paid sources list for server-side filter
        const sourcesData = (sourcesRes.data ?? []) as { utm_source: string; public_code: string | null }[]
        const pagoSources = sourcesData.map(s => s.utm_source).filter(Boolean)

        // Build utm_source → public_code map for channel filtering
        sourcePublicCodeRef.current = new Map(
          sourcesData
            .filter(s => s.utm_source && s.public_code)
            .map(s => [s.utm_source, s.public_code!])
        )

        // ── Phase 1c: fetch oportunidades with pagination + client-side filter ──
        // PostgREST max_rows=1000, so pagination is mandatory for months with >1000 opps
        const PAGE_SIZE = 1000
        const OPP_SELECT = `
          id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
          lost_reason, vendedor_closer, status, sdr_name,
          data_lead_recebido, data_conectado, data_qualificado,
          data_no_show, data_agendamento_reuniao,
          data_realizacao_vendas, data_fechado,
          data_perdido, data_perdido_vendas, data_negociacao,
          data_no_show_vendas, data_agendamento_vendas,
          appointment_status,
          data_pendencias_preenchimento,
          resumo_ia, percepcao_closer,
          agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
          agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
          agendamento_assigned_user_id, agendamento_assigned_user_nome,
          contatos!inner(
            ghl_id, nome, email, telefone,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            fbclid, gclid,
            tt_source, tt_campaign, tt_medium, tt_term, tt_content,
            owner_name, owner_email, date_created, print_instagram,
            como_nos_conheceu, faturamento_anual, perfil_inteligente,
            tags,
            workspace_id
          )
        `

        // Fetch leads WITH data_lead_recebido in the selected period
        const allRows = await fetchAllPages<OppRow>(
          () =>
            (() => {
              const base = supabase
                .from('oportunidades')
                .select(OPP_SELECT)
                .eq('workspace_id', wid)
                .gte('data_lead_recebido', startISO)
                .lte('data_lead_recebido', endISO)
              return (
                applyRecuperacaoFilter(base as unknown as RecuperacaoQueryLike, recuperacaoMode) as unknown as typeof base
              )
              // `.range()` precisa de ordem estável; `id` elimina empates silenciosos.
              .order('data_lead_recebido', { ascending: true })
              .order('id', { ascending: true }) as unknown as {
                range(f: number, t: number): PromiseLike<{ data: OppRow[] | null; error: unknown | null }>
              }
            })(),
          { pageSize: PAGE_SIZE },
        )

        let rows = allRows

        // Filter to only paid traffic — utm_source must be registered in utm_sources.
        // IMPORTANT: if pagoSources is empty (utm_sources returned 0 rows, e.g. wrong workspace
        // or RLS issue), we must NOT skip the filter — that would show all organic leads as paid.
        // Instead, apply filter and let rows = [] (0 results), which is the correct safe behavior.
        {
          const pagoSet = new Set(pagoSources)
          const paid = pagoSources.length > 0
            ? rows.filter((r) => {
                const src = r.contatos?.utm_source
                return src != null && src !== '' && pagoSet.has(src)
              })
            : []
          excluded = rows.length - paid.length
          rows = paid
        }

        // Client-side channel filter (selects specific source within paid traffic)
        if (isFilterActive(filters.channels)) {
          rows = rows.filter((r) => {
            const src = r.contatos?.utm_source ?? ''
            if (filters.channels.exclude.includes(src)) return false
            if (filters.channels.include.length > 0) return filters.channels.include.includes(src)
            return true
          })
        }

        // Client-side medium filter (utm_medium)
        if (isFilterActive(filters.mediums)) {
          rows = rows.filter((r) => {
            const medium = r.contatos?.utm_medium ?? ''
            if (filters.mediums.exclude.includes(medium)) return false
            if (filters.mediums.include.length > 0) return filters.mediums.include.includes(medium)
            return true
          })
        }

        // Client-side funil filter (cross-ref through utm_campaigns.funnels JSON array)
        if (isFilterActive(filters.funilTags)) {
          const includeCodes = filters.funilTags.include.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.funilTags.exclude.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            rows = []
          } else {
            rows = rows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        // Client-side campaign [cp] filter (utm_campaigns.nome → utm_campaign code)
        if (isFilterActive(filters.cpTags)) {
          const includeCodes = filters.cpTags.include.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => filters.cpTags.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.cpTags.exclude.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => filters.cpTags.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            rows = []
          } else {
            rows = rows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        // Cross-filter by Meta ad name → utm_term (ad_name no Meta = utm_term no contato)
        if (isFilterActive(filters.ads)) {
          rows = rows.filter((r) => {
            const term = r.contatos?.utm_term ?? ''
            if (filters.ads.exclude.includes(term)) return false
            if (filters.ads.include.length > 0) return filters.ads.include.includes(term)
            return true
          })
        }

        // Cross-filter by Meta campaign name → utm_campaign codes via utm_campaigns table
        let isMissingCampaignMapping = false
        if (isFilterActive(filters.campaigns)) {
          const includeCodes = filters.campaigns.include.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => filters.campaigns.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.campaigns.exclude.length > 0
            ? new Set(utmCampaignsLocal.filter((c) => filters.campaigns.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            rows = []
            isMissingCampaignMapping = true
          } else {
            rows = rows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        // ── Phase 2: fetch revenue for cohort (100% cohort — no upper date bound) ──
        // Fetch all revenue from startISO onwards; filter client-side by cohort opp IDs.
        // Avoids .in() URL-length limits while correctly capturing revenue that arrives
        // after the selected period (e.g. lead from Jan closing in Mar).
        const filteredOppIdsSet = new Set(rows.map((o) => o.id))
        let filteredRevenue: RevenueRow[] = []
        if (filteredOppIdsSet.size > 0) {
          const REV_PAGE_SIZE = 1000
          const allRevenueRaw = await fetchAllPages<RevenueRow>(
            () =>
              supabase
                .from('vendas_fechamento')
                .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas')
                .eq('workspace_id', wid)
                .gte('data_pagamento_entrada', startISO)
                .order('oportunidade_id', { ascending: true }) as unknown as {
                range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }>
              },
            { pageSize: REV_PAGE_SIZE },
          )
          filteredRevenue = allRevenueRaw.filter((r) => filteredOppIdsSet.has(r.oportunidade_id))
        }

        // Filter metaRows by public_code of selected channel(s)
        let finalMetaRows = (metaRes.data ?? []) as MetaRow[]
        if (isFilterActive(filters.channels)) {
          const includePCs = filters.channels.include.map((ch) => sourcePublicCodeRef.current.get(ch)).filter(Boolean) as string[]
          const excludePCs = filters.channels.exclude.map((ch) => sourcePublicCodeRef.current.get(ch)).filter(Boolean) as string[]
          if (includePCs.length > 0) {
            finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePCs.some((pc) => r.ad_name!.includes(pc)))
          }
          if (excludePCs.length > 0) {
            finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePCs.some((pc) => r.ad_name!.includes(pc)))
          }
        }

        // Filter metaRows by page_code of selected funil(s)
        let isMissingPageCode = false
        if (isFilterActive(filters.funilTags)) {
          const includePageCodes = filters.funilTags.include.length > 0
            ? utmCampaignsLocal.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f)) && c.page_code).map((c) => c.page_code!)
            : null
          const excludePageCodes = filters.funilTags.exclude.length > 0
            ? utmCampaignsLocal.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f)) && c.page_code).map((c) => c.page_code!)
            : []
          if (includePageCodes !== null) {
            if (includePageCodes.length > 0) {
              finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePageCodes.some((pc) => r.ad_name!.includes(pc)))
            } else {
              finalMetaRows = []
              isMissingPageCode = rows.length > 0
            }
          }
          if (excludePageCodes.length > 0) {
            finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePageCodes.some((pc) => r.ad_name!.includes(pc)))
          }
        }

        // Filter metaRows by page_code of selected campaign [cp]
        if (isFilterActive(filters.cpTags)) {
          if (filters.cpTags.include.length > 0) {
            const includePCs = utmCampaignsLocal.filter((c) => filters.cpTags.include.includes(c.nome) && c.page_code).map((c) => c.page_code!)
            if (includePCs.length > 0) {
              finalMetaRows = finalMetaRows.filter((r) => r.ad_name != null && includePCs.some((pc) => r.ad_name!.includes(pc)))
            }
          }
          if (filters.cpTags.exclude.length > 0) {
            const excludePCs = utmCampaignsLocal.filter((c) => filters.cpTags.exclude.includes(c.nome) && c.page_code).map((c) => c.page_code!)
            if (excludePCs.length > 0) {
              finalMetaRows = finalMetaRows.filter((r) => r.ad_name == null || !excludePCs.some((pc) => r.ad_name!.includes(pc)))
            }
          }
        }

        // Filtro por data de criação do contato (lógica GHL)
        rows = filterByLeadDate(rows, filters.startDate, filters.endDate)

        if (filters.mqlFilter === 'mql') {
          rows = rows.filter((r) => isMqlByTag(r.contatos))
        }

        if (isFilterActive(filters.sdrs)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveSdrName(r)), filters.sdrs))
        }
        if (isFilterActive(filters.closers)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveCloserName(r)), filters.closers))
        }

        // Safeguard: deduplicar por opp.id
        const seenIds = new Set<string>()
        rows = rows.filter((r) => {
          if (seenIds.has(r.id)) return false
          seenIds.add(r.id)
          return true
        })

        return {
          opps: rows,
          metaRows: finalMetaRows,
          accountDailyRows: accDailyRowsLocal,
          revenueRows: filteredRevenue,
          excludedCount: excluded,
          missingPageCodeFunnel: isMissingPageCode,
          missingCampaignMapping: isMissingCampaignMapping,
        }
      }
    },
  })

  const data = dataQuery.data ?? EMPTY_TRAFEGO_RESULT

  return {
    opps: data.opps,
    metaRows: data.metaRows,
    accountDailyRows: data.accountDailyRows,
    revenueRows: data.revenueRows,
    filterOptions,
    syncStatus,
    loading: dataQuery.isPending,
    error: dataQuery.error ? messageOf(dataQuery.error) : null,
    excludedCount: data.excludedCount,
    missingPageCodeFunnel: data.missingPageCodeFunnel,
    missingCampaignMapping: data.missingCampaignMapping,
  }
}

// ─── KPI computations (pure functions) ───────────────────────

export interface MetaKpis {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  leadsCount: number
}

// `accountDailyRows` (level=account da Meta) é a fonte de verdade pro total
// de investimento — a soma de `rows` (level=ad) pode superestimar bastante o
// gasto real da conta (CBO/Advantage+/testes de criativo). Quando fornecido e
// não-vazio, `spend` vem da soma de accountDailyRows; senão cai no fallback
// de somar por anúncio (ex: quando há filtro de campanha/adset/ad ativo, caso
// em que o level=account não pode ser quebrado por granularidade).
export function computeMetaKpis(rows: MetaRow[], accountDailyRows?: MetaAccountDailyRow[]): MetaKpis {
  let spend = 0, impressions = 0, clicks = 0, leadsCount = 0
  for (const r of rows) {
    spend += r.spend ?? 0
    impressions += r.impressions ?? 0
    clicks += r.clicks ?? 0
    const actions = Array.isArray(r.actions) ? r.actions : []
    for (const a of actions) {
      if (
        typeof a === 'object' &&
        a !== null &&
        'action_type' in a &&
        (a as { action_type: string }).action_type === 'lead'
      ) {
        leadsCount += parseFloat(String((a as { value?: string }).value ?? '0')) || 0
      }
    }
  }
  if (accountDailyRows && accountDailyRows.length > 0) {
    spend = accountDailyRows.reduce((sum, r) => sum + (r.spend ?? 0), 0)
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  return { spend, impressions, clicks, ctr, leadsCount }
}

/** Período de apuração de caixa — datas 'YYYY-MM-DD' no fuso de São Paulo. */
export interface PeriodoCaixa {
  startDate: string
  endDate: string
}

/**
 * Caixa REALMENTE recebido de uma venda dentro do período.
 *
 * Regra: soma os pagamentos do cronograma cuja `data` cai no período. Caixa de um
 * mês é o dinheiro que entrou naquele mês — não o campo `valor_entrada`, que é
 * herança do modelo antigo (uma entrada só por venda).
 *
 * Por que isso importa (medido em julho/2026):
 *  - Augusto Kraemer: R$ 1.000 na entrada + R$ 17.000 nove dias depois. Os R$ 17.000
 *    não apareciam em mês NENHUM — sumiam do caixa.
 *  - Nahuel e Lótus: segunda parcela no MESMO dia da entrada, contada como parcela
 *    futura. R$ 19.000 invisíveis.
 *  - Erick: dois lançamentos marcados "Entrada" caíram em 01/08 — pela regra nova
 *    entram em agosto, não em julho. Somar tudo que se chama "entrada" erraria aqui.
 *
 * Sem cronograma (vendas vindas do GHL, que só têm os campos antigos), cai no
 * `valor_entrada` — comportamento anterior, sem regressão.
 */
/**
 * O cronograma serve de fonte de caixa? Só quando ele registra pagamento que
 * ACONTECEU.
 *
 * No omnx-desk o closer lança o que recebeu, com comprovante, e rotula cada linha
 * ("Entrada", "Parcela 1"...). No GHL o cronograma é uma PREVISÃO de vencimento e
 * vem sem rótulo — o campo `sinal` chega como booleano.
 *
 * Medido em julho/2026: aceitar o cronograma do GHL somaria R$ 72.480,10 de 75
 * contratos antigos (o mais velho de ago/2025) cujas parcelas só venceriam em
 * julho. A planilha de cobrança mostra boa parte delas como "Atrasado" — ou seja,
 * seria caixa que nunca entrou. Nesses casos ficamos no `valor_entrada`, que ao
 * menos corresponde a dinheiro confirmado.
 */
function cronogramaEhPagamentoRegistrado(pagamentos: PagamentoVenda[]): boolean {
  return pagamentos.some((p) => {
    const s = p?.sinal
    if (typeof s !== 'string') return false
    const norm = s.trim().toLowerCase()
    return norm.length > 0 && norm !== 'true' && norm !== 'false'
  })
}

/** '2026-08-01' → '01/08'. Usado só em rótulo de UI. */
function fmtDiaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/** A linha é parte da entrada (e não uma parcela)? */
function ehLinhaDeEntrada(p: PagamentoVenda): boolean {
  return typeof p?.sinal === 'string' && p.sinal.trim().toLowerCase() === 'entrada'
}

/**
 * Achata o cronograma em lançamentos de caixa, aplicando a regra do financeiro:
 * **a entrada conta inteira na data do primeiro pagamento dela**, mesmo quando o
 * cliente a divide em dias diferentes. Parcela continua valendo pela própria data.
 *
 * Caso que define a regra (Erick, julho/2026): entrada de R$ 13.000 partida em
 * 5.000 em 31/07 e 5.000 + 3.000 em 01/08, as três lançadas como "Entrada". Pelo
 * financeiro isso é uma entrada de julho — e é assim que o relatório de vendas
 * fecha em R$ 200.200. Pela data crua, R$ 8.000 vazariam para agosto.
 *
 * Só as linhas de "Entrada" são agrupadas. Uma parcela que cai no mês seguinte
 * pertence ao mês seguinte, sem exceção.
 */
function lancamentosDeCaixa(comData: PagamentoVenda[]): { data: string; valor: number }[] {
  const out: { data: string; valor: number }[] = []
  let entradaTotal = 0
  let dataPrimeiraEntrada: string | null = null

  for (const p of comData) {
    const dia = (p.data as string).slice(0, 10)
    const v = Number(p.valor)
    if (!Number.isFinite(v)) continue

    if (ehLinhaDeEntrada(p)) {
      entradaTotal += v
      if (dataPrimeiraEntrada === null || dia < dataPrimeiraEntrada) dataPrimeiraEntrada = dia
    } else {
      out.push({ data: dia, valor: v })
    }
  }

  if (dataPrimeiraEntrada !== null) out.push({ data: dataPrimeiraEntrada, valor: entradaTotal })
  return out
}

export function caixaRecebidoNoPeriodo(row: RevenueRow, periodo?: PeriodoCaixa): number {
  const pagamentos = Array.isArray(row.pagamentos) ? row.pagamentos : []
  const comData = pagamentos.filter((p) => typeof p?.data === 'string' && p.data.length >= 10)
  if (!periodo || comData.length === 0 || !cronogramaEhPagamentoRegistrado(comData)) {
    return row.valor_entrada ?? 0
  }

  let total = 0
  for (const l of lancamentosDeCaixa(comData)) {
    if (l.data >= periodo.startDate && l.data <= periodo.endDate) total += l.valor
  }
  return total
}

/**
 * Caixa já recebido de uma venda, sem recorte de período — soma os pagamentos do
 * cronograma cuja `data` já passou.
 *
 * É a régua do modo COHORT: ali o filtro de período fala da chegada do lead, não
 * do pagamento. Um lead de janeiro que pagou em julho tem que aparecer no cohort
 * de janeiro com o dinheiro dele. Usar `caixaRecebidoNoPeriodo` nesses painéis
 * zeraria justamente esse caso.
 *
 * Parcelas futuras ficam de fora: elas são faturamento, não caixa. A entrada
 * segue a mesma regra do financeiro usada em `caixaRecebidoNoPeriodo` — conta
 * inteira na data do primeiro pagamento dela.
 *
 * Sem cronograma (vendas do GHL, que só têm os campos antigos), cai no
 * `valor_entrada` — comportamento anterior, sem regressão.
 */
export function caixaRecebidoAcumulado(row: RevenueRow, hoje?: string): number {
  const pagamentos = Array.isArray(row.pagamentos) ? row.pagamentos : []
  const comData = pagamentos.filter((p) => typeof p?.data === 'string' && p.data.length >= 10)
  if (comData.length === 0 || !cronogramaEhPagamentoRegistrado(comData)) {
    return row.valor_entrada ?? 0
  }

  const limite = hoje ?? spToday()
  let total = 0
  for (const l of lancamentosDeCaixa(comData)) {
    if (l.data <= limite) total += l.valor
  }
  return total
}

/**
 * Faturamento total da venda.
 *
 * Com cronograma, é a soma dos pagamentos — o valor exato. O campo
 * `valor_faturado` é reconstruído pela ponte como `entrada + N × parcela` com a
 * parcela arredondada em 2 casas, o que introduz centavos fantasma (Augusto
 * Kraemer virava 84.000,04; Nahuel, 50.000,02).
 *
 * Sem cronograma, usa `valor_faturado` — comportamento anterior.
 */
export function faturamentoDaVenda(row: RevenueRow): number {
  const pagamentos = Array.isArray(row.pagamentos) ? row.pagamentos : []
  if (pagamentos.length === 0 || !cronogramaEhPagamentoRegistrado(pagamentos)) {
    return row.valor_faturado ?? 0
  }

  let total = 0
  for (const p of pagamentos) {
    const v = Number(p?.valor)
    if (Number.isFinite(v)) total += v
  }
  return total
}

export function computeRevenueKpis(rows: RevenueRow[], periodo?: PeriodoCaixa) {
  let valorFaturado = 0, valorEntrada = 0
  for (const r of rows) {
    valorFaturado += faturamentoDaVenda(r)
    valorEntrada += caixaRecebidoNoPeriodo(r, periodo)
  }
  return { valorFaturado, valorEntrada }
}

/** Etapa do pipeline "Vendas SQL" que representa contrato assinado. */
export const STAGE_ASSINADA = 'Assinada'

/**
 * Status de contrato no omnx-desk que valem como "fechado".
 *
 * Regra do dono (04/08/2026): contrato ATIVO no desk é contrato assinado, com ou sem
 * Clicksign — boa parte é assinada por fora (em 04/08 eram 17 ativos sem link). O que
 * segue pendente é rascunho ou venda sem contrato nenhum.
 */
const CONTRATO_STATUS_FECHADO = new Set(['ativo', 'concluido', 'concluído', 'pausado'])

/**
 * Uma venda conta como ASSINADA por duas vias — e basta uma delas:
 *
 * 1. `vendas_fechamento` tem link do contrato ou data de assinatura. Esses campos
 *    só chegam pelo webhook do GHL (fluxo antigo do OpenClaw).
 * 2. A oportunidade está na etapa "Assinada" do pipeline. É por aqui que a
 *    assinatura das vendas do omnx-desk aparece: quando o contrato é assinado no
 *    Clicksign, a ponte `crm-marcar-assinada` move o card para Vendas SQL /
 *    Assinada — **mas não preenche** o link nem a data em `vendas_fechamento`.
 *
 * Olhar só para os campos (via 1) marcaria como pendente venda já assinada — foi
 * o caso do Augusto Kraemer, assinado no desk em 23/07/2026 e com o card em
 * "Assinada", mas sem link/data na tabela.
 *
 * Importante: nada disso tira a venda do faturamento/caixa. Ela já foi paga (tem
 * `data_pagamento_entrada`) e continua somando em todos os painéis — o card é só
 * um alerta de pendência documental, para o time saber quem cobrar.
 */
export function isVendaSemAssinatura(row: RevenueRow, assinadasPorEtapa?: Set<string>): boolean {
  // 1ª via (a mais confiável): o contrato no omnx-desk saiu do rascunho.
  const status = row.contrato_status?.trim().toLowerCase()
  if (status && CONTRATO_STATUS_FECHADO.has(status)) return false
  // 2ª via: campos do webhook antigo (OpenClaw).
  const link = row.op_link_do_contrato_assinado?.trim()
  const data = row.data_da_assinatura_do_contrato?.trim()
  if (link || data) return false
  // 3ª via: o card foi movido para "Assinada" no funil.
  return !assinadasPorEtapa?.has(row.oportunidade_id)
}

/** Monta o conjunto de oportunidades que já estão na etapa "Assinada". */
export function buildAssinadasPorEtapa(
  opps: Array<{ id: string; pipeline_stage_id?: string | null }>,
): Set<string> {
  const set = new Set<string>()
  for (const o of opps) {
    if (o.pipeline_stage_id?.trim() === STAGE_ASSINADA) set.add(o.id)
  }
  return set
}

export interface PendentesAssinatura {
  count: number
  faturamento: number
  caixa: number
  rows: RevenueRow[]
}

/**
 * Soma e lista as vendas do universo recebido que ainda não têm contrato assinado.
 * O universo já vem filtrado pelo período/dimensões do painel que chamou.
 *
 * `assinadasPorEtapa` vem de `buildAssinadasPorEtapa(opps)` — sem ele, toda venda
 * assinada pelo desk (que não grava link/data) apareceria como pendente.
 */
export function computePendentesAssinatura(
  rows: RevenueRow[],
  assinadasPorEtapa?: Set<string>,
): PendentesAssinatura {
  const pendentes = rows.filter((r) => !!r.data_pagamento_entrada && isVendaSemAssinatura(r, assinadasPorEtapa))
  let faturamento = 0, caixa = 0
  for (const r of pendentes) {
    faturamento += faturamentoDaVenda(r)
    caixa += caixaRecebidoAcumulado(r)
  }
  return { count: pendentes.length, faturamento, caixa, rows: pendentes }
}

export function applyMqlFilter(opps: OppRow[], mqlFilter: 'all' | 'mql'): OppRow[] {
  if (mqlFilter === 'mql') return opps.filter((o) => isMqlByTag(o.contatos))
  return opps
}

/**
 * Aplica os filtros de Pré-vendedor (SDR) e Closer a uma lista de opps já
 * carregada (uso em painéis/hooks que buscam dados fora do pipeline
 * principal de useTrafego/useAquisicao/useOrganico, ex: Produtividade).
 * Registros sem atribuição casam com a opção SEM_ATRIBUICAO.
 */
export function applyAttributionFilters(
  opps: OppRow[],
  sdrs: FilterValues,
  closers: FilterValues,
): OppRow[] {
  let rows = opps
  if (isFilterActive(sdrs)) {
    rows = rows.filter((o) => applyFilterValue(normalizeAttribution(resolveSdrName(o)), sdrs))
  }
  if (isFilterActive(closers)) {
    rows = rows.filter((o) => applyFilterValue(normalizeAttribution(resolveCloserName(o)), closers))
  }
  return rows
}

/**
 * Constrói mapa oppId → data_pagamento_entrada (YYYY-MM-DD ou TIMESTAMPTZ).
 * Só inclui opps que TÊM data_pagamento_entrada preenchida.
 * Usado como critério de "venda fechada" — sem pagamento confirmado, não é venda.
 */
export function buildPaymentDateMap(revenueRows: RevenueRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of revenueRows) {
    if (r.data_pagamento_entrada) {
      // Normaliza: pega só YYYY-MM-DD (pode vir TIMESTAMPTZ)
      map.set(r.oportunidade_id, r.data_pagamento_entrada.slice(0, 10))
    }
  }
  return map
}

/**
 * Constrói mapa oppId → { faturamento, caixa }.
 * Só inclui opps que TÊM data_pagamento_entrada preenchida.
 * Usado para exibir valor monetário nos gráficos de vendas (toggle Faturamento / Caixa).
 */
export function buildRevenueMap(
  revenueRows: RevenueRow[],
  periodo?: PeriodoCaixa,
): Map<string, { faturamento: number; caixa: number }> {
  const map = new Map<string, { faturamento: number; caixa: number }>()
  for (const r of revenueRows) {
    if (r.data_pagamento_entrada) {
      map.set(r.oportunidade_id, {
        faturamento: faturamentoDaVenda(r),
        // Mesma régua dos KPIs: sem o período, os gráficos com toggle "Caixa"
        // somariam pela regra antiga e divergiriam do card na mesma tela.
        caixa: caixaRecebidoNoPeriodo(r, periodo),
      })
    }
  }
  return map
}

/** Uma linha do detalhamento "quem trouxe o caixa do período". */
export interface CaixaPorCliente {
  oportunidadeId: string
  nome: string
  caixa: number
  faturamento: number
  /** Os pagamentos que caíram DENTRO do período — é o que soma no `caixa`. */
  pagamentosNoPeriodo: { data: string; valor: number; sinal: string | null; forma: string | null }[]
}

/**
 * Quebra o card "Caixa" por cliente: quanto cada um efetivamente pagou no período.
 *
 * Usa exatamente a mesma régua do KPI (`caixaRecebidoNoPeriodo`), então a soma desta
 * lista bate com o número do card — se divergir, é bug.
 *
 * O nome sai de `nome_contratante` (o que o closer digitou no omnx-desk) e cai para o
 * nome da oportunidade quando a venda veio do GHL, que não tem contratante.
 */
export function buildCaixaPorCliente(
  revenueRows: RevenueRow[],
  // Só o nome é usado daqui — tipo mínimo para servir também às opps enxutas que
  // o useCloserProdutividade carrega (OppEventRow), sem cast.
  opps: { id: string; contatos?: { nome?: string | null } | null }[],
  periodo?: PeriodoCaixa,
): CaixaPorCliente[] {
  const nomePorOpp = new Map<string, string>()
  for (const o of opps) {
    const nome = o.contatos?.nome ?? null
    if (nome) nomePorOpp.set(o.id, nome)
  }

  const out: CaixaPorCliente[] = []
  for (const r of revenueRows) {
    const caixa = caixaRecebidoNoPeriodo(r, periodo)
    const faturamento = faturamentoDaVenda(r)
    // Entra quem trouxe dinheiro no período OU quem tem faturamento — a mesma lista
    // serve aos dois cards (Caixa e Faturamento Bruto), que filtram pela sua métrica.
    if (caixa <= 0 && faturamento <= 0) continue

    // Mesma régua do card: a entrada é agrupada na data do primeiro pagamento
    // dela. Sem isso, o Erick apareceria no modal de julho com R$ 5.000 enquanto
    // o card mostra R$ 13.000 — e o rodapé de conferência acusaria divergência.
    const dentro: CaixaPorCliente['pagamentosNoPeriodo'] = []
    const comData = (Array.isArray(r.pagamentos) ? r.pagamentos : [])
      .filter((p) => typeof p?.data === 'string' && p.data.length >= 10)
    if (periodo && comData.length > 0 && cronogramaEhPagamentoRegistrado(comData)) {
      const entradas = comData.filter(ehLinhaDeEntrada)
      for (const p of comData) {
        if (ehLinhaDeEntrada(p)) continue
        const data = (p.data as string).slice(0, 10)
        if (data < periodo.startDate || data > periodo.endDate) continue
        dentro.push({ data, valor: Number(p?.valor) || 0, sinal: p?.sinal ?? null, forma: p?.forma ?? null })
      }
      if (entradas.length > 0) {
        const datas = entradas.map((p) => (p.data as string).slice(0, 10)).sort()
        const dataEntrada = datas[0]!
        if (dataEntrada >= periodo.startDate && dataEntrada <= periodo.endDate) {
          const soma = entradas.reduce((s, p) => s + (Number(p?.valor) || 0), 0)
          // Quando a entrada foi partida em dias diferentes, o rótulo diz isso —
          // senão a linha pareceria um pagamento único que não existiu.
          const sinal = entradas.length > 1
            ? `Entrada (${entradas.length} pagamentos, até ${fmtDiaMes(datas[datas.length - 1]!)})`
            : 'Entrada'
          dentro.push({ data: dataEntrada, valor: soma, sinal, forma: entradas[0]?.forma ?? null })
        }
      }
      dentro.sort((a, b) => a.data.localeCompare(b.data))
    }

    out.push({
      oportunidadeId: r.oportunidade_id,
      nome: r.nome_contratante || nomePorOpp.get(r.oportunidade_id) || 'Sem nome',
      caixa,
      faturamento,
      pagamentosNoPeriodo: dentro,
    })
  }

  return out.sort((a, b) => b.caixa - a.caixa)
}

export function computeFunnel(opps: OppRow[], paymentDateMap?: Map<string, string>) {
  const fechadosCount = paymentDateMap
    ? opps.filter((o) => paymentDateMap.has(o.id)).length
    : opps.filter((o) => o.data_fechado).length
  return [
    { key: 'leads', label: 'Leads gerados', count: opps.length },
    // MQL e uma classificacao do CONTATO (tag), nao da oportunidade: um contato com
    // 2 opps geraria 2 "MQLs" e a lista do modal repetiria a mesma pessoa.
    { key: 'mql', label: 'MQLs', count: countUniqueMqls(opps) },
    { key: 'agendados', label: 'Agendados', count: opps.filter((o) => o.data_agendamento_reuniao).length },
    { key: 'reunioes', label: 'Reuniões feitas', count: opps.filter((o) => o.data_realizacao_vendas).length },
    { key: 'fechados', label: 'Vendas fechadas', count: fechadosCount },
  ]
}

export function computeSmallCards(opps: OppRow[]) {
  return {
    mqls: opps.filter((o) => isMqlByTag(o.contatos)),
    nmqls: opps.filter((o) => o.pipeline_name === 'Pré-Vendas nMQL'),
    conectados: opps.filter((o) => o.data_conectado),
    perdidosSemReuniao: opps.filter((o) => o.data_perdido && !o.data_agendamento_reuniao),
    perdidosAposReuniao: opps.filter((o) => o.data_perdido_vendas),
    emNegociacao: opps.filter((o) => o.data_negociacao && !o.data_fechado),
  }
}

export function computeLossReasons(opps: OppRow[], withMeeting: boolean) {
  const filtered = withMeeting
    ? opps.filter((o) => o.data_perdido_vendas)
    : opps.filter((o) => o.data_perdido && !o.data_agendamento_reuniao)

  const counts: Record<string, number> = {}
  for (const o of filtered) {
    const reason = o.lost_reason ?? 'Não informado'
    counts[reason] = (counts[reason] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
}

export function computeAvgCycle(opps: OppRow[], paymentDateMap?: Map<string, string>): number | null {
  // Prazo médio = dias entre data_lead_recebido e data_pagamento_entrada (se disponível) ou data_fechado
  const closed = opps.filter((o) => {
    if (paymentDateMap) return paymentDateMap.has(o.id) && o.data_lead_recebido
    return o.data_fechado && o.data_lead_recebido
  })
  if (!closed.length) return null
  const toUTCDay = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const totalDays = closed.reduce((sum, o) => {
    const startDate = tsToSPDate(o.data_lead_recebido!)
    const endDate = paymentDateMap ? paymentDateMap.get(o.id)! : o.data_fechado!
    return sum + (toUTCDay(endDate) - toUTCDay(startDate)) / (1000 * 60 * 60 * 24)
  }, 0)
  return Math.round(totalDays / closed.length)
}

export function computeClosingCycle(opps: OppRow[], paymentDateMap: Map<string, string>): number | null {
  // Ciclo de fechamento = dias entre data_realizacao_vendas e data_pagamento_entrada
  const closed = opps.filter((o) => o.data_realizacao_vendas && paymentDateMap.has(o.id))
  if (!closed.length) return null
  const toUTCDay = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const totalDays = closed.reduce((sum, o) => {
    return sum + (toUTCDay(paymentDateMap.get(o.id)!) - toUTCDay(o.data_realizacao_vendas!)) / (1000 * 60 * 60 * 24)
  }, 0)
  return Math.round(totalDays / closed.length)
}

// ─── Ideal-Dia computation ─────────────────────────────────────

export interface IdealDiaResult {
  meta: number
  periodDays: number
  daysElapsed: number
  daysRemaining: number
  idealAcumulado: number
  atual: number
  delta: number
  pctOfMeta: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function toUtcDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function getPeriodProgress(startDate: string, endDate: string, today: string = spToday()) {
  const periodDays = Math.max(1, Math.round((toUtcDay(endDate) - toUtcDay(startDate)) / DAY_MS) + 1)

  let daysElapsed = 0
  if (today >= startDate) {
    const effectiveDate = today <= endDate ? today : endDate
    daysElapsed = Math.max(0, Math.round((toUtcDay(effectiveDate) - toUtcDay(startDate)) / DAY_MS) + 1)
  }

  daysElapsed = Math.min(daysElapsed, periodDays)
  const daysRemaining = Math.max(0, periodDays - daysElapsed)

  return { periodDays, daysElapsed, daysRemaining }
}

export function computeIdealDia(params: {
  startDate: string
  endDate: string
  meta: number
  atual: number
}): IdealDiaResult {
  const { startDate, endDate, meta, atual } = params
  const { periodDays, daysElapsed, daysRemaining } = getPeriodProgress(startDate, endDate)

  const idealAcumulado = Math.round(meta * (daysElapsed / periodDays))
  const delta = Math.round(atual - idealAcumulado)
  const pctOfMeta = meta > 0 ? Math.round((atual / meta) * 100) : 0

  return { meta, periodDays, daysElapsed, daysRemaining, idealAcumulado, atual, delta, pctOfMeta }
}

// ─── Cost-per-MQL Ideal Dia ────────────────────────────────────

export interface CostMqlIdealDia {
  periodDays: number
  daysElapsed: number
  daysRemaining: number
  maxBudget: number
  idealBudgetAcumulado: number
  atualSpend: number
  delta: number
  spendPerDayAtual: number
  spendPerDayIdeal: number
  costPerMqlIdeal: number   // budget restante / MQLs que ainda faltam
  projectedTotalSpend: number
  onTrack: boolean
}

export function computeCostMqlIdealDia(params: {
  startDate: string
  endDate: string
  costMeta: number
  mqlMeta: number
  atualSpend: number
  atualMqls: number
}): CostMqlIdealDia | null {
  const { startDate, endDate, costMeta, mqlMeta, atualSpend, atualMqls } = params
  if (costMeta <= 0 || mqlMeta <= 0) return null

  const { periodDays, daysElapsed, daysRemaining } = getPeriodProgress(startDate, endDate)
  const divisor = Math.max(daysElapsed, 1)
  const maxBudget = costMeta * mqlMeta
  const idealBudgetAcumulado = Math.round(maxBudget * (daysElapsed / periodDays))
  const delta = Math.round(atualSpend - idealBudgetAcumulado)
  const spendPerDayAtual = atualSpend / divisor
  const spendPerDayIdeal = daysRemaining > 0 ? Math.max(0, (maxBudget - atualSpend) / daysRemaining) : 0
  const mqlsRemaining = Math.max(0, mqlMeta - atualMqls)
  const budgetRemaining = Math.max(0, maxBudget - atualSpend)
  const costPerMqlIdeal = mqlsRemaining > 0 ? budgetRemaining / mqlsRemaining : 0
  const projectedTotalSpend = Math.round(atualSpend + spendPerDayAtual * daysRemaining)
  const onTrack = projectedTotalSpend <= maxBudget

  return {
    periodDays,
    daysElapsed,
    daysRemaining,
    maxBudget,
    idealBudgetAcumulado,
    atualSpend,
    delta,
    spendPerDayAtual,
    spendPerDayIdeal,
    costPerMqlIdeal,
    projectedTotalSpend,
    onTrack,
  }
}

// ─── Cost-per-MQL series ───────────────────────────────────────

export interface CostMqlPoint {
  date: string
  cumSpend: number
  cumMqls: number
  costPerMql: number
}

export function computeCostPerMqlSeries(
  metaRows: MetaRow[],
  opps: OppRow[],
  startDate: string,
  endDate: string
): CostMqlPoint[] {
  // Group meta spend by date
  const spendByDate = new Map<string, number>()
  for (const r of metaRows) {
    if (r.date) {
      spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.spend ?? 0))
    }
  }

  // Group MQL counts by SP-timezone date of data_lead_recebido (TIMESTAMPTZ)
  const mqlsByDate = new Map<string, number>()
  for (const o of opps) {
    if (isMqlByTag(o.contatos) && o.data_lead_recebido) {
      const date = tsToSPDate(o.data_lead_recebido)
      mqlsByDate.set(date, (mqlsByDate.get(date) ?? 0) + 1)
    }
  }

  // Iterate date range and build cumulative series
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')
  const points: CostMqlPoint[] = []
  let cumSpend = 0
  let cumMqls = 0

  const cur = new Date(start)
  while (cur <= end) {
    const dateStr = cur.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    cumSpend += spendByDate.get(dateStr) ?? 0
    cumMqls += mqlsByDate.get(dateStr) ?? 0
    points.push({
      date: dateStr,
      cumSpend,
      cumMqls,
      costPerMql: cumMqls > 0 ? cumSpend / cumMqls : 0,
    })
    cur.setDate(cur.getDate() + 1)
  }

  return points
}

