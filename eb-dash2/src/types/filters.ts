export type FilterValues = {
  include: string[]
  exclude: string[]
}

export const emptyFilter = (): FilterValues => ({ include: [], exclude: [] })

export const isFilterActive = (f: FilterValues): boolean =>
  f.include.length > 0 || f.exclude.length > 0

export function applyFilterValue(
  value: string | null | undefined,
  f: FilterValues,
): boolean {
  if (!isFilterActive(f)) return true
  const v = value ?? ''
  if (f.exclude.includes(v)) return false
  if (f.include.length > 0) return f.include.includes(v)
  return true
}

// ─── Atribuição (Closer / Pré-vendedor) ──────────────────────────
// Sentinela para leads/oportunidades sem closer ou pré-vendedor atribuído.
// Motivo: oportunidades.vendedor_closer está pouco preenchido em produção
// (≈1-2% das oportunidades — o campo só é sincronizado quando o closer é
// definido no GHL, e a maioria dos leads nunca chega a essa etapa). Sem
// esse valor sintético, não dá para filtrar/contar explicitamente os
// registros sem atribuição — eles ficariam invisíveis nos dropdowns.
export const SEM_ATRIBUICAO = '__sem_atribuicao__'
export const SEM_ATRIBUICAO_LABEL = 'Sem atribuição'

/** Normaliza um nome de closer/SDR para filtro: string vazia/whitespace vira o sentinela SEM_ATRIBUICAO. */
export function normalizeAttribution(value: string | null | undefined): string {
  const v = (value ?? '').replace(/\s+/g, ' ').trim()
  return v === '' ? SEM_ATRIBUICAO : v
}

/** Acrescenta a opção "Sem atribuição" a uma lista de opções de filtro (closer/pré-vendedor), se ainda não estiver presente. */
export function withSemAtribuicao(options: string[]): string[] {
  return options.includes(SEM_ATRIBUICAO) ? options : [...options, SEM_ATRIBUICAO]
}
