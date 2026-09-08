// Edge Function: sync-meta-ads
// Sincroniza dados da Meta Marketing API para o Supabase
// Executa: A cada 1 hora via pg_cron
// Fluxo: Meta API → raw_insights → processamento → insights/breakdowns

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  resolveWorkspaceCredential,
} from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';

// ============================================
// CONFIGURAÇÃO
// ============================================

const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Campos base a extrair (todas as métricas disponíveis)
const INSIGHTS_FIELDS_BASE = [
  // Identificadores
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',

  // Métricas básicas
  'spend',
  'impressions',
  'clicks',
  'reach',
  'frequency',

  // Métricas de custo
  'ctr',
  'cpc',
  'cpm',
  'cpp',

  // Conversões
  'actions',
  'conversions',
  'conversion_values',
  'cost_per_action_type',

  // Vídeo
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p95_watched_actions',
  'video_p100_watched_actions',
  'video_avg_time_watched_actions',

  // Quality
  'quality_ranking',
  'engagement_rate_ranking',
  'conversion_rate_ranking',

  // Datas
  'date_start',
  'date_stop',
];

function buildInsightsFields(_breakdowns?: string[]): string {
  // Nota: campos de breakdown (country, region, age, gender etc.) são
  // devolvidos automaticamente pela Meta API quando solicitados via
  // parâmetro `breakdowns`. Incluí-los em `fields` gera erro 400.
  return INSIGHTS_FIELDS_BASE.join(',');
}

// Retry config
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // ms

// ============================================
// TIPOS
// ============================================

interface MetaInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  actions?: Array<{ action_type: string; value: string }>;
  conversions?: Array<{ action_type: string; value: string }>;
  conversion_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p95_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
  date_start?: string;
  date_stop?: string;
  // Breakdowns
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  impression_device?: string;
  publisher_platform?: string;
  platform_position?: string;
}

interface MetaInsightsResponse {
  data: MetaInsight[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

interface SyncLog {
  started_at: string;
  finished_at?: string;
  status: 'running' | 'success' | 'partial' | 'error';
  records_fetched: number;
  records_inserted: number;
  records_updated: number;
  error_message?: string;
  error_details?: Record<string, unknown>;
  execution_time_ms?: number;
  workspace_id?: string | null;
}

// ============================================
// UTILITÁRIOS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data) : '');
}

// ============================================
// META API CLIENT
// ============================================

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  attempt = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    // Rate limit - retry com backoff
    if (response.status === 429) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] || 4000;
        log(`Rate limit atingido. Tentando novamente em ${delay}ms... (tentativa ${attempt + 1})`);
        await sleep(delay);
        return fetchWithRetry(url, options, attempt + 1);
      }
    }
    
    // Erro de servidor - retry
    if (response.status >= 500 && response.status < 600) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] || 4000;
        log(`Erro de servidor ${response.status}. Tentando novamente em ${delay}ms...`);
        await sleep(delay);
        return fetchWithRetry(url, options, attempt + 1);
      }
    }
    
    return response;
  } catch (error) {
    // Erro de rede - retry
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] || 4000;
      log(`Erro de rede: ${error}. Tentando novamente em ${delay}ms...`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw error;
  }
}

async function fetchMetaInsights(
  accessToken: string,
  adAccountId: string,
  params: {
    level?: 'account' | 'campaign' | 'adset' | 'ad';
    date_preset?: string;
    time_range?: { since: string; until: string };
    breakdowns?: string[];
    limit?: number;
    after?: string;
  }
): Promise<MetaInsightsResponse> {
  const url = new URL(`${META_BASE_URL}/${adAccountId}/insights`);

  // Parâmetros obrigatórios
  url.searchParams.append('access_token', accessToken);
  url.searchParams.append('fields', buildInsightsFields(params.breakdowns));
  
  // Parâmetros opcionais
  if (params.level) url.searchParams.append('level', params.level);
  if (params.date_preset) url.searchParams.append('date_preset', params.date_preset);
  if (params.time_range) {
    url.searchParams.append('time_range', JSON.stringify(params.time_range));
    // CRÍTICO: sem time_increment, a Meta agrega o `time_range` inteiro numa
    // única linha por anúncio (spend = soma do período todo) e marca essa
    // linha com date_start = since. Isso faz o processamento gravar a soma
    // de N dias como se fosse o gasto de 1 dia só. time_increment=1 força
    // 1 linha por dia, igual ao date_preset=today.
    url.searchParams.append('time_increment', '1');
  }
  if (params.breakdowns && params.breakdowns.length > 0) url.searchParams.append('breakdowns', params.breakdowns.join(','));
  if (params.limit) url.searchParams.append('limit', params.limit.toString());
  if (params.after) url.searchParams.append('after', params.after);
  
  log(`Chamando Meta API: ${url.toString().replace(accessToken, '***')}`);
  
  const startTime = Date.now();
  const response = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  const duration = Date.now() - startTime;
  log(`Meta API respondeu em ${duration}ms - Status: ${response.status}`);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Meta API error ${response.status}: ${errorData.error?.message || response.statusText}`
    );
  }
  
  return response.json();
}

async function fetchAllInsights(
  accessToken: string,
  adAccountId: string,
  params: {
    level?: 'account' | 'campaign' | 'adset' | 'ad';
    date_preset?: string;
    time_range?: { since: string; until: string };
    breakdowns?: string[];
  }
): Promise<MetaInsight[]> {
  const allData: MetaInsight[] = [];
  let after: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 100; // Safety limit
  
  do {
    const response = await fetchMetaInsights(accessToken, adAccountId, {
      ...params,
      limit: 500,
      after,
    });
    
    if (response.data && response.data.length > 0) {
      allData.push(...response.data);
    }
    
    after = response.paging?.cursors?.after;
    pageCount++;
    
    log(`Página ${pageCount}: ${response.data?.length || 0} registros. Total: ${allData.length}`);
    
    // Delay entre páginas para respeitar rate limits
    if (after) {
      await sleep(500);
    }
  } while (after && pageCount < MAX_PAGES);
  
  if (pageCount >= MAX_PAGES) {
    log('⚠️ Atingido limite máximo de páginas (100)');
  }
  
  return allData;
}

// ============================================
// SUPABASE OPERATIONS
// ============================================

async function saveRawInsights(
  supabase: ReturnType<typeof createClient>,
  data: {
    api_endpoint: string;
    params: Record<string, unknown>;
    response_data: MetaInsightsResponse;
    http_status: number;
    records_count: number;
    fetch_started_at: string;
    fetch_finished_at: string;
    error_details?: Record<string, unknown>;
    workspace_id?: string | null;
  }
) {
  const { data: result, error } = await supabase
    .from('meta_ads_raw_insights')
    .insert({
      api_endpoint: data.api_endpoint,
      params: data.params,
      response_data: data.response_data,
      http_status: data.http_status,
      records_count: data.records_count,
      fetch_started_at: data.fetch_started_at,
      fetch_finished_at: data.fetch_finished_at,
      error_details: data.error_details,
      processado_em: null, // Pendente de processamento
      workspace_id: data.workspace_id,
    })
    .select('id')
    .single();
  
  if (error) {
    throw new Error(`Erro ao salvar raw insights: ${error.message}`);
  }
  
  return result.id;
}

async function processRawInsights(
  supabase: ReturnType<typeof createClient>,
  rawId: string,
  breakdowns?: string[]
) {
  const hasBreakdowns = breakdowns && breakdowns.length > 0;
  const rpcName = hasBreakdowns
    ? 'processar_meta_ads_raw_region_breakdown'
    : 'processar_meta_ads_raw';

  log(`Processando raw via RPC: ${rpcName}`);

  const { data, error } = await supabase.rpc(rpcName, {
    p_raw_id: rawId,
  });

  if (error) {
    throw new Error(`Erro ao processar raw insights: ${error.message}`);
  }

  return data;
}

// Busca o total oficial de investimento no nível de CONTA (não soma de
// anúncios). Necessário porque a soma de meta_ads_insights.spend (level=ad)
// pode superestimar bastante o gasto real em campanhas com CBO/Advantage+ —
// ver comentário na migration create_meta_ads_account_daily.
async function syncAccountLevelSpend(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  adAccountId: string,
  insightParams: { date_preset?: string; time_range?: { since: string; until: string } },
  workspaceId: string,
): Promise<void> {
  const url = new URL(`${META_BASE_URL}/${adAccountId}/insights`);
  url.searchParams.append('access_token', accessToken);
  url.searchParams.append('fields', 'spend,account_currency,date_start,date_stop');
  url.searchParams.append('level', 'account');
  if (insightParams.date_preset) {
    url.searchParams.append('date_preset', insightParams.date_preset);
  } else if (insightParams.time_range) {
    url.searchParams.append('time_range', JSON.stringify(insightParams.time_range));
    url.searchParams.append('time_increment', '1');
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Meta API error (level=account) ${response.status}: ${errorData.error?.message || response.statusText}`
    );
  }

  const body = await response.json();
  const rows: Array<{ spend?: string; account_currency?: string; date_start?: string }> = body.data || [];

  for (const row of rows) {
    if (!row.date_start) continue;
    const { error } = await supabase.from('meta_ads_account_daily').upsert(
      {
        workspace_id: workspaceId,
        account_id: adAccountId,
        date: row.date_start,
        spend: parseFloat(row.spend || '0'),
        account_currency: row.account_currency || null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,account_id,date' }
    );
    if (error) {
      throw new Error(`Erro ao salvar meta_ads_account_daily: ${error.message}`);
    }
  }

  log(`✅ Nível de conta sincronizado: ${rows.length} dia(s).`);
}

async function registerSyncLog(
  supabase: ReturnType<typeof createClient>,
  entry: SyncLog
) {
  const { error } = await supabase.rpc('registrar_sync_log', {
    p_started_at: entry.started_at,
    p_status: entry.status,
    p_records_fetched: entry.records_fetched,
    p_records_inserted: entry.records_inserted,
    p_records_updated: entry.records_updated,
    p_error_message: entry.error_message,
    p_error_details: entry.error_details,
    p_execution_time_ms: entry.execution_time_ms,
    p_workspace_id: entry.workspace_id,
  } as any);

  if (error) {
    log('Erro ao registrar sync log:', error);
  }
}

// ============================================
// MULTI-CONTA (Fase 15 — D3)
// ============================================

interface AccountSyncResult {
  account_id: string;
  status: 'success' | 'error';
  records_fetched: number;
  records_inserted: number;
  breakdowns_inserted: number;
  raw_id?: string;
  error?: string;
  request_id?: string;
}

// Normaliza um account_id Meta: trim + prefixo act_ quando vem so o numero.
function normalizeMetaAccountId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

interface InsightParams {
  level: 'ad';
  date_preset?: string;
  time_range?: { since: string; until: string };
  breakdowns?: string[];
}

// Sincroniza UMA conta de anúncios: fetch → raw → processamento → nível de
// conta → campanhas. Lança erro em falha — o chamador isola por conta.
// Nota de tipagem: o client é criado sem generics (SupabaseClient<any,...>) —
// usar ReturnType<typeof createClient> aqui espalharia `never` pelas queries
// (mesmo motivo dos erros de tipo pré-existentes das funções auxiliares).
async function syncOneAccount(
  supabase: SupabaseClient<any, 'public', any>,
  metaAccessToken: string,
  workspaceId: string,
  accountId: string,
  insightParams: InsightParams,
): Promise<AccountSyncResult> {
  log(`Buscando dados da Meta API (conta ${accountId})...`);
  const fetchStartTime = new Date().toISOString();

  const insights = await fetchAllInsights(metaAccessToken, accountId, insightParams);

  const fetchEndTime = new Date().toISOString();

  log(`✅ Dados recebidos (${accountId}): ${insights.length} registros`);

  if (insights.length === 0) {
    log(`Nenhum dado para processar na conta ${accountId}.`);
    return {
      account_id: accountId,
      status: 'success',
      records_fetched: 0,
      records_inserted: 0,
      breakdowns_inserted: 0,
    };
  }

  // Salvar JSON bruto
  log(`Salvando JSON bruto (${accountId})...`);

  const rawId = await saveRawInsights(supabase, {
    api_endpoint: '/insights',
    params: {
      level: 'ad',
      ...(insightParams.date_preset
        ? { date_preset: insightParams.date_preset }
        : { time_range: insightParams.time_range }),
      ...(insightParams.breakdowns
        ? { breakdowns: insightParams.breakdowns }
        : {}),
      fields: buildInsightsFields(insightParams.breakdowns),
      account_id: accountId,
      workspace_id: workspaceId,
    },
    response_data: { data: insights },
    http_status: 200,
    records_count: insights.length,
    fetch_started_at: fetchStartTime,
    fetch_finished_at: fetchEndTime,
    workspace_id: workspaceId,
  });

  log(`✅ JSON bruto salvo (${accountId}): ${rawId}`);

  // Processar dados
  log(`Processando dados (${accountId})...`);
  const processResult = await processRawInsights(supabase, rawId, insightParams.breakdowns);

  log(`✅ Processamento concluído (${accountId}):`, processResult);

  // Nível de conta (total oficial) — não deve derrubar o sync se falhar,
  // já que o processamento por anúncio (fonte de granularidade) já está OK.
  try {
    await syncAccountLevelSpend(supabase, metaAccessToken, accountId, insightParams, workspaceId);
  } catch (accError) {
    log(`⚠️ Falha ao sincronizar nível de conta ${accountId} (não bloqueia o sync principal):`, accError);
  }

  // Sincronizar metadados de campanhas (nome, status, orçamento)
  // Extrai campanhas únicas dos insights e popula meta_ads_campaigns
  try {
    const uniqueCampaigns = new Map<string, { name?: string }>()
    for (const row of insights) {
      if (row.campaign_id && !uniqueCampaigns.has(row.campaign_id)) {
        uniqueCampaigns.set(row.campaign_id, { name: row.campaign_name })
      }
    }
    for (const [campaignId, info] of uniqueCampaigns) {
      await supabase.from('meta_ads_campaigns').upsert({
        campaign_id: campaignId,
        account_id: accountId,
        name: info.name || null,
        workspace_id: workspaceId,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,campaign_id' })
    }
    log(`✅ Campanhas sincronizadas (${accountId}): ${uniqueCampaigns.size}`)
  } catch (campaignError) {
    log(`⚠️ Falha ao sincronizar campanhas (${accountId}) — não bloqueia o sync principal:`, campaignError)
  }

  return {
    account_id: accountId,
    status: 'success',
    records_fetched: insights.length,
    records_inserted: processResult.insights_inseridos || 0,
    breakdowns_inserted: processResult.breakdowns_inseridos || 0,
    raw_id: rawId,
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  const syncStartTime = Date.now();
  const startedAt = new Date().toISOString();
  let workspaceId: string | null = null;

  log('========================================');
  log('🚀 Iniciando sincronização Meta Ads');
  log('========================================');

  try {
    // Verificar método
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método não permitido. Use POST.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const guardResponse = requireServiceRoleCaller(req);
    if (guardResponse) return guardResponse;


    // Fase 2/Fatia 8: credencial Meta e conta sao POR WORKSPACE.
    // Nao ha mais token/conta global nem fallback META_ADS_WORKSPACE_ID.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis do Supabase não configuradas');
    }

    // Ler parâmetros opcionais do body
    // - days_back: N → sincroniza os últimos N dias até hoje (BRT)
    // - time_range: { since, until } → range explícito no formato YYYY-MM-DD
    // - breakdowns: string[] → quebras solicitadas à Meta API (ex: ['country','region'])
    // - workspace_id: OBRIGATORIO (isolamento multi-tenant)
    // - account_id: opcional (Fase 15) → sincroniza SÓ esta conta (deve estar
    //   ativa para o workspace); sem ele, itera todas as contas ativas
    let body: {
      days_back?: number;
      time_range?: { since: string; until: string };
      breakdowns?: string[];
      workspace_id?: string;
      account_id?: string;
    } = {};
    try { body = await req.json(); } catch { /* body vazio ou inválido — usar defaults */ }

    const todayBRT = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    // workspace_id OBRIGATORIO (fail-closed): sem fallback a env e sem INSERT com NULL.
    if (!body.workspace_id) {
      return new Response(
        JSON.stringify({ error: 'workspace_id obrigatorio (isolamento multi-tenant).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    workspaceId = body.workspace_id;

    // Cliente Supabase + credencial Meta resolvida POR workspace (vault, service_role).
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Token resolvido UMA vez e reutilizado por todas as contas (abordagem 1,
    // docs/FASE-15-MULTI-CONTA-META.md).
    let metaAccessToken: string;
    try {
      const cred = await resolveWorkspaceCredential(supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0], workspaceId, 'meta');
      metaAccessToken = cred.apiKey;
    } catch (e) {
      const requestId = createRequestId();
      logSafeError('sync-meta-ads:credential', requestId, e);
      return new Response(
        JSON.stringify({ error: 'Credencial Meta indisponível ou conta não autorizada para este workspace.', code: 'credential_unavailable', request_id: requestId }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fase 15 (D1/D3): o escopo de sync são as contas ATIVAS em
    // workspace_meta_ad_accounts (única fonte de verdade do vínculo
    // conta ↔ workspace). Fail-closed: nenhuma conta ativa = nada a fazer.
    // Isso evita que um token com acesso a multiplas contas escreva dados
    // no workspace errado.
    let targetAccounts: string[];
    try {
      const { data: activeRows, error: activeError } = await supabase
        .from('workspace_meta_ad_accounts')
        .select('account_id')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true);

      if (activeError) {
        throw new Error(`Erro ao validar vínculo conta/workspace: ${activeError.message}`);
      }

      const activeAccounts: string[] = [];
      for (const row of (activeRows ?? []) as { account_id: string }[]) {
        const normalized = normalizeMetaAccountId(row.account_id);
        if (normalized && !activeAccounts.includes(normalized)) {
          activeAccounts.push(normalized);
        }
      }

      if (body.account_id !== undefined) {
        // Sync de UMA conta: precisa estar ativa para o workspace.
        const wanted = normalizeMetaAccountId(body.account_id);
        if (!wanted || !activeAccounts.includes(wanted)) {
          log(`Conta Meta ${wanted || String(body.account_id)} não está ativa para o workspace ${workspaceId}.`);
          return new Response(
            JSON.stringify({
              error: 'Conta Meta informada não está ativa para este workspace.',
              code: 'account_not_linked',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        targetAccounts = [wanted];
      } else {
        targetAccounts = activeAccounts;
      }

      if (targetAccounts.length === 0) {
        throw new Error(
          `Nenhuma conta Meta ativa vinculada ao workspace ${workspaceId}. ` +
          'Cadastre-a em workspace_meta_ad_accounts antes de sincronizar.'
        );
      }
    } catch (e) {
      const requestId = createRequestId();
      logSafeError('sync-meta-ads:credential', requestId, e);
      return new Response(
        JSON.stringify({ error: 'Credencial Meta indisponível ou conta não autorizada para este workspace.', code: 'credential_unavailable', request_id: requestId }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    log(`Credencial Meta OK (workspace ${workspaceId}). Contas alvo: ${targetAccounts.join(', ')}`);

    let insightParams: InsightParams;

    if (body.time_range) {
      insightParams = { level: 'ad', time_range: body.time_range, breakdowns: body.breakdowns };
      log(`Modo: time_range explícito (${body.time_range.since} → ${body.time_range.until})`, { breakdowns: body.breakdowns });
    } else if (body.days_back && body.days_back > 0) {
      const since = new Date();
      since.setDate(since.getDate() - body.days_back);
      const sinceStr = since.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      insightParams = { level: 'ad', time_range: { since: sinceStr, until: todayBRT }, breakdowns: body.breakdowns };
      log(`Modo: days_back=${body.days_back} (${sinceStr} → ${todayBRT})`, { breakdowns: body.breakdowns });
    } else {
      insightParams = { level: 'ad', date_preset: 'today', breakdowns: body.breakdowns };
      log('Modo: today (padrão)', { breakdowns: body.breakdowns });
    }

    // Itera as contas com ISOLAMENTO DE FALHA (D3): erro de uma conta é
    // registrado (request_id correlaciona com o log server-side) e não aborta
    // as demais.
    const accountResults: AccountSyncResult[] = [];
    for (let i = 0; i < targetAccounts.length; i++) {
      const accountId = targetAccounts[i];
      log(`▶ Conta ${accountId} (${i + 1}/${targetAccounts.length})`);
      try {
        accountResults.push(await syncOneAccount(supabase, metaAccessToken, workspaceId, accountId, insightParams));
      } catch (accountError) {
        const requestId = createRequestId();
        logSafeError(`sync-meta-ads:account:${accountId}`, requestId, accountError);
        accountResults.push({
          account_id: accountId,
          status: 'error',
          records_fetched: 0,
          records_inserted: 0,
          breakdowns_inserted: 0,
          error: 'Falha ao sincronizar esta conta (ver logs server-side).',
          request_id: requestId,
        });
      }
    }

    const successResults = accountResults.filter((r) => r.status === 'success');
    const failedResults = accountResults.filter((r) => r.status === 'error');
    const totalFetched = accountResults.reduce((s, r) => s + r.records_fetched, 0);
    const totalInserted = accountResults.reduce((s, r) => s + r.records_inserted, 0);
    const totalBreakdowns = accountResults.reduce((s, r) => s + r.breakdowns_inserted, 0);
    const allOk = failedResults.length === 0;
    const noneOk = successResults.length === 0;

    // Um sync log AGREGADO por execução (o painel lê o último log do
    // workspace — um log por conta mostraria só a última conta).
    const syncLog: SyncLog = {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: allOk ? 'success' : noneOk ? 'error' : 'partial',
      records_fetched: totalFetched,
      records_inserted: totalInserted,
      records_updated: 0, // Upsert conta como insert ou update
      ...(allOk ? {} : {
        error_message: 'Uma ou mais contas falharam na sincronização.',
        error_details: {
          accounts: accountResults.map((r) => ({
            account_id: r.account_id,
            status: r.status,
            records_fetched: r.records_fetched,
            ...(r.request_id ? { request_id: r.request_id } : {}),
          })),
        },
      }),
      execution_time_ms: Date.now() - syncStartTime,
      workspace_id: workspaceId,
    };

    await registerSyncLog(supabase, syncLog);

    log('========================================');
    log(allOk ? '✅ Sincronização concluída com sucesso!' : '⚠️ Sincronização concluída com falhas em algumas contas.');
    log('========================================');

    // Nenhuma conta sincronizou → compat com o erro geral atual (500).
    if (noneOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foi possível concluir a sincronização.',
          accounts: accountResults,
          execution_time_ms: syncLog.execution_time_ms,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: allOk
          ? totalFetched === 0
            ? 'Sincronização concluída - nenhum dado novo'
            : 'Sincronização concluída'
          : 'Sincronização concluída com falhas em algumas contas',
        // Compat single-conta: raw_id no topo só faz sentido com 1 conta.
        ...(accountResults.length === 1 && accountResults[0].raw_id
          ? { raw_id: accountResults[0].raw_id }
          : {}),
        records_fetched: totalFetched,
        records_inserted: totalInserted,
        records_processed: totalInserted,
        breakdowns_inserted: totalBreakdowns,
        accounts: accountResults,
        execution_time_ms: syncLog.execution_time_ms,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    const requestId = createRequestId();
    const errorMessage = 'Não foi possível concluir a sincronização.';

    logSafeError('sync-meta-ads', requestId, error);
    
    // Tentar registrar erro (se possível)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await registerSyncLog(supabase, {
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          status: 'error',
          records_fetched: 0,
          records_inserted: 0,
          records_updated: 0,
          error_message: errorMessage,
          error_details: { request_id: requestId },
          execution_time_ms: Date.now() - syncStartTime,
          workspace_id: workspaceId,
        });
      }
    } catch (logError) {
      log('Erro ao registrar log de erro:', logError);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        request_id: requestId,
        execution_time_ms: Date.now() - syncStartTime,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
