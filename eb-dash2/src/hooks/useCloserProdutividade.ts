import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd, tsToSPDate } from '@/lib/utils/dates'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import { fetchAllPages, fetchAllPagesByCursor, fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { extractErrorMessage } from '@/lib/errors'
import { isMqlByTag, parseTags, isVendaExterna, computePendentesAssinatura, buildAssinadasPorEtapa, caixaRecebidoNoPeriodo, faturamentoDaVenda, buildCaixaPorCliente } from './useTrafego'
import type { RevenueRow, PendentesAssinatura, CaixaPorCliente } from './useTrafego'
import { VENDA_DIRETA_CANAL } from './usePreVendas'
import { isFilterActive, applyFilterValue } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

// ─── Types ────────────────────────────────────────────────────

// Lead mínimo para modal de leads
export interface ProdLead {
  id: string
  contatos?: { nome?: string | null; email?: string | null; utm_source?: string | null } | null
  status?: string | null
  pipeline_name?: string | null
}

export interface CloserProdutividadeRow {
  closer: string
  leads_count: number
  mqls: number
  // Eventos de vendas que ACONTECERAM no período
  agendados_vendas: number      // data_agendamento_vendas BETWEEN
  reunioes: number              // data_realizacao_vendas BETWEEN
  no_shows: number              // data_no_show_vendas BETWEEN
  negociacao: number            // data_negociacao BETWEEN
  fechados: number              // data_pagamento_entrada BETWEEN (vendas_fechamento)
  faturamento: number           // sum valor_faturado dos fechados no período
  caixa: number                 // soma dos pagamentos do cronograma recebidos no período
  // Comunicações
  ligacoes: number
  mensagens: number
  pessoasContatadas: number
  // Leads por etapa (para modal clicável)
  leadsLeads: ProdLead[]
  mqlsLeads: ProdLead[]
  agendadosLeads: ProdLead[]
  reunioesLeads: ProdLead[]
  noShowsLeads: ProdLead[]
  negociacaoLeads: ProdLead[]
  fechadosLeads: ProdLead[]
}

export interface CloserProdutividadeConsolidado {
  leads_count: number
  mqls: number
  agendados_vendas: number
  reunioes: number
  no_shows: number
  negociacao: number
  fechados: number
  faturamento: number
  caixa: number
  ligacoes: number
  mensagens: number
  pessoasContatadas: number
  diasNoPeriodo: number
}

// Linha de closer dentro de um mês — para o dropdown da Matriz
export interface CloserMesSubRow {
  closer: string
  reunioes: number
  fechados: number
  conversao_pct: number   // fechados / reunioes * 100
  faturamento: number
  caixa: number
}

// Linha por mês de evento — para Matriz Produtividade
export interface VendasProdMesRow {
  mes: string         // 'YYYY-MM-01'
  mes_label: string   // 'Mar/26'
  leads_count: number
  mqls: number
  agendados_vendas: number
  reunioes: number
  no_shows: number
  negociacao: number
  fechados: number
  faturamento: number
  caixa: number
  // Percentuais entre etapas
  reunioes_pct: number    // reunioes / agendados
  no_shows_pct: number    // no_shows / agendados
  negociacao_pct: number  // negociacao / reunioes
  fechados_pct: number    // fechados / reunioes
  // Breakdown por closer (para dropdown expandível)
  closerRows: CloserMesSubRow[]
}

// Totais globais (TODAS as opps no período, não apenas closers registrados)
export interface CloserProdutividadeOverall {
  leads_count: number
  mqls: number
  agendados_vendas: number
  reunioes: number
  no_shows: number
  negociacao: number
  fechados: number
  faturamento: number
  caixa: number
}

export interface CloserProdutividadeData {
  rows: CloserProdutividadeRow[]
  consolidado: CloserProdutividadeConsolidado
  overall: CloserProdutividadeOverall
  /** Vendas do período que ainda não têm contrato assinado (não desconta do faturamento). */
  pendentes: PendentesAssinatura
  /**
   * Detalhamento "quem trouxe o caixa" do MESMO universo dos KPIs deste hook.
   *
   * Existe porque o modal do card usava a lista do modo Cohort enquanto o card
   * mostrava o total de Produtividade — duas fontes na mesma tela, que divergiam
   * (visto em julho/2026: card R$ 0,00 contra R$ 192.200,00 na lista).
   */
  caixaPorCliente: CaixaPorCliente[]
  rowsByMonth: VendasProdMesRow[]
  loading: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────

function countDays(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

// ─── Hook ─────────────────────────────────────────────────────

export interface CloserProdutividadeDimensionFilters {
  closerFilter?: FilterValues
  sdrFilter?: FilterValues
  canalFilter?: FilterValues
  funilFilter?: FilterValues
  campanhaFilter?: FilterValues
}

const EMPTY_OVERALL: CloserProdutividadeOverall = {
  leads_count: 0,
  mqls: 0,
  agendados_vendas: 0,
  reunioes: 0,
  no_shows: 0,
  negociacao: 0,
  fechados: 0,
  faturamento: 0,
  caixa: 0,
}

const EMPTY_PENDENTES: PendentesAssinatura = { count: 0, faturamento: 0, caixa: 0, rows: [] }

export function useCloserProdutividade(
  startDate: string,
  endDate: string,
  enabled: boolean,
  dimensionFilters?: CloserProdutividadeDimensionFilters,
  // Mesmo filtro de Recuperação das outras abas. Antes o pipeline vinha cravado
  // (`.neq(pipeline_id, RECUPERACAO)`), então o toggle da tela não tinha efeito
  // nenhum aqui e os cards de venda/faturamento divergiam da Aquisição.
  pipelineMode: RecuperacaoMode = 'exclude_recuperacao',
): CloserProdutividadeData {
  const [rows, setRows] = useState<CloserProdutividadeRow[]>([])
  const [rowsByMonth, setRowsByMonth] = useState<VendasProdMesRow[]>([])
  const [overall, setOverall] = useState<CloserProdutividadeOverall>(EMPTY_OVERALL)
  const [pendentes, setPendentes] = useState<PendentesAssinatura>(EMPTY_PENDENTES)
  const [caixaPorCliente, setCaixaPorCliente] = useState<CaixaPorCliente[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !startDate || !endDate) {
      setRows([])
      setRowsByMonth([])
      setPendentes(EMPTY_PENDENTES)
      setCaixaPorCliente([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useCloserProdutividade] No workspace found')
          setRows([])
          setOverall(EMPTY_OVERALL)
          setRowsByMonth([])
          setPendentes(EMPTY_PENDENTES)
          setCaixaPorCliente([])
          return
        }

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        // Step 1 — Closers oficiais
        const closerRes = await supabase
          .from('ghl_users')
          .select('nome')
          .contains('papeis', ['closer'])
          .eq('workspace_id', wid)
        if (cancelled) return
        const closerNames = new Set(
          (closerRes.data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean),
        )

        // Step 1.5 — utm_campaigns para mapear funil/campanha
        const campaignsRes = await supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').eq('workspace_id', wid)
        if (cancelled) return
        const utmCampaigns = (campaignsRes.data ?? []) as { nome: string | null; utm_campaign: string | number | null; funnels: unknown }[]

        // Step 2 — Opps do pipeline relevante
        // Em produtividade, a base não pode ser limitada por data_lead_recebido.
        // Cada métrica usa a data do próprio evento.
        interface OppEventRow {
          id: string
          contato_id: string | null
          vendedor_closer: string | null
          sdr_name: string | null
          status: string | null
          pipeline_name: string | null
          pipeline_stage_id: string | null
          contatos: { nome?: string | null; email?: string | null; utm_source?: string | null; utm_campaign?: string | number | null; tags?: string | null; contact_source?: string | null } | null
          data_agendamento_vendas: string | null
          data_realizacao_vendas: string | null
          data_no_show_vendas: string | null
          data_negociacao: string | null
          data_lead_recebido: string | null
        }

        const OPP_EVENT_SELECT = 'id, contato_id, vendedor_closer, sdr_name, status, pipeline_name, pipeline_stage_id, contatos!inner(nome, email, utm_source, utm_campaign, tags, contact_source, owner_name, print_instagram, workspace_id), data_agendamento_vendas, data_realizacao_vendas, data_no_show_vendas, data_negociacao, data_lead_recebido'

        // Step 2.a — Receita do período PRIMEIRO.
        //
        // A ordem importa: os ids pagos entram no filtro das oportunidades logo
        // abaixo. Uma venda paga dentro do período pode não ter NENHUM evento no
        // período (lead de maio, reunião em maio, pagamento em julho) — sem ela na
        // base, o filtro dimensional a descartaria e a venda sumiria dos Fechados.
        const pagoMap = new Map<string, { faturado: number; entrada: number }>()
        const pagoMesMap = new Map<string, string>() // oppId → 'YYYY-MM-01' (mês SP do pagamento)
        // Linhas cruas de receita do período — servem ao card "Sem contrato assinado".
        const revenueRowsPeriodo: RevenueRow[] = []
        {
          const paginas = await fetchAllPages<RevenueRow>(
            () => supabase
              .from('vendas_fechamento')
              .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, nome_contratante, produto_vendido, origem, op_link_do_contrato_assinado, data_da_assinatura_do_contrato, contrato_status')
              .eq('workspace_id', wid)
              .gte('data_pagamento_entrada', startISO)
              .lte('data_pagamento_entrada', endISO)
              .order('id') as unknown as { range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }> },
          )
          if (cancelled) return
          for (const r of paginas) {
            if (r.oportunidade_id) {
              revenueRowsPeriodo.push(r)
              const existing = pagoMap.get(r.oportunidade_id) ?? { faturado: 0, entrada: 0 }
              existing.faturado += faturamentoDaVenda(r)
              // Caixa = recebido DENTRO do período (soma o cronograma de pagamentos).
              existing.entrada += caixaRecebidoNoPeriodo(r, { startDate, endDate })
              pagoMap.set(r.oportunidade_id, existing)
              if (r.data_pagamento_entrada) {
                pagoMesMap.set(r.oportunidade_id, tsToSPDate(r.data_pagamento_entrada).slice(0, 7) + '-01')
              }
            }
          }
        }

        // Step 2.b — Oportunidades: só as que têm evento DENTRO do período.
        //
        // Antes isso varria as ~10 mil oportunidades do workspace inteiro, sem
        // filtro de data, com o select cheio — 11 páginas de payload gordo que
        // faziam a aba travar e estourar em "Erro ao carregar dados de
        // produtividade". Todas as métricas daqui comparam a data do evento com
        // startDate/endDate, então quem não tem evento na janela não muda nada.
        // Medido em 07/07–05/08: 10.023 linhas → 1.408.
        const eventoNoPeriodo = [
          `and(data_lead_recebido.gte.${startISO},data_lead_recebido.lte.${endISO})`,
          `and(data_agendamento_vendas.gte.${startDate},data_agendamento_vendas.lte.${endDate})`,
          `and(data_realizacao_vendas.gte.${startDate},data_realizacao_vendas.lte.${endDate})`,
          `and(data_no_show_vendas.gte.${startDate},data_no_show_vendas.lte.${endDate})`,
          `and(data_negociacao.gte.${startDate},data_negociacao.lte.${endDate})`,
        ].join(',')

        const oppsPorEvento = await fetchAllPagesByCursor<OppEventRow>(
          (cursor) => {
            // Sem cursor na 1ª página: `id=gt.` (vazio) é 400 no PostgREST.
            let q = supabase
              .from('oportunidades')
              .select(OPP_EVENT_SELECT)
              .eq('workspace_id', wid)
            q = applyRecuperacaoFilter(q, pipelineMode)
            q = q.or(eventoNoPeriodo)
            if (cursor !== null) q = q.gt('id', cursor)
            return q.order('id', { ascending: true }) as unknown as { limit(n: number): PromiseLike<{ data: OppEventRow[] | null; error: unknown | null }> }
          },
        )
        if (cancelled) return

        // As pagas do período que ficaram de fora do filtro de evento acima.
        const porId = new Map<string, OppEventRow>(oppsPorEvento.map((o) => [o.id, o]))
        {
          const faltantes = [...pagoMap.keys()].filter((id) => !porId.has(id))
          if (faltantes.length > 0) {
            const BATCH = 100
            const lotes: string[][] = []
            for (let i = 0; i < faltantes.length; i += BATCH) lotes.push(faltantes.slice(i, i + BATCH))
            const respostas = await Promise.all(
              lotes.map(async (batch) => {
                let q = supabase
                  .from('oportunidades')
                  .select(OPP_EVENT_SELECT)
                  .eq('workspace_id', wid)
                q = applyRecuperacaoFilter(q, pipelineMode)
                const res = await q.in('id', batch)
                if (res.error) throw res.error
                return (res.data ?? []) as unknown as OppEventRow[]
              }),
            )
            if (cancelled) return
            for (const linhas of respostas) for (const o of linhas) porId.set(o.id, o)
          }
        }
        const allEventOpps = [...porId.values()]

        // Step 2.5 — Aplicar filtros dimensionais aos eventos
        let funilIncludeCodes: Set<string> | null = null
        let funilExcludeCodes: Set<string> | null = null
        let campanhaIncludeCodes: Set<string> | null = null
        let campanhaExcludeCodes: Set<string> | null = null

        if (dimensionFilters?.funilFilter && isFilterActive(dimensionFilters.funilFilter)) {
          if (dimensionFilters.funilFilter.include.length > 0) {
            funilIncludeCodes = new Set(
              utmCampaigns
                .filter((c) => parseTags(c.funnels).some((f) => dimensionFilters.funilFilter!.include.includes(f)))
                .map((c) => String(c.utm_campaign)),
            )
          }
          if (dimensionFilters.funilFilter.exclude.length > 0) {
            funilExcludeCodes = new Set(
              utmCampaigns
                .filter((c) => parseTags(c.funnels).some((f) => dimensionFilters.funilFilter!.exclude.includes(f)))
                .map((c) => String(c.utm_campaign)),
            )
          }
        }
        if (dimensionFilters?.campanhaFilter && isFilterActive(dimensionFilters.campanhaFilter)) {
          if (dimensionFilters.campanhaFilter.include.length > 0) {
            campanhaIncludeCodes = new Set(
              utmCampaigns
                .filter((c) => dimensionFilters.campanhaFilter!.include.includes(c.nome ?? ''))
                .map((c) => String(c.utm_campaign)),
            )
          }
          if (dimensionFilters.campanhaFilter.exclude.length > 0) {
            campanhaExcludeCodes = new Set(
              utmCampaigns
                .filter((c) => dimensionFilters.campanhaFilter!.exclude.includes(c.nome ?? ''))
                .map((c) => String(c.utm_campaign)),
            )
          }
        }

        function passesFilter(opp: OppEventRow): boolean {
          if (dimensionFilters?.canalFilter && isFilterActive(dimensionFilters.canalFilter)) {
            // Venda direta é um "canal" próprio (fora do funil), independe do utm_source.
            const src = isVendaExterna(opp) ? VENDA_DIRETA_CANAL : (opp.contatos?.utm_source?.trim() ?? '')
            if (!applyFilterValue(src, dimensionFilters.canalFilter)) return false
          }
          if (dimensionFilters?.sdrFilter && isFilterActive(dimensionFilters.sdrFilter)) {
            const sdrEffective = parseTags(opp.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
              ? 'SDR IA'
              : (opp.sdr_name || '')
            if (!applyFilterValue(sdrEffective, dimensionFilters.sdrFilter)) return false
          }
          if (dimensionFilters?.closerFilter && isFilterActive(dimensionFilters.closerFilter)) {
            const closer = (opp.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
            if (!applyFilterValue(closer, dimensionFilters.closerFilter)) return false
          }
          const utmCode = opp.contatos?.utm_campaign != null ? String(opp.contatos.utm_campaign) : ''
          if (funilIncludeCodes !== null && !funilIncludeCodes.has(utmCode)) return false
          if (funilExcludeCodes !== null && funilExcludeCodes.has(utmCode)) return false
          if (campanhaIncludeCodes !== null && !campanhaIncludeCodes.has(utmCode)) return false
          if (campanhaExcludeCodes !== null && campanhaExcludeCodes.has(utmCode)) return false
          return true
        }

        const filteredEventOpps = allEventOpps.filter(passesFilter)
        const filteredOppIds = new Set(filteredEventOpps.map((o) => o.id))

        // Step 3 — Fechados com pagamento confirmado no período (carregados no 2.a)

        // Filtrar pagoMap para manter apenas opps que passam nos filtros dimensionais
        if (filteredOppIds.size < allEventOpps.length) {
          for (const oppId of [...pagoMap.keys()]) {
            if (!filteredOppIds.has(oppId)) {
              pagoMap.delete(oppId)
              pagoMesMap.delete(oppId)
            }
          }
        }

        // Pendências de contrato — mesmo universo dos fechados do período, depois
        // dos filtros dimensionais. Não desconta nada do faturamento/caixa.
        const pendentesPeriodo = computePendentesAssinatura(
          revenueRowsPeriodo.filter((r) => pagoMap.has(r.oportunidade_id)),
          buildAssinadasPorEtapa(allEventOpps),
        )
        if (!cancelled) setPendentes(pendentesPeriodo)

        // Mesmo universo dos KPIs acima — o modal do card tem que somar o card.
        if (!cancelled) {
          setCaixaPorCliente(
            buildCaixaPorCliente(
              revenueRowsPeriodo.filter((r) => pagoMap.has(r.oportunidade_id)),
              allEventOpps,
              { startDate, endDate },
            ),
          )
        }

        // Lookup closer + contato para opps pagas
        interface OppCloserRow {
          id: string
          vendedor_closer: string | null
          status: string | null
          pipeline_name: string | null
          contatos: { nome?: string | null; email?: string | null; utm_source?: string | null } | null
        }
        const pagoCloserMap = new Map<string, string>()
        const pagoOppDetails = new Map<string, OppCloserRow>()
        if (pagoMap.size > 0) {
          const pagoIds = [...pagoMap.keys()]
          const BATCH = 100
          const lotes: string[][] = []
          for (let i = 0; i < pagoIds.length; i += BATCH) lotes.push(pagoIds.slice(i, i + BATCH))
          // Os lotes são independentes — em série só somavam latência.
          // Esta query NÃO exclui o pipeline de Recuperação de propósito: 7 vendas
          // pagas vivem lá e sumiriam se fosse derivada de allEventOpps.
          const respostas = await Promise.all(
            lotes.map(async (batch) => {
              const res = await supabase
                .from('oportunidades')
                .select('id, vendedor_closer, status, pipeline_name, contatos!inner(nome, email, utm_source, workspace_id)')
                .eq('workspace_id', wid)
                .in('id', batch)
              if (res.error) throw res.error
              return (res.data ?? []) as OppCloserRow[]
            }),
          )
          if (cancelled) return
          for (const linhas of respostas) {
            for (const r of linhas) {
              if (r.id && r.vendedor_closer) {
                const normalized = r.vendedor_closer.replace(/\s+/g, ' ').trim()
                pagoCloserMap.set(r.id, normalized)
                pagoOppDetails.set(r.id, { ...r, vendedor_closer: normalized })
              }
            }
          }
        }

        // Step 4 — Comunicações outbound do período
        interface ComRow { contato_id: string | null; channel: string }
        // Cursor pela DATA, não pelo `id`: com filtro de período, ordenar por id
        // faz o Postgres varrer a PK descartando tudo que está fora da janela —
        // 1.094 ms por página contra 6 ms, e piorando a cada página até virar 500.
        const allComs = await fetchAllPagesByTimeCursor<ComRow & { id: string; data_comunicacao: string | null }>(
          (cursor) =>
            supabase
              .from('comunicacoes')
              .select('id, contato_id, channel, data_comunicacao')
              .eq('workspace_id', wid)
              .gte('data_comunicacao', cursor ?? startISO)
              .lte('data_comunicacao', endISO)
              .eq('direction', 'outbound')
              .eq('ghl_source', 'app')
              .in('channel', ['call', 'whatsapp', 'sms'])
              .order('data_comunicacao', { ascending: true })
              .order('id', { ascending: true }) as never,
          { getTime: (r) => r.data_comunicacao },
        )
        if (cancelled) return

        // Closer de cada contato — apenas dos contatos que APARECEM nessas
        // comunicações, buscados por id.
        //
        // Este mapa não pode sair de `allEventOpps` (filtrado por evento no
        // período): uma ligação do período pode ser para um contato cuja
        // oportunidade não teve evento na janela, e ele ficaria sem closer. Mas
        // também não precisa do workspace inteiro — varrer as ~10 mil
        // oportunidades aqui era o que sobrecarregava a aba depois que o resto já
        // tinha sido enxugado. No período 07/07–05/08 são 827 contatos: 9 lotes
        // leves em paralelo, no lugar de 11 páginas.
        const contatoToCloser = new Map<string, string>()
        {
          const ids = [...new Set(allComs.map((c) => c.contato_id).filter((v): v is string => !!v))]
          const BATCH = 100
          const lotes: string[][] = []
          for (let i = 0; i < ids.length; i += BATCH) lotes.push(ids.slice(i, i + BATCH))
          const respostas = await Promise.all(
            lotes.map(async (batch) => {
              let q = supabase
                .from('oportunidades')
                .select('contato_id, vendedor_closer')
              q = applyRecuperacaoFilter(q, pipelineMode)
              const res = await q.in('contato_id', batch)
              if (res.error) throw res.error
              return (res.data ?? []) as { contato_id: string | null; vendedor_closer: string | null }[]
            }),
          )
          if (cancelled) return
          for (const linhas of respostas) {
            for (const row of linhas) {
              if (row.contato_id && row.vendedor_closer) {
                contatoToCloser.set(row.contato_id, row.vendedor_closer.replace(/\s+/g, ' ').trim())
              }
            }
          }
        }

        const leadMesMap = new Map<string, { leads_count: number; mqls: number }>()
        const byCloserLead = new Map<string, { leads_count: number; mqls: number }>()
        const leadDateInRange = (value: string | null) => {
          if (!value) return null
          const spDate = tsToSPDate(value)
          return spDate >= startDate && spDate <= endDate ? spDate : null
        }

        const overallLeadCounts = {
          leads_count: 0,
          mqls: 0,
        }
        for (const opp of filteredEventOpps) {
          const leadDate = leadDateInRange(opp.data_lead_recebido)
          if (!leadDate) continue
          const isMql = isMqlByTag(opp.contatos as unknown as Parameters<typeof isMqlByTag>[0])
          overallLeadCounts.leads_count++
          if (isMql) overallLeadCounts.mqls++

          const monthKey = leadDate.slice(0, 7) + '-01'
          const monthEntry = leadMesMap.get(monthKey) ?? { leads_count: 0, mqls: 0 }
          monthEntry.leads_count++
          if (isMql) monthEntry.mqls++
          leadMesMap.set(monthKey, monthEntry)

          const closer = opp.vendedor_closer?.replace(/\s+/g, ' ').trim()
          if (closer && closerNames.has(closer)) {
            const closerEntry = byCloserLead.get(closer) ?? { leads_count: 0, mqls: 0 }
            closerEntry.leads_count++
            if (isMql) closerEntry.mqls++
            byCloserLead.set(closer, closerEntry)
          }
        }

        // Totais globais (TODAS as opps, não apenas closers registrados)
        const ov: CloserProdutividadeOverall = {
          leads_count: overallLeadCounts.leads_count,
          mqls: overallLeadCounts.mqls,
          agendados_vendas: 0, reunioes: 0, no_shows: 0, negociacao: 0,
          fechados: 0, faturamento: 0, caixa: 0,
        }
        for (const opp of filteredEventOpps) {
          if (opp.data_agendamento_vendas && opp.data_agendamento_vendas >= startDate && opp.data_agendamento_vendas <= endDate) ov.agendados_vendas++
          if (opp.data_realizacao_vendas && opp.data_realizacao_vendas >= startDate && opp.data_realizacao_vendas <= endDate) ov.reunioes++
          if (opp.data_no_show_vendas && opp.data_no_show_vendas >= startDate && opp.data_no_show_vendas <= endDate && !opp.data_realizacao_vendas) ov.no_shows++
          if (opp.data_negociacao && opp.data_negociacao >= startDate && opp.data_negociacao <= endDate) ov.negociacao++
        }
        for (const [, rev] of pagoMap) {
          ov.fechados++
          ov.faturamento += rev.faturado
          ov.caixa += rev.entrada
        }
        if (!cancelled) setOverall(ov)

        // Step 4.5 — Agrupa por mês de evento (para Matriz Produtividade)
        {
          function fmtMesLabel(mes: string): string {
            const [year, month] = mes.split('-').map(Number)
            return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
              .replace('.', '').replace(' ', '/')
          }
          interface MesAccum {
            leads_count: number
            mqls: number
            agendados: Set<string>; reunioes: Set<string>; no_shows: Set<string>; negociacao: Set<string>; fechados: Set<string>
            faturamento: number; caixa: number
          }
          const byMes = new Map<string, MesAccum>()
          function getMes(mes: string): MesAccum {
            if (!byMes.has(mes)) {
              byMes.set(mes, {
                leads_count: 0,
                mqls: 0,
                agendados: new Set(), reunioes: new Set(),
                no_shows: new Set(), negociacao: new Set(), fechados: new Set(), faturamento: 0, caixa: 0,
              })
            }
            return byMes.get(mes)!
          }

          // Acumulador por mês+closer para o dropdown expandível
          interface CloserMesAccum { reunioes: Set<string>; fechados: Set<string>; faturamento: number; caixa: number }
          const byCloserMes = new Map<string, Map<string, CloserMesAccum>>()
          function getCloserMes(mes: string, closer: string): CloserMesAccum {
            if (!byCloserMes.has(mes)) byCloserMes.set(mes, new Map())
            const mesMap = byCloserMes.get(mes)!
            if (!mesMap.has(closer)) mesMap.set(closer, { reunioes: new Set(), fechados: new Set(), faturamento: 0, caixa: 0 })
            return mesMap.get(closer)!
          }

          for (const [mes, leadCounts] of leadMesMap) {
            const m = getMes(mes)
            m.leads_count = leadCounts.leads_count
            m.mqls = leadCounts.mqls
          }
          for (const opp of filteredEventOpps) {
            if (opp.data_agendamento_vendas && opp.data_agendamento_vendas >= startDate && opp.data_agendamento_vendas <= endDate) {
              const mes = opp.data_agendamento_vendas.slice(0, 7) + '-01'
              const m = getMes(mes); m.agendados.add(opp.id)
            }
            if (opp.data_realizacao_vendas && opp.data_realizacao_vendas >= startDate && opp.data_realizacao_vendas <= endDate) {
              const mes = opp.data_realizacao_vendas.slice(0, 7) + '-01'
              const m = getMes(mes); m.reunioes.add(opp.id)
              // Acumula por closer
              const closer = opp.vendedor_closer?.replace(/\s+/g, ' ').trim()
              if (closer) getCloserMes(mes, closer).reunioes.add(opp.id)
            }
            if (opp.data_no_show_vendas && opp.data_no_show_vendas >= startDate && opp.data_no_show_vendas <= endDate && !opp.data_realizacao_vendas) {
              const mes = opp.data_no_show_vendas.slice(0, 7) + '-01'
              const m = getMes(mes); m.no_shows.add(opp.id)
            }
            if (opp.data_negociacao && opp.data_negociacao >= startDate && opp.data_negociacao <= endDate) {
              const mes = opp.data_negociacao.slice(0, 7) + '-01'
              const m = getMes(mes); m.negociacao.add(opp.id)
            }
          }
          for (const [oppId, rev] of pagoMap) {
            const mes = pagoMesMap.get(oppId)
            if (!mes) continue
            const m = getMes(mes); m.fechados.add(oppId)
            m.faturamento += rev.faturado; m.caixa += rev.entrada
            // Acumula fechados por closer
            const closer = pagoCloserMap.get(oppId)
            if (closer) {
              const cm = getCloserMes(mes, closer)
              cm.fechados.add(oppId)
              cm.faturamento += rev.faturado
              cm.caixa += rev.entrada
            }
          }
          const computedRowsByMonth: VendasProdMesRow[] = [...byMes.entries()]
            .map(([mes, m]) => {
              const leadCounts = leadMesMap.get(mes) ?? { leads_count: 0, mqls: 0 }
              const ag = m.agendados.size; const re = m.reunioes.size
              // Monta closerRows para este mês
              const mesCloserMap = byCloserMes.get(mes)
              const closerRows: CloserMesSubRow[] = mesCloserMap
                ? [...mesCloserMap.entries()]
                    .map(([closer, cm]) => {
                      const re2 = cm.reunioes.size; const fe = cm.fechados.size
                      return {
                        closer,
                        reunioes: re2,
                        fechados: fe,
                        conversao_pct: re2 > 0 ? Math.round((fe / re2) * 100) : 0,
                        faturamento: cm.faturamento,
                        caixa: cm.caixa,
                      }
                    })
                    .filter((r) => r.reunioes > 0 || r.fechados > 0)
                    .sort((a, b) => b.fechados - a.fechados || b.reunioes - a.reunioes)
                : []
              return {
                mes, mes_label: fmtMesLabel(mes),
                leads_count: leadCounts.leads_count,
                mqls: leadCounts.mqls,
                agendados_vendas: ag, reunioes: re, no_shows: m.no_shows.size,
                negociacao: m.negociacao.size, fechados: m.fechados.size,
                faturamento: m.faturamento, caixa: m.caixa,
                reunioes_pct: ag > 0 ? Math.round((re / ag) * 100) : 0,
                no_shows_pct: ag > 0 ? Math.round((m.no_shows.size / ag) * 100) : 0,
                negociacao_pct: re > 0 ? Math.round((m.negociacao.size / re) * 100) : 0,
                fechados_pct: re > 0 ? Math.round((m.fechados.size / re) * 100) : 0,
                closerRows,
              }
            })
            .sort((a, b) => b.mes.localeCompare(a.mes))
          if (!cancelled) setRowsByMonth(computedRowsByMonth)
        }

        // Step 5 — Agrupa por Closer
        const byCloser = new Map<string, {
          leads_count: number
          mqls: number
          agendados_vendas: number
          reunioes: number
          no_shows: number
          negociacao: number
          fechados: number
          faturamento: number
          caixa: number
          ligacoes: number
          mensagens: number
          contatoIds: Set<string>
          leadsLeads: ProdLead[]
          mqlsLeads: ProdLead[]
          agendadosLeads: ProdLead[]
          reunioesLeads: ProdLead[]
          noShowsLeads: ProdLead[]
          negociacaoLeads: ProdLead[]
          fechadosLeads: ProdLead[]
        }>()

        for (const closer of closerNames) {
          const leadCounts = byCloserLead.get(closer) ?? { leads_count: 0, mqls: 0 }
          byCloser.set(closer, {
            leads_count: leadCounts.leads_count,
            mqls: leadCounts.mqls,
            agendados_vendas: 0, reunioes: 0, no_shows: 0, negociacao: 0,
            fechados: 0, faturamento: 0, caixa: 0,
            ligacoes: 0, mensagens: 0, contatoIds: new Set(),
            leadsLeads: [], mqlsLeads: [],
            agendadosLeads: [], reunioesLeads: [], noShowsLeads: [], negociacaoLeads: [], fechadosLeads: [],
          })
        }

        // Eventos de pipeline
        for (const opp of filteredEventOpps) {
          const closer = opp.vendedor_closer?.replace(/\s+/g, ' ').trim()
          if (!closer || !closerNames.has(closer)) continue
          const entry = byCloser.get(closer)!
          const lead: ProdLead = { id: opp.id, contatos: opp.contatos, status: opp.status, pipeline_name: opp.pipeline_name }
          if (opp.data_lead_recebido && tsToSPDate(opp.data_lead_recebido) >= startDate && tsToSPDate(opp.data_lead_recebido) <= endDate) {
            entry.leads_count++
            entry.leadsLeads.push(lead)
            if (isMqlByTag(opp.contatos as Parameters<typeof isMqlByTag>[0])) {
              entry.mqls++
              entry.mqlsLeads.push(lead)
            }
          }
          if (opp.data_agendamento_vendas && opp.data_agendamento_vendas >= startDate && opp.data_agendamento_vendas <= endDate) {
            entry.agendados_vendas++
            entry.agendadosLeads.push(lead)
          }
          if (opp.data_realizacao_vendas && opp.data_realizacao_vendas >= startDate && opp.data_realizacao_vendas <= endDate) {
            entry.reunioes++
            entry.reunioesLeads.push(lead)
          }
          if (opp.data_no_show_vendas && opp.data_no_show_vendas >= startDate && opp.data_no_show_vendas <= endDate && !opp.data_realizacao_vendas) {
            entry.no_shows++
            entry.noShowsLeads.push(lead)
          }
          if (opp.data_negociacao && opp.data_negociacao >= startDate && opp.data_negociacao <= endDate) {
            entry.negociacao++
            entry.negociacaoLeads.push(lead)
          }
        }

        // Fechados por closer
        for (const [oppId, closer] of pagoCloserMap) {
          if (!closerNames.has(closer)) continue
          const entry = byCloser.get(closer)
          const rev = pagoMap.get(oppId)
          if (entry && rev) {
            entry.fechados++
            entry.faturamento += rev.faturado
            entry.caixa += rev.entrada
            const detail = pagoOppDetails.get(oppId)
            if (detail) {
              entry.fechadosLeads.push({ id: detail.id, contatos: detail.contatos, status: detail.status, pipeline_name: detail.pipeline_name })
            }
          }
        }

        // Comunicações — filtrar pelos contato_ids dos leads aprovados
        const filteredContatoIds = new Set(filteredEventOpps.map((o) => o.contato_id).filter(Boolean))
        for (const com of allComs) {
          if (!com.contato_id) continue
          if (filteredContatoIds.size > 0 && !filteredContatoIds.has(com.contato_id)) continue
          const closer = contatoToCloser.get(com.contato_id)
          if (!closer || !closerNames.has(closer)) continue
          const entry = byCloser.get(closer)!
          if (com.channel === 'call') entry.ligacoes++
          else entry.mensagens++
          entry.contatoIds.add(com.contato_id)
        }

        const resultRows: CloserProdutividadeRow[] = [...byCloser.entries()]
          .map(([closer, d]) => ({
            closer,
            leads_count: d.leads_count,
            mqls: d.mqls,
            agendados_vendas: d.agendados_vendas,
            reunioes: d.reunioes,
            no_shows: d.no_shows,
            negociacao: d.negociacao,
            fechados: d.fechados,
            faturamento: d.faturamento,
            caixa: d.caixa,
            ligacoes: d.ligacoes,
            mensagens: d.mensagens,
            pessoasContatadas: d.contatoIds.size,
            leadsLeads: d.leadsLeads,
            mqlsLeads: d.mqlsLeads,
            agendadosLeads: d.agendadosLeads,
            reunioesLeads: d.reunioesLeads,
            noShowsLeads: d.noShowsLeads,
            negociacaoLeads: d.negociacaoLeads,
            fechadosLeads: d.fechadosLeads,
          }))
          .filter((r) => r.leads_count + r.mqls + r.agendados_vendas + r.reunioes + r.no_shows + r.fechados + r.ligacoes + r.mensagens > 0)
          .sort((a, b) => (b.fechados + b.reunioes + b.agendados_vendas + b.leads_count) - (a.fechados + a.reunioes + a.agendados_vendas + a.leads_count))

        if (!cancelled) setRows(resultRows)
      } catch (err) {
        if (!cancelled) {
          console.error('[useCloserProdutividade] error', err)
          // Erro do PostgREST é um objeto simples ({ message, details, hint, code }),
          // não um Error — o `instanceof` caía sempre no texto genérico e escondia a
          // causa, obrigando a abrir o console para descobrir qualquer coisa.
          setError(extractErrorMessage(err, 'Erro ao carregar produtividade'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, enabled, JSON.stringify(dimensionFilters), pipelineMode])

  const consolidado = useMemo((): CloserProdutividadeConsolidado => {
    return {
      leads_count: rows.reduce((s, r) => s + r.leads_count, 0),
      mqls: rows.reduce((s, r) => s + r.mqls, 0),
      agendados_vendas: rows.reduce((s, r) => s + r.agendados_vendas, 0),
      reunioes: rows.reduce((s, r) => s + r.reunioes, 0),
      no_shows: rows.reduce((s, r) => s + r.no_shows, 0),
      negociacao: rows.reduce((s, r) => s + r.negociacao, 0),
      fechados: rows.reduce((s, r) => s + r.fechados, 0),
      faturamento: rows.reduce((s, r) => s + r.faturamento, 0),
      caixa: rows.reduce((s, r) => s + r.caixa, 0),
      ligacoes: rows.reduce((s, r) => s + r.ligacoes, 0),
      mensagens: rows.reduce((s, r) => s + r.mensagens, 0),
      pessoasContatadas: rows.reduce((s, r) => s + r.pessoasContatadas, 0),
      diasNoPeriodo: countDays(startDate, endDate),
    }
  }, [rows, startDate, endDate])

  return { rows, rowsByMonth, consolidado, overall, pendentes, caixaPorCliente, loading, error }
}
