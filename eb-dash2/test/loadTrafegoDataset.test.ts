import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
import { emptyFilter } from '@/types/filters'
import { loadTrafegoDataset, type OppRow, type TrafegoFilters } from '@/hooks/useTrafego'
import { useCohort } from '@/hooks/useCohort'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// loadTrafegoDataset usa o client Supabase encadeado
// (from().select().eq()...range()). Aqui o client é substituído por um builder
// falso que registra todas as chamadas por tabela e devolve dados sintéticos
// paginados via .range() — permite testar exclusão de Recuperação, filtros de
// data e paginação determinística sem backend.

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('@/lib/workspace', () => ({
  getWorkspaceId: vi.fn(),
}))

interface RecordedCall {
  method: string
  args: unknown[]
}

interface TableState {
  rows: Record<string, unknown>[]
  calls: RecordedCall[]
}

const tables = new Map<string, TableState>()

function stateFor(table: string): TableState {
  let state = tables.get(table)
  if (!state) {
    state = { rows: [], calls: [] }
    tables.set(table, state)
  }
  return state
}

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'gte', 'lte', 'in', 'not', 'or', 'order', 'limit', 'maybeSingle', 'single',
] as const

function createBuilder(table: string) {
  const state = stateFor(table)
  const builder: Record<string, unknown> = {}

  for (const method of CHAIN_METHODS) {
    builder[method] = (...args: unknown[]) => {
      state.calls.push({ method, args })
      return builder
    }
  }

  builder.range = (from: number, to: number) => {
    state.calls.push({ method: 'range', args: [from, to] })
    return Promise.resolve({ data: state.rows.slice(from, to + 1), error: null })
  }

  // Queries awaited sem .range() (utm_sources, utm_campaigns) precisam de thenable.
  builder.then = (
    onFulfilled?: ((value: { data: unknown[]; error: null }) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ data: state.rows, error: null }).then(onFulfilled, onRejected)

  return builder
}

function callsFor(table: string, method: string): RecordedCall[] {
  return stateFor(table).calls.filter((c) => c.method === method)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFilters(overrides: Partial<TrafegoFilters> = {}): TrafegoFilters {
  return {
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    campaigns: emptyFilter(),
    adsets: emptyFilter(),
    ads: emptyFilter(),
    channels: emptyFilter(),
    mediums: emptyFilter(),
    funilTags: emptyFilter(),
    cpTags: emptyFilter(),
    mqlFilter: 'all',
    ...overrides,
  }
}

function makeRawOpps(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `opp-${i}`,
    contato_id: `c-${i}`,
    pipeline_name: 'Pré-Vendas MQL',
    pipeline_id: 'pipeline-x',
    data_lead_recebido: '2026-03-10T12:00:00Z',
    contatos: null,
  }))
}

function makeOpp(overrides: Partial<OppRow> = {}): OppRow {
  return {
    id: 'opp-1',
    contato_id: 'c-1',
    ghl_opportunity_id: null,
    pipeline_name: 'Pré-Vendas MQL',
    pipeline_id: 'pipeline-x',
    lost_reason: null,
    vendedor_closer: null,
    status: 'open',
    data_lead_recebido: '2026-03-10T12:00:00Z',
    data_conectado: null,
    data_qualificado: null,
    data_no_show: null,
    data_agendamento_reuniao: null,
    data_reuniao_agendada: null,
    data_realizacao_vendas: null,
    data_fechado: null,
    data_perdido: null,
    data_perdido_vendas: null,
    data_negociacao: null,
    data_no_show_vendas: null,
    data_agendamento_vendas: null,
    appointment_status: null,
    data_pendencias_preenchimento: null,
    resumo_ia: null,
    percepcao_closer: null,
    sdr_name: null,
    agendamento_origem: null,
    agendamento_por_user_id: null,
    agendamento_por_user_nome: null,
    agendamento_por_user_email: null,
    agendamento_calendar_id: null,
    agendamento_calendar_name: null,
    agendamento_assigned_user_id: null,
    agendamento_assigned_user_nome: null,
    contatos: {
      ghl_id: 'g-1',
      nome: 'Lead Teste',
      email: 'lead@teste.com',
      telefone: '+5511999999999',
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: '123',
      utm_term: null,
      utm_content: null,
      fbclid: null,
      gclid: null,
      tt_source: null,
      tt_campaign: null,
      tt_medium: null,
      tt_term: null,
      tt_content: null,
      owner_name: 'sdr1',
      owner_email: null,
      date_created: '2026-03-10T11:00:00Z',
      como_nos_conheceu: null,
      faturamento_anual: null,
      perfil_inteligente: null,
      tags: null,
    },
    ...overrides,
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  tables.clear()
  vi.mocked(supabase.from).mockImplementation((table: string) => createBuilder(table) as never)
  vi.mocked(getWorkspaceId).mockResolvedValue('ws-teste')
})

// ─── loadTrafegoDataset ─────────────────────────────────────────────────────

describe('loadTrafegoDataset', () => {
  it('exclui o pipeline Recuperação da query de oportunidades', async () => {
    stateFor('oportunidades').rows = makeRawOpps(1)

    await loadTrafegoDataset(makeFilters())

    expect(callsFor('oportunidades', 'neq')).toContainEqual({
      method: 'neq',
      args: ['pipeline_id', PIPELINE_RECUPERACAO_ID],
    })
  })

  it('filtra oportunidades por data_lead_recebido com offset SP (-03:00)', async () => {
    stateFor('oportunidades').rows = makeRawOpps(1)

    await loadTrafegoDataset(makeFilters({ startDate: '2026-03-01', endDate: '2026-03-31' }))

    expect(callsFor('oportunidades', 'gte')).toContainEqual({
      method: 'gte',
      args: ['data_lead_recebido', '2026-03-01T00:00:00-03:00'],
    })
    expect(callsFor('oportunidades', 'lte')).toContainEqual({
      method: 'lte',
      args: ['data_lead_recebido', '2026-03-31T23:59:59-03:00'],
    })
  })

  it('escopa oportunidades pelo workspace do usuário', async () => {
    stateFor('oportunidades').rows = makeRawOpps(1)

    await loadTrafegoDataset(makeFilters())

    // Filtra pela coluna PRÓPRIA da tabela, não por `contatos.workspace_id`.
    //
    // `oportunidades` tem `workspace_id` denormalizado desde a Fase 6 do
    // multi-tenant (100% preenchido, zero nulos). Filtrar pelo join forçava o
    // Postgres a varrer `contatos` inteira: medido em `comunicacoes`, o mesmo
    // filtro custava 796 ms via join contra 87 ms pela coluna própria — e sob
    // carga isso estourava o statement_timeout, devolvendo 500.
    expect(callsFor('oportunidades', 'eq')).toContainEqual({
      method: 'eq',
      args: ['workspace_id', 'ws-teste'],
    })
  })

  it('pagina oportunidades de forma determinística e agrega todas as páginas', async () => {
    // 1001 linhas = 1 página cheia (1000) + 1 parcial (1) → 2 fetches
    stateFor('oportunidades').rows = makeRawOpps(1001)

    const dataset = await loadTrafegoDataset(makeFilters())

    expect(dataset.opps).toHaveLength(1001)

    // ordem estável: chave única como tiebreaker (roadmap Fase 11-A)
    const orderCalls = callsFor('oportunidades', 'order')
    expect(orderCalls).toContainEqual({ method: 'order', args: ['data_lead_recebido', { ascending: true }] })
    expect(orderCalls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] })

    const ranges = callsFor('oportunidades', 'range').map((c) => c.args)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('busca revenue por data_pagamento_entrada (não data_fechado) e só das opps do conjunto', async () => {
    stateFor('oportunidades').rows = makeRawOpps(2)
    stateFor('vendas_fechamento').rows = [
      { oportunidade_id: 'opp-1', valor_faturado: 5000, valor_entrada: 1000, data_pagamento_entrada: '2026-03-20' },
      // revenue de uma opp fora do conjunto retornado → deve ser descartada
      { oportunidade_id: 'opp-fora-do-cohort', valor_faturado: 999, valor_entrada: 99, data_pagamento_entrada: '2026-03-21' },
    ]

    const dataset = await loadTrafegoDataset(makeFilters())

    expect(callsFor('vendas_fechamento', 'gte')).toContainEqual({
      method: 'gte',
      args: ['data_pagamento_entrada', '2026-03-01T00:00:00-03:00'],
    })

    const allRevenueArgs = stateFor('vendas_fechamento').calls.flatMap((c) => c.args)
    expect(allRevenueArgs).not.toContain('data_fechado')

    expect(dataset.revenueRows).toHaveLength(1)
    expect(dataset.revenueRows[0].oportunidade_id).toBe('opp-1')
  })

  // Fase 15 — filtro opcional por conta Meta
  it('sem metaAccountId: nenhuma query ganha filtro de account_id (padrão = todas somado)', async () => {
    stateFor('oportunidades').rows = makeRawOpps(1)

    await loadTrafegoDataset(makeFilters())

    const insightsEq = callsFor('meta_ads_insights', 'eq')
    expect(insightsEq.some((c) => c.args[0] === 'account_id')).toBe(false)
    const dailyEq = callsFor('meta_ads_account_daily', 'eq')
    expect(dailyEq.some((c) => c.args[0] === 'account_id')).toBe(false)
  })

  it('com metaAccountId: meta_ads_insights e meta_ads_account_daily ganham .eq(account_id)', async () => {
    stateFor('oportunidades').rows = makeRawOpps(1)

    await loadTrafegoDataset(makeFilters({ metaAccountId: 'act_123' }))

    expect(callsFor('meta_ads_insights', 'eq')).toContainEqual({
      method: 'eq',
      args: ['account_id', 'act_123'],
    })
    expect(callsFor('meta_ads_account_daily', 'eq')).toContainEqual({
      method: 'eq',
      args: ['account_id', 'act_123'],
    })
  })
})

// ─── useCohort — fallback data_lead_recebido ────────────────────────────────

describe('useCohort (fallback de data do cohort)', () => {
  it('usa data_lead_recebido quando contatos.date_created é null', () => {
    const opps = [
      makeOpp({
        id: 'o1',
        data_lead_recebido: '2026-03-10T12:00:00Z',
        contatos: { ...makeOpp().contatos!, date_created: null },
      }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-03-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-03-01')
  })

  it('fallback converte TIMESTAMPTZ para SP (00:30Z cai no mês anterior)', () => {
    // 2026-03-01T00:30:00Z = 2026-02-28 21:30 SP → cohort de fevereiro
    const opps = [
      makeOpp({
        id: 'o1',
        data_lead_recebido: '2026-03-01T00:30:00Z',
        contatos: { ...makeOpp().contatos!, date_created: null },
      }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-02-01')
  })

  it('ignora opp sem date_created e sem data_lead_recebido', () => {
    const opps = [
      makeOpp({
        id: 'o1',
        data_lead_recebido: null,
        contatos: { ...makeOpp().contatos!, date_created: null },
      }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-03-01', '2026-03-31'))
    expect(result.current.rows).toEqual([])
  })
})
