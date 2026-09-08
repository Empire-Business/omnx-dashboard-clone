// Paginação de leituras grandes do PostgREST — em lotes concorrentes.
//
// POR QUE ISSO EXISTE
// O Supabase tem `max_rows = 1000`: qualquer `.limit(N > 1000)` é ignorado pelo servidor,
// que devolve 1000 linhas sem erro e sem aviso (ver CLAUDE.md, "LIMITE CRITICO"). Por isso
// toda leitura grande precisa de páginas.
//
// O padrão antigo espalhado pelos hooks buscava as páginas EM FILA — a página 2 só saía
// depois que a 1 voltava. Com 4.000 linhas isso são 4 idas e voltas em série, e a tela
// fica parada somando latência de rede que poderia ser paga uma vez só.
//
// Aqui as páginas vão em LOTES concorrentes (padrão: 4 por vez). O custo é buscar, no pior
// caso, até `concurrency - 1` páginas vazias no fim — barato perto do que se ganha.
//
// ORDEM DETERMINÍSTICA É OBRIGATÓRIA
// Sem `.order()` estável no query builder, o corte entre páginas é indefinido e linhas
// podem repetir ou sumir. Use sempre um desempate único (ex.: `.order('id')`).

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_CONCURRENCY = 4

/** Query paginável por cursor: recebe o último id lido (null na primeira página). */
interface KeysetQuery<T> {
  limit(n: number): PromiseLike<{ data: T[] | null; error: unknown | null }>
}

/**
 * Busca todas as páginas por CURSOR (keyset), não por OFFSET.
 *
 * POR QUE ISSO EXISTE
 * `range()`/OFFSET fica mais caro a cada página: para entregar a linha 5.000 o
 * Postgres materializa as 5.000 anteriores e descarta. Com o `select` gordo dos
 * painéis (join de ~25 colunas de contatos), as páginas profundas passavam do
 * `statement_timeout` e o PostgREST devolvia **500** — a aba Produtividade
 * quebrava com "Erro ao carregar dados", e o log do Postgres mostrava
 * `canceling statement due to statement timeout` em série.
 *
 * Com cursor, cada página é `id > último_id` + `limit`: index scan de custo
 * constante, independente da profundidade.
 *
 * TRADE-OFF: é sequencial por natureza (a página N+1 depende do último id da N),
 * enquanto `fetchAllPages` busca em lotes concorrentes. Vale a pena quando o
 * volume é grande o suficiente para as páginas profundas ficarem caras — que é
 * justamente quando o OFFSET quebra. Para leituras pequenas, prefira o outro.
 *
 * @example
 * const rows = await fetchAllPagesByCursor<OppRow>((cursor) =>
 *   supabase.from('oportunidades').select(SELECT)
 *     .eq('workspace_id', wid)
 *     .gt('id', cursor ?? '')     // '' é menor que qualquer uuid
 *     .order('id', { ascending: true }),
 * )
 */
export async function fetchAllPagesByCursor<T extends { id?: string | null }>(
  makeQuery: (cursor: string | null) => KeysetQuery<T>,
  options: { pageSize?: number; maxPages?: number; getCursor?: (row: T) => string | null } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxPages = options.maxPages ?? 500
  const getCursor = options.getCursor ?? ((row: T) => row.id ?? null)

  const all: T[] = []
  let cursor: string | null = null

  for (let page = 0; page < maxPages; page++) {
    const res = await makeQuery(cursor).limit(pageSize)
    if (res.error) throw res.error
    const rows = res.data ?? []
    all.push(...rows)
    if (rows.length < pageSize) return all

    const ultimo = getCursor(rows[rows.length - 1]!)
    // Sem cursor não dá para avançar; parar é melhor que repetir a mesma página
    // para sempre.
    if (!ultimo) return all
    cursor = ultimo
  }

  return all
}

/** Query paginável por cursor de tempo: recebe o último valor lido (null na 1ª página). */
interface TimeKeysetQuery<T> {
  limit(n: number): PromiseLike<{ data: T[] | null; error: unknown | null }>
}

/**
 * Busca todas as páginas por CURSOR DE TEMPO (uma coluna de data + `id` como desempate).
 *
 * POR QUE ISSO EXISTE, se já há `fetchAllPagesByCursor`
 * Cursor por `id` (uuid) só é barato quando a query NÃO tem outro filtro seletivo.
 * Nos painéis, o filtro real é a janela de datas — e aí o Postgres varre a PK
 * descartando o que está fora do período. Medido em produção, em `comunicacoes`
 * (282 mil linhas), uma única página de 1.000 linhas:
 *
 *   ordem por `id`               -> 1.094 ms, 18.361 linhas descartadas pelo filtro
 *   ordem por `data_comunicacao` ->     6 ms, usando (workspace_id, data, id)
 *
 * 180x. E o custo por `id` CRESCE a cada página, porque o cursor avança em espaço
 * de uuid, não em espaço de data — foi isso que voltou a devolver **500**
 * (`statement timeout`) nas abas de Vendas mesmo depois da troca de OFFSET por
 * cursor.
 *
 * DEDUPLICAÇÃO: o corte usa `>=`, não `>`. Dois registros podem ter exatamente o
 * mesmo timestamp, e `>` perderia silenciosamente o segundo. Como consequência a
 * última linha de cada página reaparece na próxima, então as repetições são
 * removidas por `id`.
 *
 * @example
 * const rows = await fetchAllPagesByTimeCursor<OppRow>(
 *   (cursor) => {
 *     let q = supabase.from('oportunidades').select(SELECT).eq('workspace_id', wid)
 *       .gte('data_lead_recebido', cursor ?? startISO)
 *       .lte('data_lead_recebido', endISO)
 *     return q.order('data_lead_recebido', { ascending: true }).order('id', { ascending: true })
 *   },
 *   { getTime: (r) => r.data_lead_recebido },
 * )
 */
export async function fetchAllPagesByTimeCursor<T extends { id?: string | null }>(
  makeQuery: (cursor: string | null) => TimeKeysetQuery<T>,
  options: {
    pageSize?: number
    maxPages?: number
    /** Extrai o valor da coluna de tempo usada como cursor. */
    getTime: (row: T) => string | null | undefined
    getId?: (row: T) => string | null | undefined
  },
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxPages = options.maxPages ?? 500
  const getId = options.getId ?? ((row: T) => row.id ?? null)

  const all: T[] = []
  const vistos = new Set<string>()
  let cursor: string | null = null

  for (let page = 0; page < maxPages; page++) {
    // Anotação explícita: `cursor` é reatribuído a partir do resultado, e sem o
    // tipo o TS acusa inferência circular (TS7022) no `await`.
    const res: { data: T[] | null; error: unknown | null } = await makeQuery(cursor).limit(pageSize)
    if (res.error) throw res.error
    const rows: T[] = res.data ?? []

    let novos = 0
    for (const row of rows) {
      const id = getId(row)
      // Sem id não dá para deduplicar; incluir é melhor que descartar dado real.
      if (id == null) { all.push(row); novos++; continue }
      if (vistos.has(id)) continue
      vistos.add(id)
      all.push(row)
      novos++
    }

    if (rows.length < pageSize) return all

    const ultimo: string | null = getTimeSafe(rows[rows.length - 1]!, options.getTime)
    // Sem cursor não dá para avançar. E se a página inteira já tinha sido lida,
    // avançar de novo repetiria a mesma janela para sempre — mais de `pageSize`
    // linhas com timestamp idêntico é o único caso, e nenhum painel tem isso.
    if (!ultimo || novos === 0) return all
    cursor = ultimo
  }

  return all
}

function getTimeSafe<T>(row: T, getTime: (row: T) => string | null | undefined): string | null {
  const v = getTime(row)
  return v == null || v === '' ? null : v
}

/** Formato mínimo do query builder do supabase-js que este helper precisa. */
interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown | null }>
}

export interface FetchAllPagesOptions {
  /** Linhas por página. Nunca deve passar de 1000 (teto do PostgREST). */
  pageSize?: number
  /** Quantas páginas buscar ao mesmo tempo. */
  concurrency?: number
  /** Trava de segurança contra loop infinito. */
  maxPages?: number
}

/**
 * Busca todas as páginas de uma query, em lotes concorrentes.
 *
 * `makeQuery` precisa devolver um builder NOVO a cada chamada — os builders do supabase-js
 * são de uso único depois de aguardados, então reaproveitar um só dá erro silencioso.
 *
 * @example
 * const rows = await fetchAllPages<OppRow>(() =>
 *   supabase.from('oportunidades').select(SELECT)
 *     .eq('workspace_id', wid)
 *     .order('data_lead_recebido', { ascending: true })
 *     .order('id', { ascending: true })   // desempate único
 * )
 */
export async function fetchAllPages<T>(
  makeQuery: () => RangeableQuery<T>,
  options: FetchAllPagesOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const maxPages = options.maxPages ?? 500

  const all: T[] = []
  let nextPage = 0

  while (nextPage < maxPages) {
    const batch = Array.from({ length: concurrency }, (_, i) => nextPage + i)

    const results = await Promise.all(
      batch.map(async (page) => {
        const res = await makeQuery().range(page * pageSize, (page + 1) * pageSize - 1)
        if (res.error) throw res.error
        return res.data ?? []
      }),
    )

    // Concatena na ordem do lote (Promise.all preserva a ordem dos índices), não na
    // ordem de chegada — senão a paginação embaralharia o resultado.
    let done = false
    for (const rows of results) {
      all.push(...rows)
      // Página incompleta = fim dos dados. As páginas seguintes deste lote já vieram
      // vazias; parar aqui evita continuar pedindo além do fim.
      if (rows.length < pageSize) {
        done = true
        break
      }
    }

    if (done) return all
    nextPage += concurrency
  }

  return all
}
