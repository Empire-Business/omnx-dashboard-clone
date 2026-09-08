// Edge Function: sync-meta-ads-backfill
// Faz backfill histórico de dados da Meta Marketing API
// Estratégia: Extrai dia por dia com rate limiting para não sobrecarregar a API
//
// Exemplo de chamada padrão (sem breakdown):
//   curl -X POST <url>/sync-meta-ads-backfill \
//     -H "Authorization: Bearer <service_role>" \
//     -d '{"workspace_id":"<workspace-uuid>","data_inicio":"2025-09-01","data_fim":"2025-09-30","max_dias":30}'
//
// Exemplo de chamada por região (breakdown):
//   curl -X POST <url>/sync-meta-ads-backfill \
//     -H "Authorization: Bearer <service_role>" \
//     -d '{"data_inicio":"2025-11-01","data_fim":"2026-06-18","breakdowns":["country","region"],"max_dias":30}'
//
// Exemplo de dry run:
//   curl -X POST <url>/sync-meta-ads-backfill \
//     -H "Authorization: Bearer <service_role>" \
//     -d '{"data_inicio":"2025-11-01","data_fim":"2026-06-18","breakdowns":["country","region"],"dry_run":true}'

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  resolveWorkspaceCredential,
} from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

// ============================================
// CONFIGURAÇÃO
// ============================================

const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Rate limiting: 1 chamada a cada 5 segundos = 720/hora (dentro do limite de 200-1000 da Meta)
const DELAY_MS = 5000;

// Máximo de páginas por dia (safety limit)
const MAX_PAGES = 50;

// Tamanho da página
const PAGE_SIZE = 500;

// Campos a extrair (todas as métricas disponíveis)
const INSIGHTS_FIELDS_BASE = [
  // Identificadores
  'campaign_id', 'campaign_name',
  'adset_id', 'adset_name',
  'ad_id', 'ad_name',

  // Métricas básicas
  'spend', 'impressions', 'clicks', 'reach', 'frequency',

  // Métricas de custo
  'ctr', 'cpc', 'cpm', 'cpp',

  // Conversões
  'actions', 'conversions', 'conversion_values', 'cost_per_action_type',

  // Vídeo
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p95_watched_actions',
  'video_p100_watched_actions', 'video_avg_time_watched_actions',

  // Quality
  'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',

  // Datas
  'date_start', 'date_stop'
];

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
  [key: string]: unknown;
}

interface MetaInsightsResponse {
  data: MetaInsight[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

// ============================================
// UTILITÁRIOS
// ============================================

function buildInsightsFields(_breakdowns?: string[]): string {
  // Nota: campos de breakdown (country, region, age, gender etc.) são
  // devolvidos automaticamente pela Meta API quando solicitados via
  // parâmetro `breakdowns`. Incluí-los em `fields` gera erro 400.
  return INSIGHTS_FIELDS_BASE.join(',');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data) : '');
}

function formatDate(date: Date): string {
  // toLocaleDateString com sv-SE retorna "YYYY-MM-DD" no timezone de SP
  // Evita bug de retornar o dia seguinte quando chamado após 21:00 SP (00:00 UTC)
  return date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

// ============================================
// META API CLIENT
// ============================================

async function fetchMetaInsightsForDay(
  accessToken: string,
  adAccountId: string,
  date: string,
  breakdowns?: string[]
): Promise<MetaInsight[]> {
  const allData: MetaInsight[] = [];
  let after: string | undefined;
  let pageCount = 0;

  const fields = buildInsightsFields(breakdowns);

  log(`📅 Buscando dados para ${date}${breakdowns ? ` (breakdowns: ${breakdowns.join(',')})` : ''}...`);

  do {
    const url = new URL(`${META_BASE_URL}/${adAccountId}/insights`);

    url.searchParams.append('access_token', accessToken);
    url.searchParams.append('fields', fields);
    url.searchParams.append('level', 'ad');
    url.searchParams.append('time_range', JSON.stringify({ since: date, until: date }));
    // since === until (1 dia), então isso é redundante hoje — mas explícito
    // para não depender do comportamento padrão da Meta se este código for
    // reaproveitado depois para ranges maiores. Ver bug corrigido em
    // sync-meta-ads (time_range sem time_increment soma o período inteiro
    // numa linha só).
    url.searchParams.append('time_increment', '1');
    url.searchParams.append('limit', PAGE_SIZE.toString());

    if (breakdowns && breakdowns.length > 0) {
      url.searchParams.append('breakdowns', breakdowns.join(','));
    }

    if (after) {
      url.searchParams.append('after', after);
    }

    log(`  Página ${pageCount + 1}...`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Meta API error ${response.status}: ${errorData.error?.message || response.statusText}`
      );
    }

    const data: MetaInsightsResponse = await response.json();

    if (data.data && data.data.length > 0) {
      allData.push(...data.data);
    }

    after = data.paging?.cursors?.after;
    pageCount++;

    // Delay entre páginas (respeitar rate limit)
    if (after) {
      await sleep(1000);
    }

  } while (after && pageCount < MAX_PAGES);

  log(`  ✅ ${allData.length} registros encontrados`);

  return allData;
}

// ============================================
// SUPABASE OPERATIONS
// ============================================

async function saveRawInsights(
  supabase: ReturnType<typeof createClient>,
  data: {
    workspace_id: string;
    api_endpoint: string;
    params: Record<string, unknown>;
    response_data: { data: MetaInsight[] };
    http_status: number;
    records_count: number;
    fetch_started_at: string;
    fetch_finished_at: string;
  }
): Promise<string> {
  const { data: result, error } = await supabase
    .from('meta_ads_raw_insights')
    .insert({
      workspace_id: data.workspace_id,
      api_endpoint: data.api_endpoint,
      params: data.params,
      response_data: data.response_data,
      http_status: data.http_status,
      records_count: data.records_count,
      fetch_started_at: data.fetch_started_at,
      fetch_finished_at: data.fetch_finished_at,
      processado_em: null,
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
  rawId: string
): Promise<{ insights_inseridos: number; breakdowns_inseridos: number }> {
  const { data, error } = await supabase.rpc('processar_meta_ads_raw', {
    p_raw_id: rawId,
  });

  if (error) {
    throw new Error(`Erro ao processar raw insights: ${error.message}`);
  }

  return data as { insights_inseridos: number; breakdowns_inseridos: number };
}

async function processRawInsightsBreakdown(
  supabase: ReturnType<typeof createClient>,
  rawId: string
): Promise<{ insights_inseridos: number; breakdowns_inseridos: number }> {
  const { data, error } = await supabase.rpc('processar_meta_ads_raw_region_breakdown', {
    p_raw_id: rawId,
  });

  if (error) {
    throw new Error(`Erro ao processar raw insights com breakdown: ${error.message}`);
  }

  return data as { insights_inseridos: number; breakdowns_inseridos: number };
}

// Busca o total oficial de investimento no nível de CONTA pra um único dia
// (não soma de anúncios) — ver comentário na migration
// create_meta_ads_account_daily e em syncAccountLevelSpend de sync-meta-ads.
async function syncAccountLevelSpendForDay(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  accessToken: string,
  adAccountId: string,
  date: string,
): Promise<void> {
  const url = new URL(`${META_BASE_URL}/${adAccountId}/insights`);
  url.searchParams.append('access_token', accessToken);
  url.searchParams.append('fields', 'spend,account_currency,date_start,date_stop');
  url.searchParams.append('level', 'account');
  url.searchParams.append('time_range', JSON.stringify({ since: date, until: date }));
  url.searchParams.append('time_increment', '1');

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
}

async function updateBackfillProgress(
  supabase: ReturnType<typeof createClient>,
  controleId: string,
  date: string,
  status: string,
  rawId?: string,
  registros?: number,
  error?: string
): Promise<void> {
  const { error: rpcError } = await supabase.rpc('atualizar_progresso_backfill', {
    p_controle_id: controleId,
    p_data: date,
    p_status: status,
    p_raw_id: rawId,
    p_registros: registros || 0,
    p_error: error,
  });

  if (rpcError) {
    log('Erro ao atualizar progresso:', rpcError);
  }
}

// ============================================
// MAIN BACKFILL LOGIC
// ============================================

async function processDay(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  accessToken: string,
  adAccountId: string,
  controleId: string,
  date: string,
  breakdowns?: string[]
): Promise<{ success: boolean; registros: number; error?: string }> {
  const fetchStartTime = new Date().toISOString();

  try {
    // Marcar como running
    await updateBackfillProgress(supabase, controleId, date, 'running');

    // Buscar dados da Meta
    const insights = await fetchMetaInsightsForDay(accessToken, adAccountId, date, breakdowns);
    const fetchEndTime = new Date().toISOString();

    // Se não tem dados, marcar como skipped
    if (insights.length === 0) {
      await updateBackfillProgress(supabase, controleId, date, 'skipped', undefined, 0);
      return { success: true, registros: 0 };
    }

    // Salvar JSON bruto
    const rawId = await saveRawInsights(supabase, {
      workspace_id: workspaceId,
      api_endpoint: '/insights',
      params: {
        workspace_id: workspaceId,
        level: 'ad',
        time_range: { since: date, until: date },
        fields: buildInsightsFields(breakdowns),
        account_id: adAccountId,
        ...(breakdowns ? { breakdowns } : {}),
      },
      response_data: { data: insights },
      http_status: 200,
      records_count: insights.length,
      fetch_started_at: fetchStartTime,
      fetch_finished_at: fetchEndTime,
    });

    // Processar dados com a função correta
    const hasBreakdowns = breakdowns && breakdowns.length > 0;
    const processResult = hasBreakdowns
      ? await processRawInsightsBreakdown(supabase, rawId)
      : await processRawInsights(supabase, rawId);

    // Nível de conta (total oficial) — não deve derrubar o dia se falhar,
    // já que o processamento por anúncio (granularidade) já está OK.
    try {
      await syncAccountLevelSpendForDay(supabase, workspaceId, accessToken, adAccountId, date);
    } catch (accError) {
      const msg = accError instanceof Error ? accError.message : String(accError);
      log(`⚠️ Falha ao sincronizar nível de conta em ${date} (não bloqueia o dia): ${msg}`);
    }

    // Marcar como sucesso
    await updateBackfillProgress(
      supabase,
      controleId,
      date,
      'success',
      rawId,
      processResult.insights_inseridos
    );

    return {
      success: true,
      registros: processResult.insights_inseridos
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    // Marcar como erro
    await updateBackfillProgress(supabase, controleId, date, 'error', undefined, 0, errorMessage);

    return { success: false, registros: 0, error: errorMessage };
  }
}

// ============================================
// MULTI-CONTA (Fase 15 — D3)
// ============================================

// Normaliza um account_id Meta: trim + prefixo act_ quando vem so o numero.
function normalizeMetaAccountId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

interface AccountBackfillResult {
  account_id: string;
  ok: boolean;
  message?: string;
  controle_id?: string;
  status?: string;
  dias_pendentes?: number;
  dias?: string[];
  dias_processados?: number;
  total_registros?: number;
  progresso?: string;
  percentual?: number;
  results?: unknown[];
  modo?: string;
  error?: string;
}

interface BackfillRunOptions {
  controle_id?: string;
  data_inicio?: string;
  data_fim?: string;
  max_dias: number | null;
  dry_run: boolean;
  breakdowns?: string[];
}

// Executa o backfill de UMA conta. As tabelas de controle
// (meta_ads_backfill_controle/_log) nao tem account_id — o progresso por dia
// e por controle — entao cada conta recebe o PROPRIO controle quando o caller
// nao informa `controle_id`. Os dados gravados carregam account_id nos params
// do raw (triggers/processadores ja validam).
// Nota de tipagem: o client é criado sem generics (SupabaseClient<any,...>) —
// ver comentário equivalente nas funções auxiliares pré-existentes.
async function runBackfillForAccount(
  supabase: SupabaseClient<any, 'public', any>,
  workspaceId: string,
  accessToken: string,
  accountId: string,
  opts: BackfillRunOptions,
): Promise<AccountBackfillResult> {
  // Se não tem controle_id, criar um novo backfill (um POR CONTA)
  let backfillId = opts.controle_id;

  if (!backfillId) {
    // Data padrão: 01/09/2025 até hoje
    const dataInicio = opts.data_inicio || '2025-09-01';
    const dataFim = opts.data_fim || formatDate(new Date());

    log(`Criando novo backfill (${accountId}): ${dataInicio} até ${dataFim}`);

    const { data, error } = await supabase.rpc('criar_backfill_meta_ads', {
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
    });

    if (error) {
      throw new Error(`Erro ao criar backfill: ${error.message}`);
    }

    backfillId = data;
    log(`Backfill criado (${accountId}): ${backfillId}`);
  }

  // Buscar informações do backfill
  const { data: backfillData, error: backfillError } = await supabase
    .from('meta_ads_backfill_controle')
    .select('*')
    .eq('id', backfillId)
    .single();

  if (backfillError || !backfillData) {
    throw new Error(`Backfill não encontrado: ${backfillId}`);
  }

  if (backfillData.status === 'completed') {
    return {
      account_id: accountId,
      ok: true,
      message: 'Backfill já completado',
      controle_id: backfillId,
      status: 'completed',
    };
  }

  if (backfillData.status === 'paused') {
    return {
      account_id: accountId,
      ok: false,
      error: 'Backfill está pausado. Use retomar_backfill_meta_ads() para continuar.',
      controle_id: backfillId,
      status: 'paused',
    };
  }

  // Buscar dias pendentes
  const { data: diasPendentes, error: diasError } = await supabase
    .from('meta_ads_backfill_log')
    .select('data')
    .eq('controle_id', backfillId)
    .eq('status', 'pending')
    .order('data', { ascending: true })
    .limit(opts.max_dias || 1000);

  if (diasError) {
    throw new Error(`Erro ao buscar dias pendentes: ${diasError.message}`);
  }

  if (!diasPendentes || diasPendentes.length === 0) {
    return {
      account_id: accountId,
      ok: true,
      message: 'Nenhum dia pendente',
      controle_id: backfillId,
      status: 'completed',
    };
  }

  log(`Processando ${diasPendentes.length} dias (${accountId})...`);

  if (opts.dry_run) {
    return {
      account_id: accountId,
      ok: true,
      message: 'Dry run - nenhum dado será salvo',
      controle_id: backfillId,
      dias_pendentes: diasPendentes.length,
      dias: diasPendentes.map(d => d.data),
      modo: opts.breakdowns ? 'breakdown' : 'padrao',
    };
  }

  // Atualizar status para running
  await supabase
    .from('meta_ads_backfill_controle')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', backfillId);

  // Processar cada dia
  const results = [];
  let totalRegistros = 0;
  let diasProcessados = 0;

  for (const dia of diasPendentes) {
    const date = dia.data;

    log(`\n📅 Processando ${date} (${diasProcessados + 1}/${diasPendentes.length}) [${accountId}]...`);

    const result = await processDay(
      supabase,
      workspaceId,
      accessToken,
      accountId,
      backfillId,
      date,
      opts.breakdowns
    );

    results.push({ date, ...result });

    if (result.success) {
      totalRegistros += result.registros;
      diasProcessados++;
    }

    // Delay entre dias (rate limiting)
    if (diasProcessados < diasPendentes.length) {
      log(`  ⏱️  Aguardando ${DELAY_MS}ms...`);
      await sleep(DELAY_MS);
    }

    // Verificar se deve continuar (header de cancelamento opcional)
    // Aqui poderia verificar um sinal de cancelamento se necessário
  }

  // Buscar status final
  const { data: statusFinal } = await supabase
    .from('meta_ads_backfill_controle')
    .select('*')
    .eq('id', backfillId)
    .single();

  return {
    account_id: accountId,
    ok: true,
    message: 'Backfill executado',
    controle_id: backfillId,
    dias_processados: diasProcessados,
    total_registros: totalRegistros,
    status: statusFinal?.status,
    progresso: `${statusFinal?.dias_processados}/${statusFinal?.total_dias}`,
    percentual: Math.round((statusFinal?.dias_processados / statusFinal?.total_dias) * 100),
    results: results,
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();

  log('========================================');
  log('🚀 Iniciando backfill Meta Ads');
  log('========================================');

  try {
    const guardResponse = requireServiceRoleCaller(req);
    if (guardResponse) return guardResponse;

    // Verificar método
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método não permitido. Use POST.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Carregar variáveis de ambiente
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis do Supabase não configuradas');
    }

    // Parse do body
    const body = await req.json().catch(() => ({}));
    const {
      workspace_id,
      controle_id,
      account_id,     // Fase 15: backfill de UMA conta (deve estar ativa no workspace)
      max_dias = null, // Limite de dias a processar (null = todos)
      dry_run = false,  // Se true, só simula sem salvar
      breakdowns
    } = body;

    if (typeof workspace_id !== 'string' || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'workspace_id obrigatorio (isolamento multi-tenant).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validação básica do parâmetro breakdowns
    if (breakdowns !== undefined && !Array.isArray(breakdowns)) {
      return new Response(
        JSON.stringify({ error: 'O parâmetro "breakdowns" deve ser um array de strings.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (breakdowns && breakdowns.some((b: unknown) => typeof b !== 'string')) {
      return new Response(
        JSON.stringify({ error: 'Todos os valores de "breakdowns" devem ser strings.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const normalizedBreakdowns = breakdowns && breakdowns.length > 0
      ? breakdowns as string[]
      : undefined;

    // Criar cliente Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Token resolvido UMA vez e reutilizado por todas as contas (abordagem 1,
    // docs/FASE-15-MULTI-CONTA-META.md).
    let metaAccessToken: string;
    try {
      const credential = await resolveWorkspaceCredential(
        supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0],
        workspace_id,
        'meta',
      );
      metaAccessToken = credential.apiKey;
    } catch (credentialError) {
      const message = credentialError instanceof Error ? credentialError.message : String(credentialError);
      log(`Credencial Meta indisponivel ou não autorizada para workspace ${workspace_id}: ${message}`);
      return new Response(
        JSON.stringify({ error: 'Credencial Meta indisponivel ou conta não autorizada para o workspace.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fase 15 (D1/D3): o escopo do backfill são as contas ATIVAS em
    // workspace_meta_ad_accounts (única fonte de verdade do vínculo
    // conta ↔ workspace). Fail-closed: nenhuma conta ativa = nada a fazer.
    const { data: activeRows, error: activeError } = await supabase
      .from('workspace_meta_ad_accounts')
      .select('account_id')
      .eq('workspace_id', workspace_id)
      .eq('is_active', true);

    if (activeError) {
      log(`Erro ao validar vínculo conta/workspace ${workspace_id}: ${activeError.message}`);
      return new Response(
        JSON.stringify({ error: 'Credencial Meta indisponivel ou conta não autorizada para o workspace.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const activeAccounts: string[] = [];
    for (const row of (activeRows ?? []) as { account_id: string }[]) {
      const normalized = normalizeMetaAccountId(row.account_id);
      if (normalized && !activeAccounts.includes(normalized)) {
        activeAccounts.push(normalized);
      }
    }

    let targetAccounts: string[];
    if (account_id !== undefined) {
      const wanted = normalizeMetaAccountId(account_id);
      if (!wanted || !activeAccounts.includes(wanted)) {
        log(`Conta Meta ${wanted || String(account_id)} não está ativa para o workspace ${workspace_id}.`);
        return new Response(
          JSON.stringify({ error: 'Conta Meta informada não está ativa para este workspace.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      targetAccounts = [wanted];
    } else {
      targetAccounts = activeAccounts;
    }

    if (targetAccounts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma conta Meta ativa vinculada a este workspace.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // As tabelas de controle não têm account_id: um controle retoma o
    // backfill de UMA conta. Com várias contas alvo, exigir account_id.
    if (controle_id && targetAccounts.length > 1) {
      return new Response(
        JSON.stringify({
          error: 'controle_id retoma o backfill de uma única conta — informe também account_id (o workspace tem várias contas ativas).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Itera as contas com ISOLAMENTO DE FALHA (D3): erro de uma conta é
    // registrado no resultado agregado e não aborta as demais. Cada conta
    // recebe o PRÓPRIO controle de backfill (as tabelas de controle não têm
    // account_id) quando controle_id não é informado.
    const accountResults: AccountBackfillResult[] = [];
    for (let i = 0; i < targetAccounts.length; i++) {
      const accountId = targetAccounts[i];
      log(`▶ Conta ${accountId} (${i + 1}/${targetAccounts.length})`);
      try {
        accountResults.push(await runBackfillForAccount(
          supabase,
          workspace_id,
          metaAccessToken,
          accountId,
          {
            controle_id,
            data_inicio: body.data_inicio,
            data_fim: body.data_fim,
            max_dias,
            dry_run,
            breakdowns: normalizedBreakdowns,
          },
        ));
      } catch (accountError) {
        const msg = accountError instanceof Error ? accountError.message : String(accountError);
        log(`❌ ERRO no backfill da conta ${accountId}: ${msg}`);
        accountResults.push({ account_id: accountId, ok: false, error: msg });
      }

      // Rate limiting entre contas (o token é o mesmo)
      if (!dry_run && i < targetAccounts.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    log('========================================');
    log('✅ Backfill concluído!');
    log('========================================');

    const allOk = accountResults.every((r) => r.ok);
    const noneOk = accountResults.every((r) => !r.ok);

    // Compat single-conta: campos de topo idênticos ao formato anterior.
    if (accountResults.length === 1) {
      const r = accountResults[0];
      if (!r.ok) {
        const paused = r.status === 'paused';
        return new Response(
          JSON.stringify({
            success: false,
            error: r.error,
            controle_id: r.controle_id,
            status: r.status,
            accounts: accountResults,
          }),
          { status: paused ? 400 : 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: r.message,
          controle_id: r.controle_id,
          ...(r.dias_pendentes !== undefined ? { dias_pendentes: r.dias_pendentes } : {}),
          ...(r.dias !== undefined ? { dias: r.dias } : {}),
          ...(r.dias_processados !== undefined ? { dias_processados: r.dias_processados } : {}),
          ...(r.total_registros !== undefined ? { total_registros: r.total_registros } : {}),
          breakdowns: normalizedBreakdowns || null,
          ...(r.modo ? { modo: r.modo } : {}),
          status: r.status,
          ...(r.progresso ? { progresso: r.progresso } : {}),
          ...(r.percentual !== undefined ? { percentual: r.percentual } : {}),
          ...(r.results ? { results: r.results } : {}),
          accounts: accountResults,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Multi-conta: agregado por conta. 500 só quando NENHUMA conta rodou
    // (compat com o erro geral anterior).
    if (noneOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foi possível concluir o backfill em nenhuma conta.',
          accounts: accountResults,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: allOk,
        message: allOk
          ? 'Backfill executado'
          : 'Backfill executado com falhas em algumas contas',
        dias_processados: accountResults.reduce((s, r) => s + (r.dias_processados ?? 0), 0),
        total_registros: accountResults.reduce((s, r) => s + (r.total_registros ?? 0), 0),
        breakdowns: normalizedBreakdowns || null,
        accounts: accountResults,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    log('❌ ERRO no backfill:', errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
