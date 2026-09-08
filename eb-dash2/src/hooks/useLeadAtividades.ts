import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { applyRecuperacaoFilter, PIPELINE_VENDAS_SQL_ID } from '@/lib/constants'
import { isFilterActive } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

// ─── Types ────────────────────────────────────────────────────

export interface AtividadeRow {
  id: string
  oppId: string
  contatoId: string
  leadNome: string | null
  leadTelefone: string | null
  leadEmail: string | null
  sdrName: string | null
  channel: string | null
  direction: string | null
  ghlSource: string | null
  mensagemBody: string | null
  dataComunicacao: string | null
  phoneCallDuration: number | null
  phoneCallStatus: string | null
  msgStatus: string | null
  isAutomatico: boolean
}

export interface LeadAtividadesResult {
  rows: AtividadeRow[]
  total: number
  loading: boolean
  error: string | null
  loadPage: (page: number) => void
}

const PAGE_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────

function tsSPHour(ts: string): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
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

// ─── Hook ──────────────────────────────────────────────────────

export function useLeadAtividades(
  startDate: string,
  endDate: string,
  sdrFilter: FilterValues | string | undefined,
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao',
  enabled: boolean,
): LeadAtividadesResult {
  const [rows, setRows] = useState<AtividadeRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const loadPage = useCallback(
    (p: number) => {
      setPage(p)
    },
    [],
  )

  // Referência estável: só dispara o effect quando o filtro muda de conteúdo
  const sdrFilterStable = useDeepCompareValue(
    sdrFilter,
    typeof sdrFilter === 'string' ? sdrFilter : JSON.stringify(sdrFilter),
  )

  useEffect(() => {
    if (!enabled || !startDate || !endDate) {
      setRows([])
      setTotal(0)
      return
    }

    const sdrFilter = sdrFilterStable
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useLeadAtividades] No workspace found')
          setRows([])
          setTotal(0)
          return
        }

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        // 1. Mapa contato_id → { sdrName, oppId }
        interface OppSdrRow {
          id: string
          contato_id: string | null
          sdr_name: string | null
          contatos: { owner_name: string | null } | null
        }
        const contatoToSdr = new Map<string, { sdrName: string; oppId: string }>()
        {
          const PAGE_SIZE_INNER = 1000
          let page = 0
          while (true) {
            let q = supabase
              .from('oportunidades')
              .select('id, contato_id, sdr_name, contatos!inner(owner_name, workspace_id)')
              .eq('workspace_id', wid)
            q = applyRecuperacaoFilter(q, pipelineMode)
            // Vendas SQL segue fora da atividade de pre-vendas em qualquer modo,
            // exceto quando a visao e so Recuperacao (que nao tem Vendas SQL).
            if (pipelineMode !== 'only_recuperacao') {
              q = q.neq('pipeline_id', PIPELINE_VENDAS_SQL_ID)
            }
            const res = await q.order('id').range(page * PAGE_SIZE_INNER, (page + 1) * PAGE_SIZE_INNER - 1)
            if (cancelled) return
            if (res.error) throw res.error
            for (const row of res.data as unknown as OppSdrRow[]) {
              if (row.contato_id) {
                const sdr = row.sdr_name || row.contatos?.owner_name
                if (sdr) {
                  contatoToSdr.set(row.contato_id, { sdrName: sdr, oppId: row.id })
                }
              }
            }
            if ((res.data?.length ?? 0) < PAGE_SIZE_INNER) break
            page++
          }
        }

        // 2. Count query
        {
          let q = supabase
            .from('comunicacoes')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', wid)
            .gte('data_comunicacao', startISO)
            .lte('data_comunicacao', endISO)
            .in('direction', ['outbound', 'inbound'])

          const sdrActive = sdrFilter && (typeof sdrFilter === 'string' ? !!sdrFilter : isFilterActive(sdrFilter))
          if (sdrActive) {
            const contatoIdsWithSdr = [...contatoToSdr.entries()]
              .filter(([, v]) => {
                if (typeof sdrFilter === 'string') return v.sdrName === sdrFilter
                const fv = sdrFilter as FilterValues
                if (fv.exclude.includes(v.sdrName)) return false
                if (fv.include.length > 0) return fv.include.includes(v.sdrName)
                return true
              })
              .map(([k]) => k)
            if (contatoIdsWithSdr.length === 0) {
              if (!cancelled) {
                setTotal(0)
                setRows([])
              }
              return
            }
            q = q.in('contato_id', contatoIdsWithSdr)
          }

          const res = await q
          if (cancelled) return
          if (res.error) throw res.error
          setTotal(res.count ?? 0)
        }

        // 3. Fetch page
        const offset = page * PAGE_SIZE
        let q = supabase
          .from('comunicacoes')
          .select(`
            id,
            contato_id,
            channel,
            direction,
            ghl_source,
            msg_status,
            mensagem_body,
            data_comunicacao,
            phone_call_duration,
            phone_call_status,
            contatos!inner(id, nome, telefone, email, workspace_id)
          `)
          .eq('workspace_id', wid)
          .gte('data_comunicacao', startISO)
          .lte('data_comunicacao', endISO)
          .in('direction', ['outbound', 'inbound'])
          .order('data_comunicacao', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        const sdrActiveFetch = sdrFilter && (typeof sdrFilter === 'string' ? !!sdrFilter : isFilterActive(sdrFilter))
        if (sdrActiveFetch) {
          const contatoIdsWithSdr = [...contatoToSdr.entries()]
            .filter(([, v]) => {
              if (typeof sdrFilter === 'string') return v.sdrName === sdrFilter
              const fv = sdrFilter as FilterValues
              if (fv.exclude.includes(v.sdrName)) return false
              if (fv.include.length > 0) return fv.include.includes(v.sdrName)
              return true
            })
            .map(([k]) => k)
          if (contatoIdsWithSdr.length > 0) {
            q = q.in('contato_id', contatoIdsWithSdr)
          }
        }

        const res = await q
        if (cancelled) return
        if (res.error) throw res.error

        const resultRows: AtividadeRow[] = []
        interface CommDetailRow {
          id: string
          contato_id: string
          channel: string | null
          direction: string | null
          ghl_source: string | null
          usuario_ghl_id?: string | null
          msg_status: string | null
          mensagem_body: string | null
          data_comunicacao: string | null
          phone_call_duration: number | null
          phone_call_status: string | null
          contatos: { id: string; nome: string | null; telefone: string | null; email: string | null } | null
        }
        for (const row of res.data as unknown as CommDetailRow[]) {
          const contato = row.contatos
          const oppInfo = contatoToSdr.get(row.contato_id)
          if (!oppInfo) continue

          const isAutomatico =
            row.direction === 'outbound' &&
            (row.ghl_source === 'workflow' ||
              row.ghl_source === 'api' ||
              row.ghl_source === 'bot' ||
              (row.ghl_source === null && row.usuario_ghl_id === null))

          resultRows.push({
            id: row.id,
            oppId: oppInfo.oppId,
            contatoId: row.contato_id,
            leadNome: contato?.nome ?? null,
            leadTelefone: contato?.telefone ?? null,
            leadEmail: contato?.email ?? null,
            sdrName: oppInfo.sdrName,
            channel: row.channel,
            direction: row.direction,
            ghlSource: row.ghl_source,
            mensagemBody: row.mensagem_body,
            dataComunicacao: row.data_comunicacao,
            phoneCallDuration: row.phone_call_duration,
            phoneCallStatus: row.phone_call_status,
            msgStatus: row.msg_status,
            isAutomatico,
          })
        }

        if (!cancelled) {
          setRows(resultRows)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useLeadAtividades] error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar atividades')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [enabled, startDate, endDate, sdrFilterStable, pipelineMode, page])

  return { rows, total, loading, error, loadPage }
}

export { tsSPHour, fmtDuration }
