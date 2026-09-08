#!/usr/bin/env node
/**
 * Script: setup-test-users.mjs
 *
 * Cria usuários de teste para os testes Playwright de sub-apps.
 *
 * Requisitos:
 *  - SUPABASE_ACCESS_TOKEN (PAT) no .env.local  → já salvo pelo usuário
 *  - SUPABASE_SERVICE_ROLE_KEY no .env.local   → necessário para criar usuários de auth
 *  - PROJECT_REF no .env.local OU descoberto via Management API
 *
 * Como usar:
 *  1. Adicione o service role key ao .env.local:
 *     SUPABASE_SERVICE_ROLE_KEY=<sua_chave>
 *  2. node scripts/sub-apps/setup-test-users.mjs
 *
 * O script cria 3 usuários de teste e configura permissões iniciais:
 *  - admin_master: owner do workspace, acesso a todos os apps
 *  - gestor: member com acesso a aquisicao-vendas, relatorios, metas, leads
 *  - sdr: member com acesso a pre-vendas, sdr-ia, leads
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve('.env.local'), 'utf-8')
    const vars = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      vars[key] = value
    }
    return vars
  } catch {
    return {}
  }
}

const env = loadEnvLocal()

const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = env.PROJECT_REF

const APPS = [
  'aquisicao-vendas',
  'traqueamento',
  'pre-vendas',
  'relatorios',
  'sdr-ia',
  'metas',
  'leads',
]

const TEST_USERS = {
  admin_master: {
    email: 'test.admin.master@omnx.dev',
    password: generatePassword(),
    role: 'owner',
  },
  gestor: {
    email: 'test.gestor@omnx.dev',
    password: generatePassword(),
    role: 'member',
    apps: ['aquisicao-vendas', 'relatorios', 'metas', 'leads'],
  },
  sdr: {
    email: 'test.sdr@omnx.dev',
    password: generatePassword(),
    role: 'member',
    apps: ['pre-vendas', 'sdr-ia', 'leads'],
  },
}

function generatePassword() {
  return randomBytes(16).toString('hex')
}

async function getProjectRef() {
  if (PROJECT_REF) return PROJECT_REF

  if (!ACCESS_TOKEN) {
    throw new Error('SUPABASE_ACCESS_TOKEN não encontrado no .env.local')
  }

  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  })

  if (!res.ok) {
    throw new Error(`Erro ao listar projetos: ${res.status} ${await res.text()}`)
  }

  const projects = await res.json()
  if (!projects || projects.length === 0) {
    throw new Error('Nenhum projeto encontrado com esse PAT.')
  }

  if (projects.length > 1) {
    console.log('Mais de um projeto encontrado:')
    projects.forEach((p) => console.log(`  - ${p.name}: ${p.ref}`))
    throw new Error('Defina PROJECT_REF no .env.local para escolher o projeto.')
  }

  return projects[0].ref
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY não encontrado no .env.local')
    console.error('   Adicione a service role key do seu projeto para criar usuários de teste.\n')
    console.error('   Exemplo:')
    console.error('   SUPABASE_SERVICE_ROLE_KEY=<SEU_SUPABASE_SERVICE_ROLE_KEY_AQUI>\n')
    process.exit(1)
  }

  const projectRef = await getProjectRef()
  const supabaseUrl = `https://${projectRef}.supabase.co`

  console.log(`🔧 Projeto: ${projectRef}`)
  console.log(`🔧 URL: ${supabaseUrl}`)

  const supabase = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Criar usuários de auth
  const created = {}
  for (const [key, user] of Object.entries(TEST_USERS)) {
    const { data: list, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      throw new Error(`Erro ao listar usuários: ${listError.message}`)
    }

    const existing = list.users.find((u) => u.email === user.email)

    if (existing) {
      console.log(`⚠️  Usuário ${key} já existe (${user.email}). Pulando criação.`)
      created[key] = existing.id
      continue
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    })

    if (error) {
      throw new Error(`Erro ao criar ${key}: ${error.message}`)
    }

    created[key] = data.user.id
    console.log(`✅ Usuário ${key} criado: ${user.email}`)
  }

  // 2. Descobrir workspace do primeiro workspace existente
  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .limit(1)

  if (wsError || !workspaces || workspaces.length === 0) {
    throw new Error('Nenhum workspace encontrado. Crie um workspace antes de rodar este script.')
  }

  const workspaceId = workspaces[0].id
  console.log(`🔧 Workspace: ${workspaceId}`)

  // 3. Garantir workspace_members
  for (const [key, user] of Object.entries(TEST_USERS)) {
    const userId = created[key]
    const { error } = await supabase.from('workspace_members').upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        role: user.role,
        is_active: true,
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,user_id' }
    )

    if (error) {
      throw new Error(`Erro ao adicionar ${key} ao workspace: ${error.message}`)
    }

    console.log(`✅ ${key} vinculado ao workspace como ${user.role}`)
  }

  // 4. Ativar todos os apps no workspace
  for (const slug of APPS) {
    await supabase.from('workspace_apps').upsert(
      {
        workspace_id: workspaceId,
        app_slug: slug,
        is_active: true,
      },
      { onConflict: 'workspace_id,app_slug' }
    )
  }
  console.log('✅ Todos os apps ativados no workspace')

  // 5. Configurar permissões
  // Owner/admin já têm acesso a todos os apps ativos pela edge function.
  // Para usuários member, usamos overrides por usuário, pois gestor e sdr
  // compartilham a role 'member' mas precisam de permissões diferentes.
  for (const [key, user] of Object.entries(TEST_USERS)) {
    if (user.role === 'owner') continue

    // Limpa overrides anteriores do usuário
    await supabase
      .from('app_user_overrides')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', created[key])

    for (const slug of APPS) {
      const allowed = user.apps.includes(slug)
      await supabase.from('app_user_overrides').insert(
        {
          workspace_id: workspaceId,
          app_slug: slug,
          user_id: created[key],
          can_view: allowed,
          granted_by: created.admin_master,
        }
      )
    }
    console.log(`✅ Overrides de permissão configurados para ${key}`)
  }

  // 6. Imprimir credenciais para PLAYWRIGHT_TEST_USERS
  const playwrightUsers = {}
  for (const [key, user] of Object.entries(TEST_USERS)) {
    playwrightUsers[key] = {
      email: user.email,
      password: user.password,
    }
  }

  console.log('\n🎉 Setup concluído!')
  console.log('\nAdicione ao seu .env.local:')
  console.log(`PLAYWRIGHT_TEST_USERS=${JSON.stringify(playwrightUsers)}`)
  console.log('\nDepois rode:')
  console.log('npx playwright test tests/sub-apps --project=chromium')
}

main().catch((err) => {
  console.error('\n❌ Erro:', err.message)
  process.exit(1)
})
