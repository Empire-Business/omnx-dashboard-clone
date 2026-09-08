// Aplica um arquivo de migration via connection string (simple query protocol).
// Uso:
//   set -a; source .env.test; set +a
//   deno run --allow-all scripts/apply-migration-via-db-url.mjs <caminho-da-migration> [TEST_DB_URL|PROD_DB_URL]
//
// Por que existe: `supabase db query --db-url --file` empacota o arquivo num
// prepared statement e o Postgres recusa múltiplos comandos (SQLSTATE 42601).
// node-postgres usa o protocolo simples quando não há parâmetros, aceitando o
// arquivo inteiro de uma vez — mesmo efeito de `psql -f`.
//
// Escopo: aplicar ARQUIVO DE MIGRATION versionado em banco de teste/staging.
// Produção continua sendo `supabase db push` (rastreio em schema_migrations).
import pg from 'npm:pg@8.13.1'
const { Client } = pg

const file = Deno.args[0]
const urlVar = Deno.args[1] ?? 'TEST_DB_URL'
if (!file) {
  console.error('uso: apply-migration-via-db-url.mjs <migration.sql> [ENV_VAR_DA_URL]')
  Deno.exit(2)
}
const url = Deno.env.get(urlVar)
if (!url) {
  console.error(`variável ${urlVar} não definida`)
  Deno.exit(2)
}

const sql = await Deno.readTextFile(file)
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.log(`OK: ${file} aplicada via ${urlVar}`)
} finally {
  await client.end()
}
