#!/usr/bin/env node
// SELECT read-only via Management API — diagnóstico do vazamento de investimento
// entre workspaces (meta_ads_account_daily / meta_ads_insights).
// Uso: node scripts/check-meta-ads-workspace-spend.mjs
import fs from 'node:fs'

const REF = 'qzesffnkqgelmtfblzkr'
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN ausente (nem no ambiente, nem em .env.local)')
  process.exit(1)
}

async function run(label, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  console.log(`\n=== ${label} ===`)
  if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); return }
  console.table(JSON.parse(text))
}

await run('Spend por workspace (account_daily, 21/06→20/07)', `
  SELECT w.name AS workspace, m.workspace_id, COUNT(*) AS linhas, ROUND(SUM(m.spend)::numeric, 2) AS spend_total
  FROM meta_ads_account_daily m
  LEFT JOIN workspaces w ON w.id = m.workspace_id
  WHERE m.date BETWEEN '2026-06-21' AND '2026-07-20'
  GROUP BY w.name, m.workspace_id
  ORDER BY spend_total DESC
`)

await run('Linhas legadas com workspace_id NULL (account_daily)', `
  SELECT COUNT(*) AS null_rows, ROUND(COALESCE(SUM(spend),0)::numeric, 2) AS spend_null
  FROM meta_ads_account_daily WHERE workspace_id IS NULL
`)

await run('Linhas legadas com workspace_id NULL (insights)', `
  SELECT COUNT(*) AS null_rows, ROUND(COALESCE(SUM(spend),0)::numeric, 2) AS spend_null
  FROM meta_ads_insights WHERE workspace_id IS NULL
`)
