import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WeeklyReportTable } from '../WeeklyReportTable'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

// ─── Dados mockados ─────────────────────────────────────────────────────────

const mockRows: WeeklyReportRow[] = [
  {
    module: 'trafego',
    week_start: '2026-05-12',
    week_end: '2026-05-18',
    year_week: '2026-W20',
    report_type: 'cohort',
    status: 'completed',
    leads_count: 120,
    mqls_count: 40,
    conectados_count: 35,
    agendados_count: 20,
    reunioes_count: 12,
    fechados_count: 5,
    faturamento_bruto: 25000,
    caixa_recebido: 12000,
  },
  {
    module: 'trafego',
    week_start: '2026-05-05',
    week_end: '2026-05-11',
    year_week: '2026-W19',
    report_type: 'cohort',
    status: 'completed',
    leads_count: 100,
    mqls_count: 30,
    conectados_count: 28,
    agendados_count: 18,
    reunioes_count: 10,
    fechados_count: 4,
    faturamento_bruto: 18000,
    caixa_recebido: 9000,
  },
]

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('WeeklyReportTable', () => {
  it('renderiza todas as colunas do cabeçalho', () => {
    render(<WeeklyReportTable rows={mockRows} loading={false} />)

    expect(screen.getByText('Semana')).toBeInTheDocument()
    expect(screen.getByText('Leads')).toBeInTheDocument()
    expect(screen.getByText('MQLs')).toBeInTheDocument()
    expect(screen.getByText('Conectados')).toBeInTheDocument()
    expect(screen.getByText('Agendados')).toBeInTheDocument()
    expect(screen.getByText('Reuniões')).toBeInTheDocument()
    expect(screen.getByText('Fechados')).toBeInTheDocument()
    expect(screen.getByText('Faturamento')).toBeInTheDocument()
    expect(screen.getByText('Caixa')).toBeInTheDocument()
  })

  it('renderiza os dados das linhas corretamente', () => {
    render(<WeeklyReportTable rows={mockRows} loading={false} />)

    // Verifica se as semanas estão presentes
    expect(screen.getByText('2026-W20')).toBeInTheDocument()
    expect(screen.getByText('2026-W19')).toBeInTheDocument()

    // Verifica valores numéricos
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('formata moeda no padrão brasileiro (BRL)', () => {
    render(<WeeklyReportTable rows={mockRows} loading={false} />)

    // Formatação esperada: R$ 25.000 e R$ 18.000
    expect(screen.getByText('R$ 25.000')).toBeInTheDocument()
    expect(screen.getByText('R$ 18.000')).toBeInTheDocument()
    expect(screen.getByText('R$ 12.000')).toBeInTheDocument()
    expect(screen.getByText('R$ 9.000')).toBeInTheDocument()
  })

  it('renderiza skeleton rows quando loading', () => {
    render(<WeeklyReportTable rows={[]} loading={true} />)

    // Quando loading, deve haver 5 skeleton rows (cada um com 9 células)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renderiza empty state quando não há dados e não está loading', () => {
    render(<WeeklyReportTable rows={[]} loading={false} />)

    expect(screen.getByText('Nenhum dado disponível')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Os relatórios semanais ainda não foram gerados para este módulo. O backfill está pendente.',
      ),
    ).toBeInTheDocument()
  })
})

// ─── Dedup e ordenação (fix de snapshots duplicados em weekly_snapshots) ────
//
// Mesmo cenário de produção do trendData.test.ts: pares legados workspace_id
// NULL + novo para a mesma semana, e snapshot com week_start fora da convenção
// de segunda-feira cujo year_week colide com o snapshot correto.

function makeRow(overrides: Partial<WeeklyReportRow>): WeeklyReportRow {
  return {
    module: 'trafego',
    week_start: '2026-06-29',
    week_end: '2026-07-05',
    year_week: '2026-W27',
    report_type: 'cohort',
    status: 'completed',
    leads_count: 0,
    mqls_count: 0,
    conectados_count: 0,
    agendados_count: 0,
    reunioes_count: 0,
    fechados_count: 0,
    faturamento_bruto: 0,
    caixa_recebido: 0,
    data_version: 1,
    computed_at: null,
    ...overrides,
  }
}

// Sequência como o hook devolve (ORDER BY week_start DESC): semanas repetidas
// e year_week colidindo entre week_starts distintos.
function linhasProducao(): WeeklyReportRow[] {
  return [
    makeRow({ week_start: '2026-07-13', week_end: '2026-07-19', year_week: '2026-W29', leads_count: 120, computed_at: '2026-07-14T07:00:00Z' }),
    makeRow({ week_start: '2026-07-06', week_end: '2026-07-12', year_week: '2026-W28', leads_count: 150, computed_at: '2026-07-07T07:00:00Z' }),
    // W27 duplicada: par legado NULL + workspace (valores idênticos)
    makeRow({ week_start: '2026-06-29', week_end: '2026-07-05', year_week: '2026-W27', leads_count: 210, computed_at: '2026-07-06T07:00:09Z' }),
    makeRow({ week_start: '2026-06-29', week_end: '2026-07-05', year_week: '2026-W27', leads_count: 210, computed_at: '2026-07-06T18:00:06Z' }),
    // W21 colidindo: snapshot legado de terça (45) vs. correto de segunda (260)
    makeRow({ week_start: '2026-05-19', week_end: '2026-05-25', year_week: '2026-W21', leads_count: 45, data_version: 2, computed_at: '2026-05-20T18:54:13Z' }),
    makeRow({ week_start: '2026-05-18', week_end: '2026-05-24', year_week: '2026-W21', leads_count: 260, data_version: 2, computed_at: '2026-05-25T07:00:08Z' }),
  ]
}

function weekLabelsRenderizados(): string[] {
  return screen.getAllByText(/^20\d\d-W\d{1,2}$/).map((el) => el.textContent ?? '')
}

describe('WeeklyReportTable — dedup e ordenação de semanas', () => {
  it('renderiza exatamente uma linha por semana (sem year_week repetido)', () => {
    render(<WeeklyReportTable rows={linhasProducao()} loading={false} />)

    const labels = weekLabelsRenderizados()
    expect(labels).toHaveLength(4)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('em colisão de year_week, exibe os valores do snapshot vencedor', () => {
    render(<WeeklyReportTable rows={linhasProducao()} loading={false} />)

    const w21Row = screen.getByText('2026-W21').closest('tr') as HTMLElement
    expect(within(w21Row).getByText('260')).toBeInTheDocument()
    expect(within(w21Row).queryByText('45')).not.toBeInTheDocument()
  })

  it('ordena da semana mais recente para a mais antiga, mesmo com entrada fora de ordem', () => {
    const shuffled = [...linhasProducao()].reverse()
    render(<WeeklyReportTable rows={shuffled} loading={false} />)

    expect(weekLabelsRenderizados()).toEqual(['2026-W29', '2026-W28', '2026-W27', '2026-W21'])
  })
})
