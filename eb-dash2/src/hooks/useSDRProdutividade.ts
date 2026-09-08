import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd, tsToSPDate } from '@/lib/utils/dates'
import { applyRecuperacaoFilter } from '@/lib/constants'
import { isMqlByTag, parseTags } from './useTrafego'

function isIaLead(contatos: { tags?: string | null } | null | undefined): boolean {
  return parseTags(contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
}

// ─── Types ────────────────────────────────────────────────────

export interface SDRProdutividadeRow {
  sdr: string
  leads_count: number
  mqls: number
  // Eventos de pipeline que ACONTECERAM no período (independente de quando entrou o lead)
  conectados: number          // data_conectado BETWEEN startDate AND endDate
  agendados: number           // data_agendamento_reuniao BETWEEN startDate AND endDate
  agendamentosSeries: { date: string; count: number }[]  // agendamentos por dia no período
  reunioes: number            // data_realizacao_vendas BETWEEN startDate AND endDate
  fechados: number            // data_pagamento_entrada BETWEEN startDate AND endDate (vendas_fechamento)
  // Atividade de comunicação no período (outbound humana)
  ligacoes: number
  mensagens: number
  pessoasContatadas: number
}

export interface SDRProdutividadeConsolidado {
  leads_count: number
  mqls: number
  conectados: number
  agendados: number
  reunioes: number
  fechados: number
  ligacoes: number
  mensagens: number
  pessoasContatadas: number
  diasNoPeriodo: number
}

export interface SDRProdutividadeData {
  rows: SDRProdutividadeRow[]
  consolidado: SDRProdutividadeConsolidado
  // Total de vendas pagas no período (todos os SDRs, incluindo SDR IA).
  // Fonte: pagoOppIds.size (vendas_fechamento.data_pagamento_entrada) — não depende
  // de carregamento assíncrono do gráfico de destaque.
  totalFechados: number
  loading: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────

function countDays(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

function buildDailySeries(
  agendamentoDates: string[],
  startDate: string,
  endDate: string,
): { date: string; count: number }[] {
  const byDate = new Map<string, number>()
  for (const d of agendamentoDates) {
    byDate.set(d, (byDate.get(d) ?? 0) + 1)
  }
  const result: { date: string; count: number }[] = []
  const cur = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (cur <= end) {
    const dateStr = cur.toISOString().slice(0, 10)
    result.push({ date: dateStr, count: byDate.get(dateStr) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

// ─── Hook ─────────────────────────────────────────────────────

/**
 * PRODUTIVIDADE — cada métrica usa a data do próprio evento.
 * O período de lead/MQL não pode limitar os números operacionais.
 *
 * Diferença em relação ao COHORT (useSDRLeaderboard):
 *   COHORT        → filtra opps por data_lead_recebido; conta TODOS os eventos
 *   PRODUTIVIDADE → busca o pipeline relevante e conta apenas eventos que ocorreram no período
 */
export function useSDRProdutividade(
  startDate: string,
  endDate: string,
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao',
  enabled: boolean,
): SDRProdutividadeData {
  const [rows, setRows] = useState<SDRProdutividadeRow[]>([])
  const [totalFechados, setTotalFechados] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !startDate || !endDate) {
      setRows([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useSDRProdutividade] No workspace found')
          setRows([])
          setTotalFechados(0)
          return
        }

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        // Step 1 — SDRs oficiais
        const sdrRes = await supabase
          .from('ghl_users')
          .select('nome')
          .contains('papeis', ['sdr'])
          .eq('workspace_id', wid)
        if (cancelled) return
        const sdrNames = new Set(
          (sdrRes.data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean),
        )

        // Step 2 — Opps do pipeline relevante
        // Em produtividade, não limitar por data_lead_recebido.
        interface OppEventRow {
          id: string
          contato_id: string | null
          sdr_name: string | null
          data_lead_recebido: string | null
          contatos: { tags?: string | null; owner_name?: string | null } | null
          data_conectado: string | null
          data_agendamento_reuniao: string | null
          data_realizacao_vendas: string | null
          data_fechado: string | null
        }

        const allEventOpps: OppEventRow[] = []
        {
          const PAGE_SIZE = 1000
          let page = 0
          while (true) {
            let q = supabase
              .from('oportunidades')
              .select('id, contato_id, sdr_name, data_lead_recebido, contatos!inner(tags, owner_name, workspace_id), data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado')
              .eq('workspace_id', wid)
            // Para eventos de pipeline (conectados, agendados, reunioes), incluímos Vendas SQL.
            // Motivo: quando o SDR agenda uma reunião, a automação do GHL pode mover o lead para
            // Vendas SQL imediatamente. Excluir Vendas SQL faz esses agendamentos desaparecerem.
            // O filtro por sdrNames no loop abaixo garante que só contamos ações de SDRs.
            q = applyRecuperacaoFilter(q, pipelineMode)
            const res = await q.order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            allEventOpps.push(...((res.data ?? []) as unknown as OppEventRow[]))
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            page++
          }
        }

        // Step 3 — Fechados com PAGAMENTO confirmado no período (usa data_pagamento_entrada, não data_fechado)
        // vendas_fechamento.data_pagamento_entrada é TIMESTAMPTZ → usa ISO SP
        interface RevenueRow { oportunidade_id: string }
        const pagoOppIds = new Set<string>()
        {
          const PAGE_SIZE = 1000
          let page = 0
          while (true) {
            const res = await supabase
              .from('vendas_fechamento')
              .select('oportunidade_id')
              .eq('workspace_id', wid)
              .gte('data_pagamento_entrada', startISO)
              .lte('data_pagamento_entrada', endISO)
              .order('oportunidade_id')
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            for (const r of (res.data ?? []) as RevenueRow[]) {
              if (r.oportunidade_id) pagoOppIds.add(r.oportunidade_id)
            }
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            page++
          }
          // Expõe o total bruto de fechamentos (todos os SDRs + SDR IA) imediatamente
          // para que o KPI "Fechados" do painel não dependa do carregamento do gráfico.
          if (!cancelled) setTotalFechados(pagoOppIds.size)
        }

        // Também precisamos do sdr_name para os opps pagos que podem não ter evento de pipeline no período
        // Fazemos um lookup separado para as opps pagas
        // Importante: SEM filtro de pipeline - vendas podem estar em qualquer pipeline
        // (ex: Vendas SQL) e o SDR que originou o lead deve ser creditado
        interface OppOwnerRow { id: string; sdr_name: string | null; contatos: { tags?: string | null } | null }
        const pagoOwnerMap = new Map<string, string>() // opp_id → sdr_name
        if (pagoOppIds.size > 0) {
          const pagoIds = [...pagoOppIds]
          // Busca em batches de até 100 ids para evitar URL longa
          const BATCH = 100
          for (let i = 0; i < pagoIds.length; i += BATCH) {
            const batch = pagoIds.slice(i, i + BATCH)
            const res = await supabase
              .from('oportunidades')
              .select('id, sdr_name, contatos!inner(tags, workspace_id)')
              .eq('workspace_id', wid)
              .in('id', batch)
            if (cancelled) return
            if (res.error) throw res.error
            for (const r of (res.data ?? []) as unknown as OppOwnerRow[]) {
              // Leads IA pertencem exclusivamente à SDR IA — não creditar ao SDR humano
              if (isIaLead(r.contatos)) continue
              if (r.id && r.sdr_name && sdrNames.has(r.sdr_name)) {
                pagoOwnerMap.set(r.id, r.sdr_name)
              }
            }
          }
        }

        // Step 4 — Comunicações outbound humanas no período
        interface ComRow {
          contato_id: string | null
          channel: string
          data_comunicacao: string
        }
        const allComs: ComRow[] = []
        // Mapa contato_id → sdr_name para mapear comunicações ao SDR
        interface OppSdrRow {
          contato_id: string | null
          sdr_name: string | null
          contatos: { owner_name: string | null; tags?: string | null } | null
        }
        const contatoToSdr = new Map<string, string>()
        {
          // Carregar mapa contato → sdr do pipeline relevante (paginado)
          // Inclui Vendas SQL: contatos podem ter sido movidos lá após o agendamento pelo SDR.
          const PAGE_SIZE = 1000
          let page = 0
          while (true) {
            let q = supabase
              .from('oportunidades')
              .select('contato_id, sdr_name, contatos!inner(owner_name, tags, workspace_id)')
              .eq('workspace_id', wid)
            q = applyRecuperacaoFilter(q, pipelineMode)
            const res = await q.order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            for (const row of (res.data ?? []) as unknown as OppSdrRow[]) {
              // Leads IA não devem ser mapeados a SDRs humanos
              if (isIaLead(row.contatos)) continue
              const sdr = row.sdr_name || row.contatos?.owner_name
              if (row.contato_id && sdr) {
                contatoToSdr.set(row.contato_id, sdr)
              }
            }
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            page++
          }
        }
        {
          const PAGE_SIZE = 1000
          let page = 0
          while (true) {
            const res = await supabase
              .from('comunicacoes')
              .select('contato_id, channel, data_comunicacao')
              .eq('workspace_id', wid)
              .gte('data_comunicacao', startISO)
              .lte('data_comunicacao', endISO)
              .eq('direction', 'outbound')
              .eq('ghl_source', 'app')
              .in('channel', ['call', 'whatsapp', 'sms'])
              .order('id')
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            allComs.push(...((res.data ?? []) as ComRow[]))
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            page++
          }
        }

        const leadCountsBySdr = new Map<string, { leads_count: number; mqls: number }>()
        for (const opp of allEventOpps) {
          if (isIaLead(opp.contatos)) continue  // leads IA pertencem exclusivamente à SDR IA
          if (!opp.data_lead_recebido) continue
          const leadDate = tsToSPDate(opp.data_lead_recebido)
          if (leadDate < startDate || leadDate > endDate) continue
          const sdr = (opp.sdr_name || opp.contatos?.owner_name || '').trim()
          if (!sdr || !sdrNames.has(sdr)) continue
          const entry = leadCountsBySdr.get(sdr) ?? { leads_count: 0, mqls: 0 }
          entry.leads_count++
          if (isMqlByTag(opp.contatos as Parameters<typeof isMqlByTag>[0])) entry.mqls++
          leadCountsBySdr.set(sdr, entry)
        }

        // Step 5 — Agrupa por SDR
        // Inicializa counters para todos os SDRs oficiais
        const bySdr = new Map<string, {
          leads_count: number
          mqls: number
          conectados: number
          agendados: number
          agendamentoDates: string[]
          reunioes: number
          fechados: number
          ligacoes: number
          mensagens: number
          contatoIds: Set<string>
        }>()

        for (const sdr of sdrNames) {
          const leadCounts = leadCountsBySdr.get(sdr) ?? { leads_count: 0, mqls: 0 }
          bySdr.set(sdr, {
            leads_count: leadCounts.leads_count,
            mqls: leadCounts.mqls,
            conectados: 0,
            agendados: 0,
            agendamentoDates: [],
            reunioes: 0,
            fechados: 0,
            ligacoes: 0,
            mensagens: 0,
            contatoIds: new Set(),
          })
        }

        // Conta eventos de pipeline por SDR
        for (const opp of allEventOpps) {
          if (isIaLead(opp.contatos)) continue  // leads IA pertencem exclusivamente à SDR IA
          const sdr = (opp.sdr_name || opp.contatos?.owner_name || '').trim()
          if (!sdr || !sdrNames.has(sdr)) continue
          const entry = bySdr.get(sdr)!

          if (opp.data_conectado && opp.data_conectado >= startDate && opp.data_conectado <= endDate) {
            entry.conectados++
          }
          if (opp.data_agendamento_reuniao && opp.data_agendamento_reuniao >= startDate && opp.data_agendamento_reuniao <= endDate) {
            entry.agendados++
            entry.agendamentoDates.push(opp.data_agendamento_reuniao.slice(0, 10))
          }
          if (opp.data_realizacao_vendas && opp.data_realizacao_vendas >= startDate && opp.data_realizacao_vendas <= endDate) {
            entry.reunioes++
          }
        }

        // Conta fechados por SDR (usando data_pagamento_entrada)
        for (const [oppId, sdr] of pagoOwnerMap) {
          if (!sdrNames.has(sdr)) continue
          const entry = bySdr.get(sdr)
          if (entry && pagoOppIds.has(oppId)) {
            entry.fechados++
          }
        }

        // Conta comunicações por SDR
        for (const com of allComs) {
          if (!com.contato_id) continue
          const sdr = contatoToSdr.get(com.contato_id)
          if (!sdr || !sdrNames.has(sdr)) continue
          const entry = bySdr.get(sdr)!
          if (com.channel === 'call') entry.ligacoes++
          else entry.mensagens++
          entry.contatoIds.add(com.contato_id)
        }

        // Monta rows finais (apenas SDRs com alguma atividade)
        const resultRows: SDRProdutividadeRow[] = [...bySdr.entries()]
          .map(([sdr, d]) => ({
            sdr,
            leads_count: d.leads_count,
            mqls: d.mqls,
            conectados: d.conectados,
            agendados: d.agendados,
            agendamentosSeries: buildDailySeries(d.agendamentoDates, startDate, endDate),
            reunioes: d.reunioes,
            fechados: d.fechados,
            ligacoes: d.ligacoes,
            mensagens: d.mensagens,
            pessoasContatadas: d.contatoIds.size,
          }))
          .filter((r) => r.leads_count + r.mqls + r.conectados + r.agendados + r.reunioes + r.fechados + r.ligacoes + r.mensagens > 0)
          .sort((a, b) => (b.conectados + b.agendados + b.leads_count) - (a.conectados + a.agendados + a.leads_count))

        if (!cancelled) setRows(resultRows)
      } catch (err) {
        if (!cancelled) {
          console.error('[useSDRProdutividade] error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar produtividade')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [startDate, endDate, pipelineMode, enabled])

  const consolidado = useMemo((): SDRProdutividadeConsolidado => {
    return {
      leads_count: rows.reduce((s, r) => s + r.leads_count, 0),
      mqls: rows.reduce((s, r) => s + r.mqls, 0),
      conectados: rows.reduce((s, r) => s + r.conectados, 0),
      agendados: rows.reduce((s, r) => s + r.agendados, 0),
      reunioes: rows.reduce((s, r) => s + r.reunioes, 0),
      fechados: rows.reduce((s, r) => s + r.fechados, 0),
      ligacoes: rows.reduce((s, r) => s + r.ligacoes, 0),
      mensagens: rows.reduce((s, r) => s + r.mensagens, 0),
      pessoasContatadas: rows.reduce((s, r) => s + r.pessoasContatadas, 0),
      diasNoPeriodo: countDays(startDate, endDate),
    }
  }, [rows, startDate, endDate])

  return { rows, consolidado, totalFechados, loading, error }
}
