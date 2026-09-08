#!/usr/bin/env -S npx tsx
/**
 * Fase 8 — LGPD/offboarding: expurgo definitivo de workspace (hard-delete).
 * docs/PLANO-MULTI-TENANT-AGENCY.md (secao 16.3) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md
 *
 * Wrapper de operador em torno da RPC `purge_workspace_data` (service_role only,
 * migration 20260811000000). Por padrão roda em DRY-RUN (só mostra o que seria
 * apagado, nada é commitado — a própria RPC garante isso via ROLLBACK). Só
 * apaga de verdade com --execute.
 *
 * Uso:
 *   # 1) sempre rodar o export ANTES (obrigatório por LGPD, Art. 18 IX):
 *   npx tsx scripts/export-workspace-data.ts --workspace-id=<uuid> --out=./export-<id>
 *
 *   # 2) dry-run (padrão, seguro, não apaga nada):
 *   npx tsx scripts/purge-workspace.ts --workspace-id=<uuid> --confirm="Nome Exato do Workspace"
 *
 *   # 3) execução real (apaga de verdade + deleta os usuários exclusivos do Auth):
 *   npx tsx scripts/purge-workspace.ts --workspace-id=<uuid> --confirm="Nome Exato do Workspace" --execute
 *
 *   # 4) se o purge nasceu de um workspace_deletion_requests, marcar concluído:
 *   npx tsx scripts/purge-workspace.ts ... --execute --request-id=<uuid>
 *
 * Lê SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY de .env.test por padrão — para
 * rodar contra outra instância, passe as env vars explicitamente no shell.
 * NUNCA aponta para produção (qzesffnkqgelmtfblzkr) sem decisão explícita do
 * operador fora deste script — não há trava automática aqui porque este
 * script É a ferramenta de operador que legitimamente PRECISA rodar em
 * produção algum dia (ao contrário da suite de testes).
 */
import { readFileSync, existsSync } from 'node:fs'
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

async function main() {
  const workspaceId = getArg('workspace-id')
  const confirmName = getArg('confirm')
  const requestId = getArg('request-id')
  const execute = process.argv.includes('--execute')

  if (!workspaceId || !confirmName) {
    console.error(
      '❌ Uso: npx tsx scripts/purge-workspace.ts --workspace-id=<uuid> --confirm="Nome Exato" [--execute] [--request-id=<uuid>]'
    )
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

  console.log(`\n${execute ? '🔴 EXECUÇÃO REAL' : '🟡 DRY-RUN (nada será apagado)'} — workspace ${workspaceId} em ${url}`)
  if (execute) {
    console.log('⚠️  Você tem 5 segundos para cancelar (Ctrl+C) antes do expurgo real começar...')
    await new Promise((r) => setTimeout(r, 5000))
  }

  const { data, error } = await client.rpc('purge_workspace_data', {
    p_workspace_id: workspaceId,
    p_confirmation_name: confirmName,
    p_dry_run: !execute,
  })

  if (!execute) {
    // dry_run=true SEMPRE volta como erro (a RPC força ROLLBACK via RAISE) —
    // isso é o comportamento esperado, não uma falha do script.
    if (!error) {
      console.error('❌ Inesperado: dry-run não retornou erro (a RPC deveria sempre fazer ROLLBACK em dry-run).')
      process.exit(1)
    }
    const marker = 'DRY_RUN_ROLLBACK: '
    const idx = error.message.indexOf(marker)
    if (idx === -1) {
      console.error(`❌ RPC recusou o expurgo (confirmação errada ou workspace inexistente): ${error.message}`)
      process.exit(1)
    }
    const report = JSON.parse(error.message.slice(idx + marker.length))
    console.log('\n📋 Relatório de DRY-RUN (nada foi apagado — contagens reais):')
    console.log(JSON.stringify(report, null, 2))
    console.log('\n✅ Dry-run concluído. Rode de novo com --execute para apagar de verdade.')
    return
  }

  if (error) {
    console.error(`❌ Expurgo real FALHOU (transação foi desfeita automaticamente — nada ficou pela metade): ${error.message}`)
    process.exit(1)
  }

  console.log('\n✅ Expurgo concluído. Relatório:')
  console.log(JSON.stringify(data, null, 2))

  const exclusiveUserIds: string[] = data?.usuarios_exclusivos_nao_apagados_de_auth_users ?? []
  if (exclusiveUserIds.length > 0) {
    console.log(`\n🧹 Apagando ${exclusiveUserIds.length} usuário(s) do Auth cuja ÚNICA membership era este workspace...`)
    for (const userId of exclusiveUserIds) {
      const { error: delErr } = await client.auth.admin.deleteUser(userId)
      if (delErr) {
        console.error(`   ⚠️  Falha ao apagar auth.users ${userId}: ${delErr.message} (ação manual necessária)`)
      } else {
        console.log(`   ✓ auth.users ${userId} apagado`)
      }
    }
  } else {
    console.log('\n(nenhum usuário com membership exclusiva a apagar do Auth)')
  }

  if (requestId) {
    const { error: finalizeErr } = await client.rpc('finalize_workspace_deletion_request', {
      p_request_id: requestId,
      p_deletion_report: data,
    })
    if (finalizeErr) {
      console.error(`⚠️  Falha ao finalizar workspace_deletion_requests ${requestId}: ${finalizeErr.message}`)
    } else {
      console.log(`✓ workspace_deletion_requests ${requestId} marcado como 'deleted'`)
    }
  }

  console.log('\n⚠️  Gaps conhecidos que este expurgo NÃO cobre (ver docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md secao 5):')
  console.log('   meta_ads_campaigns, meta_ads_permalinks, weekly_email_logs, weekly_email_schedules, audit_log (residual)')
}

main().catch((err) => {
  console.error('❌ Falha inesperada:', err)
  process.exit(1)
})
