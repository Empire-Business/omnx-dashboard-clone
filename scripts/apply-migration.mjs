#!/usr/bin/env node
// Aplica UMA migration versionada ao banco de PRODUÇÃO via Management API e
// registra a versão em supabase_migrations.schema_migrations.
//
// Uso:
//   node scripts/apply-migration.mjs <arquivo-em-supabase/migrations>
//   node scripts/apply-migration.mjs 20261001000000_user_dashboard_prefs.sql
//
// Segurança:
//   - Lê SUPABASE_ACCESS_TOKEN de .env.local (nunca imprime o token).
//   - Aplica só o arquivo indicado (nada de "push --include-all").
//   - Bloqueia DDL destrutivo (DROP/TRUNCATE/DELETE/ALTER ... TYPE) sem a flag
//     --allow-destructive E sem confirmação, porque no modo "só produção" não
//     há mais teste/staging (ver docs/DECISAO-SO-PRODUCAO-2026-07-18.md).
//   - Idempotente do lado do registro (ON CONFLICT DO NOTHING).
import fs from 'node:fs'
import path from 'node:path'

const REF = 'qzesffnkqgelmtfblzkr' // produção (projeto Supabase deste repo)
const arg = process.argv[2]
const allowDestructive = process.argv.includes('--allow-destructive')

if (!arg) {
  console.error('Uso: node scripts/apply-migration.mjs <arquivo.sql> [--allow-destructive]')
  process.exit(1)
}

const file = arg.includes('/') ? arg : path.join('supabase/migrations', arg)
if (!fs.existsSync(file)) {
  console.error(`Arquivo não encontrado: ${file}`)
  process.exit(1)
}

const version = path.basename(file).split('_')[0]
if (!/^\d{14}$/.test(version)) {
  console.error(`Nome de migration inválido (esperado <timestamp>_...): ${path.basename(file)}`)
  process.exit(1)
}
const name = path.basename(file).replace(/^\d+_/, '').replace(/\.sql$/, '')
const sql = fs.readFileSync(file, 'utf8')

// Guarda contra DDL destrutivo sem confirmação explícita.
const destructive = /\b(DROP\s+(TABLE|COLUMN|SCHEMA|TYPE|CONSTRAINT|INDEX|FUNCTION|VIEW|TRIGGER|POLICY)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\w+\s+TYPE)\b/i.test(sql)
if (destructive && !allowDestructive) {
  console.error('⛔ Esta migration contém DDL/DML potencialmente destrutivo.')
  console.error('   No modo "só produção" isso vai direto sem rede de segurança.')
  console.error('   Tire um backup/snapshot do banco ANTES e reexecute com --allow-destructive.')
  process.exit(2)
}

// Token: lê SUPABASE_ACCESS_TOKEN de .env.local (gitignored); cai para a variável de ambiente se definida.
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (fs.existsSync('.env.local')
    ? fs
        .readFileSync('.env.local', 'utf8')
        .match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '')
    : null)
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN ausente (nem no ambiente, nem em .env.local)')
  process.exit(1)
}

async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const run = async () => {
  // Já aplicada?
  const already = await q(
    `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}'`,
  )
  if (Array.isArray(already) && already.length > 0) {
    console.log(`✓ ${version} já consta no histórico de produção — nada a fazer.`)
    return
  }

  console.log(`→ Aplicando ${path.basename(file)} em PRODUÇÃO (${REF})...`)
  await q(sql)

  // Registra no histórico (dollar-quote evita escape).
  await q(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('${version}', '${name.replace(/'/g, "''")}', ARRAY[$mig$${sql}$mig$])
     ON CONFLICT (version) DO NOTHING`,
  )

  const check = await q(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${version}'`,
  )
  const ok = Array.isArray(check) && check.length > 0
  console.log(ok ? `✅ ${version} aplicada e registrada em produção.` : `⚠️ Aplicada mas registro não confirmado.`)
}

run().catch((e) => {
  console.error('❌ Falha ao aplicar migration:', e.message)
  process.exit(1)
})
