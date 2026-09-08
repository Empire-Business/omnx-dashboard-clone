// Fase 4 (fatia 4) — logica de "Testar conexao" (prova de posse, plano-mae secao 3.5.1).
//
// Modulo PURO (sem imports Deno/esm) testado em Node (vitest) e importado pela
// edge function Deno test-workspace-credential. Contem apenas construcao de URL
// e interpretacao de resposta — nunca faz a chamada de rede (isso fica na edge
// function, que tem acesso a fetch/timeout/segredo). Assim a logica de "o token
// bate com o location/conta esperado" e testavel sem rede e sem Deno.

export const GHL_API_BASE = 'https://services.leadconnectorhq.com'
export const GHL_API_VERSION = '2021-04-15'
export const META_GRAPH_BASE = 'https://graph.facebook.com/v18.0'

export function buildGhlTestUrl(locationId: string): string {
  return `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}`
}

export function buildMetaTestUrl(adAccountId: string): string {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  return `${META_GRAPH_BASE}/${encodeURIComponent(accountId)}?fields=id,name`
}

export interface TestConnectionResult {
  ok: boolean
  error?: string
  // Nome da conta retornado pela Meta (apenas quando o teste passa).
  name?: string
}

/** Resultado do teste de UMA conta Meta (Fase 15 — multi-conta). */
export interface MetaAccountTestResult {
  account_id: string
  ok: boolean
  name?: string
  error?: string
}

/**
 * Fase 15 (D4): extrai a lista de contas Meta a testar a partir do metadata da
 * credencial. Le `ad_account_ids: string[]` (canonico) com fallback para o
 * legado `ad_account_id: string` (singular). Normaliza: trim, descarta vazios/
 * nao-strings, adiciona prefixo `act_` quando vem so o numero e deduplica.
 * A validacao estrita de formato (`^act_[0-9]+$`) fica no RPC de save — aqui
 * somos permissivos porque o teste serve justamente para diagnosticar
 * configuracao quebrada.
 */
export function extractMetaAdAccountIds(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  if (!metadata) return []
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const trimmed = raw.trim()
    if (!trimmed) return
    const withPrefix = trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`
    if (seen.has(withPrefix)) return
    seen.add(withPrefix)
    out.push(withPrefix)
  }
  const list = metadata.ad_account_ids
  if (Array.isArray(list)) {
    for (const item of list) push(item)
  }
  // Fallback legado: credencial salva antes da Fase 15 so tem o singular.
  push(metadata.ad_account_id)
  return out
}

/**
 * Agrega os resultados por conta: `ok` geral somente se TODAS passam.
 * Com uma unica conta, o resultado de topo e equivalente ao comportamento
 * anterior (ok + error da propria conta).
 */
export function aggregateMetaAccountResults(
  accounts: MetaAccountTestResult[]
): { ok: boolean; error?: string; accounts: MetaAccountTestResult[] } {
  const firstError = accounts.find((a) => !a.ok)?.error
  return {
    ok: accounts.length > 0 && accounts.every((a) => a.ok),
    ...(firstError ? { error: firstError } : {}),
    accounts,
  }
}

/**
 * Interpreta a resposta de `GET /locations/{locationId}` do GHL.
 * So considera "ok" se: (a) status 2xx e (b) o `id` da location retornada bate
 * com o `expectedLocationId` cadastrado — sem o passo (b), um token valido para
 * OUTRO location responderia 200 e daria falso positivo de posse.
 */
export function interpretGhlTestResult(
  status: number,
  body: unknown,
  expectedLocationId: string
): TestConnectionResult {
  if (status === 401 || status === 403) {
    return { ok: false, error: 'Chave invalida ou sem acesso a este location' }
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: `GHL respondeu com erro (status ${status})` }
  }

  const location = extractLocationFromBody(body)
  if (!location) {
    return { ok: false, error: 'Resposta do GHL sem dados de location' }
  }
  if (location.id !== expectedLocationId) {
    return { ok: false, error: 'A chave pertence a outro location — verifique o Location ID' }
  }
  return { ok: true }
}

function extractLocationFromBody(body: unknown): { id: string } | null {
  const b = body as Record<string, unknown> | null | undefined
  if (!b) return null
  const direct = b.id
  if (typeof direct === 'string') return { id: direct }
  const nested = b.location as Record<string, unknown> | undefined
  if (nested && typeof nested.id === 'string') return { id: nested.id }
  return null
}

/**
 * Interpreta a resposta de `GET /act_{adAccountId}?fields=id,name` do Meta Graph API.
 * So considera "ok" se: (a) status 2xx e (b) o `id` retornado bate com a conta
 * esperada (com ou sem prefixo `act_`).
 */
export function interpretMetaTestResult(
  status: number,
  body: unknown,
  expectedAdAccountId: string
): TestConnectionResult {
  if (status === 401 || status === 403) {
    return { ok: false, error: 'Token invalido ou sem acesso a esta conta de anuncios' }
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: `Meta respondeu com erro (status ${status})` }
  }

  const b = body as Record<string, unknown> | null | undefined
  const returnedId = typeof b?.id === 'string' ? b.id : null
  if (!returnedId) {
    return { ok: false, error: 'Resposta da Meta sem dados da conta' }
  }

  const expected = expectedAdAccountId.startsWith('act_')
    ? expectedAdAccountId
    : `act_${expectedAdAccountId}`
  const returned = returnedId.startsWith('act_') ? returnedId : `act_${returnedId}`
  if (returned !== expected) {
    return { ok: false, error: 'O token pertence a outra conta de anuncios' }
  }
  // Fase 15: devolve o nome da conta (quando a Meta o envia) para a UI exibir
  // no resultado por conta. Aditivo — chamadores antigos leem so ok/error.
  const name = typeof b?.name === 'string' && b.name.trim() ? b.name : undefined
  return name ? { ok: true, name } : { ok: true }
}
