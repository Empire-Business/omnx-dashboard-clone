import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvLocal(): void {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...valueParts] = trimmed.split('=')
      if (!key) continue
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // .env.local não existe ou não é legível; continua com process.env
  }
}

loadEnvLocal()

const PROJECT_REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN) {
  throw new Error(
    'SUPABASE_ACCESS_TOKEN é obrigatório para limpar dados de teste. Configure no .env.local na raiz.'
  )
}

async function runSql(query: string): Promise<unknown> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SQL failed (${res.status}): ${body}`)
  }

  return res.json()
}

/**
 * Retorna o workspace_id do primeiro workspace ativo de um usuário.
 */
export async function getWorkspaceIdByEmail(email: string): Promise<string | null> {
  const rows = (await runSql(
    `SELECT m.workspace_id
     FROM workspace_members m
     JOIN auth.users u ON u.id = m.user_id
     WHERE u.email = '${email.replace(/'/g, "''")}'
       AND m.is_active = true
     LIMIT 1`
  )) as Array<{ workspace_id: string }>

  return rows?.[0]?.workspace_id ?? null
}

/**
 * Remove metas (goal_definitions + goal_versions + goal_snapshots)
 * de um app específico em um workspace.
 * Útil para garantir que testes de cadastro de metas não colidam
 * com dados de execuções anteriores.
 */
export async function deleteGoalsByApp(workspaceId: string, appSlug: string): Promise<void> {
  await runSql(
    `DELETE FROM goal_snapshots
     WHERE goal_version_id IN (
       SELECT v.id
       FROM goal_versions v
       JOIN goal_definitions d ON d.id = v.goal_definition_id
       WHERE d.workspace_id = '${workspaceId}'
         AND d.app_slug = '${appSlug.replace(/'/g, "''")}'
     )`
  )

  await runSql(
    `DELETE FROM goal_versions
     WHERE goal_definition_id IN (
       SELECT id FROM goal_definitions
       WHERE workspace_id = '${workspaceId}'
         AND app_slug = '${appSlug.replace(/'/g, "''")}'
     )`
  )

  await runSql(
    `DELETE FROM goal_definitions
     WHERE workspace_id = '${workspaceId}'
       AND app_slug = '${appSlug.replace(/'/g, "''")}'`
  )
}

/**
 * Remove criativos nativos (source = 'native') cujo external_id inicie com o prefixo informado.
 * Útil para limpar dados criados por testes E2E de criação de criativos.
 */
export async function deleteNativeCreativesByPrefix(workspaceId: string, prefix: string): Promise<void> {
  await runSql(
    `DELETE FROM notion_creatives
     WHERE workspace_id = '${workspaceId}'
       AND source = 'native'
       AND external_id LIKE '${prefix.replace(/'/g, "''")}%'`
  )
}

/**
 * Remove testes de criativos associados a um conjunto de creative_ids.
 */
export async function deleteCreativeTestsByCreativeIds(workspaceId: string, creativeIds: string[]): Promise<void> {
  if (creativeIds.length === 0) return
  const ids = creativeIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')
  await runSql(
    `DELETE FROM creative_tests
     WHERE workspace_id = '${workspaceId}'
       AND creative_id IN (${ids})`
  )
}

/**
 * Remove criativos nativos de teste criados pelos cenários E2E do sub-app Criativos.
 * Filtra por nome contendo 'E2E', source = 'native' e updated_at anterior ao limite,
 * evitando deletar registros de testes ainda em execução (paralelismo).
 */
export async function deleteNativeCreativesByNamePattern(
  workspaceId: string,
  pattern: string,
  olderThanMinutes = 5
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString()
  await runSql(
    `DELETE FROM notion_creatives
     WHERE workspace_id = '${workspaceId}'
       AND source = 'native'
       AND name ILIKE '${pattern.replace(/'/g, "''")}'
       AND updated_at < '${cutoff}'`
  )
}
