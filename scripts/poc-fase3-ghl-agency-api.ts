#!/usr/bin/env -S npx tsx
/**
 * POC Fase 3 — Agency API do GHL (docs/PLANO-MULTI-TENANT-AGENCY.md secao 6.2)
 *
 * Script EXPLORATORIO (nao e parte da suite de testes nem de producao).
 * Testa, com o token real fornecido pelo dono em .env.test, as 4 dimensoes
 * de risco da secao 6.2 antes do go/no-go da Fase 3 (auto-descoberta):
 *
 *   1. Existencia/tipo do endpoint de descoberta (funciona com Private
 *      Integration Token, ou so com OAuth Marketplace?)
 *   2. Modelo de consentimento por sub-conta (a descoberta e "zero toque"
 *      ou exige instalacao/aprovacao por location?)
 *   3. Modelo de entrega de webhooks para apps Marketplace (nao testavel
 *      sem um App instalado — reportado como "nao testado" nesta rodada).
 *   4. Confiabilidade/granularidade do campo de admin (requer pelo menos
 *      1 location valida — ver aviso se GHL_TEST_LOCATION_ID_* vazio).
 *
 * Uso:
 *   npx tsx scripts/poc-fase3-ghl-agency-api.ts
 *
 * Le GHL_AGENCY_API_TOKEN / GHL_AGENCY_COMPANY_ID / GHL_TEST_LOCATION_ID_*
 * de .env.test (raiz do repo). NUNCA loga o token; so status HTTP e um
 * resumo curto do corpo (sem PII completa) de cada resposta.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_TEST_PATH = join(ROOT, '.env.test')

function loadEnvTest(): Record<string, string> {
  if (!existsSync(ENV_TEST_PATH)) {
    console.error('❌ .env.test não encontrado em', ENV_TEST_PATH)
    process.exit(1)
  }
  const raw = readFileSync(ENV_TEST_PATH, 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const env = loadEnvTest()
const TOKEN = env.GHL_AGENCY_API_TOKEN
const COMPANY_ID = env.GHL_AGENCY_COMPANY_ID
const TEST_LOCATIONS = [
  env.GHL_TEST_LOCATION_ID_1,
  env.GHL_TEST_LOCATION_ID_2,
  env.GHL_TEST_LOCATION_ID_3_CRIADA_DEPOIS,
].filter((v): v is string => !!v && v.length > 0)

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

if (!TOKEN) {
  console.error('❌ GHL_AGENCY_API_TOKEN vazio em .env.test — preencha antes de rodar esta POC.')
  process.exit(1)
}

interface ProbeResult {
  label: string
  method: string
  url: string
  status: number | 'ERRO_REDE'
  ok: boolean
  bodySummary: string
}

async function probe(label: string, url: string, extraHeaders: Record<string, string> = {}): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Version: GHL_API_VERSION,
        Accept: 'application/json',
        ...extraHeaders,
      },
    })
    const text = await res.text()
    let bodySummary: string
    try {
      const json = JSON.parse(text)
      const keys = Array.isArray(json) ? `array[${json.length}]` : Object.keys(json).slice(0, 8).join(', ')
      bodySummary = keys || '(vazio)'
    } catch {
      bodySummary = text.slice(0, 200).replace(/\s+/g, ' ')
    }
    return { label, method: 'GET', url, status: res.status, ok: res.ok, bodySummary }
  } catch (err) {
    return {
      label,
      method: 'GET',
      url,
      status: 'ERRO_REDE',
      ok: false,
      bodySummary: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  console.log('=== POC Fase 3 — Agency API do GHL ===')
  console.log(`Company ID: ${COMPANY_ID || '(não preenchido)'}`)
  console.log(`Locations de teste preenchidas: ${TEST_LOCATIONS.length}/3`)
  console.log('')

  const results: ProbeResult[] = []

  // Dimensão 1 — endpoint de descoberta de sub-contas (Marketplace/OAuth,
  // testando se um Private Integration Token também é aceito).
  results.push(
    await probe(
      'Dimensão 1: GET /oauth/installedLocations (descoberta agency-wide)',
      `${GHL_API_BASE}/oauth/installedLocations?companyId=${encodeURIComponent(COMPANY_ID ?? '')}&isInstalled=true`
    )
  )

  // Dimensão 1 (alternativa) — endpoint de busca de locations por companyId.
  const searchUrl = `${GHL_API_BASE}/locations/search?companyId=${encodeURIComponent(COMPANY_ID ?? '')}`
  results.push(await probe('Dimensão 1 (alt): GET /locations/search (busca por companyId)', searchUrl))

  // Se /locations/search funcionou, usa os locationIds retornados (nome + id
  // apenas, sem PII adicional) para alimentar a dimensão 4 automaticamente —
  // não depende de preencher GHL_TEST_LOCATION_ID_* manualmente.
  let discoveredLocations: Array<{ id: string; name: string }> = []
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${TOKEN}`, Version: GHL_API_VERSION, Accept: 'application/json' },
    })
    if (searchRes.ok) {
      const json = (await searchRes.json()) as { locations?: Array<{ id: string; name?: string }> }
      discoveredLocations = (json.locations ?? []).map((l) => ({ id: l.id, name: l.name ?? '(sem nome)' }))
    }
  } catch {
    // silencioso — o probe acima já reportou o status
  }

  // Dimensão 1 (alternativa) — info da própria agência/company.
  if (COMPANY_ID) {
    results.push(
      await probe('Dimensão 1 (alt): GET /companies/{companyId}', `${GHL_API_BASE}/companies/${encodeURIComponent(COMPANY_ID)}`)
    )
  }

  console.log(`Locations descobertas via /locations/search: ${discoveredLocations.length}`)
  for (const loc of discoveredLocations.slice(0, 10)) {
    console.log(`  - ${loc.id}  (${loc.name})`)
  }
  console.log('')

  // Dimensão 4 — campo de admin por location. Usa as locations descobertas
  // automaticamente; cai para GHL_TEST_LOCATION_ID_* preenchidas manualmente
  // se a descoberta automática não tiver retornado nada.
  const locationsForDimension4 =
    discoveredLocations.length > 0 ? discoveredLocations.map((l) => l.id).slice(0, 3) : TEST_LOCATIONS

  for (const [i, locationId] of locationsForDimension4.entries()) {
    results.push(
      await probe(
        `Dimensão 4: GET /users/ (usuários/admins) — location de teste #${i + 1}`,
        `${GHL_API_BASE}/users/?locationId=${encodeURIComponent(locationId)}`
      )
    )
    results.push(
      await probe(
        `Dimensão 1 (confirma escopo): GET /locations/{locationId} — location de teste #${i + 1}`,
        `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}`
      )
    )
  }

  console.log('--- Resultados brutos ---')
  for (const r of results) {
    const statusLabel = r.status === 'ERRO_REDE' ? 'ERRO DE REDE' : `HTTP ${r.status}`
    console.log(`[${r.ok ? 'OK ' : 'FAIL'}] ${r.label}`)
    console.log(`      ${statusLabel} — ${r.bodySummary}`)
  }

  console.log('')
  console.log('--- Leitura (não é go/no-go automático — leia o resumo e decida com o dono) ---')
  const discoveryOk = results.slice(0, 3).some((r) => r.ok)
  if (!discoveryOk) {
    console.log('⚠️  Nenhum endpoint de descoberta agency-wide respondeu OK com este token.')
    console.log('    Isso é consistente com a suspeita da seção 6.2: Private Integration Token')
    console.log('    pode ser sempre escopado a UMA sub-conta (location), nunca à agência inteira —')
    console.log('    "descoberta automática" pode exigir um App Marketplace com OAuth em vez de PIT.')
  } else {
    console.log('✅ Pelo menos um endpoint de descoberta respondeu OK — vale investigar o payload completo')
    console.log('   (rode de novo com um logger que salve a resposta, fora deste script, para não expor PII aqui).')
  }
  if (TEST_LOCATIONS.length === 0) {
    console.log('⚠️  Nenhuma GHL_TEST_LOCATION_ID_* preenchida — dimensão 4 (campo de admin) não testada.')
    console.log('    Preencha ao menos 1 location de teste em .env.test e rode de novo.')
  }
  console.log('⚠️  Dimensão 3 (modelo de entrega de webhook Marketplace) não é testável sem um App')
  console.log('    Marketplace instalado — fora do escopo deste script.')
}

main().catch((err) => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
