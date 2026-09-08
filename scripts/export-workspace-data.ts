#!/usr/bin/env -S npx tsx
/**
 * Fase 8 — LGPD/offboarding: export/portabilidade de dados de um workspace.
 * docs/PLANO-MULTI-TENANT-AGENCY.md (secao 16.3) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md
 *
 * Gera um pacote JSON (1 arquivo por tabela) com TODAS as linhas do workspace
 * indicado — pré-requisito obrigatório de LGPD (Art. 18, IX) antes de qualquer
 * hard-delete. Usa a mesma lista de tabelas do RPC `export_workspace_data_manifest`
 * (fonte de verdade das contagens) para nunca divergir do que o purge realmente cobre.
 *
 * Uso:
 *   npx tsx scripts/export-workspace-data.ts --workspace-id=<uuid> --out=./export-<id>
 *
 * Lê SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY de .env.test (nunca aponta pra
 * produção — mesma trava de projeto de teste usada pela suite de integração).
 * Para rodar contra produção (fora desta sessão), o operador precisa passar
 * as env vars explicitamente — este script NUNCA lê .env de produção sozinho.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
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

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

// Tabelas com workspace_id direto — exportadas por filtro simples.
const DIRECT_TABLES = [
  'contatos',
  'oportunidades',
  'comunicacoes',
  'vendas_fechamento',
  'ghl_users',
  'ghl_calendars',
  'ghl_integration_settings',
  'ghl_field_mappings',
  'ghl_pipeline_mappings',
  'ghl_stage_mappings',
  'ghl_discovery_runs',
  'workspace_members',
  'workspace_settings',
  'workspace_apps',
  'funnels',
  'utm_campaigns',
  'utm_sources',
  'utm_sources_plain',
  'disparos',
  'disparo_tags',
  'sales_processes',
  'sdr_ia_config',
  'goal_definitions',
  'notion_creatives',
  'organic_investments',
  'organic_investment_items',
  'stevo_whatsapp_calls',
]

async function main() {
  const workspaceId = getArg('workspace-id')
  const outDir = getArg('out') ?? join(ROOT, `export-${workspaceId ?? 'workspace'}`)
  if (!workspaceId) {
    console.error('❌ Uso: npx tsx scripts/export-workspace-data.ts --workspace-id=<uuid> [--out=./pasta]')
    process.exit(1)
  }

  const env = { ...loadEnvFile(join(ROOT, '.env.test')), ...process.env }
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (.env.test ou env).')
    process.exit(1)
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`📦 Exportando dados do workspace ${workspaceId} de ${url}`)
  mkdirSync(outDir, { recursive: true })

  const { data: manifest, error: manifestError } = await client.rpc('export_workspace_data_manifest', {
    p_workspace_id: workspaceId,
  })
  if (manifestError) {
    console.error(`❌ export_workspace_data_manifest falhou: ${manifestError.message}`)
    process.exit(1)
  }
  writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('📋 Manifesto (contagens esperadas por tabela):', manifest)

  const summary: Record<string, number> = {}

  for (const table of DIRECT_TABLES) {
    const rows: Record<string, unknown>[] = []
    const PAGE_SIZE = 1000
    let page = 0
    // Paginação obrigatória — PostgREST ignora .limit(N) > 1000 (CLAUDE.md).
    while (true) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error) {
        console.warn(`⚠️  ${table}: ${error.message} (tabela pulada — pode não existir nesta instância)`)
        break
      }
      rows.push(...(data ?? []))
      if ((data?.length ?? 0) < PAGE_SIZE) break
      page++
    }
    if (rows.length > 0) {
      writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2))
    }
    summary[table] = rows.length
    console.log(`  ${table}: ${rows.length} linha(s)`)
  }

  // Tabelas sem workspace_id direto (join via contatos) — reunioes/ghl_tasks/ghl_opp_reconcile_items.
  const { data: contatoIds } = await client.from('contatos').select('id').eq('workspace_id', workspaceId)
  const ids = (contatoIds ?? []).map((r: { id: string }) => r.id)
  for (const [table, column] of [
    ['reunioes', 'contato_id'],
    ['ghl_tasks', 'contato_id'],
    ['ghl_opp_reconcile_items', 'contato_id'],
  ] as const) {
    if (ids.length === 0) {
      summary[table] = 0
      continue
    }
    const { data, error } = await client.from(table).select('*').in(column, ids)
    if (error) {
      console.warn(`⚠️  ${table}: ${error.message}`)
      continue
    }
    if ((data?.length ?? 0) > 0) {
      writeFileSync(join(outDir, `${table}.json`), JSON.stringify(data, null, 2))
    }
    summary[table] = data?.length ?? 0
    console.log(`  ${table}: ${data?.length ?? 0} linha(s)`)
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify({ workspaceId, generatedAt: new Date().toISOString(), summary }, null, 2))

  console.log(`\n✅ Export concluído em ${outDir}`)
  console.log('⚠️  Gaps conhecidos NÃO exportados por este script (ver docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md secao 5):')
  console.log('   meta_ads_campaigns, meta_ads_permalinks, weekly_email_logs, weekly_email_schedules, audit_log (residual)')
}

main().catch((err) => {
  console.error('❌ Falha inesperada:', err)
  process.exit(1)
})
