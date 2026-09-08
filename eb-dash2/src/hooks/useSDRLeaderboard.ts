import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import type { OppRow, RevenueRow } from './useTrafego'
import { parseTags, isMqlByTag } from './useTrafego'

// ─── Types ────────────────────────────────────────────────────

export interface SDRRow {
  sdr: string
  leads: OppRow[]
  leads_count: number
  conectados: number
  taxa_conexao: number           // %
  agendados: number
  taxa_agendamento: number       // %
  agendados_no_prazo: number     // leads agendados em até 7 dias COM reunião até 10 dias
  taxa_agendamento_prazo: number // % = (agendados_no_prazo / leads_com_data_lead) * 100
  leads_com_data_lead: number    // denominador válido (tem data_lead_recebido)
  ligacoes: number
  mensagens: number
  fechamentos: number
  fechamentosLeads: OppRow[]     // leads com data_pagamento_entrada confirmada
  avg_response_seconds: number   // média em segundos (0 = sem dados)
  response_count: number         // quantas respostas foram medidas
  leads_sem_resposta: number     // contagem de leads que nunca receberam outbound
  pct_sem_resposta: number       // % de leads sem resposta
  last_response_seconds: number  // gap da ÚLTIMA resposta em segundos (0 = sem dados)
  last_response_at: string | null // ISO timestamp da última resposta
  is_ia: boolean                  // true para o row sintético "SDR IA"
}

export interface SDRLeaderboardData {
  rows: SDRRow[]
  loading: boolean
  error: string | null
}

// ─── Helper: agendamento dentro do prazo ──────────────────────
// Meta SDR: O SDR tem até 7 dias para AGENDAR (criar agendamento)
//           A reunião deve ser marcada para até 10 dias após entrada

const PRAZO_AGENDAMENTO_DIAS = 7  // Prazo para SDR agendar (quando cria o agendamento)
const PRAZO_REUNIAO_DIAS = 10     // Prazo para quando a reunião será realizada

// ─── Helper: SDR IA ────────────────────────────────────────────
function isIaLead(opp: OppRow): boolean {
  return parseTags(opp.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
}

function agendadoNoPrazo(opp: OppRow): boolean {
  // Verificar se tem os dados obrigatórios
  if (!opp.data_agendamento_reuniao || !opp.data_reuniao_agendada || !opp.data_lead_recebido) {
    return false
  }

  // data_lead_recebido é TIMESTAMPTZ → extrai apenas a parte da data
  const entradaStr = opp.data_lead_recebido.slice(0, 10)
  const entrada = new Date(entradaStr + 'T00:00:00')
  const agendamento = new Date(opp.data_agendamento_reuniao + 'T00:00:00')
  const reuniao = new Date(opp.data_reuniao_agendada + 'T00:00:00')

  // Calcular diferenças em dias
  const diffAgendamento = (agendamento.getTime() - entrada.getTime()) / 86_400_000
  const diffReuniao = (reuniao.getTime() - entrada.getTime()) / 86_400_000

  // Validar AMBOS os prazos:
  // 1. SDR deve agendar em até 7 dias
  // 2. Reunião deve ser em até 10 dias
  return (
    diffAgendamento >= 0 && diffAgendamento <= PRAZO_AGENDAMENTO_DIAS &&
    diffReuniao >= 0 && diffReuniao <= PRAZO_REUNIAO_DIAS
  )
}

// ─── Hook ─────────────────────────────────────────────────────

export function useSDRLeaderboard(
  opps: OppRow[],
  startDate: string,
  endDate: string,
  revenueRows: RevenueRow[] = [],
): SDRLeaderboardData {
  const [comMap, setComMap] = useState<Map<string, { ligacoes: number; mensagens: number }>>(
    new Map()
  )
  const [responseMap, setResponseMap] = useState<
    Map<string, { avg_response_seconds: number; response_count: number }>
  >(new Map())
  const [lastResponseMap, setLastResponseMap] = useState<
    Map<string, { last_response_seconds: number; last_response_at: string }>
  >(new Map())
  const [respondeuSet, setRespondeuSet] = useState<Set<string>>(new Set())
  const [iaComData, setIaComData] = useState<{ mensagens: number; respondeuSet: Set<string> }>(
    { mensagens: 0, respondeuSet: new Set() }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── SDR names from ghl_users (papel = 'sdr') ─────────────────
  const [sdrNames, setSdrNames] = useState<Set<string>>(new Set())
  const [sdrNamesLoaded, setSdrNamesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getWorkspaceId().then((wid) => {
      if (!wid || cancelled) return
      supabase
        .from('ghl_users')
        .select('nome')
        .contains('papeis', ['sdr'])
        .eq('workspace_id', wid)
        .then(({ data }) => {
          if (cancelled) return
          const names = new Set((data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean))
          setSdrNames(names)
          setSdrNamesLoaded(true)
        })
    })
    return () => { cancelled = true }
  }, [])

  // ── Step 1.5: async response time via RPC ──────────────────
  useEffect(() => {
    if (!startDate || !endDate) {
      setResponseMap(new Map())
      return
    }

    const startISO = toSPISOStart(startDate)
    const endISO = toSPISOEnd(endDate)

    supabase
      .rpc('get_sdr_avg_response_time', {
        p_start: startISO,
        p_end: endISO,
      })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) {
          console.error('[useSDRLeaderboard] get_sdr_avg_response_time error', rpcErr)
          setResponseMap(new Map())
          return
        }

        const map = new Map<string, { avg_response_seconds: number; response_count: number }>()
        for (const row of data ?? []) {
          map.set(row.sdr_name, {
            avg_response_seconds: row.avg_response_seconds,
            response_count: row.response_count,
          })
        }
        setResponseMap(map)
      })
  }, [startDate, endDate])

  // ── Step 1.6: async last response time via RPC ────────────────
  useEffect(() => {
    if (!startDate || !endDate) {
      setLastResponseMap(new Map())
      return
    }

    const startISO = toSPISOStart(startDate)
    const endISO = toSPISOEnd(endDate)

    supabase
      .rpc('get_sdr_last_response_time', {
        p_start: startISO,
        p_end: endISO,
      })
      .then(({ data, error: rpcErr }) => {
        if (rpcErr) {
          console.error('[useSDRLeaderboard] get_sdr_last_response_time error', rpcErr)
          setLastResponseMap(new Map())
          return
        }

        const map = new Map<string, { last_response_seconds: number; last_response_at: string }>()
        for (const row of data ?? []) {
          map.set(row.sdr_name, {
            last_response_seconds: row.last_response_seconds,
            last_response_at: row.last_response_at,
          })
        }
        setLastResponseMap(map)
      })
  }, [startDate, endDate])

  // ── Step 1: synchronous grouping from opps ───────────────────
  const baseRows = useMemo(() => {
    if (!opps.length) return []

    // Leads com pagamento confirmado (data_pagamento_entrada preenchida)
    const paidOppIds = new Set(
      revenueRows.map((r) => r.oportunidade_id).filter((id): id is string => Boolean(id))
    )

    const bySdr = new Map<string, OppRow[]>()
    for (const opp of opps) {
      if (isIaLead(opp)) continue  // IA leads tratados separadamente em iaOpps abaixo
      const sdr = opp.sdr_name || opp.contatos?.owner_name || 'Sem SDR'
      const existing = bySdr.get(sdr) ?? []
      existing.push(opp)
      bySdr.set(sdr, existing)
    }

    function buildRow(sdr: string, sdrOpps: OppRow[], iaRow = false): SDRRow {
      const conectados = sdrOpps.filter((o) => o.data_conectado).length
      const mqls = sdrOpps.filter((o) => isMqlByTag(o.contatos)).length
      const agendados = sdrOpps.filter((o) => o.data_agendamento_reuniao).length
      // Fechamentos = leads com data_pagamento_entrada confirmada (não apenas data_fechado)
      const fechamentosLeads = sdrOpps.filter((o) => paidOppIds.has(o.id))
      const fechamentos = fechamentosLeads.length
      const leads_com_data_lead = sdrOpps.filter((o) => o.data_lead_recebido).length
      const agendados_no_prazo = sdrOpps.filter(agendadoNoPrazo).length
      const taxa_agendamento_prazo =
        leads_com_data_lead > 0
          ? Math.round((agendados_no_prazo / leads_com_data_lead) * 100)
          : 0
      return {
        sdr,
        leads: sdrOpps,
        leads_count: sdrOpps.length,
        conectados,
        taxa_conexao: sdrOpps.length > 0 ? Math.round((conectados / sdrOpps.length) * 100) : 0,
        agendados,
        taxa_agendamento: mqls > 0 ? Math.round((agendados / mqls) * 100) : 0,
        agendados_no_prazo,
        taxa_agendamento_prazo,
        leads_com_data_lead,
        ligacoes: 0,
        mensagens: 0,
        fechamentos,
        fechamentosLeads,
        avg_response_seconds: 0,
        response_count: 0,
        leads_sem_resposta: 0,
        pct_sem_resposta: 0,
        last_response_seconds: 0,
        last_response_at: null,
        is_ia: iaRow,
      }
    }

    const humanRows = [...bySdr.entries()]
      .filter(([sdr]) => {
        if (!sdrNamesLoaded) return true  // ainda carregando — mostra tudo temporariamente
        return sdrNames.has(sdr)          // só SDRs com papel 'sdr' em ghl_users
      })
      .map(([sdr, sdrOpps]) => buildRow(sdr, sdrOpps, false))

    // SDR IA: leads com tag [cp] sdr ia — row sintético adicionado após o filtro de sdrNames
    const iaOpps = opps.filter(isIaLead)
    if (iaOpps.length > 0) {
      humanRows.push(buildRow('SDR IA', iaOpps, true))
    }

    return humanRows
  }, [opps, revenueRows, sdrNames, sdrNamesLoaded])

  // ── Stable key: sorted contato_ids joined — changes only when lead set changes ──
  const contatoIdsKey = useMemo(() => {
    const ids = opps
      .map((o) => o.contato_id)
      .filter((id): id is string => Boolean(id))
    return [...new Set(ids)].sort().join(',')
  }, [opps])

  // ── Step 2: async comunicacoes — fetch all in period, match client-side ──
  // Fetching without a contato_id filter avoids the .in([...500 UUIDs]) URL-length limit.
  // We match rows back to SDRs via a contato_id → owner_name map built from opps.
  useEffect(() => {
    let cancelled = false

    if (!contatoIdsKey) {
      setComMap(new Map())
      return
    }

    // Build lookup map inside the effect so the closure is always fresh
    const contatoToSdr = new Map<string, string>()
    for (const opp of opps) {
      if (opp.contato_id) {
        contatoToSdr.set(opp.contato_id, opp.sdr_name || opp.contatos?.owner_name || 'Sem SDR')
      }
    }

    setLoading(true)
    setError(null)

    const startISO = toSPISOStart(startDate)
    const endISO = toSPISOEnd(endDate)

    // Contato_ids dos leads de IA (para query de workflow)
    const iaContatoIds = opps
      .filter(isIaLead)
      .map((o) => o.contato_id)
      .filter((id): id is string => Boolean(id))

    const PAGE_SIZE = 1000

    void (async () => {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        // Paginated fetch: human outbound messages
        const allHuman: { contato_id: string | null; channel: string }[] = []
        let page = 0
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
          if (cancelled) return
          if (res.error) throw res.error
          allHuman.push(...((res.data ?? []) as { contato_id: string | null; channel: string }[]))
          if ((res.data?.length ?? 0) < PAGE_SIZE) break
          page++
        }

        // Paginated fetch: IA workflow messages
        const allIa: { contato_id: string | null }[] = []
        if (iaContatoIds.length > 0) {
          let iaPage = 0
          while (true) {
            const res = await supabase
              .from('comunicacoes')
              .select('contato_id')
              .eq('workspace_id', wid)
              .gte('data_comunicacao', startISO)
              .lte('data_comunicacao', endISO)
              .eq('direction', 'outbound')
              .eq('ghl_source', 'workflow')
              .in('contato_id', iaContatoIds)
              .order('id', { ascending: true })
              .range(iaPage * PAGE_SIZE, (iaPage + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            allIa.push(...((res.data ?? []) as { contato_id: string | null }[]))
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            iaPage++
          }
        }

        // Processar mensagens humanas
        const bySdr = new Map<string, { ligacoes: number; mensagens: number }>()
        const respondeu = new Set<string>()
        for (const c of allHuman) {
          if (!c.contato_id) continue
          respondeu.add(c.contato_id)
          const sdr = contatoToSdr.get(c.contato_id)
          if (!sdr) continue  // comunicação de um contato fora do período atual
          const entry = bySdr.get(sdr) ?? { ligacoes: 0, mensagens: 0 }
          if (c.channel === 'call') entry.ligacoes++
          else if (c.channel === 'whatsapp' || c.channel === 'sms') entry.mensagens++
          bySdr.set(sdr, entry)
        }

        // Processar mensagens workflow da SDR IA
        let iaMensagens = 0
        const iaRespondeu = new Set<string>()
        for (const c of allIa) {
          if (!c.contato_id) continue
          iaMensagens++
          iaRespondeu.add(c.contato_id)
        }

        setComMap(bySdr)
        setRespondeuSet(respondeu)
        setIaComData({ mensagens: iaMensagens, respondeuSet: iaRespondeu })
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('[useSDRLeaderboard] comunicacoes error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar comunicações')
          setLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [contatoIdsKey, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 3: merge sync + async ───────────────────────────────
  const rows = useMemo(() => {
    const merged = baseRows.map((row) => {
      // Row SDR IA: usa dados de workflow, não de SDRs humanos
      if (row.is_ia) {
        const semResposta = row.leads.filter(
          (o) => o.contato_id && !iaComData.respondeuSet.has(o.contato_id)
        ).length
        const pctSemResposta = row.leads_count > 0 ? Math.round((semResposta / row.leads_count) * 100) : 0
        return {
          ...row,
          mensagens: iaComData.mensagens,
          leads_sem_resposta: semResposta,
          pct_sem_resposta: pctSemResposta,
        }
      }

      const com = comMap.get(row.sdr)
      const rt = responseMap.get(row.sdr)
      const lr = lastResponseMap.get(row.sdr)

      // Calcular leads sem resposta (humanos)
      const semResposta = row.leads.filter(
        (o) => o.contato_id && !respondeuSet.has(o.contato_id)
      ).length
      const pctSemResposta = row.leads_count > 0 ? Math.round((semResposta / row.leads_count) * 100) : 0

      return {
        ...row,
        ligacoes: com?.ligacoes ?? 0,
        mensagens: com?.mensagens ?? 0,
        avg_response_seconds: rt?.avg_response_seconds ?? 0,
        response_count: rt?.response_count ?? 0,
        leads_sem_resposta: semResposta,
        pct_sem_resposta: pctSemResposta,
        last_response_seconds: lr?.last_response_seconds ?? 0,
        last_response_at: lr?.last_response_at ?? null,
      }
    })

    // Ordena por taxa_agendamento DESC; SDR IA aparece depois dos humanos se empate
    return merged.sort((a, b) => {
      if (a.is_ia !== b.is_ia) return a.is_ia ? 1 : -1
      return b.taxa_agendamento - a.taxa_agendamento
    })
  }, [baseRows, comMap, responseMap, respondeuSet, lastResponseMap, iaComData])

  return { rows, loading, error }
}
