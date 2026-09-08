import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart } from '@/lib/utils/dates'

// ─── Types ──────────────────────────────────────────────────────

export interface CommAggregation {
  msgs_humanas: number   // outbound humano: (ghl_source='app' + whatsapp/sms/mensagem) OU (qualquer source + sms)
  msgs_ia: number        // outbound + ghl_source='workflow' + canal não-email
  emails: number         // outbound + channel='email'
  ligacoes: number       // channel='call' (qualquer direção)
  msgs_lead: number      // inbound (qualquer canal)
  inbound_dates: string[] // timestamps inbound por contato
}

const EMPTY: CommAggregation = { msgs_humanas: 0, msgs_ia: 0, emails: 0, ligacoes: 0, msgs_lead: 0, inbound_dates: [] }

const PAGE_SIZE = 1000

// ─── Paginated fetch helper ─────────────────────────────────────

// Shape mínimo de uma query PostgREST paginável via .order().range()
interface PaginatableQuery {
  order: (column: string) => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
  }
}

async function fetchPaginated<T extends Record<string, unknown>>(
  buildQuery: () => PaginatableQuery,
): Promise<T[]> {
  const all: T[] = []
  let page = 0
  while (true) {
    const query = buildQuery()
    const { data, error } = await query
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) {
      console.error('[useMQLCohortComms] fetch error', error)
      // Não engolir a falha: propaga para o chamador expor estado de erro
      // (senão o hook retornaria dados parciais silenciosamente).
      throw new Error(error.message)
    }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    page++
  }
  return all
}

// ─── Hook ───────────────────────────────────────────────────────

// Map vazio compartilhado (nunca mutado) para os estados "sem dados"
const EMPTY_MAP = new Map<string, CommAggregation>()

export function useMQLCohortComms(
  contatoIds: string[],
  startDate: string,
): {
  commsMap: Map<string, CommAggregation>
  loading: boolean
  error: string | null
} {
  // Último fetch concluído (ou falho) — o que é exibido deriva deste estado
  const [result, setResult] = useState<{
    key: string
    map: Map<string, CommAggregation>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Stable key to avoid unnecessary refetches
  const contatoIdsKey = useMemo(() => {
    if (contatoIds.length === 0) return ''
    return [...new Set(contatoIds)].sort().join(',')
  }, [contatoIds])

  // Chave do fetch atual: muda quando ids ou startDate mudam
  const fetchKey = contatoIdsKey ? `${contatoIdsKey}|${startDate}` : ''

  useEffect(() => {
    if (!fetchKey) return
    let cancelled = false
    setError(null)

    const contatoSet = new Set(contatoIdsKey.split(','))
    const startISO = toSPISOStart(startDate)

    // 3 queries em paralelo — busca TODAS as comunicações desde startDate (cohort: sem limite superior)
    getWorkspaceId().then((wid) => {
      if (!wid) throw new Error('Conta não encontrada')
      return Promise.all([
      // 1. Outbound humano (SDR):
      //    - ghl_source='app' + whatsapp/sms/mensagem/call  (SDR pelo app GHL)
      //    - ghl_source='api' + sms                         (SMS humano via API — confirmado)
      fetchPaginated<{ contato_id: string | null; channel: string; ghl_source: string | null }>(() =>
        supabase
          .from('comunicacoes')
          .select('contato_id, channel, ghl_source')
          .eq('workspace_id', wid)
          .gte('data_comunicacao', startISO)
          .eq('direction', 'outbound')
          .or('and(ghl_source.eq.app,channel.in.(whatsapp,sms,mensagem,call)),and(ghl_source.eq.api,channel.eq.sms)'),
      ),
      // 2. Outbound IA + Email
      //    - ghl_source='workflow' + qualquer canal não-email  (bot/automação)
      //    - channel='email' (qualquer source)
      fetchPaginated<{ contato_id: string | null; channel: string; ghl_source: string | null }>(() =>
        supabase
          .from('comunicacoes')
          .select('contato_id, channel, ghl_source')
          .eq('workspace_id', wid)
          .gte('data_comunicacao', startISO)
          .eq('direction', 'outbound')
          .or('ghl_source.eq.workflow,channel.eq.email'),
      ),
      // 3. Inbound (lead respondeu)
      fetchPaginated<{ contato_id: string | null; data_comunicacao: string | null }>(() =>
        supabase
          .from('comunicacoes')
          .select('contato_id, data_comunicacao')
          .eq('workspace_id', wid)
          .gte('data_comunicacao', startISO)
          .eq('direction', 'inbound'),
      ),
      ])
    }).then(([humanRows, iaEmailRows, inboundRows]) => {
      if (cancelled) return

      const map = new Map<string, CommAggregation>()
      const getOrCreate = (id: string): CommAggregation => {
        let entry = map.get(id)
        if (!entry) {
          entry = { ...EMPTY }
          map.set(id, entry)
        }
        return entry
      }

      // 1. Humano outbound
      for (const row of humanRows) {
        if (!row.contato_id || !contatoSet.has(row.contato_id)) continue
        const entry = getOrCreate(row.contato_id)
        if (row.channel === 'call') entry.ligacoes++
        else entry.msgs_humanas++ // whatsapp, sms (app ou api), mensagem
      }

      // 2. IA + Email
      for (const row of iaEmailRows) {
        if (!row.contato_id || !contatoSet.has(row.contato_id)) continue
        const entry = getOrCreate(row.contato_id)
        if (row.channel === 'email') entry.emails++
        else if (row.ghl_source === 'workflow') entry.msgs_ia++
      }

      // 3. Inbound
      for (const row of inboundRows) {
        if (!row.contato_id || !contatoSet.has(row.contato_id)) continue
        const entry = getOrCreate(row.contato_id)
        entry.msgs_lead++
        if (row.data_comunicacao) entry.inbound_dates.push(row.data_comunicacao)
      }

      for (const entry of map.values()) {
        entry.inbound_dates.sort((a, b) => a.localeCompare(b))
      }

      setResult({ key: fetchKey, map })
    }).catch((err) => {
      if (cancelled) return
      console.error('[useMQLCohortComms] unexpected error', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar comunicações')
      // Marca o fetch atual como concluído (com falha) mantendo dados anteriores
      setResult((prev) => ({ key: fetchKey, map: prev?.map ?? new Map() }))
    })

    return () => { cancelled = true }
  }, [contatoIdsKey, startDate, fetchKey])

  // Estado derivado: sem dados enquanto o fetch da chave atual não concluiu
  const commsMap = fetchKey === '' ? EMPTY_MAP : (result?.map ?? EMPTY_MAP)
  const loading = fetchKey !== '' && result?.key !== fetchKey

  return { commsMap, loading, error }
}
