import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''
const REAL_LOCATION_ID = process.env.REAL_LOCATION_ID || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD || !REAL_LOCATION_ID) {
  console.error('Missing required env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function invokeFunction(name, body, token) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  return { status: res.status, data }
}

async function main() {
  console.log('🔐 Logging in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })

  if (authError) {
    console.error('❌ Login failed:', authError.message)
    process.exit(1)
  }

  console.log('✅ Logged in as', authData.user?.email)

  const { data: workspaces, error: wsError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .order('role', { ascending: false })
    .limit(1)

  if (wsError || !workspaces?.length) {
    console.error('❌ No workspace found:', wsError?.message)
    process.exit(1)
  }

  const workspaceId = workspaces[0].workspace_id
  console.log('✅ Workspace:', workspaceId, '| Role:', workspaces[0].role)

  console.log('💾 Saving real GHL Location ID to test workspace...')
  const setup = await invokeFunction(
    'setup-ghl-integration',
    {
      workspace_id: workspaceId,
      ghl_location_id: REAL_LOCATION_ID,
      webhook_secret: 'test-webhook-secret',
    },
    authData.session.access_token
  )

  console.log('   setup status:', setup.status)
  if (setup.status !== 200) {
    console.log('   setup response:', JSON.stringify(setup.data, null, 2))
    process.exit(1)
  }

  console.log('🚀 Calling discover-ghl-config with real location...')
  const discover = await invokeFunction('discover-ghl-config', { workspace_id: workspaceId }, authData.session.access_token)

  console.log('   HTTP status:', discover.status)

  if (discover.status === 200) {
    const hasData =
      (discover.data?.pipelines?.length ?? 0) > 0 ||
      (discover.data?.contact_custom_fields?.length ?? 0) > 0 ||
      (discover.data?.opportunity_custom_fields?.length ?? 0) > 0

    if (hasData) {
      console.log('\n🎉 SUCCESS! GHL integration is working with real data:')
      console.log('   pipelines:', discover.data.pipelines?.length ?? 0)
      console.log('   contact_custom_fields:', discover.data.contact_custom_fields?.length ?? 0)
      console.log('   opportunity_custom_fields:', discover.data.opportunity_custom_fields?.length ?? 0)
    } else {
      console.log('\n⚠️ discover-ghl-config returned 200 but with empty data.')
      console.log('   Response:', JSON.stringify(discover.data, null, 2))
    }
  } else {
    console.log('   Response:', JSON.stringify(discover.data, null, 2))
    console.log('\n❌ discover-ghl-config failed.')
  }
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
