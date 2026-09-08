import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelatoriosPage } from '../RelatoriosPage'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as Record<string, unknown>),
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  }
})

let mockHookReturn = {
  rows: [],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}

vi.mock('@/hooks/useWeeklyReports', () => ({
  useWeeklyReports: () => mockHookReturn,
}))

vi.mock('../tabs/CohortTab', () => ({
  CohortTab: () => <div data-testid="cohort-tab">CohortTab</div>,
}))
vi.mock('../tabs/ProdutividadeTab', () => ({
  ProdutividadeTab: () => <div data-testid="produtividade-tab">ProdutividadeTab</div>,
}))
vi.mock('../tabs/ComparativoTab', () => ({
  ComparativoTab: () => <div data-testid="comparativo-tab">ComparativoTab</div>,
}))
vi.mock('../tabs/TendenciasTab', () => ({
  TendenciasTab: () => <div data-testid="tendencias-tab">TendenciasTab</div>,
}))

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('RelatoriosPage', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockHookReturn = {
      rows: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
    }
  })

  it('renderiza as 4 tabs de navegação', () => {
    render(<RelatoriosPage />)

    expect(screen.getByText('Cohort')).toBeInTheDocument()
    expect(screen.getByText('Produtividade')).toBeInTheDocument()
    expect(screen.getByText('Comparativo')).toBeInTheDocument()
    expect(screen.getByText('Tendências')).toBeInTheDocument()
  })

  it('renderiza o seletor de módulo com todas as opções', () => {
    render(<RelatoriosPage />)

    expect(screen.getByText('Módulo:')).toBeInTheDocument()
    expect(screen.getByText('Tráfego')).toBeInTheDocument()
    expect(screen.getByText('Pré-Vendas')).toBeInTheDocument()
    expect(screen.getByText('Vendas')).toBeInTheDocument()
    expect(screen.getByText('Orgânico')).toBeInTheDocument()
    expect(screen.getByText('Recuperação')).toBeInTheDocument()
  })

  it('renderiza a tab ativa com base na URL', () => {
    mockSearchParams = new URLSearchParams({ tab: 'produtividade' })
    render(<RelatoriosPage />)

    expect(screen.getByTestId('produtividade-tab')).toBeInTheDocument()
  })

  it('exibe mensagem de erro quando o hook retorna erro', () => {
    mockHookReturn.error = 'Falha na conexão'
    render(<RelatoriosPage />)

    expect(screen.getByText(/Erro ao carregar dados:/)).toBeInTheDocument()
    // O texto do erro está em um nó irmão; usamos regex para localizá-lo
    expect(screen.getByText(/Falha na conexão/)).toBeInTheDocument()
  })
})
