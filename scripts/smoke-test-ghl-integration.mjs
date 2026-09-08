import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = process.env.TEST_EMAIL || ''
const PASSWORD = process.env.TEST_PASSWORD || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD')
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

  // Find a workspace where the user is owner/admin and has GHL integration
  console.log('🔍 Looking for workspace with real GHL integration...')
  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .in('role', ['owner', 'admin'])

  if (membershipError || !memberships?.length) {
    console.error('❌ No admin workspace found:', membershipError?.message)
    process.exit(1)
  }

  const workspaceIds = memberships.map((m) => m.workspace_id)

  const { data: settingsList, error: settingsError } = await supabase
    .from('ghl_integration_settings')
    .select('workspace_id, ghl_location_id')
    .in('workspace_id', workspaceIds)
    .not('ghl_location_id', 'is', null)
    .neq('ghl_location_id', 'test-location-id-smoke-123')
    .limit(5)

  if (settingsError) {
    console.error('❌ Error reading settings:', settingsError.message)
    process.exit(1)
  }

  if (!settingsList?.length) {
    console.log('⚠️ No real GHL integration found for admin workspaces.')
    console.log('   Configure a real GHL Location ID in /workspace/ghl-config first.')
    process.exit(0)
  }

  const target = settingsList[0]
  console.log('✅ Found real GHL integration:', {
    workspace_id: target.workspace_id,
    location_id_prefix: target.ghl_location_id.slice(0, 6) + '...',
  })

  console.log('🚀 Calling discover-ghl-config with real location...')
  const discover = await invokeFunction('discover-ghl-config', { workspace_id: target.workspace_id }, authData.session.access_token)

  console.log('   HTTP status:', discover.status)

  if (discover.status === 200) {
    const hasData =
      (discover.data?.pipelines?.length ?? 0) > 0 ||
      (discover.data?.contact_custom_fields?.length ?? 0) > 0 ||
      (discover.data?.opportunity_custom_fields?.length ?? 0) > 0

    if (hasData) {
      console.log('✅ discover-ghl-config returned real GHL data:')
      console.log('   pipelines:', discover.data.pipelines?.length ?? 0)
      console.log('   contact_custom_fields:', discover.data.contact_custom_fields?.length ?? 0)
      console.log('   opportunity_custom_fields:', discover.data.opportunity_custom_fields?.length ?? 0)
      console.log('\n🎉 GHL integration is working with real data!')
    } else {
      console.log('⚠️ discover-ghl-config returned 200 but with empty data.')
      console.log('   Response:', JSON.stringify(discover.data, null, 2))
    }
  } else {
    console.log('   Response:', JSON.stringify(discover.data, null, 2))
    console.log('\n❌ discover-ghl-config failed. Check response above.')
  }
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err)
  process.exit(1)
})
