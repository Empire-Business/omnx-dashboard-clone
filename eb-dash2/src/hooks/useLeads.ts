import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { OppRow } from './useTrafego'
import { isFilterActive, SEM_ATRIBUICAO, withSemAtribuicao } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

export type { OppRow }

// ─── Tipo de tráfego ────────────────────────────────────────
// Classificação canônica do lead pela origem (contatos.utm_source), a mesma
// já usada em Aquisição/Tráfego/Orgânico:
//   pago            → código cadastrado em utm_sources
//   organico        → código cadastrado em utm_sources_plain (e não em utm_sources)
//   nao_classificado→ tem código, mas ele não está em nenhuma das duas tabelas
//   sem_origem      → utm_source nulo ou vazio
export type TrafficType = 'pago' | 'organico' | 'nao_classificado' | 'sem_origem'

export const TRAFFIC_TYPES: TrafficType[] = ['pago', 'organico', 'nao_classificado', 'sem_origem']

export const TRAFFIC_TYPE_LABEL: Record<TrafficType, string> = {
  pago: 'Tráfego pago',
  organico: 'Orgânico',
  nao_classificado: 'Canal não cadastrado',
  sem_origem: 'Sem origem',
}

export interface TrafficSourceSets {
  /** Códigos de utm_sources (pago) */
  paid: string[]
  /** Códigos de utm_sources_plain que não estão em utm_sources (orgânico) */
  organic: string[]
}

export interface LeadsFilters {
  startDate: string
  endDate: string
  trafficType: FilterValues
  utmSource: FilterValues
  utmCampaign: FilterValues
  utmMedium: FilterValues
  utmTerm: FilterValues
  pipelineName: FilterValues
  status: FilterValues
  vendedorCloser: FilterValues
  sdrName: FilterValues     // pré-vendedor: oportunidades.sdr_name (sem o fallback contatos.owner_name — filtro é server-side)
  search: string
}

export interface LeadsFilterOptions {
  trafficTypes: TrafficType[]
  pipelines: string[]
  utmSources: string[]
  utmCampaigns: string[]
  utmMediums: string[]
  utmTerms: string[]
  closers: string[]
  sdrs: string[]
}

// Monta uma cláusula PostgREST .or(...) para um filtro que pode incluir o
// sentinela SEM_ATRIBUICAO (registro com a coluna NULL). Retorna null quando
// não há include ativo (nesse caso o exclude é aplicado separadamente).
function buildAttributionOrClause(column: string, include: string[]): string | null {
  if (include.length === 0) return null
  const real = include.filter((v) => v !== SEM_ATRIBUICAO)
  const parts: string[] = []
  if (real.length > 0) parts.push(`${column}.in.(${real.join(',')})`)
  if (include.includes(SEM_ATRIBUICAO)) parts.push(`${column}.is.null`)
  return parts.join(',')
}

// Valor impossível: usado quando o filtro de tipo de tráfego não deixa nenhuma
// categoria selecionável (ex: só "pago" marcado, mas nenhum canal pago cadastrado).
// Sem isso o filtro sumiria e a tela mostraria todos os leads — o oposto do pedido.
const TRAFFIC_NO_MATCH = '__sem_correspondencia__'

function quoteInValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Resolve quais tipos de tráfego passam no filtro.
 * Sem include → todos; com include → só os marcados. Excludes sempre removem.
 */
export function resolveAllowedTrafficTypes(filter: FilterValues): TrafficType[] {
  const base = filter.include.length > 0
    ? TRAFFIC_TYPES.filter((t) => filter.include.includes(t))
    : TRAFFIC_TYPES
  return base.filter((t) => !filter.exclude.includes(t))
}

/**
 * Traduz os tipos permitidos numa cláusula PostgREST `.or(...)` sobre
 * contatos.utm_source. Sempre positiva (união dos tipos permitidos) — assim
 * o "excluir" não esbarra na armadilha de NULL do `not.in`.
 */
export function buildTrafficTypeOrClause(allowed: TrafficType[], sets: TrafficSourceSets): string {
  const parts: string[] = []
  const known = [...sets.paid, ...sets.organic]

  if (allowed.includes('pago') && sets.paid.length > 0) {
    parts.push(`utm_source.in.(${sets.paid.map(quoteInValue).join(',')})`)
  }
  if (allowed.includes('organico') && sets.organic.length > 0) {
    parts.push(`utm_source.in.(${sets.organic.map(quoteInValue).join(',')})`)
  }
  if (allowed.includes('sem_origem')) {
    parts.push('utm_source.is.null')
    parts.push('utm_source.eq.')
  }
  if (allowed.includes('nao_classificado')) {
    const conds = ['utm_source.not.is.null', 'utm_source.neq.']
    if (known.length > 0) conds.push(`utm_source.not.in.(${known.map(quoteInValue).join(',')})`)
    parts.push(`and(${conds.join(',')})`)
  }

  if (parts.length === 0) return `utm_source.eq.${TRAFFIC_NO_MATCH}`
  return parts.join(',')
}

// ─── Resolução de códigos UTM → nomes amigáveis ─────────────
// Mesmo padrão da página Inscrições: cruza utm_sources,
// utm_sources_plain, utm_campaigns e utm_mediums.

export interface UtmMaps {
  sources: Map<string, string>
  campaigns: Map<string, string>
  mediums: Map<string, string>
}

export interface UtmMapRows {
  sources: Array<{ utm_source: string | null; nome: string | null }>
  sourcesPlain: Array<{ utm_source: string | null; nome: string | null }>
  campaigns: Array<{ utm_campaign: string | number | null; nome: string | null }>
  mediums: Array<{ utm_medium: string | null; nome: string | null }>
}

// utm_sources_plain sobrescreve utm_sources em caso de conflito (orgânicos
// refinados depois dos pagos) — mesma ordem de merge da página Inscrições.
export function buildUtmMaps(rows: UtmMapRows): UtmMaps {
  const sources = new Map<string, string>()
  const campaigns = new Map<string, string>()
  const mediums = new Map<string, string>()
  for (const r of rows.sources) if (r.utm_source) sources.set(r.utm_source, r.nome || r.utm_source)
  for (const r of rows.sourcesPlain) if (r.utm_source) sources.set(r.utm_source, r.nome || r.utm_source)
  for (const r of rows.campaigns) if (r.utm_campaign != null) campaigns.set(String(r.utm_campaign), r.nome || String(r.utm_campaign))
  for (const r of rows.mediums) if (r.utm_medium) mediums.set(r.utm_medium, r.nome || r.utm_medium)
  return { sources, campaigns, mediums }
}

// Código sem mapeamento é exibido cru; código vazio vira "—".
export function resolveUtmName(
  maps: UtmMaps,
  type: keyof UtmMaps,
  code: string | null | undefined,
): string {
  if (!code) return '—'
  return maps[type].get(code) ?? code
}

export type SortField =
  | 'data_lead_recebido'
  | 'data_fechado'
  | 'pipeline_name'
  | 'status'
  | 'vendedor_closer'

export interface VendaPagamento {
  data: string | null
  valor: number | null
  forma: string | null
  plataforma: string | null
  sinal: string | null
}

export interface VendaComprovante {
  storage_path: string
  nome_original: string | null
  mime_type: string | null
  tamanho_bytes: number | null
  sinal: string | null
}

export interface VendasFechamento {
  valor_entrada: number | null
  numero_parcelas: number | null
  valor_parcela: number | null
  forma_pagamento: string | null
  produto_vendido: string | null
  op_vencimentos_parcelas: string | null
  op_link_do_contrato_assinado: string | null
  data_da_assinatura_do_contrato: string | null  // DATE: "YYYY-MM-DD"
  data_pagamento_entrada: string | null
  nome_contratante: string | null
  cpf_cnpj_contratante: string | null
  logradouro_rua_avenida: string | null
  numero_endereco: string | null
  complemento_endereco: string | null
  bairro: string | null
  municipio: string | null
  estado_uf: string | null
  cep: string | null
  observacoes_venda: string | null
  // Campos do modelo omnx-desk (ex-EmpireDesk) (vazios/null em vendas históricas do GHL)
  pagamentos: VendaPagamento[] | null
  comprovantes: VendaComprovante[] | null
  closer_nome: string | null
  closer_email: string | null
  origem: string | null
}

export interface LeadsFull extends OppRow {
  // Tentativa dates (only fetched in fetchLeadWithVendas, not in list)
  data_tentativa_1?: string | null
  data_tentativa_2?: string | null
  data_tentativa_3?: string | null
  data_tentativa_4?: string | null
  data_tentativa_5?: string | null
  data_tentativa_6?: string | null
  data_tentativa_7?: string | null
  data_tentativa_8?: string | null
  vendas_fechamento?: VendasFechamento | null
  application_answers?: LeadApplicationAnswer[]
}

export interface LeadApplicationAnswer {
  key: string
  label: string
  value: string
}

const PAGE_SIZE = 50

// Lean select for list view (50 rows at a time)
const CONTATOS_SELECT = `
  ghl_id, nome, email, telefone,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  fbclid, gclid,
  tt_source, tt_campaign, tt_medium, tt_term, tt_content,
  owner_name, owner_email, closer_name, closer_email, date_created,
  como_nos_conheceu, faturamento_anual, perfil_inteligente,
  tags
`

// Full select for detail view (single row)
const CONTATOS_SELECT_DETAIL = `
  ghl_id, nome, email, telefone,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  fbclid, gclid,
  tt_source, tt_campaign, tt_medium, tt_term, tt_content,
  owner_name, owner_email, closer_name, closer_email, date_created,
  como_nos_conheceu, faturamento_anual, perfil_inteligente,
  primeiro_nome, ultimo_nome, country,
  descricao_negocio, tipo_empresa,
  investe_trafego, treinamento_marketing, tempo_usa_internet,
  super_heroi_favorito, disponibilidade_barra,
  print_instagram, tags,
  situacao_atual, preciso_ajuda_para, obstaculos, visao_6_meses, plano_meta,
  situacao_investimentos, possiveis_objecoes,
  swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas,
  follow_up_1, follow_up_2, follow_up_3, follow_up_4, follow_up_5,
  follow_up_6, follow_up_7, follow_up_8, follow_up_9, follow_up_10,
  follow_up_11, follow_up_12, follow_up_13, follow_up_14, follow_up_15,
  comunicacao_veredito, comunicacao_erros_atuais, comunicacao_tendencia_mercado,
  analise_oferta_principal, banco_ideias_conteudo, canais_venda_recomendados,
  analise_gap_pontos_fracos, estudo_concorrentes, estrategia_antibrjection_scripts,
  plano_acao_passo_a_passo,
  id_analise, link_analise, status_analise, data_analise,
  custom_fields
`

function buildOppSelectList(useInnerContatoJoin = false) {
  return `
  id, ghl_opportunity_id, pipeline_name, pipeline_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
  agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
  agendamento_assigned_user_id, agendamento_assigned_user_nome,
  contatos${useInnerContatoJoin ? '!inner' : ''}(${CONTATOS_SELECT})
`
}

// Detail view — full contatos select
const OPP_SELECT_FULL = `
  id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id, pipeline_stage_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  data_tentativa_1, data_tentativa_2, data_tentativa_3,
  data_tentativa_4, data_tentativa_5, data_tentativa_6,
  data_tentativa_7, data_tentativa_8,
  agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
  agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
  agendamento_assigned_user_id, agendamento_assigned_user_nome,
  contatos(${CONTATOS_SELECT_DETAIL})
`

interface ApplicationFieldMatcher {
  all?: readonly string[]
  any?: readonly string[]
}

interface ApplicationFieldConfig {
  key: string
  label: string
  valueFromContato: (contato: OppRow['contatos']) => unknown
  webhookMatchers?: readonly ApplicationFieldMatcher[]
}

interface WebhookLeadPayload {
  id?: string | null
  contact_id?: string | null
  customData?: Record<string, unknown> | null
}

const WEBHOOK_HISTORY_START_AT = Date.parse('2026-03-13T00:00:00Z')
const WEBHOOK_LOOKBACK_MS = 6 * 60 * 60 * 1000
const WEBHOOK_LOOKAHEAD_MS = 30 * 60 * 60 * 1000

const APPLICATION_FIELDS: readonly ApplicationFieldConfig[] = [
  {
    key: 'contact.perfilinsta',
    label: 'Qual é o seu @ do instagram?',
    valueFromContato: (contato) => contato?.print_instagram,
    webhookMatchers: [
      { all: ['instagram'] },
      { all: ['print', 'instagram'] },
    ],
  },
  {
    key: 'contact.descricao_seu_negocio_atual',
    label: 'Faça uma breve descrição do seu negócio atual: o que você vende, quem são seus clientes e quanto você cobra em média.',
    valueFromContato: (contato) => contato?.descricao_negocio,
    webhookMatchers: [
      { all: ['descricao', 'negocio', 'cobra'] },
      { all: ['negocio', 'clientes', 'vende'] },
    ],
  },
  {
    key: 'contact.ja_fez_treinamento_mkt_digital',
    label: 'Já fez algum treinamento de marketing digital? Se sim, qual?',
    valueFromContato: (contato) => contato?.treinamento_marketing,
    webhookMatchers: [
      { all: ['treinamento', 'marketing', 'digital'] },
    ],
  },
  {
    key: 'contact.resultados_6meses_redes_sociais',
    label: 'Como você gostaria de ver suas redes sociais nos próximos 6 meses?',
    valueFromContato: (contato) => contato?.visao_6_meses,
    webhookMatchers: [
      { all: ['redes', 'sociais', '6', 'meses'] },
      { all: ['marca', 'resultado', 'financeiro'] },
    ],
  },
  {
    key: 'contact.qual__o_seu_plano_para_atingir_esta_meta',
    label: 'Qual é o seu plano para atingir esta meta?',
    valueFromContato: (contato) => contato?.plano_meta,
    webhookMatchers: [
      { all: ['plano', 'atingir', 'meta'] },
    ],
  },
  {
    key: 'contact.fale_os_3_principais_obstculos_que_esto_impedindo_voc_de_atingir_as_metas_acima',
    label: 'Fale os 3 principais obstáculos que estão impedindo você de atingir as metas acima.',
    valueFromContato: (contato) => contato?.obstaculos,
    webhookMatchers: [
      { all: ['3', 'principais', 'obstaculos'] },
      { all: ['impedindo', 'atingir', 'metas'] },
    ],
  },
  {
    key: 'contact.quanto_tempo_usa_internet_para_crescer_negocio',
    label: 'Há quanto tempo você usa a internet para crescer o seu negócio?',
    valueFromContato: (contato) => contato?.tempo_usa_internet,
    webhookMatchers: [
      { all: ['tempo', 'internet', 'crescer', 'negocio'] },
      { all: ['acoes', 'marketing', 'tentou'] },
    ],
  },
  {
    key: 'contact.ocupacao_contato',
    label: 'Qual das opções abaixo melhor descreve você?',
    valueFromContato: (contato) => contato?.tipo_empresa,
    webhookMatchers: [
      { all: ['melhor', 'descreve', 'voce'] },
    ],
  },
  {
    key: 'contact.objetivo_contato',
    label: 'Conte um pouco sobre o seu negócio e o que espera conseguir com a nossa ajuda.',
    valueFromContato: (contato) => contato?.preciso_ajuda_para,
    webhookMatchers: [
      { all: ['negocio', 'espera', 'nossa', 'ajuda'] },
      { all: ['conseguir', 'nossa', 'ajuda'] },
    ],
  },
  {
    key: 'contact.qual_dessas_opes_melhor_descreve_a_situao_atual_do_seu_negcio_em_termos_de_investimentos',
    label: 'Qual dessas opções melhor descreve a situação atual do seu negócio em termos de investimentos?',
    valueFromContato: (contato) => contato?.situacao_investimentos,
    webhookMatchers: [
      { all: ['situacao', 'negocio', 'investimentos'] },
      { all: ['melhor', 'descreve', 'investimentos'] },
    ],
  },
  {
    key: 'contact.faturamento_anual',
    label: 'Faturamento anual',
    valueFromContato: (contato) => contato?.faturamento_anual,
    webhookMatchers: [
      { all: ['faturamento'] },
    ],
  },
  {
    key: 'contact.comfirma_comprometimento',
    label: 'Confirma comprometimento com a chamada?',
    valueFromContato: () => null,
    webhookMatchers: [
      { all: ['comprometido', 'comparecer', 'chamada'] },
      { all: ['sim', 'eu', 'estou'] },
      { all: ['comprometimento', 'chamada'] },
    ],
  },
  {
    key: 'contact.perfeito_para_encerramos_me_diga_qual_o_seu_superheri_favorito',
    label: 'Perfeito! Para encerrarmos, me diga qual o seu super-herói favorito.',
    valueFromContato: (contato) => contato?.super_heroi_favorito,
    webhookMatchers: [
      { all: ['super', 'heroi', 'favorito'] },
    ],
  },
]

function cleanText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

function normalizeLookupText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesLookupPattern(
  normalizedKey: string,
  matcher: ApplicationFieldMatcher
): boolean {
  const hasAll = matcher.all?.every((token) => normalizedKey.includes(normalizeLookupText(token))) ?? false
  if (hasAll) return true

  return matcher.any?.some((token) => normalizedKey.includes(normalizeLookupText(token))) ?? false
}

function findWebhookAnswerValue(
  customData: Record<string, unknown> | null | undefined,
  matchers: readonly ApplicationFieldMatcher[] | undefined
): string | null {
  if (!customData || !matchers?.length) return null

  for (const [rawKey, rawValue] of Object.entries(customData)) {
    const value = cleanText(rawValue)
    if (!value) continue

    const normalizedKey = normalizeLookupText(rawKey)
    if (matchers.some((matcher) => matchesLookupPattern(normalizedKey, matcher))) {
      return value
    }
  }

  return null
}

async function fetchWebhookFallbackAnswers(
  lead: Pick<LeadsFull, 'ghl_opportunity_id' | 'contatos'>
): Promise<Record<string, string>> {
  const dateCreated = lead.contatos?.date_created
  if (!dateCreated) return {}

  const createdAtMs = Date.parse(dateCreated)
  if (!Number.isFinite(createdAtMs) || createdAtMs < WEBHOOK_HISTORY_START_AT) {
    return {}
  }

  const start = new Date(createdAtMs - WEBHOOK_LOOKBACK_MS).toISOString()
  const end = new Date(createdAtMs + WEBHOOK_LOOKAHEAD_MS).toISOString()

  // Paginado (.range): a janela (~36h) pode passar de 1000 webhooks/dia. Com
  // .limit(1200) o PostgREST ignorava (>max_rows=1000) e devolvia só 1000 —
  // truncando silenciosamente e podendo perder o webhook do lead procurado.
  let allWebhookRows: Array<{ created_at: string; payload: WebhookLeadPayload | null }> = []
  {
    const PAGE = 1000
    let page = 0
    while (true) {
      const { data, error } = await supabase
        .from('webhooks_ghl')
        .select('created_at, payload')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (error) {
        console.warn('[fetchLeadWithVendas] webhook fallback failed', error)
        return {}
      }
      const rows = (data ?? []) as Array<{ created_at: string; payload: WebhookLeadPayload | null }>
      allWebhookRows = allWebhookRows.concat(rows)
      if (rows.length < PAGE) break
      page++
    }
  }

  const ghlContactId = cleanText(lead.contatos?.ghl_id)
  const ghlOpportunityId = cleanText(lead.ghl_opportunity_id)
  const matchedRows = allWebhookRows
    .filter((row) => {
      const payload = row.payload
      return (
        cleanText(payload?.contact_id) === ghlContactId ||
        cleanText(payload?.id) === ghlOpportunityId
      )
    })

  if (!matchedRows.length) return {}

  const fallbackValues: Record<string, string> = {}

  // Chaves do payload que são objetos de sistema — ignorar na busca de respostas
  const SYSTEM_KEYS = new Set([
    'contact', 'customData', 'triggerData', 'attributionSource',
    'lastAttributionSource', 'location', 'workflow',
  ])

  for (const field of APPLICATION_FIELDS) {
    if (!field.webhookMatchers?.length) continue

    for (const row of matchedRows) {
      // Mescla: nível raiz do payload (excluindo objetos de sistema) + customData
      // As respostas do formulário chegam no nível raiz com o texto da pergunta como chave
      const topLevel = Object.fromEntries(
        Object.entries(row.payload ?? {}).filter(([k]) => !SYSTEM_KEYS.has(k))
      ) as Record<string, unknown>
      const merged = { ...topLevel, ...(row.payload?.customData ?? {}) }

      const value = findWebhookAnswerValue(merged, field.webhookMatchers)
      if (value) {
        fallbackValues[field.key] = value
        break
      }
    }
  }

  return fallbackValues
}

function buildLeadApplicationAnswers(
  contato: OppRow['contatos'],
  webhookFallbacks: Record<string, string>
): LeadApplicationAnswer[] {
  return APPLICATION_FIELDS
    .map((field) => {
      const value = cleanText(field.valueFromContato(contato)) ?? webhookFallbacks[field.key] ?? null
      if (!value) return null

      return {
        key: field.key,
        label: field.label,
        value,
      }
    })
    .filter((field): field is LeadApplicationAnswer => field !== null)
}

export function useLeads(filters: LeadsFilters) {
  const [leads, setLeads] = useState<OppRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<SortField>('data_lead_recebido')
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter options
  const [pipelines, setPipelines] = useState<string[]>([])
  const [utmSources, setUtmSources] = useState<string[]>([])
  const [utmCampaigns, setUtmCampaigns] = useState<string[]>([])
  const [utmMediums, setUtmMediums] = useState<string[]>([])
  const [utmTerms, setUtmTerms] = useState<string[]>([])
  const [closers, setClosers] = useState<string[]>([])
  const [sdrs, setSdrs] = useState<string[]>([])
  const [utmMaps, setUtmMaps] = useState<UtmMaps>({ sources: new Map(), campaigns: new Map(), mediums: new Map() })
  const [trafficSets, setTrafficSets] = useState<TrafficSourceSets>({ paid: [], organic: [] })
  const [ghlLocationId, setGhlLocationId] = useState<string | null>(null)

  // Load filter options once
  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      const wid = await getWorkspaceId()
      if (!wid) {
        console.warn('[useLeads] No workspace found')
        return
      }

      // PostgREST ignora .limit(N) com N>1000 — pagina pra pegar todos os
      // valores distintos, senão pipelines/UTM sources/closers que só
      // aparecem depois da linha 1000 (ordem não garantida) somem do filtro.
      async function fetchAllRows<T>(
        buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
      ): Promise<T[]> {
        const PAGE_SIZE = 1000
        let all: T[] = []
        let page = 0
        while (true) {
          const res = await buildQuery(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (res.error) break
          const rows = res.data ?? []
          all = all.concat(rows)
          if (rows.length < PAGE_SIZE) break
          page++
        }
        return all
      }

      const [pipeRows, utmRows, closerRows, sdrRows, srcRes, srcPlainRes, cmpRes, medRes, ghlRes] = await Promise.all([
        fetchAllRows<{ pipeline_name: string | null }>((from, to) =>
          supabase
            .from('oportunidades')
            .select('pipeline_name')
            .not('pipeline_name', 'is', null)
            .eq('workspace_id', wid)
            .order('id', { ascending: true })
            .range(from, to)
        ),
        // Um único scan paginado em contatos gera as opções dos 4 filtros UTM
        // (códigos que realmente aparecem nos leads — igual Inscrições, que
        // extrai as opções dos valores distintos da própria tabela de dados).
        fetchAllRows<{ utm_source: string | null; utm_campaign: string | null; utm_medium: string | null; utm_term: string | null }>((from, to) =>
          supabase
            .from('contatos')
            .select('utm_source, utm_campaign, utm_medium, utm_term')
            .or('utm_source.not.is.null,utm_campaign.not.is.null,utm_medium.not.is.null,utm_term.not.is.null')
            .eq('workspace_id', wid)
            .order('id', { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<{ vendedor_closer: string | null }>((from, to) =>
          supabase
            .from('oportunidades')
            .select('vendedor_closer')
            .not('vendedor_closer', 'is', null)
            .eq('workspace_id', wid)
            .order('id', { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<{ sdr_name: string | null }>((from, to) =>
          supabase
            .from('oportunidades')
            .select('sdr_name')
            .not('sdr_name', 'is', null)
            .eq('workspace_id', wid)
            .order('id', { ascending: true })
            .range(from, to)
        ),
        // Tabelas de mapeamento código UTM → nome amigável (só para labels)
        supabase.from('utm_sources').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_sources_plain').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_campaigns').select('utm_campaign, nome').eq('workspace_id', wid),
        supabase.from('utm_mediums').select('utm_medium, nome').eq('workspace_id', wid),
        // Location do GHL para montar o link externo do contato.
        // Via RPC: a RLS de `ghl_integration_settings` so libera leitura para
        // owner/admin, entao o SELECT direto voltava vazio para SDR/pre-vendedor
        // e o link "Abrir no CRM" sumia em silencio.
        supabase.rpc('get_workspace_ghl_location_id', { p_workspace_id: wid }),
      ])
      if (cancelled) return

      const pipes = [
        ...new Set(pipeRows.map((r) => r.pipeline_name).filter(Boolean)),
      ] as string[]
      const uniqSorted = (vals: Array<string | null>) =>
        ([...new Set(vals.filter(Boolean))] as string[]).sort()

      setPipelines(pipes.sort())
      setUtmSources(uniqSorted(utmRows.map((r) => r.utm_source)))
      setUtmCampaigns(uniqSorted(utmRows.map((r) => r.utm_campaign)))
      setUtmMediums(uniqSorted(utmRows.map((r) => r.utm_medium)))
      setUtmTerms(uniqSorted(utmRows.map((r) => r.utm_term)))
      setClosers(withSemAtribuicao(uniqSorted(closerRows.map((r) => r.vendedor_closer))))
      setSdrs(withSemAtribuicao(uniqSorted(sdrRows.map((r) => r.sdr_name))))
      // Conjuntos de códigos pagos/orgânicos — base do filtro "Tipo de tráfego".
      // utm_sources tem precedência: um código cadastrado nas duas tabelas conta
      // como pago (mesmo critério de Aquisição/Tráfego).
      const paidCodes = [...new Set(((srcRes.data ?? []) as Array<{ utm_source: string | null }>)
        .map((r) => r.utm_source).filter((c): c is string => !!c))]
      const paidSet = new Set(paidCodes)
      const organicCodes = [...new Set(((srcPlainRes.data ?? []) as Array<{ utm_source: string | null }>)
        .map((r) => r.utm_source).filter((c): c is string => !!c && !paidSet.has(c)))]
      setTrafficSets({ paid: paidCodes, organic: organicCodes })

      setUtmMaps(buildUtmMaps({
        sources: srcRes.data ?? [],
        sourcesPlain: srcPlainRes.data ?? [],
        campaigns: cmpRes.data ?? [],
        mediums: medRes.data ?? [],
      }))
      if (ghlRes.data) setGhlLocationId(ghlRes.data as unknown as string)
    }

    void loadOptions()
    return () => { cancelled = true }
  }, [])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const wid = await getWorkspaceId()
      if (!wid) {
        throw new Error('Conta não encontrada')
      }

      const normalizedSearch = filters.search.trim().replace(/[(),]/g, ' ')

      let query = supabase
        .from('oportunidades')
        // Nested-contact filters must run in SQL before pagination, otherwise
        // page 5 matches are invisible while the user is on page 1.
        // Always inner-join contatos so we can enforce workspace isolation.
        .select(buildOppSelectList(true), { count: 'exact' })
        .eq('workspace_id', wid)
        .order(sortField, { ascending: sortAsc })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      // Quando há busca textual, ignorar filtros de data — o lead pode estar fora do período padrão
      if (filters.startDate && !normalizedSearch) {
        query = query.gte('data_lead_recebido', `${filters.startDate}T00:00:00-03:00`)
      }
      if (filters.endDate && !normalizedSearch) {
        query = query.lte('data_lead_recebido', `${filters.endDate}T23:59:59-03:00`)
      }
      if (isFilterActive(filters.pipelineName)) {
        if (filters.pipelineName.include.length > 0) {
          query = query.in('pipeline_name', filters.pipelineName.include)
        }
        for (const v of filters.pipelineName.exclude) {
          query = query.neq('pipeline_name', v)
        }
      }
      if (isFilterActive(filters.status)) {
        if (filters.status.include.length > 0) {
          query = query.in('status', filters.status.include)
        }
        for (const v of filters.status.exclude) {
          query = query.neq('status', v)
        }
      }
      if (isFilterActive(filters.vendedorCloser)) {
        const orClause = buildAttributionOrClause('vendedor_closer', filters.vendedorCloser.include)
        if (orClause) query = query.or(orClause)
        for (const v of filters.vendedorCloser.exclude) {
          query = v === SEM_ATRIBUICAO
            ? query.not('vendedor_closer', 'is', null)
            : query.neq('vendedor_closer', v)
        }
      }
      if (isFilterActive(filters.sdrName)) {
        const orClause = buildAttributionOrClause('sdr_name', filters.sdrName.include)
        if (orClause) query = query.or(orClause)
        for (const v of filters.sdrName.exclude) {
          query = v === SEM_ATRIBUICAO
            ? query.not('sdr_name', 'is', null)
            : query.neq('sdr_name', v)
        }
      }
      if (isFilterActive(filters.trafficType)) {
        const allowed = resolveAllowedTrafficTypes(filters.trafficType)
        query = query.or(buildTrafficTypeOrClause(allowed, trafficSets), { referencedTable: 'contatos' })
      }
      if (isFilterActive(filters.utmSource)) {
        if (filters.utmSource.include.length > 0) {
          query = query.filter('contatos.utm_source', 'in', `(${filters.utmSource.include.join(',')})`)
        }
        for (const v of filters.utmSource.exclude) {
          query = query.filter('contatos.utm_source', 'neq', v)
        }
      }
      if (isFilterActive(filters.utmCampaign)) {
        if (filters.utmCampaign.include.length > 0) {
          query = query.filter('contatos.utm_campaign', 'in', `(${filters.utmCampaign.include.join(',')})`)
        }
        for (const v of filters.utmCampaign.exclude) {
          query = query.filter('contatos.utm_campaign', 'neq', v)
        }
      }
      if (isFilterActive(filters.utmMedium)) {
        if (filters.utmMedium.include.length > 0) {
          query = query.filter('contatos.utm_medium', 'in', `(${filters.utmMedium.include.join(',')})`)
        }
        for (const v of filters.utmMedium.exclude) {
          query = query.filter('contatos.utm_medium', 'neq', v)
        }
      }
      if (isFilterActive(filters.utmTerm)) {
        if (filters.utmTerm.include.length > 0) {
          query = query.filter('contatos.utm_term', 'in', `(${filters.utmTerm.include.join(',')})`)
        }
        for (const v of filters.utmTerm.exclude) {
          query = query.filter('contatos.utm_term', 'neq', v)
        }
      }
      if (normalizedSearch) {
        const searchPattern = `%${normalizedSearch}%`
        query = query.or(
          [
            `nome.ilike.${searchPattern}`,
            `email.ilike.${searchPattern}`,
            `utm_source.ilike.${searchPattern}`,
          ].join(','),
          { referencedTable: 'contatos' }
        )
      }

      const { data, error: qErr, count } = await query

      if (qErr) throw qErr

      setLeads((data ?? []) as unknown as OppRow[])
      setTotal(count ?? 0)
    } catch (err) {
      console.error('[useLeads]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar leads')
    } finally {
      setLoading(false)
    }
  }, [filters, page, sortField, sortAsc, trafficSets])

  useEffect(() => {
    void loadLeads()
  }, [loadLeads])

  // Reset to page 0 on filter change (adjust state during render — ver
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const filtersResetKey = [
    filters.startDate,
    filters.endDate,
    JSON.stringify(filters.utmSource),
    JSON.stringify(filters.utmCampaign),
    JSON.stringify(filters.utmMedium),
    JSON.stringify(filters.utmTerm),
    JSON.stringify(filters.pipelineName),
    JSON.stringify(filters.status),
    JSON.stringify(filters.vendedorCloser),
    JSON.stringify(filters.sdrName),
    filters.search,
  ].join('')

  const [prevResetKey, setPrevResetKey] = useState(filtersResetKey)
  if (prevResetKey !== filtersResetKey) {
    setPrevResetKey(filtersResetKey)
    setPage(0)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((v) => !v)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const deleteLeads = async (ids: string[]) => {
    if (ids.length === 0) return

    const wid = await getWorkspaceId()
    if (!wid) {
      throw new Error('Conta não encontrada')
    }

    // Garante que só deletamos oportunidades cujo contato pertence ao workspace.
    const { data: allowed, error: allowErr } = await supabase
      .from('oportunidades')
      .select('id')
      .in('id', ids)
      .eq('workspace_id', wid)

    if (allowErr) throw allowErr
    const allowedIds = (allowed ?? []).map((r) => r.id)
    if (allowedIds.length === 0) return

    const { error } = await supabase.from('oportunidades').delete().in('id', allowedIds)
    if (error) throw error
    await loadLeads()
  }

  return {
    leads,
    total,
    page,
    pageSize: PAGE_SIZE,
    setPage,
    sortField,
    sortAsc,
    handleSort,
    loading,
    error,
    filterOptions: { trafficTypes: TRAFFIC_TYPES, pipelines, utmSources, utmCampaigns, utmMediums, utmTerms, closers, sdrs } satisfies LeadsFilterOptions,
    utmMaps,
    ghlLocationId,
    deleteLeads,
  }
}

// Fetch single lead with full data (vendas + tentativas)
export async function fetchLeadWithVendas(oppId: string): Promise<LeadsFull | null> {
  const [oppRes, vendasRes] = await Promise.all([
    supabase
      .from('oportunidades')
      .select(OPP_SELECT_FULL)
      .eq('id', oppId)
      .maybeSingle(),
    supabase
      .from('vendas_fechamento')
      .select(`
        valor_entrada, numero_parcelas, valor_parcela,
        forma_pagamento, produto_vendido, op_vencimentos_parcelas,
        op_link_do_contrato_assinado,
        data_da_assinatura_do_contrato,
        data_pagamento_entrada,
        nome_contratante, cpf_cnpj_contratante,
        logradouro_rua_avenida, numero_endereco, complemento_endereco,
        bairro, municipio, estado_uf, cep,
        observacoes_venda,
        pagamentos, comprovantes, closer_nome, closer_email, origem
      `)
      .eq('oportunidade_id', oppId)
      .maybeSingle(),
  ])

  if (!oppRes.data) return null

  const lead = oppRes.data as unknown as LeadsFull
  const webhookFallbacks = await fetchWebhookFallbackAnswers(lead)

  return {
    ...lead,
    vendas_fechamento: vendasRes.data as unknown as VendasFechamento | null,
    application_answers: buildLeadApplicationAnswers(lead.contatos, webhookFallbacks),
  }
}
