// Paleta categórica ÚNICA de gráficos (Nubank v2.2, tokens `--series-1..12`
// definidos em src/index.css nos dois modos).
//
// Antes existiam duas paletas: `--chart-1..8` (pizza/barras, escolhida por hash
// do rótulo) e `--series-1..8` (linhas, escolhida por posição na ordenação).
// Resultado: a mesma origem — "acelerador", por exemplo — saía roxa na pizza e
// verde na linha, e a cor da linha ainda mudava quando o ranking mudava de
// período. Agora existe uma paleta só e a cor é derivada do RÓTULO, então cada
// origem tem sempre a mesma cor em todos os gráficos e em todas as ocasiões.
//
// `--chart-*` continua existindo no CSS para usos pontuais (KPIs, gauges), mas
// não é mais usada por gráfico categórico: ela repete tons (chart-1 = chart-2,
// chart-4 = chart-5) e é quase toda roxa.
const PALETTE = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
  'var(--series-9)',
  'var(--series-10)',
  'var(--series-11)',
  'var(--series-12)',
]

function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) {
    hash = (hash << 5) - hash + label.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Cor canônica de um rótulo (origem, canal, campanha, closer...).
 * Determinística: o mesmo texto devolve sempre a mesma cor, em qualquer
 * gráfico, sessão ou período.
 *
 * Quando o gráfico tem várias séries juntas, prefira `buildLabelColorMap`:
 * ela usa esta mesma cor como primeira escolha, mas desempata colisões para
 * que duas séries visíveis ao mesmo tempo não fiquem idênticas.
 */
export function getLabelColor(label: string): string {
  return PALETTE[hashLabel(label) % PALETTE.length]
}

/**
 * Mapa rótulo → cor para um conjunto de séries exibidas juntas.
 *
 * Regras:
 * 1. cada rótulo tenta primeiro a sua cor canônica (`getLabelColor`), então a
 *    cor é a mesma na pizza, na barra e na linha;
 * 2. se dois rótulos disputam a mesma cor, o desempate percorre a paleta a
 *    partir dela — sem isso duas fatias/linhas ficariam indistinguíveis;
 * 3. a ordem de atendimento é alfabética, NÃO a ordem de exibição. Assim o
 *    resultado não muda quando o ranking do período muda, e dois gráficos com
 *    o mesmo conjunto de rótulos produzem exatamente as mesmas cores;
 * 4. se houver mais rótulos que cores, o excedente volta à cor canônica
 *    (repetição inevitável, mas ainda estável).
 */
export function buildLabelColorMap(labels: Iterable<string>): Map<string, string> {
  const unique = Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const taken = new Set<number>()
  const map = new Map<string, string>()

  for (const label of unique) {
    const preferred = hashLabel(label) % PALETTE.length
    let index = preferred
    if (taken.size < PALETTE.length) {
      let step = 0
      while (taken.has(index) && step < PALETTE.length) {
        step++
        index = (preferred + step) % PALETTE.length
      }
    }
    taken.add(index)
    map.set(label, PALETTE[index])
  }

  return map
}
