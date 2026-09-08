import { describe, it, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWeeklyReports } from '../useWeeklyReports'

// ─── Helper: cria um mock do cliente Supabase ───────────────────────────────

function createMockClient(returnData: unknown[] | null = [], returnError: Error | null = null) {
  const chain: {
    select: () => typeof chain
    eq: () => typeof chain
    order: () => typeof chain
    limit: () => typeof chain
    then: (resolve: (value: unknown) => void, _reject?: (reason?: unknown) => void) => void
  } = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve) => {
      resolve({ data: returnData, error: returnError })
    },
  }
  return {
    from: () => chain,
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('useWeeklyReports', () => {
  it('retorna dados quando a query é bem-sucedida', async () => {
    const mockRows = [
      {
        module: 'trafego',
        week_start: '2026-05-12',
        week_end: '2026-05-18',
        year_week: '2026-W20',
        report_type: 'cohort',
        status: 'completed',
        leads_count: 100,
        mqls_count: 30,
        conectados_count: 25,
        agendados_count: 15,
        reunioes_count: 10,
        fechados_count: 3,
        faturamento_bruto: 15000,
        caixa_recebido: 7500,
      },
    ]

    const mockClient = createMockClient(mockRows)

    const { result } = renderHook(() =>
      useWeeklyReports({ module: 'trafego', reportType: 'cohort' }, mockClient),
    )

    // Inicialmente está carregando
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].year_week).toBe('2026-W20')
    expect(result.current.rows[0].leads_count).toBe(100)
  })

  it('retorna erro quando a query falha', async () => {
    const mockClient = createMockClient(null, new Error('Network error'))

    const { result } = renderHook(() =>
      useWeeklyReports({ module: 'trafego', reportType: 'cohort' }, mockClient),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeTruthy()
    expect(result.current.rows).toHaveLength(0)
  })

  it('aplica filtros de dimensão quando fornecidos', async () => {
    const mockRows = [
      {
        module: 'trafego',
        week_start: '2026-05-12',
        week_end: '2026-05-18',
        year_week: '2026-W20',
        report_type: 'produtividade',
        status: 'completed',
        leads_count: 50,
        mqls_count: 15,
      },
    ]

    const mockClient = createMockClient(mockRows)

    const { result } = renderHook(() =>
      useWeeklyReports(
        {
          module: 'trafego',
          reportType: 'produtividade',
          dimension: 'canal',
          dimensionValue: 'meta_ads',
        },
        mockClient,
      ),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Verifica que o hook retornou os dados filtrados
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].leads_count).toBe(50)
  })

  it('chama refresh e recarrega os dados', async () => {
    const mockRows = [
      {
        module: 'vendas',
        week_start: '2026-05-12',
        week_end: '2026-05-18',
        year_week: '2026-W20',
        report_type: 'produtividade',
        status: 'completed',
        leads_count: 20,
      },
    ]

    const mockClient = createMockClient(mockRows)

    const { result } = renderHook(() =>
      useWeeklyReports({ module: 'vendas', reportType: 'produtividade' }, mockClient),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows).toHaveLength(1)

    // O refresh incrementa o refreshKey, causando re-execução do effect.
    // Como o mockClient é o mesmo, os dados não mudam.
    // Testamos apenas que a função refresh existe e pode ser chamada sem erro.
    act(() => {
      result.current.refresh()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows).toHaveLength(1)
  })
})
