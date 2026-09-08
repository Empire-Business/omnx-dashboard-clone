import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import type { OppRow, RevenueRow } from './useTrafego'
import { buildPaymentDateMap, countUniqueMqls, caixaRecebidoAcumulado, faturamentoDaVenda } from './useTrafego'

// ─── Types ────────────────────────────────────────────────────

export interface CloserRow {
  closer: string
  leads: OppRow[]
  leads_count: number
  mqls: number
  agendados_vendas: number
  reunioes_realizadas: number
  no_shows: number
  taxa_no_show: number           // %
  taxa_comparecimento: number    // %
  negociacao: number
  fechados: number
  conversao_pct: number          // fechados / reunioes_realizadas %
  faturamento: number
  caixa: number
  ligacoes: number
  mensagens: number
  avg_response_seconds: number
  response_count: number
  leads_sem_resposta: number
  pct_sem_resposta: number
}

export interface CloserLeaderboardData {
  rows: CloserRow[]
  loading: boolean
  error: string | null
}

// ─── Hook ─────────────────────────────────────────────────────

export function useCloserLeaderboard(
  opps: OppRow[],
  revenueRows: RevenueRow[],
  startDate: string,
  endDate: string
): CloserLeaderboardData {
  const [comMap, setComMap] = useState<Map<string, { ligacoes: number; mensagens: number }>>(new Map())
  const [respondeuSet, setRespondeuSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Closer names from ghl_users ─────────────────────────────
  const [closerNames, setCloserNames] = useState<Set<string>>(new Set())
  const [closerNamesLoaded, setCloserNamesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getWorkspaceId().then((wid) => {
      if (!wid || cancelled) return
      supabase
        .from('ghl_users')
        .select('nome')
        .contains('papeis', ['closer'])
        .eq('workspace_id', wid)
        .then(({ data }) => {
          if (cancelled) return
          const names = new Set((data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean))
          setCloserNames(names)
          setCloserNamesLoaded(true)
        })
    })
    return () => { cancelled = true }
  }, [])

  // ── Payment map ─────────────────────────────────────────────
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  // ── Revenue maps ────────────────────────────────────────────
  const revMap = useMemo(() => {
    const map = new Map<string, { faturado: number; entrada: number }>()
    for (const r of revenueRows) {
      const existing = map.get(r.oportunidade_id) ?? { faturado: 0, entrada: 0 }
      existing.faturado += faturamentoDaVenda(r)
      existing.entrada += caixaRecebidoAcumulado(r)
      map.set(r.oportunidade_id, existing)
    }
    return map
  }, [revenueRows])

  // ── Base rows from opps ─────────────────────────────────────
  const baseRows = useMemo(() => {
    if (!opps.length) return []

    const byCloser = new Map<string, OppRow[]>()
    for (const opp of opps) {
      const closer = (opp.vendedor_closer ?? 'Sem Closer').replace(/\s+/g, ' ').trim()
      const existing = byCloser.get(closer) ?? []
      existing.push(opp)
      byCloser.set(closer, existing)
    }

    return [...byCloser.entries()]
      .filter(([closer]) => {
        if (!closerNamesLoaded) return true
        return closerNames.has(closer)
      })
      .map(([closer, closerOpps]) => {
        const mqls = countUniqueMqls(closerOpps)
        const agendados_vendas = closerOpps.filter((o) => !!o.data_agendamento_vendas).length
        const reunioes_realizadas = closerOpps.filter((o) => !!o.data_realizacao_vendas).length
        const no_shows = closerOpps.filter((o) => !!o.data_no_show_vendas && !o.data_realizacao_vendas).length
        const negociacao = closerOpps.filter((o) => !!o.data_negociacao).length
        const fechados = closerOpps.filter((o) => paymentDateMap.has(o.id)).length
        const faturamento = closerOpps.reduce((sum, o) => sum + (revMap.get(o.id)?.faturado ?? 0), 0)
        const caixa = closerOpps.reduce((sum, o) => sum + (revMap.get(o.id)?.entrada ?? 0), 0)

        return {
          closer,
          leads: closerOpps,
          leads_count: closerOpps.length,
          mqls,
          agendados_vendas,
          reunioes_realizadas,
          no_shows,
          taxa_no_show: agendados_vendas > 0 ? Math.round((no_shows / agendados_vendas) * 100) : 0,
          taxa_comparecimento: agendados_vendas > 0 ? Math.round((reunioes_realizadas / agendados_vendas) * 100) : 0,
          negociacao,
          fechados,
          conversao_pct: reunioes_realizadas > 0 ? Math.round((fechados / reunioes_realizadas) * 100) : 0,
          faturamento,
          caixa,
          ligacoes: 0,
          mensagens: 0,
          avg_response_seconds: 0,
          response_count: 0,
          leads_sem_resposta: 0,
          pct_sem_resposta: 0,
        } as CloserRow
      })
  }, [opps, closerNames, closerNamesLoaded, paymentDateMap, revMap])

  // ── Stable key for comunicacoes fetch ───────────────────────
  const contatoIdsKey = useMemo(() => {
    const ids = opps
      .map((o) => o.contato_id)
      .filter((id): id is string => Boolean(id))
    return [...new Set(ids)].sort().join(',')
  }, [opps])

  // ── Fetch comunicacoes (outbound closer messages) ───────────
  useEffect(() => {
    let cancelled = false

    if (!contatoIdsKey) {
      setComMap(new Map())
      return
    }

    // contato_id → closer name
    const contatoToCloser = new Map<string, string>()
    for (const opp of opps) {
      if (opp.contato_id && opp.vendedor_closer) {
        contatoToCloser.set(opp.contato_id, opp.vendedor_closer)
      }
    }

    setLoading(true)
    setError(null)

    const startISO = toSPISOStart(startDate)
    const endISO = toSPISOEnd(endDate)

    const PAGE_SIZE = 1000

    void (async () => {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        // Cursor por `data_comunicacao`, não OFFSET nem cursor por `id`: os dois
        // estouravam o statement_timeout (500) nas páginas profundas. Ver
        // fetchAllPagesByTimeCursor.
        type ComRow = { id: string; contato_id: string | null; channel: string; data_comunicacao: string | null }
        const allRows = await fetchAllPagesByTimeCursor<ComRow>(
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
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_comunicacao },
        )
        if (cancelled) return

        const byCloser = new Map<string, { ligacoes: number; mensagens: number }>()
        const respondeu = new Set<string>()

        for (const c of allRows) {
          if (!c.contato_id) continue
          respondeu.add(c.contato_id)
          const closer = contatoToCloser.get(c.contato_id)
          if (!closer) continue
          const entry = byCloser.get(closer) ?? { ligacoes: 0, mensagens: 0 }
          if (c.channel === 'call') entry.ligacoes++
          else if (c.channel === 'whatsapp' || c.channel === 'sms') entry.mensagens++
          byCloser.set(closer, entry)
        }

        setComMap(byCloser)
        setRespondeuSet(respondeu)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('[useCloserLeaderboard] comunicacoes error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar comunicações')
          setLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [contatoIdsKey, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge sync + async ──────────────────────────────────────
  const rows = useMemo(() => {
    const merged = baseRows.map((row) => {
      const com = comMap.get(row.closer)
      const semResposta = row.leads.filter(
        (o) => o.contato_id && !respondeuSet.has(o.contato_id)
      ).length
      const pctSemResposta = row.leads_count > 0 ? Math.round((semResposta / row.leads_count) * 100) : 0

      return {
        ...row,
        ligacoes: com?.ligacoes ?? 0,
        mensagens: com?.mensagens ?? 0,
        leads_sem_resposta: semResposta,
        pct_sem_resposta: pctSemResposta,
      }
    })

    // Sort by conversao_pct DESC
    return merged.sort((a, b) => b.conversao_pct - a.conversao_pct)
  }, [baseRows, comMap, respondeuSet])

  return { rows, loading, error }
}
