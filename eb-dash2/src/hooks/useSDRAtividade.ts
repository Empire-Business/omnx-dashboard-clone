import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { applyRecuperacaoFilter, PIPELINE_VENDAS_SQL_ID } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────

export interface SDRAtividadeDia {
  data: string              // "YYYY-MM-DD"
  ligacoes: number          // channel = 'call'
  mensagens: number         // channel = 'whatsapp' | 'sms'
  pessoasContatadas: number // COUNT DISTINCT contato_id no dia
}

export interface SDRAtividadeRow {
  sdr: string
  dias: SDRAtividadeDia[]
  totais: {
    ligacoes: number
    mensagens: number
    pessoasContatadas: number // DISTINCT no período inteiro
    mediaLigacoesDia: number
    mediaMensagensDia: number
    mediaPessoasDia: number
  }
}

export interface SDRAtividadeData {
  rows: SDRAtividadeRow[]
  consolidado: {
    ligacoes: number
    mensagens: number
    pessoasContatadas: number
    mediaLigacoesDia: number
    mediaMensagensDia: number
    mediaPessoasDia: number
    diasNoPeriodo: number
  }
  loading: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────

/** Converte TIMESTAMPTZ para "YYYY-MM-DD" em São Paulo */
function tsSPDay(ts: string): string {
  return new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

/** Conta dias úteis (todos os dias do calendário) entre duas datas YYYY-MM-DD */
function countDays(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

// ─── Hook ─────────────────────────────────────────────────────

export function useSDRAtividade(
  startDate: string,
  endDate: string,
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao',
  enabled: boolean,
): SDRAtividadeData {
  const [rows, setRows] = useState<SDRAtividadeRow[]>([])
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
          console.warn('[useSDRAtividade] No workspace found')
          setRows([])
          return
        }

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        // 1. SDRs oficiais
        const sdrRes = await supabase
          .from('ghl_users')
          .select('nome')
          .contains('papeis', ['sdr'])
          .eq('workspace_id', wid)
        if (cancelled) return
        const sdrNames = new Set(
          (sdrRes.data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean),
        )

        // 2. Mapa contato_id → sdr_name (paginado, filtra por pipeline)
        interface OppSdrRow {
          contato_id: string | null
          sdr_name: string | null
          contatos: { owner_name: string | null } | null
        }
        const contatoToSdr = new Map<string, string>()
        {
          const PAGE_SIZE = 1000
          let page = 0
          while (true) {
            let q = supabase
              .from('oportunidades')
              .select('contato_id, sdr_name, contatos(owner_name)')
              .eq('workspace_id', wid)
            q = applyRecuperacaoFilter(q, pipelineMode)
            // Vendas SQL segue fora da atividade de pre-vendas em qualquer modo,
            // exceto quando a visao e so Recuperacao (que nao tem Vendas SQL).
            if (pipelineMode !== 'only_recuperacao') {
              q = q.neq('pipeline_id', PIPELINE_VENDAS_SQL_ID)
            }
            const res = await q
              .order('id')
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (res.error) throw res.error
            for (const row of (res.data ?? []) as unknown as OppSdrRow[]) {
              const sdr = row.sdr_name || row.contatos?.owner_name
              if (row.contato_id && sdr) {
                contatoToSdr.set(row.contato_id, sdr)
              }
            }
            if ((res.data?.length ?? 0) < PAGE_SIZE) break
            page++
          }
        }

        // 3. Comunicações outbound humanas no período (paginado)
        interface ComRow {
          contato_id: string | null
          channel: string
          data_comunicacao: string
        }
        const allComs: ComRow[] = []
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

        // 4. Agrupar por SDR → dia
        // Estrutura: Map<sdr, Map<dia, { ligacoes, mensagens, contatoIds }>>
        const bySdr = new Map<string, Map<string, { ligacoes: number; mensagens: number; contatoIds: Set<string> }>>()

        for (const com of allComs) {
          if (!com.contato_id || !com.data_comunicacao) continue
          const sdr = contatoToSdr.get(com.contato_id)
          if (!sdr || !sdrNames.has(sdr)) continue

          const dia = tsSPDay(com.data_comunicacao)

          if (!bySdr.has(sdr)) bySdr.set(sdr, new Map())
          const sdrMap = bySdr.get(sdr)!
          if (!sdrMap.has(dia)) sdrMap.set(dia, { ligacoes: 0, mensagens: 0, contatoIds: new Set() })
          const entry = sdrMap.get(dia)!

          if (com.channel === 'call') entry.ligacoes++
          else entry.mensagens++
          entry.contatoIds.add(com.contato_id)
        }

        // 5. Montar rows
        const diasNoPeriodo = countDays(startDate, endDate)

        const resultRows: SDRAtividadeRow[] = [...bySdr.entries()]
          .map(([sdr, diaMap]) => {
            const dias: SDRAtividadeDia[] = [...diaMap.entries()]
              .map(([data, d]) => ({
                data,
                ligacoes: d.ligacoes,
                mensagens: d.mensagens,
                pessoasContatadas: d.contatoIds.size,
              }))
              .sort((a, b) => b.data.localeCompare(a.data)) // mais recente primeiro

            const totalLig = dias.reduce((s, d) => s + d.ligacoes, 0)
            const totalMsg = dias.reduce((s, d) => s + d.mensagens, 0)
            // Pessoas únicas no período inteiro (não soma dos dias)
            const allContatos = new Set<string>()
            for (const [, d] of diaMap) {
              for (const id of d.contatoIds) allContatos.add(id)
            }

            return {
              sdr,
              dias,
              totais: {
                ligacoes: totalLig,
                mensagens: totalMsg,
                pessoasContatadas: allContatos.size,
                mediaLigacoesDia: Math.round((totalLig / diasNoPeriodo) * 10) / 10,
                mediaMensagensDia: Math.round((totalMsg / diasNoPeriodo) * 10) / 10,
                mediaPessoasDia: Math.round((allContatos.size / diasNoPeriodo) * 10) / 10,
              },
            }
          })
          .sort((a, b) => (b.totais.ligacoes + b.totais.mensagens) - (a.totais.ligacoes + a.totais.mensagens))

        if (!cancelled) setRows(resultRows)
      } catch (err) {
        if (!cancelled) {
          console.error('[useSDRAtividade] error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar atividade')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [startDate, endDate, pipelineMode, enabled])

  // Consolidado do time
  const consolidado = useMemo(() => {
    const diasNoPeriodo = countDays(startDate, endDate)
    const totalLig = rows.reduce((s, r) => s + r.totais.ligacoes, 0)
    const totalMsg = rows.reduce((s, r) => s + r.totais.mensagens, 0)
    // Pessoas únicas do time inteiro = soma dos SDRs (pode ter overlap, mas é boa aproximação)
    const totalPessoas = rows.reduce((s, r) => s + r.totais.pessoasContatadas, 0)
    return {
      ligacoes: totalLig,
      mensagens: totalMsg,
      pessoasContatadas: totalPessoas,
      mediaLigacoesDia: Math.round((totalLig / diasNoPeriodo) * 10) / 10,
      mediaMensagensDia: Math.round((totalMsg / diasNoPeriodo) * 10) / 10,
      mediaPessoasDia: Math.round((totalPessoas / diasNoPeriodo) * 10) / 10,
      diasNoPeriodo,
    }
  }, [rows, startDate, endDate])

  return { rows, consolidado, loading, error }
}
