const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SB_URL ||
  'https://qzesffnkqgelmtfblzkr.supabase.co'

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SB_SERVICE_ROLE_KEY

const TARGET_EMAIL = process.argv[2] || process.env.TARGET_EMAIL || ''

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY ou SB_SERVICE_ROLE_KEY antes de rodar este script.')
  process.exit(1)
}

if (!TARGET_EMAIL) {
  console.error('Informe o email do usuário como argumento: node scripts/diagnostico-workspace-isolation.js acessos@thetrinity.com.br')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function run() {
  console.log(`🔍 Diagnóstico de isolamento por workspace para: ${TARGET_EMAIL}\n`)

  // 1. Buscar usuário pelo email via auth.admin.listUsers
  const { data: listData, error: userError } = await sb.auth.admin.listUsers()

  if (userError) {
    console.error('❌ Erro ao listar usuários:', userError.message)
    process.exit(1)
  }

  const userData = listData?.users?.find((u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase())

  if (!userData) {
    console.error('❌ Usuário não encontrado:', TARGET_EMAIL)
    process.exit(1)
  }

  const userId = userData.id
  console.log('👤 Usuário encontrado')
  console.log('   ID:', userId)
  console.log('   Email:', userData.email)
  console.log('   Criado em:', userData.created_at)

  // 2. Workspace membership do usuário
  const { data: memberships, error: membershipError } = await sb
    .from('workspace_members')
    .select('workspace_id, role, is_active')
    .eq('user_id', userId)

  if (membershipError) throw membershipError

  console.log('\n🏢 Workspaces do usuário:')
  if (!memberships?.length) {
    console.log('   ❌ Nenhum workspace_members encontrado')
  } else {
    memberships.forEach((m) => {
      console.log(`   - ${m.workspace_id} | role=${m.role} | active=${m.is_active}`)
    })
  }

  const activeMemberships = memberships?.filter((m) => m.is_active) || []
  const activeWorkspaceIds = activeMemberships.map((m) => m.workspace_id)

  // 3. Lista de workspaces
  const { data: workspaces, error: workspacesError } = await sb
    .from('workspaces')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  if (workspacesError) throw workspacesError

  console.log('\n📋 Todos os workspaces:')
  workspaces?.forEach((w) => {
    const userHere = activeWorkspaceIds.includes(w.id) ? ' ← usuário ATIVO aqui' : ''
    console.log(`   - ${w.id} | ${w.name} | criado=${w.created_at}${userHere}`)
  })

  const oldestWorkspace = workspaces?.[0]

  // 4. Contagem de contatos por workspace (loop porque PostgREST JS nao suporta .group())
  const contactsByWorkspace = []
  for (const ws of workspaces || []) {
    const { count, error } = await sb
      .from('contatos')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', ws.id)
    if (error) throw error
    contactsByWorkspace.push({ workspace_id: ws.id, count: count ?? 0 })
  }

  console.log('\n📊 Contatos por workspace:')
  if (!contactsByWorkspace?.length) {
    console.log('   Nenhum contato encontrado')
  } else {
    contactsByWorkspace.forEach((row) => {
      const ws = workspaces?.find((w) => w.id === row.workspace_id)
      const label = ws ? `${ws.name} (${row.workspace_id})` : row.workspace_id
      const userHere = activeWorkspaceIds.includes(row.workspace_id) ? ' ← workspace do usuário' : ''
      console.log(`   - ${label}: ${row.count}${userHere}`)
    })
  }

  // 5. Contatos com workspace_id NULL
  const { count: nullWorkspaceContacts, error: nullContactsError } = await sb
    .from('contatos')
    .select('*', { count: 'exact', head: true })
    .is('workspace_id', null)

  if (nullContactsError) throw nullContactsError

  console.log(`\n⚠️  Contatos com workspace_id NULL: ${nullWorkspaceContacts ?? 0}`)

  // 6. Oportunidades com contato_id NULL
  const { count: nullContactOpps, error: nullOppError } = await sb
    .from('oportunidades')
    .select('*', { count: 'exact', head: true })
    .is('contato_id', null)

  if (nullOppError) throw nullOppError

  console.log(`⚠️  Oportunidades com contato_id NULL: ${nullContactOpps ?? 0}`)

  // 7. Configurações GHL por workspace
  const { data: ghlSettings, error: ghlError } = await sb
    .from('ghl_integration_settings')
    .select('workspace_id, ghl_location_id, is_active, created_at')
    .order('created_at', { ascending: true })

  if (ghlError) throw ghlError

  console.log('\n🔌 Configurações GHL por workspace:')
  if (!ghlSettings?.length) {
    console.log('   Nenhuma configuração GHL encontrada')
  } else {
    ghlSettings.forEach((s) => {
      const ws = workspaces?.find((w) => w.id === s.workspace_id)
      const label = ws ? `${ws.name} (${s.workspace_id})` : s.workspace_id
      const userHere = activeWorkspaceIds.includes(s.workspace_id) ? ' ← workspace do usuário' : ''
      console.log(`   - ${label}`)
      console.log(`     location_id=${s.ghl_location_id} | active=${s.is_active}${userHere}`)
    })
  }

  // 8. Últimos webhooks recebidos e seus location_ids
  const { data: latestWebhooks, error: webhookError } = await sb
    .from('webhooks_ghl')
    .select('id, created_at, location_id')
    .order('created_at', { ascending: false })
    .limit(10)

  if (webhookError) throw webhookError

  console.log('\n📡 Últimos 10 webhooks recebidos:')
  latestWebhooks?.forEach((w) => {
    console.log(`   - ${w.id} | ${w.created_at} | location_id=${w.location_id || 'NULL'}`)
  })

  // 9. Verificação: dados estão indo para o workspace do usuário?
  console.log('\n🩺 Conclusão preliminar:')

  if (activeMemberships.length === 0) {
    console.log('   ❌ Usuário não tem nenhum workspace ativo. Ele não verá dados.')
  } else if (activeMemberships.length > 1) {
    console.log('   ⚠️  Usuário está ativo em múltiplos workspaces. O frontend usa o primeiro encontrado.')
  }

  if (activeMemberships.length > 0 && oldestWorkspace) {
    const userWorkspaceIds = activeMemberships.map((m) => m.workspace_id)
    const userWorkspacesHaveContacts = contactsByWorkspace?.some(
      (row) => userWorkspaceIds.includes(row.workspace_id) && (row.count ?? 0) > 0
    )
    const oldestWorkspaceHasContacts = contactsByWorkspace?.some(
      (row) => row.workspace_id === oldestWorkspace.id && (row.count ?? 0) > 0
    )

    if (!userWorkspacesHaveContacts && oldestWorkspaceHasContacts) {
      console.log(`   ❌ PROVÁVEL CAUSA: os contatos estão no workspace mais antigo (${oldestWorkspace.name}), mas o usuário está em outro workspace.`)
      console.log('      Isso acontece quando get_workspace_id_by_ghl_location_id faz fallback ou quando os dados foram inseridos antes da v2.')
    } else if (userWorkspacesHaveContacts) {
      console.log('   ✅ O workspace do usuário tem contatos. O problema pode estar em filtros, RLS ou data.')
    } else {
      console.log('   ⚠️  Não há contatos em nenhum workspace do usuário. Pode ser falta de dados ou problema na ingestão.')
    }
  }

  if ((nullWorkspaceContacts ?? 0) > 0) {
    console.log('   ⚠️  Existem contatos com workspace_id NULL — eles ficam invisíveis para todos via RLS.')
  }

  if ((nullContactOpps ?? 0) > 0) {
    console.log('   ⚠️  Existem oportunidades com contato_id NULL — elas ficam invisíveis via RLS.')
  }
}

run().catch((err) => {
  console.error('\n💥 Erro:', err.message || err)
  process.exit(1)
})
