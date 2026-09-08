const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SB_URL ||
  'https://qzesffnkqgelmtfblzkr.supabase.co'

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SB_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY ou SB_SERVICE_ROLE_KEY antes de rodar este script.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function count(table, filter) {
  let query = sb.from(table).select('*', { count: 'exact', head: true })
  query = filter(query)
  const { count: total, error } = await query
  if (error) throw error
  return total ?? 0
}

async function latestRows(table, select, configure, limit = 5) {
  let query = sb.from(table).select(select)
  query = configure(query)
  const { data, error } = await query.limit(limit)
  if (error) throw error
  return data ?? []
}

async function latestQueueRows(status, orderAscending = true) {
  const next = async (select) =>
    latestRows(
      'contact_opp_sync_queue',
      select,
      (q) => q.eq('status', status).order('created_at', { ascending: orderAscending }),
      10,
    )

  try {
    return await next('id,ghl_contact_id,location_id,status,attempts,created_at,last_error,claimed_at')
  } catch (error) {
    if (!String(error.message || error).includes('claimed_at')) throw error
    return next('id,ghl_contact_id,location_id,status,attempts,created_at,last_error')
  }
}

async function latestDoneQueueRows() {
  const next = async (select) =>
    latestRows(
      'contact_opp_sync_queue',
      select,
      (q) => q.eq('status', 'done').order('processed_at', { ascending: false }),
      10,
    )

  try {
    return await next('id,ghl_contact_id,location_id,status,attempts,created_at,processed_at,claimed_at')
  } catch (error) {
    if (!String(error.message || error).includes('claimed_at')) throw error
    return next('id,ghl_contact_id,location_id,status,attempts,created_at,processed_at')
  }
}

async function latestGhlApiJobRows(status, orderAscending = true) {
  return latestRows(
    'ghl_api_jobs',
    'id,caller,url,status,attempts,created_at,processed_at,claimed_at,handled_at,error,idempotency_key,context',
    (q) => q.eq('status', status).order(status === 'done' || status === 'dead' ? 'processed_at' : 'created_at', { ascending: orderAscending }),
    10,
  )
}

async function latestUnhandledTerminalGhlApiJobRows() {
  return latestRows(
    'ghl_api_jobs',
    'id,caller,url,status,attempts,created_at,processed_at,claimed_at,handled_at,error,idempotency_key,context',
    (q) => q
      .in('status', ['done', 'dead'])
      .is('handled_at', null)
      .order('processed_at', { ascending: false }),
    10,
  )
}

async function main() {
  const [
    oppTotal,
    oppPipelineNull,
    oppPipelineNameNull,
    oppDataLeadNull,
    queueTotal,
    queuePending,
    queueProcessing,
    queueDone,
    queueError,
    ghlApiJobsTotal,
    ghlApiJobsPending,
    ghlApiJobsProcessing,
    ghlApiJobsDone,
    ghlApiJobsDead,
    ghlApiJobsUnhandledTerminal,
    pendingNulls,
    oldestPendingQueue,
    oldestProcessingQueue,
    latestQueueDone,
    oldestPendingGhlApiJobs,
    oldestProcessingGhlApiJobs,
    latestDoneGhlApiJobs,
    latestDeadGhlApiJobs,
    latestUnhandledTerminalGhlApiJobs,
    reconcileLatestRuns,
    conversationLogs,
    latestWebhook,
    latestMeta,
    latestTags,
  ] = await Promise.all([
    count('oportunidades', (q) => q),
    count('oportunidades', (q) => q.is('pipeline_id', null)),
    count('oportunidades', (q) => q.is('pipeline_name', null).not('pipeline_id', 'is', null)),
    count('oportunidades', (q) => q.is('data_lead_recebido', null)),
    count('contact_opp_sync_queue', (q) => q),
    count('contact_opp_sync_queue', (q) => q.eq('status', 'pending')),
    count('contact_opp_sync_queue', (q) => q.eq('status', 'processing')),
    count('contact_opp_sync_queue', (q) => q.eq('status', 'done')),
    count('contact_opp_sync_queue', (q) => q.eq('status', 'error')),
    count('ghl_api_jobs', (q) => q),
    count('ghl_api_jobs', (q) => q.eq('status', 'pending')),
    count('ghl_api_jobs', (q) => q.eq('status', 'processing')),
    count('ghl_api_jobs', (q) => q.eq('status', 'done')),
    count('ghl_api_jobs', (q) => q.eq('status', 'dead')),
    count('ghl_api_jobs', (q) => q.in('status', ['done', 'dead']).is('handled_at', null)),
    latestRows(
      'oportunidades',
      'ghl_opportunity_id,nome_contato,email_contato,pipeline_id,pipeline_name,data_lead_recebido,updated_at',
      (q) => q.or('pipeline_id.is.null,data_lead_recebido.is.null').order('updated_at', { ascending: false }),
      10,
    ),
    latestQueueRows('pending', true),
    latestQueueRows('processing', true),
    latestDoneQueueRows(),
    latestGhlApiJobRows('pending', true),
    latestGhlApiJobRows('processing', true),
    latestGhlApiJobRows('done', false),
    latestGhlApiJobRows('dead', false),
    latestUnhandledTerminalGhlApiJobRows(),
    latestRows(
      'ghl_opp_reconcile_runs',
      'id,mode,scope,source,status,total_contacts,processed_contacts,success_contacts,error_contacts,opportunities_missing,opportunities_extra,opportunities_inserted,opportunities_updated,started_at,finished_at,created_at',
      (q) => q.order('created_at', { ascending: false }),
      5,
    ).catch(() => []),
    latestRows(
      'ghl_conversations_sync_log',
      'started_at,finished_at,mode,status,messages_upserted,error_message',
      (q) => q.order('started_at', { ascending: false }),
      10,
    ),
    sb
      .from('webhooks_ghl')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    sb
      .from('meta_ads_insights')
      .select('date,created_at')
      .order('date', { ascending: false })
      .limit(1)
      .single(),
    sb
      .from('contatos')
      .select('updated_at')
      .not('tags', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (latestWebhook.error) throw latestWebhook.error
  if (latestMeta.error) throw latestMeta.error
  if (latestTags.error) throw latestTags.error

  const summary = {
    generated_at: new Date().toISOString(),
    oportunidades: {
      total: oppTotal,
      pipeline_id_null: oppPipelineNull,
      pipeline_name_null_com_pipeline: oppPipelineNameNull,
      data_lead_recebido_null: oppDataLeadNull,
      exemplos_pendentes: pendingNulls,
    },
    contact_opp_sync_queue: {
      total: queueTotal,
      pending: queuePending,
      processing: queueProcessing,
      done: queueDone,
      error: queueError,
      oldest_pending: oldestPendingQueue,
      oldest_processing: oldestProcessingQueue,
      latest_done: latestQueueDone,
    },
    ghl_api_jobs: {
      total: ghlApiJobsTotal,
      pending: ghlApiJobsPending,
      processing: ghlApiJobsProcessing,
      done: ghlApiJobsDone,
      dead: ghlApiJobsDead,
      terminal_unhandled: ghlApiJobsUnhandledTerminal,
      oldest_pending: oldestPendingGhlApiJobs,
      oldest_processing: oldestProcessingGhlApiJobs,
      latest_done: latestDoneGhlApiJobs,
      latest_dead: latestDeadGhlApiJobs,
      latest_terminal_unhandled: latestUnhandledTerminalGhlApiJobs,
    },
    ghl_opp_reconcile_runs: reconcileLatestRuns,
    webhooks_ghl: {
      ultimo_recebido_em: latestWebhook.data?.created_at ?? null,
    },
    sync_contact_tags: {
      ultimo_contato_com_tags_atualizado_em: latestTags.data?.updated_at ?? null,
    },
    sync_meta_ads: {
      ultimo_registro: latestMeta.data ?? null,
    },
    sync_ghl_conversations: {
      ultimas_execucoes: conversationLogs,
      verifique_pelo_log: true,
    },
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
