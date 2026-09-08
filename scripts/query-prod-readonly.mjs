#!/usr/bin/env node
// Introspecção READ-ONLY de produção via Supabase Management API.
// Uso: node scripts/query-prod-readonly.mjs "<SELECT ...>"
// Bloqueia qualquer coisa que não comece com SELECT/WITH/EXPLAIN (defesa
// contra uso acidental para mutação nesta sessão de auditoria).
import fs from 'node:fs'

const REF = 'qzesffnkqgelmtfblzkr'
const sql = process.argv[2]
if (!sql) {
  console.error('Uso: node scripts/query-prod-readonly.mjs "<SQL SELECT>"')
  process.exit(1)
}
if (!/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql)) {
  console.error('⛔ Este script só executa SELECT/WITH/EXPLAIN (introspecção read-only).')
  process.exit(2)
}

const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (fs.existsSync('.env.local')
    ? fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '')
    : null)
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN ausente')
  process.exit(1)
}

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await r.text()
if (!r.ok) {
  console.error(`HTTP ${r.status}: ${text.slice(0, 500)}`)
  process.exit(1)
}
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}
