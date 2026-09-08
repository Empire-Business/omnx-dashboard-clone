import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { applyRecuperacaoFilter } from '@/lib/constants'
import {
  buildRevenueMap,
  isMqlByTag,
  parseTags,
  type OppRow,
  type RevenueRow,
} from './useTrafego'
import type { PreVendasFilters } from './usePreVendas'
import { toSPISOEnd, toSPISOStart } from '@/lib/utils/dates'
import { isFilterActive } from '@/types/filters'

// Cohort usa bookingRate + avgBookingTime; produtividade usa agendamentos + avgResponseTime.
// contactAttempts e revenue são comuns aos dois modos.
export type MetricKey =
  | 'bookingRate'
  | 'avgBookingTime'
  | 'agendamentos'
  | 'avgResponseTime'
  | 'contactAttempts'
  | 'revenue'

interface UtmCampaignEntry {
  nome: string
  utm_campaign: string
  funnels: unknown
}

interface CommunicationCount {
  calls: number
  messages: number
}

export interface SDRHighlightMetric {
  value: number
  displayValue: string
  tooltipDetail: string
  modalTitle: string
  leads: OppRow[]
}

export interface SDRHighlightChartRow {
  sdr: string
  metrics: Partial<Record<MetricKey, SDRHighlightMetric>>
}

export interface SDRHighlightChartData {
  rows: SDRHighlightChartRow[]
  loading: boolean
  error: string | null
}

interface UseSDRHighlightChartParams {
  mode: 'cohort' | 'produtividade'
  orderedSdrs: string[]
  opps: OppRow[]
  revenueRows: RevenueRow[]
  filters: PreVendasFilters
  startDate: string
  endDate: string
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
}

function getOppSdr(opp: OppRow): string {
  return (opp.sdr_name || opp.contatos?.owner_name || 'Sem SDR').trim()
}

function isIaLead(opp: OppRow): boolean {
  return parseTags(opp.contatos?.tags).some((tag) => tag.toLowerCase() === '[cp] sdr ia')
}

function matchesDateRange(date: string | null | undefined, startDate: string, endDate: string): boolean {
  if (!date) return false
  const normalized = date.slice(0, 10)
  return normalized >= startDate && normalized <= endDate
}

function getBookingLagDays(opp: OppRow): number | null {
  if (!opp.data_lead_recebido || !opp.data_agendamento_reuniao) return null

  const leadDate = new Date(`${opp.data_lead_recebido.slice(0, 10)}T00:00:00`)
  const bookingDate = new Date(`${opp.data_agendamento_reuniao.slice(0, 10)}T00:00:00`)
  const diff = (bookingDate.getTime() - leadDate.getTime()) / 86_400_000
  if (!Number.isFinite(diff) || diff < 0) return null
  return diff
}

function formatDays(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value) + ' d'
}

function formatCurrencyCompact(value: number): string {
  if (value <= 0) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function fmtResponseTimeSecs(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return '< 1 min'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function sortOppsByIds(sourceOpps: OppRow[], ids: Set<string>): OppRow[] {
  return sourceOpps.filter((opp) => ids.has(opp.id))
}

function buildRows(
  orderedSdrs: string[],
  sourceOpps: OppRow[],
  revenueRows: RevenueRow[],
  attemptsByOppId: Map<string, CommunicationCount>,
  mode: 'cohort' | 'produtividade',
  startDate: string,
  endDate: string,
  avgResponseTimeBySdr?: Map<string, number>,
  prodRevenueBySdr?: Map<string, { total: number; oppIds: Set<string> }>,
): SDRHighlightChartRow[] {
  // Lookup rápido id → OppRow para montar lista de leads no modal de faturamento
  const oppById = new Map<string, OppRow>()
  for (const opp of sourceOpps) oppById.set(opp.id, opp)

  const bySdr = new Map<string, OppRow[]>()

  for (const opp of sourceOpps) {
    // Leads IA (tag '[cp] sdr ia') são agrupados sob 'SDR IA', não sob seu owner_name real
    const sdr = isIaLead(opp) ? 'SDR IA' : getOppSdr(opp)
    const list = bySdr.get(sdr) ?? []
    list.push(opp)
    bySdr.set(sdr, list)
  }

  return orderedSdrs
    .map((sdr) => {
      const sdrOpps = bySdr.get(sdr) ?? []
      if (sdrOpps.length === 0) return null

      // ── Contato tentados (comum aos dois modos) ────────────────
      const contactAttemptOpps = sdrOpps
        .filter((opp) => {
          const attempts = attemptsByOppId.get(opp.id)
          return !!attempts && attempts.calls + attempts.messages > 0
        })
        .sort((a, b) => {
          const totalA = (attemptsByOppId.get(a.id)?.calls ?? 0) + (attemptsByOppId.get(a.id)?.messages ?? 0)
          const totalB = (attemptsByOppId.get(b.id)?.calls ?? 0) + (attemptsByOppId.get(b.id)?.messages ?? 0)
          return totalB - totalA
        })

      const attemptsTotal = contactAttemptOpps.reduce((sum, opp) => {
        const attempts = attemptsByOppId.get(opp.id)
        return sum + (attempts?.calls ?? 0) + (attempts?.messages ?? 0)
      }, 0)

      // ── PRODUTIVIDADE ──────────────────────────────────────────
      if (mode === 'produtividade') {
        // Agendamentos que ACONTECERAM no período (data do evento, não data do lead)
        const agendadosNoPeriodo = sdrOpps.filter((opp) =>
          matchesDateRange(opp.data_agendamento_reuniao, startDate, endDate)
        )

        // Tempo médio de resposta:
        // - SDRs humanos: via RPC get_sdr_avg_response_time (ghl_source='app')
        // - SDR IA: via loadIaAvgResponseTime (ghl_source='workflow'), já injetado no map
        const avgRespSecs = avgResponseTimeBySdr?.get(sdr) ?? 0

        // Faturamento: opps de qualquer pipeline com data_pagamento_entrada no período
        const prodRev = prodRevenueBySdr?.get(sdr) ?? { total: 0, oppIds: new Set<string>() }

        return {
          sdr,
          metrics: {
            agendamentos: {
              value: agendadosNoPeriodo.length,
              displayValue: String(agendadosNoPeriodo.length),
              tooltipDetail: `${agendadosNoPeriodo.length} agendamentos realizados no período`,
              modalTitle: `Agendamentos no período — ${sdr}`,
              leads: agendadosNoPeriodo,
            },
            avgResponseTime: {
              value: avgRespSecs,
              displayValue: fmtResponseTimeSecs(avgRespSecs),
              tooltipDetail: avgRespSecs > 0
                ? `Média de ${fmtResponseTimeSecs(avgRespSecs)} para responder leads`
                : 'Sem dados de resposta no período',
              modalTitle: `Tempo de resposta — ${sdr}`,
              leads: [],
            },
            contactAttempts: {
              value: attemptsTotal,
              displayValue: String(attemptsTotal),
              tooltipDetail: `${contactAttemptOpps.length} leads com ligações ou mensagens`,
              modalTitle: `Tentativas de contato — ${sdr}`,
              leads: contactAttemptOpps,
            },
            revenue: {
              value: prodRev.total,
              displayValue: formatCurrencyCompact(prodRev.total),
              tooltipDetail: `${prodRev.oppIds.size} fechamentos com pagamento no período`,
              modalTitle: `Faturamento — ${sdr}`,
              leads: [...prodRev.oppIds]
                .map((id) => oppById.get(id))
                .filter((o): o is OppRow => o !== undefined),
            },
          },
        } satisfies SDRHighlightChartRow
      }

      // ── COHORT ────────────────────────────────────────────────
      const revMap = buildRevenueMap(revenueRows)

      const mqls = sdrOpps.filter((opp) => isMqlByTag(opp.contatos))
      const agendados = sdrOpps.filter((opp) => !!opp.data_agendamento_reuniao)
      const bookingRate = mqls.length > 0 ? (agendados.length / mqls.length) * 100 : 0

      const avgTimeOpps = sdrOpps
        .filter((opp) => getBookingLagDays(opp) !== null)
        .sort((a, b) => (getBookingLagDays(b) ?? 0) - (getBookingLagDays(a) ?? 0))

      const avgLagSum = avgTimeOpps.reduce((sum, opp) => sum + (getBookingLagDays(opp) ?? 0), 0)
      const avgLag = avgTimeOpps.length > 0 ? avgLagSum / avgTimeOpps.length : 0

      const revenueOppIds = new Set<string>()
      let revenueTotal = 0
      for (const opp of sdrOpps) {
        const rev = revMap.get(opp.id)
        if (!rev || rev.faturamento <= 0) continue
        revenueOppIds.add(opp.id)
        revenueTotal += rev.faturamento
      }
      const revenueOpps = sortOppsByIds(sdrOpps, revenueOppIds)

      return {
        sdr,
        metrics: {
          bookingRate: {
            value: bookingRate,
            displayValue: `${Math.round(bookingRate)}%`,
            tooltipDetail: `${agendados.length} agendados / ${mqls.length} MQLs`,
            modalTitle: `Taxa de agendamento — ${sdr}`,
            leads: agendados,
          },
          avgBookingTime: {
            value: avgLag,
            displayValue: avgTimeOpps.length > 0 ? formatDays(avgLag) : '—',
            tooltipDetail: avgTimeOpps.length > 0
              ? `${avgTimeOpps.length} leads com lead recebido e agendamento válidos`
              : 'Sem leads com datas válidas',
            modalTitle: `Tempo médio de agendamento — ${sdr}`,
            leads: avgTimeOpps,
          },
          contactAttempts: {
            value: attemptsTotal,
            displayValue: String(attemptsTotal),
            tooltipDetail: `${contactAttemptOpps.length} leads com ligações ou mensagens`,
            modalTitle: `Contatos tentados — ${sdr}`,
            leads: contactAttemptOpps,
          },
          revenue: {
            value: revenueTotal,
            displayValue: formatCurrencyCompact(revenueTotal),
            tooltipDetail: `${revenueOpps.length} leads com faturamento`,
            modalTitle: `Faturamento — ${sdr}`,
            leads: revenueOpps,
          },
        },
      } satisfies SDRHighlightChartRow
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
}

async function loadProdutividadeBase(
  filters: PreVendasFilters,
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao',
): Promise<{ opps: OppRow[]; revenueRows: RevenueRow[] }> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const campaignsRes = await supabase
    .from('utm_campaigns')
    .select('nome, utm_campaign, funnels')
    .eq('workspace_id', wid)
  if (campaignsRes.error) throw campaignsRes.error
  const utmCampaigns = (campaignsRes.data ?? []) as UtmCampaignEntry[]

  const OPP_SELECT = `
    id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
    lost_reason, vendedor_closer, status, sdr_name,
    data_lead_recebido, data_conectado, data_qualificado,
    data_no_show, data_agendamento_reuniao, data_reuniao_agendada,
    data_realizacao_vendas, data_fechado,
    data_perdido, data_perdido_vendas, data_negociacao,
    data_no_show_vendas, data_agendamento_vendas,
    data_pendencias_preenchimento,
    data_auto_agendamento,
    resumo_ia, percepcao_closer,
    contatos(
      ghl_id, nome, email, telefone,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbclid, gclid,
      tt_source, tt_campaign, tt_medium, tt_term, tt_content,
      owner_name, owner_email, date_created, print_instagram,
      como_nos_conheceu, faturamento_anual, perfil_inteligente,
      tags
    )
  `

  const allOpps: OppRow[] = []
  const PAGE_SIZE = 1000
  let page = 0
  while (true) {
    let q = supabase
      .from('oportunidades')
      .select(OPP_SELECT)
      .eq('workspace_id', wid)
    // Em modo Produtividade, incluímos Vendas SQL para não perder eventos de SDR:
    // quando o SDR agenda uma reunião, a automação GHL move o lead para Vendas SQL
    // imediatamente. Excluir esse pipeline apaga o registro do agendamento feito pelo SDR.
    // O filtro por sdr_name / orderedSdrs abaixo garante que só ações de SDRs são contadas.
    q = applyRecuperacaoFilter(q, pipelineMode)
    const res = await q.order('id', { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (res.error) throw res.error
    const pageRows = (res.data ?? []) as unknown as OppRow[]
    allOpps.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) break
    page++
  }

  let rows = allOpps
  if (isFilterActive(filters.sdrs)) {
    rows = rows.filter((row) => {
      const sdr = isIaLead(row) ? 'SDR IA' : getOppSdr(row)
      if (filters.sdrs.exclude.includes(sdr)) return false
      if (filters.sdrs.include.length > 0) return filters.sdrs.include.includes(sdr)
      return true
    })
  }
  if (isFilterActive(filters.closers)) {
    rows = rows.filter((row) => {
      const closer = (row.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
      if (filters.closers.exclude.includes(closer)) return false
      if (filters.closers.include.length > 0) return filters.closers.include.includes(closer)
      return true
    })
  }
  if (isFilterActive(filters.canais)) {
    rows = rows.filter((row) => {
      const src = row.contatos?.utm_source ?? ''
      if (filters.canais.exclude.includes(src)) return false
      if (filters.canais.include.length > 0) return filters.canais.include.includes(src)
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
  if (isFilterActive(filters.campanhas)) {
    const includeCodes = filters.campanhas.include.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.campanhas.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
      : null
    const excludeCodes = filters.campanhas.exclude.length > 0
      ? new Set(utmCampaigns.filter((c) => filters.campanhas.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
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
  if (filters.modoMql === 'mql') {
    rows = rows.filter((row) => isMqlByTag(row.contatos))
  }

  return { opps: rows, revenueRows: [] }
}

// Calcula tempo médio de resposta da SDR IA via pares inbound → outbound(workflow).
// Lógica análoga à RPC get_sdr_avg_response_time, mas usando ghl_source='workflow'
// em vez de 'app', pois a IA responde automaticamente via automações GHL.
async function loadIaAvgResponseTime(
  iaContactIds: string[],
  startDate: string,
  endDate: string,
): Promise<number> {
  if (iaContactIds.length === 0) return 0

  const startISO = toSPISOStart(startDate)
  const endISO = toSPISOEnd(endDate)

  interface ComRow {
    contato_id: string | null
    ghl_conversation_id: string | null
    direction: string
    ghl_source: string
    data_comunicacao: string
  }

  // Busca inbound e outbound(workflow) em dois passes para evitar OR aninhado
  const allComs: ComRow[] = []
  const PAGE_SIZE = 1000
  const BATCH_SIZE = 100

  for (const direction of ['inbound', 'outbound'] as const) {
    for (let i = 0; i < iaContactIds.length; i += BATCH_SIZE) {
      const batch = iaContactIds.slice(i, i + BATCH_SIZE)
      let page = 0
      while (true) {
        let q = supabase
          .from('comunicacoes')
          .select('contato_id, ghl_conversation_id, direction, ghl_source, data_comunicacao')
          .gte('data_comunicacao', startISO)
          .lte('data_comunicacao', endISO)
          .eq('direction', direction)
          .in('contato_id', batch)
          .order('ghl_conversation_id')
          .order('data_comunicacao')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (direction === 'outbound') {
          q = q.eq('ghl_source', 'workflow')
        }
        const res = await q
        if (res.error) throw res.error
        allComs.push(...(res.data ?? []) as ComRow[])
        if ((res.data?.length ?? 0) < PAGE_SIZE) break
        page++
      }
    }
  }

  // Agrupa por conversa e ordena por data
  const byConv = new Map<string, ComRow[]>()
  for (const com of allComs) {
    if (!com.ghl_conversation_id) continue
    const list = byConv.get(com.ghl_conversation_id) ?? []
    list.push(com)
    byConv.set(com.ghl_conversation_id, list)
  }

  // Calcula pares inbound → primeira resposta workflow
  // Janela máxima: 86400s (24h) — mesmo critério da RPC humana.
  // Exibe o tempo real das automações GHL, incluindo follow-ups agendados.
  const MAX_IA_RESPONSE_SECS = 86_400
  const gaps: number[] = []
  for (const msgs of byConv.values()) {
    msgs.sort((a, b) => a.data_comunicacao.localeCompare(b.data_comunicacao))
    let lastInboundTs: number | null = null
    for (const msg of msgs) {
      if (msg.direction === 'inbound') {
        lastInboundTs = new Date(msg.data_comunicacao).getTime()
      } else if (msg.direction === 'outbound' && msg.ghl_source === 'workflow' && lastInboundTs !== null) {
        const gapSecs = (new Date(msg.data_comunicacao).getTime() - lastInboundTs) / 1000
        if (gapSecs >= 0 && gapSecs <= MAX_IA_RESPONSE_SECS) {
          gaps.push(gapSecs)
        }
        lastInboundTs = null // reseta: só conta o primeiro reply por pergunta
      }
    }
  }

  if (gaps.length === 0) return 0
  return gaps.reduce((a, b) => a + b, 0) / gaps.length
}

// Carrega tempo médio de resposta por SDR via RPC (mesmo usado no leaderboard cohort)
async function loadAvgResponseTimeBySdr(startDate: string, endDate: string): Promise<Map<string, number>> {
  const startISO = toSPISOStart(startDate)
  const endISO = toSPISOEnd(endDate)
  const res = await supabase.rpc('get_sdr_avg_response_time', { p_start: startISO, p_end: endISO })
  if (res.error) throw res.error
  const map = new Map<string, number>()
  for (const row of (res.data ?? []) as { sdr_name: string; avg_response_seconds: number }[]) {
    if (row.sdr_name) map.set(row.sdr_name, row.avg_response_seconds)
  }
  return map
}

// Carrega faturamento por SDR em modo produtividade: usa data_pagamento_entrada no período,
// sem filtrar por pipeline (crédita o SDR do lead original, independente de onde fechou).
async function loadProdRevenueBySdr(
  startDate: string,
  endDate: string,
): Promise<Map<string, { total: number; oppIds: Set<string> }>> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const startISO = toSPISOStart(startDate)
  const endISO = toSPISOEnd(endDate)

  const revenueByOppId = new Map<string, number>()
  {
    const PAGE_SIZE = 1000
    let page = 0
    while (true) {
      const revRes = await supabase
        .from('vendas_fechamento')
        .select('oportunidade_id, valor_faturado')
        .eq('workspace_id', wid)
        .gte('data_pagamento_entrada', startISO)
        .lte('data_pagamento_entrada', endISO)
        .order('oportunidade_id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (revRes.error) throw revRes.error
      for (const row of (revRes.data ?? []) as { oportunidade_id: string; valor_faturado: number | null }[]) {
        if (row.oportunidade_id && (row.valor_faturado ?? 0) > 0) {
          revenueByOppId.set(row.oportunidade_id, row.valor_faturado!)
        }
      }
      if ((revRes.data?.length ?? 0) < PAGE_SIZE) break
      page++
    }
  }

  if (revenueByOppId.size === 0) return new Map()

  // Busca sdr_name das opps pagas — sem filtro de pipeline
  const oppIds = [...revenueByOppId.keys()]
  const revBySdr = new Map<string, { total: number; oppIds: Set<string> }>()
  const BATCH = 100
  for (let i = 0; i < oppIds.length; i += BATCH) {
    const batch = oppIds.slice(i, i + BATCH)
    const res = await supabase.from('oportunidades').select('id, sdr_name, contatos(tags, owner_name)').in('id', batch)
    if (res.error) throw res.error
    for (const row of (res.data ?? []) as unknown as OppRow[]) {
      // Leads da SDR IA são identificados pela tag '[cp] sdr ia' — agrupados sob 'SDR IA'
      // Para demais leads, usar sdr_name com fallback para owner_name (regra obrigatória CLAUDE.md)
      const sdrKey = isIaLead(row) ? 'SDR IA' : (row.sdr_name || row.contatos?.owner_name || null)
      if (!sdrKey) continue
      const entry = revBySdr.get(sdrKey) ?? { total: 0, oppIds: new Set<string>() }
      entry.total += revenueByOppId.get(row.id) ?? 0
      entry.oppIds.add(row.id)
      revBySdr.set(sdrKey, entry)
    }
  }
  return revBySdr
}

async function loadAttemptsByOppId(
  sourceOpps: OppRow[],
  startDate: string,
  endDate: string,
): Promise<Map<string, CommunicationCount>> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const attemptsByOppId = new Map<string, CommunicationCount>()
  const startISO = toSPISOStart(startDate)
  const endISO = toSPISOEnd(endDate)

  const humanOpps = sourceOpps.filter((opp) => !isIaLead(opp))
  const iaOpps = sourceOpps.filter(isIaLead)

  const contatoToOppId = new Map<string, string>()
  for (const opp of humanOpps) {
    if (opp.contato_id && !contatoToOppId.has(opp.contato_id)) {
      contatoToOppId.set(opp.contato_id, opp.id)
    }
  }

  const iaContactToOppId = new Map<string, string>()
  for (const opp of iaOpps) {
    if (opp.contato_id && !iaContactToOppId.has(opp.contato_id)) {
      iaContactToOppId.set(opp.contato_id, opp.id)
    }
  }

  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const res = await supabase
      .from('comunicacoes')
      .select('contato_id, channel')
      .eq('workspace_id', wid)
      .gte('data_comunicacao', startISO)
      .lte('data_comunicacao', endISO)
      .eq('direction', 'outbound')
      .eq('ghl_source', 'app')
      .in('channel', ['call', 'whatsapp', 'sms'])
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (res.error) throw res.error
    const pageRows = (res.data ?? []) as { contato_id: string | null; channel: string }[]
    for (const row of pageRows) {
      if (!row.contato_id) continue
      const oppId = contatoToOppId.get(row.contato_id)
      if (!oppId) continue
      const entry = attemptsByOppId.get(oppId) ?? { calls: 0, messages: 0 }
      if (row.channel === 'call') entry.calls++
      else entry.messages++
      attemptsByOppId.set(oppId, entry)
    }
    if (pageRows.length < PAGE_SIZE) break
    page++
  }

  const iaContatoIds = [...iaContactToOppId.keys()]
  if (iaContatoIds.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < iaContatoIds.length; i += BATCH_SIZE) {
      const batch = iaContatoIds.slice(i, i + BATCH_SIZE)
      let batchPage = 0
      while (true) {
        const res = await supabase
          .from('comunicacoes')
          .select('contato_id')
          .gte('data_comunicacao', startISO)
          .lte('data_comunicacao', endISO)
          .eq('direction', 'outbound')
          .eq('ghl_source', 'workflow')
          .in('contato_id', batch)
          .order('id', { ascending: true })
          .range(batchPage * PAGE_SIZE, (batchPage + 1) * PAGE_SIZE - 1)
        if (res.error) throw res.error
        const pageRows = (res.data ?? []) as { contato_id: string | null }[]
        for (const row of pageRows) {
          if (!row.contato_id) continue
          const oppId = iaContactToOppId.get(row.contato_id)
          if (!oppId) continue
          const entry = attemptsByOppId.get(oppId) ?? { calls: 0, messages: 0 }
          entry.messages++
          attemptsByOppId.set(oppId, entry)
        }
        if (pageRows.length < PAGE_SIZE) break
        batchPage++
      }
    }
  }

  return attemptsByOppId
}

export function useSDRHighlightChart({
  mode,
  orderedSdrs,
  opps,
  revenueRows,
  filters,
  startDate,
  endDate,
  pipelineMode,
}: UseSDRHighlightChartParams): SDRHighlightChartData {
  const [rows, setRows] = useState<SDRHighlightChartRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stableSdrs = useMemo(
    () => orderedSdrs.filter(Boolean),
    [orderedSdrs]
  )

  useEffect(() => {
    let cancelled = false

    if (stableSdrs.length === 0) {
      setRows([])
      setLoading(false)
      setError(null)
      return () => { cancelled = true }
    }

    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const base = mode === 'cohort'
          ? { opps, revenueRows }
          : await loadProdutividadeBase(filters, pipelineMode)

        // Leads IA são agrupados sob 'SDR IA' — incluir se 'SDR IA' estiver na lista
        const filteredOpps = base.opps.filter((opp) => {
          const sdr = isIaLead(opp) ? 'SDR IA' : getOppSdr(opp)
          return stableSdrs.includes(sdr)
        })
        const attemptsByOppId = await loadAttemptsByOppId(filteredOpps, startDate, endDate)

        let avgResponseTimeBySdr: Map<string, number> | undefined
        let prodRevenueBySdr: Map<string, { total: number; oppIds: Set<string> }> | undefined

        if (mode === 'produtividade') {
          const iaContactIds = filteredOpps
            .filter(isIaLead)
            .map((opp) => opp.contato_id)
            .filter((id): id is string => !!id)

          ;[avgResponseTimeBySdr, prodRevenueBySdr] = await Promise.all([
            loadAvgResponseTimeBySdr(startDate, endDate),
            loadProdRevenueBySdr(startDate, endDate),
          ])

          // Injeta o tempo de resposta da SDR IA (calculado via workflow, não via RPC humana)
          const iaAvgSecs = await loadIaAvgResponseTime(iaContactIds, startDate, endDate)
          if (iaAvgSecs > 0) {
            avgResponseTimeBySdr ??= new Map()
            avgResponseTimeBySdr.set('SDR IA', iaAvgSecs)
          }
        }

        const nextRows = buildRows(
          stableSdrs,
          filteredOpps,
          base.revenueRows,
          attemptsByOppId,
          mode,
          startDate,
          endDate,
          avgResponseTimeBySdr,
          prodRevenueBySdr,
        )

        if (!cancelled) {
          setRows(nextRows)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useSDRHighlightChart] error', err)
          setRows([])
          setError(err instanceof Error ? err.message : 'Erro ao carregar gráfico de SDRs')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [mode, stableSdrs, opps, revenueRows, filters, startDate, endDate, pipelineMode])

  return { rows, loading, error }
}
