import { describe, expect, it } from 'vitest'

import { buildTrendData } from '@/lib/relatorios/trendData'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

// ─── Fixture ────────────────────────────────────────────────────────────────
//
// Reproduz o formato real de v_weekly_dashboard em produção (2026-07-15):
// weekly_snapshots contém duplicatas legadas — pares workspace_id NULL +
// workspace_id preenchido para a mesma semana, e snapshots antigos com
// week_start fora da convenção de segunda-feira cujo year_week colide com o
// snapshot correto (ex.: 2026-05-19 e 2026-05-18, ambos "2026-W21").

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

// Mesma sequência que o hook retorna hoje em produção (ORDER BY week_start
// DESC): semanas repetidas e year_week colidindo entre week_starts distintos.
function producaoRows(): WeeklyReportRow[] {
  return [
    makeRow({ week_start: '2026-07-13', week_end: '2026-07-19', year_week: '2026-W29', leads_count: 120, computed_at: '2026-07-14T07:00:00Z' }),
    makeRow({ week_start: '2026-07-06', week_end: '2026-07-12', year_week: '2026-W28', leads_count: 150, computed_at: '2026-07-07T07:00:00Z' }),
    // W27 duplicada: par legado NULL + workspace (valores idênticos)
    makeRow({ week_start: '2026-06-29', week_end: '2026-07-05', year_week: '2026-W27', leads_count: 210, computed_at: '2026-07-06T07:00:09Z' }),
    makeRow({ week_start: '2026-06-29', week_end: '2026-07-05', year_week: '2026-W27', leads_count: 210, computed_at: '2026-07-06T18:00:06Z' }),
    // W21 colidindo: snapshot legado de terça (45) vs. correto de segunda (260)
    makeRow({ week_start: '2026-05-19', week_end: '2026-05-25', year_week: '2026-W21', leads_count: 45, data_version: 2, computed_at: '2026-05-20T18:54:13Z' }),
    makeRow({ week_start: '2026-05-18', week_end: '2026-05-24', year_week: '2026-W21', leads_count: 260, data_version: 2, computed_at: '2026-05-25T07:00:08Z' }),
    // W20 com 3 snapshots: vence o de maior data_version
    makeRow({ week_start: '2026-05-12', week_end: '2026-05-18', year_week: '2026-W20', leads_count: 250, data_version: 9, computed_at: '2026-05-20T18:54:07Z' }),
    makeRow({ week_start: '2026-05-11', week_end: '2026-05-17', year_week: '2026-W20', leads_count: 256, data_version: 78, computed_at: '2026-07-06T14:30:08Z' }),
    makeRow({ week_start: '2026-05-11', week_end: '2026-05-17', year_week: '2026-W20', leads_count: 256, data_version: 1, computed_at: '2026-07-06T15:00:09Z' }),
  ]
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('buildTrendData', () => {
  it('retorna vazio para entrada vazia', () => {
    expect(buildTrendData([], 'leads')).toEqual([])
  })

  it('deduplica semanas repetidas: exatamente um ponto por year_week', () => {
    const data = buildTrendData(producaoRows(), 'leads')
    expect(data.map((d) => d.label)).toEqual(['2026-W20', '2026-W21', '2026-W27', '2026-W28', '2026-W29'])
  })

  it('ordena cronologicamente (asc) mesmo com entrada embaralhada ou desc', () => {
    const desc = producaoRows()
    const shuffled = [...desc].reverse()
    for (const rows of [desc, shuffled]) {
      const keys = buildTrendData(rows, 'leads').map((d) => d.key)
      const sorted = [...keys].sort()
      expect(keys).toEqual(sorted)
    }
  })

  it('gera chaves únicas e estáveis (week_start ISO), nunca o label', () => {
    const data = buildTrendData(producaoRows(), 'leads')
    const keys = data.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['2026-05-11', '2026-05-18', '2026-06-29', '2026-07-06', '2026-07-13'])
  })

  it('em colisão de year_week entre week_starts distintos, escolhe o snapshot computado mais recentemente', () => {
    // Caso real W21: mesma data_version — vence computed_at 2026-05-25 (260 leads,
    // week_start de segunda-feira), não o legado de terça-feira (45 leads).
    const data = buildTrendData(producaoRows(), 'leads')
    const w21 = data.find((d) => d.label === '2026-W21')
    expect(w21?.key).toBe('2026-05-18')
    expect(w21?.value).toBe(260)
  })

  it('entre snapshots da mesma semana, prefere o de maior data_version', () => {
    // Caso real W20: v78 (computed 07-06) vence v9 e v1.
    const data = buildTrendData(producaoRows(), 'leads')
    const w20 = data.find((d) => d.label === '2026-W20')
    expect(w20?.key).toBe('2026-05-11')
    expect(w20?.value).toBe(256)
  })

  it('duplicata exata (mesmos valores) colapsa em um único ponto sem alterar o valor', () => {
    const data = buildTrendData(producaoRows(), 'leads')
    const w27 = data.filter((d) => d.label === '2026-W27')
    expect(w27).toHaveLength(1)
    expect(w27[0].value).toBe(210)
  })

  it('extrai a métrica pedida e converte null para 0', () => {
    const rows = [
      makeRow({ week_start: '2026-07-06', year_week: '2026-W28', mqls_count: null, faturamento_bruto: 12500.5 }),
      makeRow({ week_start: '2026-06-29', year_week: '2026-W27', mqls_count: 42, faturamento_bruto: null }),
    ]
    const mqls = buildTrendData(rows, 'mqls')
    expect(mqls.map((d) => d.value)).toEqual([42, 0])
    const faturamento = buildTrendData(rows, 'faturamento_bruto')
    expect(faturamento.map((d) => d.value)).toEqual([0, 12500.5])
  })

  it('tolera rows sem data_version/computed_at (campos opcionais)', () => {
    const rows = [
      makeRow({ week_start: '2026-06-29', year_week: '2026-W27', leads_count: 10, data_version: undefined, computed_at: undefined }),
      makeRow({ week_start: '2026-06-29', year_week: '2026-W27', leads_count: 10, data_version: undefined, computed_at: undefined }),
    ]
    const data = buildTrendData(rows, 'leads')
    expect(data).toHaveLength(1)
    expect(data[0]).toEqual({ key: '2026-06-29', label: '2026-W27', value: 10 })
  })
})
