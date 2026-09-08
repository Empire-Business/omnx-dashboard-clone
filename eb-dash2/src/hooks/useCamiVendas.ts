import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
import { parseTags } from './useTrafego'
import type { OppRow } from './useTrafego'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { isFilterActive, applyFilterValue } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

// ─── Helpers de tag Cami ──────────────────────────────────────

/** Lead que se inscreveu no produto Cami Start (tag: [cp] cami start) */
export function isCamiInscrito(tags: string[]): boolean {
  return tags.some((t) => t.toLowerCase() === '[cp] cami start')
}

/** Lead que comprou o produto Cami Start (tag: cami start) */
export function isCamiComprador(tags: string[]): boolean {
  return tags.some((t) => t.toLowerCase() === 'cami start')
}

// ─── Types ────────────────────────────────────────────────────

export interface CamiFilters {
  startDate: string   // 'YYYY-MM-DD' São Paulo
  endDate: string
  mode: 'cohort' | 'produtividade'
  canal?: FilterValues
  sdr?: FilterValues
}

export interface CamiChartDay {
  date: string     // 'YYYY-MM-DD'
  label: string    // 'DD/MM'
  inscritos: number
  compradores: number
}

export interface CamiData {
  inscritos: OppRow[]
  compradores: OppRow[]
  chartDays: CamiChartDay[]
  loading: boolean
  error: string | null
}

// ─── Helpers internos ─────────────────────────────────────────

/** Gera array de dias entre startDate e endDate (inclusive) */
function generateDays(startDate: string, endDate: string): CamiChartDay[] {
  const days: CamiChartDay[] = []
  const current = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (current <= end) {
    const yyyy = current.getFullYear()
    const mm = String(current.getMonth() + 1).padStart(2, '0')
    const dd = String(current.getDate()).padStart(2, '0')
    days.push({
      date: `${yyyy}-${mm}-${dd}`,
      label: `${dd}/${mm}`,
      inscritos: 0,
      compradores: 0,
    })
    current.setDate(current.getDate() + 1)
  }
  return days
}

/** Converte TIMESTAMPTZ ou DATE para 'YYYY-MM-DD' no fuso SP */
function toSPDate(val: string): string {
  if (val.length === 10) return val
  return new Date(val).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

// ─── Select mínimo para a aba Cami ───────────────────────────

const OPP_SELECT = `
  id, contato_id, ghl_opportunity_id, pipeline_id, pipeline_name,
  data_lead_recebido, sdr_name, vendedor_closer, status,
  contatos(nome, email, telefone, tags, utm_source, owner_name)
`

// ─── Hook ─────────────────────────────────────────────────────

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

export function useCamiVendas(filters: CamiFilters): CamiData {
  const [inscritos, setInscritos] = useState<OppRow[]>([])
  const [compradores, setCompradores] = useState<OppRow[]>([])
  const [chartDays, setChartDays] = useState<CamiChartDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Referência estável dos filtros que disparam o fetch (compara por conteúdo)
  const filtersStable = useDeepCompareValue(
    filters,
    JSON.stringify({
      s: filters.startDate,
      e: filters.endDate,
      m: filters.mode,
      c: filters.canal,
      sd: filters.sdr,
    }),
  )

  useEffect(() => {
    const filters = filtersStable
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const startISO = toSPISOStart(filters.startDate)
        const endISO = toSPISOEnd(filters.endDate)

        // ─── PASSO 1: Buscar todas as opps do período por data_lead_recebido ──
        // Tanto inscritos quanto compradores são buscados do mesmo pool base,
        // mas filtrados INDEPENDENTEMENTE por tag — um comprador NÃO precisa
        // ter a tag [cp] cami start para aparecer como comprador.
        const PAGE_SIZE = 1000
        // Cursor por data (não OFFSET): páginas profundas com este select
        // estouravam o statement_timeout — 500 no PostgREST.
        const allOpps = await fetchAllPagesByTimeCursor<OppRow>(
          (cursor) =>
            supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
              .gte('data_lead_recebido', cursor ?? startISO)
              .lte('data_lead_recebido', endISO)
              .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
              .order('data_lead_recebido', { ascending: true })
              .order('id', { ascending: true }) as never,
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
        )

        // ─── PASSO 2: Aplicar filtros de dimensão ────────────────────────────
        let pool = allOpps

        if (filters.canal && isFilterActive(filters.canal)) {
          pool = pool.filter((o) => applyFilterValue(o.contatos?.utm_source, filters.canal!))
        }
        if (filters.sdr && isFilterActive(filters.sdr)) {
          const sdrFv = filters.sdr
          pool = pool.filter((o) => {
            const isIa = parseTags(o.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
            const effectiveSdr = isIa ? 'SDR IA' : (o.sdr_name ?? o.contatos?.owner_name ?? '')
            return applyFilterValue(effectiveSdr, sdrFv)
          })
        }

        // ─── PASSO 3: Filtrar inscritos e compradores de forma INDEPENDENTE ──
        //
        // IMPORTANTE: inscritos e compradores são populações separadas.
        // Um comprador (tag "cami start") pode não ter a tag "[cp] cami start".
        // Por isso ambos são filtrados diretamente de pool.
        const inscritosArr = pool.filter((o) =>
          isCamiInscrito(parseTags(o.contatos?.tags))
        )
        const compradoresArr = pool.filter((o) =>
          isCamiComprador(parseTags(o.contatos?.tags))
        )

        // ─── PASSO 4: Montar gráfico dia-a-dia ───────────────────────────────
        const days = generateDays(filters.startDate, filters.endDate)
        const dayMap = new Map(days.map((d) => [d.date, d]))

        // Inscritos agrupados por data_lead_recebido
        for (const o of inscritosArr) {
          if (!o.data_lead_recebido) continue
          const d = toSPDate(o.data_lead_recebido)
          const day = dayMap.get(d)
          if (day) day.inscritos++
        }

        // Compradores agrupados por data_lead_recebido
        for (const o of compradoresArr) {
          if (!o.data_lead_recebido) continue
          const d = toSPDate(o.data_lead_recebido)
          const day = dayMap.get(d)
          if (day) day.compradores++
        }

        if (!cancelled) {
          setInscritos(inscritosArr)
          setCompradores(compradoresArr)
          setChartDays(days)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar dados Cami')
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [filtersStable])

  return { inscritos, compradores, chartDays, loading, error }
}
