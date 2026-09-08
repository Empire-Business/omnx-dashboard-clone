export type StatusFilter = 'all' | 'active' | 'inactive'
export type TipoFilter = 'all' | 'marketing' | 'utility'

export interface DisparosFilters {
  /** YYYY-MM-DD ou '' (sem limite) */
  startDate: string
  endDate: string
  status: StatusFilter
  tipo: TipoFilter
  busca: string
}

export const EMPTY_DISPAROS_FILTERS: DisparosFilters = {
  startDate: '',
  endDate: '',
  status: 'all',
  tipo: 'all',
  busca: '',
}

/** Data de hoje em America/Sao_Paulo, formato YYYY-MM-DD */
function hoje(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function primeiroDiaMes(iso: string): string {
  return iso.slice(0, 8) + '01'
}

export const DISPAROS_PRESETS: { label: string; fn: () => { s: string; e: string } }[] = [
  { label: 'Todo o período', fn: () => ({ s: '', e: '' }) },
  { label: 'Hoje', fn: () => ({ s: hoje(), e: hoje() }) },
  { label: '7 dias', fn: () => ({ s: addDays(hoje(), -6), e: hoje() }) },
  { label: '30 dias', fn: () => ({ s: addDays(hoje(), -29), e: hoje() }) },
  { label: 'Este mês', fn: () => ({ s: primeiroDiaMes(hoje()), e: hoje() }) },
  {
    label: 'Mês passado',
    fn: () => {
      const d = new Date(hoje() + 'T12:00:00')
      const primeiroMesPassado = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const ultimoMesPassado = new Date(d.getFullYear(), d.getMonth(), 0)
      const fmt = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(primeiroMesPassado), e: fmt(ultimoMesPassado) }
    },
  },
]
