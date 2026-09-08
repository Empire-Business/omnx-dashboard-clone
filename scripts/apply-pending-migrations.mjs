#!/usr/bin/env node
// Descobre quais migrations versionadas ainda NÃO foram aplicadas em produção e
// aplica cada uma (em ordem) via scripts/apply-migration.mjs.
//
// Rodado pela IA localmente (não há CI de migrations — decisão do dono, sem
// GitHub Actions): escrevo a(s) migration(s) e aplico todas as pendentes com
//   node scripts/apply-pending-migrations.mjs
//
// Token: SUPABASE_ACCESS_TOKEN de .env.local (gitignored) ou do ambiente.
// Segurança: migration destrutiva (DROP/ALTER TYPE/backfill) ABORTA a menos que
// o arquivo contenha o marcador "-- @auto-apply-destructive" — assim uma mudança
// destrutiva sempre passa por revisão humana explícita + backup antes de rodar
// em produção (ver docs/DECISAO-SO-PRODUCAO-2026-07-18.md).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const REF = 'qzesffnkqgelmtfblzkr'
const DIR = 'supabase/migrations'

const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (fs.existsSync('.env.local')
    ? fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '')
    : null)
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN ausente (ambiente ou .env.local)')
  process.exit(1)
}

async function appliedVersions() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT version FROM supabase_migrations.schema_migrations' }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const rows = await r.json()
  return new Set((Array.isArray(rows) ? rows : []).map((x) => x.version))
}

const DESTRUCTIVE =
  /\b(DROP\s+(TABLE|COLUMN|SCHEMA|TYPE|CONSTRAINT|INDEX|FUNCTION|VIEW|TRIGGER|POLICY)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\w+\s+TYPE)\b/i

const run = async () => {
  const applied = await appliedVersions()

  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f)) // só migrations versionadas (ignora omnx_criativos_all_in_one.sql etc.)
    .sort()

  const pending = files.filter((f) => !applied.has(f.split('_')[0]))

  if (pending.length === 0) {
    console.log('✓ Nenhuma migration pendente — produção está em dia.')
    return
  }

  console.log(`→ ${pending.length} migration(s) pendente(s): ${pending.join(', ')}`)

  for (const f of pending) {
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8')
    const isDestructive = DESTRUCTIVE.test(sql)
    const marked = /--\s*@auto-apply-destructive/.test(sql)
    if (isDestructive && !marked) {
      console.error(`⛔ ${f} é destrutiva e NÃO tem o marcador "-- @auto-apply-destructive".`)
      console.error('   Revise, tire backup de produção, e adicione o marcador na migration para aplicá-la.')
      process.exit(2)
    }
    const args = ['scripts/apply-migration.mjs', f]
    if (isDestructive) args.push('--allow-destructive')
    const res = spawnSync('node', args, { stdio: 'inherit', env: process.env })
    if (res.status !== 0) {
      console.error(`❌ Falha ao aplicar ${f} (exit ${res.status}). Abortando.`)
      process.exit(res.status || 1)
    }
  }
  console.log(`✅ ${pending.length} migration(s) aplicada(s) em produção.`)
}

run().catch((e) => {
  console.error('❌ Erro:', e.message)
  process.exit(1)
})
