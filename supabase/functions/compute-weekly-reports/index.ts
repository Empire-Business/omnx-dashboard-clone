// Edge Function: compute-weekly-reports
// Orquestra o cálculo de snapshots semanais (cohort ou produtividade)
// para os módulos solicitados e persiste nas tabelas tipadas.
//
// Payload:
//   POST /compute-weekly-reports
//   {
//     "week_start": "2026-05-12",        // segunda-feira da semana (obrigatório)
//     "report_type": "produtividade",    // "cohort" | "produtividade"
//     "modules": ["trafego", "aquisicao", "organico"],  // omitir = todos
//     "dry_run": false,                  // true = só calcula, não persiste
//     "workspace_id": "<uuid>"           // obrigatório — isolamento por workspace
//   }
//
// Resposta:
//   { "success": true, "snapshot_id": 42, "module_results": { "trafego": { "inserted": 3, "errors": [] } } }

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';
const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L';

const ALLOWED_ORIGINS = [
  'https://ceo.omnx.pro',
  'http://localhost:3222',
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };
}

const ALL_MODULES = [
  'trafego', 'aquisicao', 'organico',
  'prevendas', 'vendas', 'recuperacao',
  'sdr', 'closer', 'metas',
] as const;

export type ModuleKey = typeof ALL_MODULES[number];
export type ReportType = 'cohort' | 'produtividade';

interface ComputePayload {
  week_start: string;
  report_type: ReportType;
  modules?: ModuleKey[];
  dry_run?: boolean;
  workspace_id: string;
  reprocess?: boolean;
}

interface ModuleResult {
  inserted: number;
  errors: string[];
}

interface ComputeResponse {
  success: boolean;
  snapshot_id: number | null;
  duration_ms: number;
  module_results: Record<string, ModuleResult>;
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function spDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // Garante formato YYYY-MM-DD
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function safeDiv(num: number, den: number): number | null {
  return den !== 0 ? Number((num / den).toFixed(4)) : null;
}

// =============================================================================
// SNAPSHOT MANAGEMENT
// =============================================================================

async function ensureSnapshot(
  supabase: SupabaseClient<any, 'public', any>,
  weekStart: string,
  weekEnd: string,
  reportType: ReportType,
  workspaceId: string | null,
): Promise<{ id: number; data_version: number; workspace_id: string | null } | null> {
  const yearWeek = `${weekStart.slice(0, 4)}-W${getWeekNumber(new Date(weekStart + 'T00:00:00'))}`;

  // Tenta encontrar snapshot existente isolado por workspace.
  const { data: existingRaw } = await supabase
    .from('weekly_snapshots')
    .select('id, data_version, workspace_id')
    .eq('workspace_id', workspaceId as string)
    .eq('week_start', weekStart)
    .eq('report_type', reportType)
    .maybeSingle();

  const existing = existingRaw as { id: number; data_version: number; workspace_id: string | null } | null;

  if (existing) {
    // Atualiza status para computing e incrementa version
    const { data: updated, error } = await supabase
      .from('weekly_snapshots')
      .update({
        status: 'computing',
        data_version: existing.data_version + 1,
        updated_at: new Date().toISOString(),
        workspace_id: workspaceId,
      })
      .eq('id', existing.id)
      .select('id, data_version, workspace_id')
      .single();

    if (error || !updated) {
      console.error('Failed to update snapshot:', error);
      return null;
    }
    return {
      id: updated.id as number,
      data_version: updated.data_version as number,
      workspace_id: updated.workspace_id as string | null,
    };
  }

  // Cria novo snapshot
  // NOTA: week_end é GENERATED ALWAYS AS (week_start + 6) — não inserir
  const { data: created, error } = await supabase
    .from('weekly_snapshots')
    .insert({
      week_start: weekStart,
      year_week: yearWeek,
      report_type: reportType,
      status: 'computing',
      data_version: 1,
      workspace_id: workspaceId,
    })
    .select('id, data_version, workspace_id')
    .single();

  if (error || !created) {
    console.error('Failed to create snapshot:', error);
    return null;
  }
  return {
    id: created.id as number,
    data_version: created.data_version as number,
    workspace_id: created.workspace_id as string | null,
  };
}

export function getWeekNumber(input: Date): number {
  const d = new Date(input.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

async function finalizeSnapshot(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  status: 'completed' | 'failed',
  durationMs: number,
  recordsProcessed: number,
  errorMessage?: string,
) {
  const update: Record<string, unknown> = {
    status,
    computed_at: new Date().toISOString(),
    computation_duration_ms: durationMs,
    records_processed: recordsProcessed,
    error_message: errorMessage || null,
  };

  if (status === 'completed') {
    update.error_message = null;
  }

  const { error } = await supabase
    .from('weekly_snapshots')
    .update(update)
    .eq('id', snapshotId);

  if (error) {
    console.error('Failed to finalize snapshot:', error);
  }
}

// =============================================================================
// CALCULADORES POR MÓDULO
// =============================================================================

// -------------------------------
// 1. TRÁFEGO — Produtividade
// -------------------------------
export async function computeTrafegoProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  // Para cada dimensão, calcular métricas
  // MVP: apenas dimensão 'todos' (total do módulo)
  // TODO: implementar dimension breakdown (canal, funil, campanha, etc.)

  for (const dim of dimensions) {
    try {
      // --- Leads gerados na semana (data_lead_recebido) ---
      const leadsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: leadsCount, error: leadsErr } = workspaceId
        ? await leadsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsCountQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);

      // --- MQLs (leads com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const fechadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: fechadosCount, error: fechadosErr } = workspaceId
        ? await fechadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await fechadosCountQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Faturamento bruto (vendas_fechamento.valor_faturado para opps fechadas na semana) ---
      // Busca IDs das oportunidades fechadas na semana
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: oppsFechadasErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (oppsFechadasErr) throw new Error(`opps_fechadas: ${oppsFechadasErr.message}`);

      let faturamentoBruto = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada com data_pagamento_entrada na semana) ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);

      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Meta Ads (spend, impressions, clicks na semana) ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend, impressions, clicks, leads')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);

      const metaSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);
      const metaImpressions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).impressions) || 0), 0);
      const metaClicks = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).clicks) || 0), 0);
      const metaLeadsActions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).leads) || 0), 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const cpmql = safeDiv(metaSpend, mqlsCount || 0);
      const cpv = safeDiv(metaSpend, fechadosCount || 0);
      const roas = safeDiv(faturamentoBruto, metaSpend);
      const roasCaixa = safeDiv(caixaRecebido, metaSpend);
      const ctr = safeDiv(metaClicks, metaImpressions);
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        meta_spend: Number(metaSpend.toFixed(2)),
        meta_impressions: metaImpressions,
        meta_clicks: metaClicks,
        meta_leads_actions: metaLeadsActions,
        cpmql,
        cpv,
        roas,
        roas_caixa: roasCaixa,
        ctr,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] trafego row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_trafego')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`trafego[${dim}]: ${msg}`);
    }
  }

  return result;
}


// -------------------------------
// 1b. TRÁFEGO — Cohort
// -------------------------------
async function computeTrafegoCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;

      // --- Métricas de funil (cumulativas — em qualquer data) ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- MQLs (leads da semana com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto (vendas_fechamento.valor_faturado de opps da semana) ---
      let faturamentoBruto = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada de opps da semana) ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Meta Ads (spend, impressions, clicks na semana) — mesmo que produtividade ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend, impressions, clicks, leads')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);

      const metaSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);
      const metaImpressions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).impressions) || 0), 0);
      const metaClicks = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).clicks) || 0), 0);
      const metaLeadsActions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).leads) || 0), 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const cpmql = safeDiv(metaSpend, mqlsCount || 0);
      const cpv = safeDiv(metaSpend, fechadosCount || 0);
      const roas = safeDiv(faturamentoBruto, metaSpend);
      const roasCaixa = safeDiv(caixaRecebido, metaSpend);
      const ctr = safeDiv(metaClicks, metaImpressions);
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        meta_spend: Number(metaSpend.toFixed(2)),
        meta_impressions: metaImpressions,
        meta_clicks: metaClicks,
        meta_leads_actions: metaLeadsActions,
        cpmql,
        cpv,
        roas,
        roas_caixa: roasCaixa,
        ctr,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] trafego cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_trafego')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`trafego[${dim}]: ${msg}`);
    }
  }

  return result;
}


// -------------------------------
// 2. AQUISIÇÃO — Produtividade
// -------------------------------
async function computeAquisicaoProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads gerados na semana (data_lead_recebido) ---
      const leadsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: leadsCount, error: leadsErr } = workspaceId
        ? await leadsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsCountQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);

      // --- MQLs (leads com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const fechadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: fechadosCount, error: fechadosErr } = workspaceId
        ? await fechadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await fechadosCountQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Faturamento bruto e valor_entrada (vendas_fechamento das opps fechadas na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: oppsFechadasErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (oppsFechadasErr) throw new Error(`opps_fechadas: ${oppsFechadasErr.message}`);

      let faturamentoBruto = 0;
      let valorEntrada = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        valorEntrada = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada com data_pagamento_entrada na semana) ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);

      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Meta Ads (spend, impressions, clicks na semana) ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend, impressions, clicks, leads')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);

      const metaSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);
      const metaImpressions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).impressions) || 0), 0);
      const metaClicks = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).clicks) || 0), 0);
      const metaLeadsActions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).leads) || 0), 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const cpmql = safeDiv(metaSpend, mqlsCount || 0);
      const cpv = safeDiv(metaSpend, fechadosCount || 0);
      const roas = safeDiv(faturamentoBruto, metaSpend);
      const roasCaixa = safeDiv(caixaRecebido, metaSpend);
      const ctr = safeDiv(metaClicks, metaImpressions);
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        valor_entrada: Number(valorEntrada.toFixed(2)),
        meta_spend: Number(metaSpend.toFixed(2)),
        meta_impressions: metaImpressions,
        meta_clicks: metaClicks,
        meta_leads_actions: metaLeadsActions,
        cpmql,
        cpv,
        roas,
        roas_caixa: roasCaixa,
        ctr,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] aquisicao row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_aquisicao')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`aquisicao[${dim}]: ${msg}`);
    }
  }

  return result;
}

// -------------------------------
// 3. ORGÂNICO — Produtividade
// -------------------------------
async function computeOrganicoProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads gerados na semana (data_lead_recebido) ---
      const leadsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: leadsCount, error: leadsErr } = workspaceId
        ? await leadsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsCountQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);

      // --- MQLs (leads com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const fechadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: fechadosCount, error: fechadosErr } = workspaceId
        ? await fechadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await fechadosCountQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Faturamento bruto (vendas_fechamento.valor_faturado de opps fechadas na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: oppsFechadasErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (oppsFechadasErr) throw new Error(`opps_fechadas: ${oppsFechadasErr.message}`);

      let faturamentoBruto = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada com data_pagamento_entrada na semana) ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);

      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] organico row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_organico')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`organico[${dim}]: ${msg}`);
    }
  }

  return result;
}

// -------------------------------
// STUBS: Pré-Vendas, Vendas, Recuperação, SDR, Closer, Metas — Produtividade
// -------------------------------
async function computePrevendasProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads recebidos na semana ---
      const leadsDataQuery = supabase
        .from('oportunidades')
        .select('id, data_conectado, contatos!inner(workspace_id)')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: leadsData, error: leadsErr } = workspaceId
        ? await leadsDataQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsDataQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);
      const leadsCount = leadsData?.length || 0;
      const leadsSemResposta = (leadsData || []).filter((o: Record<string, unknown>) => o.data_conectado == null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: fechadosErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);
      const fechadosCount = oppsFechadas?.length || 0;

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Comunicações (TODO: validar schema da tabela comunicacoes para SDR) ---
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: leadsSemResposta,
        avg_response_seconds: avgResponseSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_sem_resposta_pct: taxaSemResposta,
      };

      if (dryRun) {
        console.log('[DRY RUN] prevendas row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_prevendas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`prevendas[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeVendasProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads recebidos na semana ---
      const leadsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: leadsCount, error: leadsErr } = workspaceId
        ? await leadsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsCountQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: fechadosErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);
      const fechadosCount = oppsFechadas?.length || 0;

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Perdidos detalhe (após reunião vs sem reunião) ---
      const perdidosDetailQuery = supabase
        .from('oportunidades')
        .select('data_realizacao_vendas, contatos!inner(workspace_id)')
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: perdidosDetail, error: perdidosDetailErr } = workspaceId
        ? await perdidosDetailQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosDetailQuery;

      if (perdidosDetailErr) throw new Error(`perdidos_detail: ${perdidosDetailErr.message}`);
      const perdidosAposReuniao = (perdidosDetail || []).filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const perdidosSemReuniao = (perdidosDetail || []).filter((o: Record<string, unknown>) => o.data_realizacao_vendas == null).length;

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      let valorEntrada = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        valorEntrada = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Caixa recebido (valor_entrada com data_pagamento_entrada na semana) ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Ciclo de fechamento (média dias entre reunião e fechado) ---
      const cicloDataQuery = supabase
        .from('oportunidades')
        .select('data_realizacao_vendas, data_fechado, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .not('data_realizacao_vendas', 'is', null);
      const { data: cicloData, error: cicloErr } = workspaceId
        ? await cicloDataQuery.eq('contatos.workspace_id', workspaceId)
        : await cicloDataQuery;

      if (cicloErr) throw new Error(`ciclo: ${cicloErr.message}`);
      let cicloFechamentoDias = null;
      if (cicloData && cicloData.length > 0) {
        const dias = cicloData.map((o: Record<string, unknown>) => {
          const d1 = new Date(o.data_realizacao_vendas as string);
          const d2 = new Date(o.data_fechado as string);
          return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
        });
        cicloFechamentoDias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      }

      // --- Comunicações (TODO: validar schema da tabela comunicacoes) ---
      // TODO: ajustar filtro de comunicacoes para closer_name/owner_name quando schema for validado
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaComparecimento = safeDiv((reunioesCount || 0), ((reunioesCount || 0) + (noShowsCount || 0))) ? Number(((reunioesCount || 0) / ((reunioesCount || 0) + (noShowsCount || 0)) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        perdidos_apos_reuniao: perdidosAposReuniao,
        perdidos_sem_reuniao: perdidosSemReuniao,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        valor_entrada: Number(valorEntrada.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        avg_response_seconds: avgResponseSeconds,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_comparecimento_pct: taxaComparecimento,
        ciclo_fechamento_dias: cicloFechamentoDias,
      };

      if (dryRun) {
        console.log('[DRY RUN] vendas row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_vendas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`vendas[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeRecuperacaoProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads recebidos na semana ---
      const leadsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: leadsCount, error: leadsErr } = workspaceId
        ? await leadsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsCountQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: fechadosErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);
      const fechadosCount = oppsFechadas?.length || 0;

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Perdidos (data_perdido na semana) ---
      const perdidosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: perdidosCount, error: perdidosErr } = workspaceId
        ? await perdidosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await perdidosCountQuery;

      if (perdidosErr) throw new Error(`perdidos: ${perdidosErr.message}`);

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Comunicações (TODO: validar schema da tabela comunicacoes) ---
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: 0,
        avg_response_seconds: avgResponseSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
      };

      if (dryRun) {
        console.log('[DRY RUN] recuperacao row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_recuperacao')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`recuperacao[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeSdrProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads recebidos na semana ---
      const leadsDataQuery = supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, contatos!inner(workspace_id)')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: leadsData, error: leadsErr } = workspaceId
        ? await leadsDataQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsDataQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);
      const leadsCount = leadsData?.length || 0;
      const leadsSemResposta = (leadsData || []).filter((o: Record<string, unknown>) => o.data_conectado == null).length;

      // --- Conectados (data_conectado na semana) ---
      const conectadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_conectado', weekStart)
        .lte('data_conectado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: conectadosCount, error: conectadosErr } = workspaceId
        ? await conectadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await conectadosCountQuery;

      if (conectadosErr) throw new Error(`conectados: ${conectadosErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosDataQuery = supabase
        .from('oportunidades')
        .select('data_conectado, data_agendamento_reuniao, contatos!inner(workspace_id)')
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: agendadosData, error: agendadosErr } = workspaceId
        ? await agendadosDataQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosDataQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);
      const agendadosCount = agendadosData?.length || 0;

      // --- Agendados no prazo (<= 24h do conectado) ---
      const agendadosNoPrazo = (agendadosData || []).filter((o: Record<string, unknown>) => {
        if (!o.data_conectado || !o.data_agendamento_reuniao) return false;
        const d1 = new Date(o.data_conectado as string).getTime();
        const d2 = new Date(o.data_agendamento_reuniao as string).getTime();
        return (d2 - d1) <= 24 * 60 * 60 * 1000;
      }).length;

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: fechadosErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);
      const fechadosCount = oppsFechadas?.length || 0;

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Comunicações ---
      // TODO: implementar quando dados de comunicacoes estiverem disponiveis
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;
      const ultimaRespostaSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, conectadosCount || 0) ? Number(((agendadosCount || 0) / (conectadosCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamentoPrazo = safeDiv(agendadosNoPrazo || 0, agendadosCount || 0) ? Number(((agendadosNoPrazo || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        agendados_no_prazo: agendadosNoPrazo,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: leadsSemResposta,
        avg_response_seconds: avgResponseSeconds,
        ultima_resposta_seconds: ultimaRespostaSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_agendamento_prazo_pct: taxaAgendamentoPrazo,
        taxa_conversao_pct: taxaConversao,
        taxa_sem_resposta_pct: taxaSemResposta,
      };

      if (dryRun) {
        console.log('[DRY RUN] sdr row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_sdr')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`sdr[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeCloserProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Leads recebidos na semana (para leads_sem_resposta) ---
      const leadsDataQuery = supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, contatos!inner(workspace_id)')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: leadsData, error: leadsErr } = workspaceId
        ? await leadsDataQuery.eq('contatos.workspace_id', workspaceId)
        : await leadsDataQuery;

      if (leadsErr) throw new Error(`leads: ${leadsErr.message}`);
      const leadsCount = leadsData?.length || 0;
      const leadsSemResposta = (leadsData || []).filter((o: Record<string, unknown>) => o.data_realizacao_vendas == null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Agendados (data_agendamento_reuniao na semana) ---
      const agendadosCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: agendadosCount, error: agendadosErr } = workspaceId
        ? await agendadosCountQuery.eq('contatos.workspace_id', workspaceId)
        : await agendadosCountQuery;

      if (agendadosErr) throw new Error(`agendados: ${agendadosErr.message}`);

      // --- Reuniões (data_realizacao_vendas na semana) ---
      const reunioesCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_realizacao_vendas', weekStart)
        .lte('data_realizacao_vendas', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: reunioesCount, error: reunioesErr } = workspaceId
        ? await reunioesCountQuery.eq('contatos.workspace_id', workspaceId)
        : await reunioesCountQuery;

      if (reunioesErr) throw new Error(`reunioes: ${reunioesErr.message}`);

      // --- Fechados (data_fechado na semana) ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, data_fechado, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: fechadosErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (fechadosErr) throw new Error(`fechados: ${fechadosErr.message}`);
      const fechadosCount = oppsFechadas?.length || 0;

      // --- No-shows (data_no_show na semana) ---
      const noShowsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_no_show', weekStart)
        .lte('data_no_show', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .is('data_realizacao_vendas', null);
      const { count: noShowsCount, error: noShowsErr } = workspaceId
        ? await noShowsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await noShowsCountQuery;

      if (noShowsErr) throw new Error(`no_shows: ${noShowsErr.message}`);

      // --- Negociação (data_negociacao na semana) ---
      const negociacaoCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_negociacao', weekStart)
        .lte('data_negociacao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: negociacaoCount, error: negociacaoErr } = workspaceId
        ? await negociacaoCountQuery.eq('contatos.workspace_id', workspaceId)
        : await negociacaoCountQuery;

      if (negociacaoErr) throw new Error(`negociacao: ${negociacaoErr.message}`);

      // --- Faturamento bruto e caixa (das opps fechadas na semana) ---
      let faturamentoBruto = 0;
      let caixaRecebido = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        caixaRecebido = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Ciclo de fechamento (média dias entre reunião e fechado) ---
      let cicloFechamentoDias = null;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const comReuniao = oppsFechadas.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null);
        if (comReuniao.length > 0) {
          const dias = comReuniao.map((o: Record<string, unknown>) => {
            const d1 = new Date(o.data_realizacao_vendas as string);
            const d2 = new Date(o.data_fechado as string);
            return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
          });
          cicloFechamentoDias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
        }
      }

      // --- Comunicações ---
      // TODO: implementar quando dados de comunicacoes estiverem disponiveis
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaComparecimento = safeDiv((reunioesCount || 0), ((reunioesCount || 0) + (noShowsCount || 0))) ? Number(((reunioesCount || 0) / ((reunioesCount || 0) + (noShowsCount || 0)) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        avg_response_seconds: avgResponseSeconds,
        leads_sem_resposta: leadsSemResposta,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_comparecimento_pct: taxaComparecimento,
        taxa_sem_resposta_pct: taxaSemResposta,
        ciclo_fechamento_dias: cicloFechamentoDias,
      };

      if (dryRun) {
        console.log('[DRY RUN] closer row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_closer')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`closer[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeMetasProdutividade(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Metas (targets) — buscar em metas_ads se existir ---
      let metaMqlTarget: number | null = null;
      let metaCpmqlTarget: number | null = null;
      let metaSpendTarget: number | null = null;
      let metaVendasTarget: number | null = null;

      // Tenta formato wide (metas_ads) ou formato long (metas)
      try {
        const metasDataQuery = supabase
          .from('metas_ads')
          .select('meta_mql, meta_cpmql, meta_spend, meta_vendas')
          .lte('periodo_inicio', weekEnd)
          .gte('periodo_fim', weekStart);
        const { data: metasData, error: metasErr } = workspaceId
          ? await metasDataQuery.eq('workspace_id', workspaceId).maybeSingle()
          : await metasDataQuery.maybeSingle();

        if (!metasErr && metasData) {
          metaMqlTarget = Number(metasData.meta_mql) || null;
          metaCpmqlTarget = Number(metasData.meta_cpmql) || null;
          metaSpendTarget = Number(metasData.meta_spend) || null;
          metaVendasTarget = Number(metasData.meta_vendas) || null;
        }
      } catch {
        // Fallback: formato long da tabela metas
        try {
          const metasRowsQuery = supabase
            .from('metas')
            .select('tipo, valor')
            .eq('referencia', 'global')
            .lte('periodo_inicio', weekEnd)
            .gte('periodo_fim', weekStart);
          const { data: metasRows, error: metasErr2 } = workspaceId
            ? await metasRowsQuery.eq('workspace_id', workspaceId)
            : await metasRowsQuery;

          if (!metasErr2 && metasRows) {
            for (const row of metasRows) {
              if (row.tipo === 'mql_count_trafego') metaMqlTarget = Number(row.valor) || null;
              if (row.tipo === 'custo_mql_trafego') metaCpmqlTarget = Number(row.valor) || null;
              if (row.tipo === 'agendamentos_sdr') metaVendasTarget = Number(row.valor) || null;
            }
          }
        } catch {
          // Nenhuma tabela de metas disponível
        }
      }

      // --- Realizado MQL (mesma query do trafego) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Realizado Spend ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);
      const realizadoSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);

      // --- Realizado Vendas (fechados na semana) ---
      const vendasCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: vendasCount, error: vendasErr } = workspaceId
        ? await vendasCountQuery.eq('contatos.workspace_id', workspaceId)
        : await vendasCountQuery;

      if (vendasErr) throw new Error(`vendas: ${vendasErr.message}`);

      // --- Realizado Faturamento ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: oppsFechadasErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (oppsFechadasErr) throw new Error(`opps_fechadas: ${oppsFechadasErr.message}`);

      let realizadoFaturamento = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        realizadoFaturamento = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Realizado Caixa (valor_entrada com data_pagamento_entrada na semana) ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const realizadoCaixa = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const realizadoCpmql = safeDiv(realizadoSpend, mqlsCount || 0);

      const pctAtingidoMql = (metaMqlTarget != null && metaMqlTarget > 0) ? Number(((mqlsCount || 0) / metaMqlTarget * 100).toFixed(2)) : null;
      const pctAtingidoVendas = (metaVendasTarget != null && metaVendasTarget > 0) ? Number(((vendasCount || 0) / metaVendasTarget * 100).toFixed(2)) : null;
      const pctAtingidoSpend = (metaSpendTarget != null && metaSpendTarget > 0) ? Number(((realizadoSpend || 0) / metaSpendTarget * 100).toFixed(2)) : null;

      // Ideal dia (meta / 22 dias úteis como padrão)
      const idealDiaMql = (metaMqlTarget != null && metaMqlTarget > 0) ? Number((metaMqlTarget / 22).toFixed(2)) : null;
      const idealDiaVendas = (metaVendasTarget != null && metaVendasTarget > 0) ? Number((metaVendasTarget / 22).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        meta_mql_target: metaMqlTarget,
        meta_cpmql_target: metaCpmqlTarget,
        meta_spend_target: metaSpendTarget,
        meta_vendas_target: metaVendasTarget,
        realizado_mql: mqlsCount || 0,
        realizado_spend: Number(realizadoSpend.toFixed(2)),
        realizado_vendas: vendasCount || 0,
        realizado_faturamento: Number(realizadoFaturamento.toFixed(2)),
        realizado_caixa: Number(realizadoCaixa.toFixed(2)),
        realizado_cpmql: realizadoCpmql,
        pct_atingido_mql: pctAtingidoMql,
        pct_atingido_vendas: pctAtingidoVendas,
        pct_atingido_spend: pctAtingidoSpend,
        ideal_dia_mql: idealDiaMql,
        ideal_dia_vendas: idealDiaVendas,
      };

      if (dryRun) {
        console.log('[DRY RUN] metas row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_metas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`metas[${dim}]: ${msg}`);
    }
  }

  return result;
}

// -------------------------------
// STUBS: Cohort para todos os módulos (exceto trafego)
// -------------------------------
async function computeAquisicaoCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;

      // --- Métricas de funil (cumulativas — em qualquer data) ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- MQLs (leads da semana com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto e valor_entrada (vendas_fechamento das opps da semana) ---
      let faturamentoBruto = 0;
      let valorEntrada = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        valorEntrada = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada das opps da semana) ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Meta Ads (spend, impressions, clicks na semana) ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend, impressions, clicks, leads')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);

      const metaSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);
      const metaImpressions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).impressions) || 0), 0);
      const metaClicks = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).clicks) || 0), 0);
      const metaLeadsActions = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).leads) || 0), 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const cpmql = safeDiv(metaSpend, mqlsCount || 0);
      const cpv = safeDiv(metaSpend, fechadosCount || 0);
      const roas = safeDiv(faturamentoBruto, metaSpend);
      const roasCaixa = safeDiv(caixaRecebido, metaSpend);
      const ctr = safeDiv(metaClicks, metaImpressions);
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        valor_entrada: Number(valorEntrada.toFixed(2)),
        meta_spend: Number(metaSpend.toFixed(2)),
        meta_impressions: metaImpressions,
        meta_clicks: metaClicks,
        meta_leads_actions: metaLeadsActions,
        cpmql,
        cpv,
        roas,
        roas_caixa: roasCaixa,
        ctr,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] aquisicao cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_aquisicao')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`aquisicao[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeOrganicoCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;

      // --- Métricas de funil (cumulativas — em qualquer data) ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- MQLs (leads da semana com tag MQL) ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto (vendas_fechamento.valor_faturado de opps da semana) ---
      let faturamentoBruto = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido (vendas_fechamento.valor_entrada de opps da semana) ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
      };

      if (dryRun) {
        console.log('[DRY RUN] organico cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_organico')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`organico[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computePrevendasCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;
      const leadsSemResposta = opps.filter((o: Record<string, unknown>) => o.data_conectado == null).length;

      // --- Métricas de funil (cumulativas) ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Comunicações (TODO: validar schema da tabela comunicacoes para SDR) ---
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: leadsSemResposta,
        avg_response_seconds: avgResponseSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_sem_resposta_pct: taxaSemResposta,
      };

      if (dryRun) {
        console.log('[DRY RUN] prevendas cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_prevendas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`prevendas cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeVendasCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, data_agendamento_reuniao, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;

      // --- Métricas de funil (cumulativas) ---
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- Perdidos detalhe (após reunião vs sem reunião) ---
      const perdidosAposReuniao = opps.filter((o: Record<string, unknown>) => o.data_perdido != null && o.data_realizacao_vendas != null).length;
      const perdidosSemReuniao = opps.filter((o: Record<string, unknown>) => o.data_perdido != null && o.data_realizacao_vendas == null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      let valorEntrada = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        valorEntrada = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Ciclo de fechamento (média dias entre reunião e fechado na base) ---
      const oppsFechadasComReuniao = opps.filter((o: Record<string, unknown>) => o.data_fechado != null && o.data_realizacao_vendas != null);
      let cicloFechamentoDias = null;
      if (oppsFechadasComReuniao.length > 0) {
        const dias = oppsFechadasComReuniao.map((o: Record<string, unknown>) => {
          const d1 = new Date(o.data_realizacao_vendas as string);
          const d2 = new Date(o.data_fechado as string);
          return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
        });
        cicloFechamentoDias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      }

      // --- Comunicações (TODO: validar schema da tabela comunicacoes) ---
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaComparecimento = safeDiv((reunioesCount || 0), ((reunioesCount || 0) + (noShowsCount || 0))) ? Number(((reunioesCount || 0) / ((reunioesCount || 0) + (noShowsCount || 0)) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        perdidos_apos_reuniao: perdidosAposReuniao,
        perdidos_sem_reuniao: perdidosSemReuniao,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        valor_entrada: Number(valorEntrada.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        avg_response_seconds: avgResponseSeconds,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_comparecimento_pct: taxaComparecimento,
        ciclo_fechamento_dias: cicloFechamentoDias,
      };

      if (dryRun) {
        console.log('[DRY RUN] vendas cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_vendas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`vendas cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeRecuperacaoCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: oportunidades com data_lead_recebido na semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select(
          'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, contatos!inner(workspace_id)',
        )
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;

      // --- Métricas de funil (cumulativas) ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;
      const perdidosCount = opps.filter((o: Record<string, unknown>) => o.data_perdido != null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Comunicações (TODO: validar schema da tabela comunicacoes) ---
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, mqlsCount || 0) ? Number(((agendadosCount || 0) / (mqlsCount || 0) * 100).toFixed(2)) : null;
      const taxaReuniao = safeDiv(reunioesCount || 0, agendadosCount || 0) ? Number(((reunioesCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        perdidos_count: perdidosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: 0,
        avg_response_seconds: avgResponseSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_reuniao_pct: taxaReuniao,
        taxa_conversao_pct: taxaConversao,
      };

      if (dryRun) {
        console.log('[DRY RUN] recuperacao cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_recuperacao')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`recuperacao cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeSdrCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: leads da semana ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, contatos!inner(workspace_id)')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;
      const leadsSemResposta = opps.filter((o: Record<string, unknown>) => o.data_conectado == null).length;

      // --- Métricas cumulativas ---
      const conectadosCount = opps.filter((o: Record<string, unknown>) => o.data_conectado != null).length;
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;

      // --- Agendados no prazo ---
      const agendadosNoPrazo = opps.filter((o: Record<string, unknown>) => {
        if (!o.data_conectado || !o.data_agendamento_reuniao) return false;
        const d1 = new Date(o.data_conectado as string).getTime();
        const d2 = new Date(o.data_agendamento_reuniao as string).getTime();
        return (d2 - d1) <= 24 * 60 * 60 * 1000;
      }).length;

      // --- Faturamento bruto ---
      let faturamentoBruto = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Caixa recebido ---
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const caixaDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: caixaData, error: caixaErr } = workspaceId
          ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
          : await caixaDataQuery;

        if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
        caixaRecebido = (caixaData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Comunicações ---
      // TODO: implementar quando dados de comunicacoes estiverem disponiveis
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;
      const ultimaRespostaSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConexao = safeDiv(conectadosCount || 0, leadsCount || 0) ? Number(((conectadosCount || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamento = safeDiv(agendadosCount || 0, conectadosCount || 0) ? Number(((agendadosCount || 0) / (conectadosCount || 0) * 100).toFixed(2)) : null;
      const taxaAgendamentoPrazo = safeDiv(agendadosNoPrazo || 0, agendadosCount || 0) ? Number(((agendadosNoPrazo || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        conectados_count: conectadosCount || 0,
        agendados_count: agendadosCount || 0,
        agendados_no_prazo: agendadosNoPrazo,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        leads_sem_resposta: leadsSemResposta,
        avg_response_seconds: avgResponseSeconds,
        ultima_resposta_seconds: ultimaRespostaSeconds,
        taxa_conexao_pct: taxaConexao,
        taxa_agendamento_pct: taxaAgendamento,
        taxa_agendamento_prazo_pct: taxaAgendamentoPrazo,
        taxa_conversao_pct: taxaConversao,
        taxa_sem_resposta_pct: taxaSemResposta,
      };

      if (dryRun) {
        console.log('[DRY RUN] sdr cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_sdr')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`sdr cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeCloserCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Base: leads da semana atribuídos a closer ---
      const baseDataQuery = supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_agendamento_reuniao, contatos!inner(workspace_id)')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: baseData, error: baseErr } = workspaceId
        ? await baseDataQuery.eq('contatos.workspace_id', workspaceId)
        : await baseDataQuery;

      if (baseErr) throw new Error(`base: ${baseErr.message}`);

      const opps = baseData || [];
      const leadsCount = opps.length;
      const leadsSemResposta = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas == null).length;

      // --- Métricas cumulativas ---
      const agendadosCount = opps.filter((o: Record<string, unknown>) => o.data_agendamento_reuniao != null).length;
      const reunioesCount = opps.filter((o: Record<string, unknown>) => o.data_realizacao_vendas != null).length;
      const fechadosCount = opps.filter((o: Record<string, unknown>) => o.data_fechado != null).length;
      const noShowsCount = opps.filter((o: Record<string, unknown>) => o.data_no_show != null && o.data_realizacao_vendas == null).length;
      const negociacaoCount = opps.filter((o: Record<string, unknown>) => o.data_negociacao != null).length;

      // --- MQLs ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Faturamento bruto e caixa ---
      let faturamentoBruto = 0;
      let caixaRecebido = 0;
      if (opps.length > 0) {
        const oppIds = opps.map((o: Record<string, unknown>) => o.id as string);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, valor_entrada, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        faturamentoBruto = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
        caixaRecebido = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
        }, 0);
      }

      // --- Ciclo de fechamento ---
      const oppsFechadasComReuniao = opps.filter((o: Record<string, unknown>) => o.data_fechado != null && o.data_realizacao_vendas != null);
      let cicloFechamentoDias = null;
      if (oppsFechadasComReuniao.length > 0) {
        const dias = oppsFechadasComReuniao.map((o: Record<string, unknown>) => {
          const d1 = new Date(o.data_realizacao_vendas as string);
          const d2 = new Date(o.data_fechado as string);
          return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
        });
        cicloFechamentoDias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      }

      // --- Comunicações ---
      // TODO: implementar quando dados de comunicacoes estiverem disponiveis
      const ligacoesCount = 0;
      const mensagensCount = 0;
      const pessoasContatadas = 0;
      const avgResponseSeconds = null;

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const taxaConversao = safeDiv(fechadosCount || 0, reunioesCount || 0) ? Number(((fechadosCount || 0) / (reunioesCount || 0) * 100).toFixed(2)) : null;
      const taxaNoShow = safeDiv(noShowsCount || 0, agendadosCount || 0) ? Number(((noShowsCount || 0) / (agendadosCount || 0) * 100).toFixed(2)) : null;
      const taxaComparecimento = safeDiv((reunioesCount || 0), ((reunioesCount || 0) + (noShowsCount || 0))) ? Number(((reunioesCount || 0) / ((reunioesCount || 0) + (noShowsCount || 0)) * 100).toFixed(2)) : null;
      const taxaSemResposta = safeDiv(leadsSemResposta || 0, leadsCount || 0) ? Number(((leadsSemResposta || 0) / (leadsCount || 0) * 100).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        leads_count: leadsCount || 0,
        mqls_count: mqlsCount || 0,
        agendados_count: agendadosCount || 0,
        reunioes_count: reunioesCount || 0,
        fechados_count: fechadosCount || 0,
        no_shows_count: noShowsCount || 0,
        negociacao_count: negociacaoCount || 0,
        faturamento_bruto: Number(faturamentoBruto.toFixed(2)),
        caixa_recebido: Number(caixaRecebido.toFixed(2)),
        ligacoes_count: ligacoesCount,
        mensagens_count: mensagensCount,
        pessoas_contatadas: pessoasContatadas,
        avg_response_seconds: avgResponseSeconds,
        leads_sem_resposta: leadsSemResposta,
        taxa_conversao_pct: taxaConversao,
        taxa_no_show_pct: taxaNoShow,
        taxa_comparecimento_pct: taxaComparecimento,
        taxa_sem_resposta_pct: taxaSemResposta,
        ciclo_fechamento_dias: cicloFechamentoDias,
      };

      if (dryRun) {
        console.log('[DRY RUN] closer cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_closer')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`closer cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

async function computeMetasCohort(
  supabase: SupabaseClient<any, 'public', any>,
  snapshotId: number,
  workspaceId: string | null,
  weekStart: string,
  weekEnd: string,
  dryRun: boolean,
): Promise<ModuleResult> {
  const result: ModuleResult = { inserted: 0, errors: [] };
  const dimensions = ['todos'];

  for (const dim of dimensions) {
    try {
      // --- Metas (targets) — buscar em metas_ads se existir ---
      let metaMqlTarget: number | null = null;
      let metaCpmqlTarget: number | null = null;
      let metaSpendTarget: number | null = null;
      let metaVendasTarget: number | null = null;

      // Tenta formato wide (metas_ads) ou formato long (metas)
      try {
        const metasDataQuery = supabase
          .from('metas_ads')
          .select('meta_mql, meta_cpmql, meta_spend, meta_vendas')
          .lte('periodo_inicio', weekEnd)
          .gte('periodo_fim', weekStart);
        const { data: metasData, error: metasErr } = workspaceId
          ? await metasDataQuery.eq('workspace_id', workspaceId).maybeSingle()
          : await metasDataQuery.maybeSingle();

        if (!metasErr && metasData) {
          metaMqlTarget = Number(metasData.meta_mql) || null;
          metaCpmqlTarget = Number(metasData.meta_cpmql) || null;
          metaSpendTarget = Number(metasData.meta_spend) || null;
          metaVendasTarget = Number(metasData.meta_vendas) || null;
        }
      } catch {
        // Fallback: formato long da tabela metas
        try {
          const metasRowsQuery = supabase
            .from('metas')
            .select('tipo, valor')
            .eq('referencia', 'global')
            .lte('periodo_inicio', weekEnd)
            .gte('periodo_fim', weekStart);
          const { data: metasRows, error: metasErr2 } = workspaceId
            ? await metasRowsQuery.eq('workspace_id', workspaceId)
            : await metasRowsQuery;

          if (!metasErr2 && metasRows) {
            for (const row of metasRows) {
              if (row.tipo === 'mql_count_trafego') metaMqlTarget = Number(row.valor) || null;
              if (row.tipo === 'custo_mql_trafego') metaCpmqlTarget = Number(row.valor) || null;
              if (row.tipo === 'agendamentos_sdr') metaVendasTarget = Number(row.valor) || null;
            }
          }
        } catch {
          // Nenhuma tabela de metas disponível
        }
      }

      // --- Realizado MQL ---
      const mqlsCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(tags, workspace_id)', { count: 'exact', head: true })
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .ilike('contatos.tags', '%MQL%');
      const { count: mqlsCount, error: mqlsErr } = workspaceId
        ? await mqlsCountQuery.eq('contatos.workspace_id', workspaceId)
        : await mqlsCountQuery;

      if (mqlsErr) throw new Error(`mqls: ${mqlsErr.message}`);

      // --- Realizado Spend ---
      const metaDataQuery = supabase
        .from('meta_ads_insights')
        .select('spend')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      const { data: metaData, error: metaErr } = workspaceId
        ? await metaDataQuery.eq('workspace_id', workspaceId)
        : await metaDataQuery;

      if (metaErr) throw new Error(`meta_ads: ${metaErr.message}`);
      const realizadoSpend = (metaData || []).reduce((s, r: unknown) => s + (Number((r as Record<string, unknown>).spend) || 0), 0);

      // --- Realizado Vendas ---
      const vendasCountQuery = supabase
        .from('oportunidades')
        .select('*, contatos!inner(workspace_id)', { count: 'exact', head: true })
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { count: vendasCount, error: vendasErr } = workspaceId
        ? await vendasCountQuery.eq('contatos.workspace_id', workspaceId)
        : await vendasCountQuery;

      if (vendasErr) throw new Error(`vendas: ${vendasErr.message}`);

      // --- Realizado Faturamento ---
      const oppsFechadasQuery = supabase
        .from('oportunidades')
        .select('id, contatos!inner(workspace_id)')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: oppsFechadas, error: oppsFechadasErr } = workspaceId
        ? await oppsFechadasQuery.eq('contatos.workspace_id', workspaceId)
        : await oppsFechadasQuery;

      if (oppsFechadasErr) throw new Error(`opps_fechadas: ${oppsFechadasErr.message}`);

      let realizadoFaturamento = 0;
      if (oppsFechadas && oppsFechadas.length > 0) {
        const oppIds = oppsFechadas.map(o => o.id);
        const vfDataQuery = supabase
          .from('vendas_fechamento')
          .select('valor_faturado, contatos!inner(workspace_id)')
          .in('oportunidade_id', oppIds);
        const { data: vfData, error: vfErr } = workspaceId
          ? await vfDataQuery.eq('contatos.workspace_id', workspaceId)
          : await vfDataQuery;

        if (vfErr) throw new Error(`faturamento: ${vfErr.message}`);
        realizadoFaturamento = (vfData || []).reduce((sum, row: unknown) => {
          return sum + (Number((row as Record<string, unknown>).valor_faturado) || 0);
        }, 0);
      }

      // --- Realizado Caixa ---
      const caixaDataQuery = supabase
        .from('vendas_fechamento')
        .select('valor_entrada, contatos!inner(workspace_id)')
        .gte('data_pagamento_entrada', weekStart)
        .lte('data_pagamento_entrada', weekEnd);
      const { data: caixaData, error: caixaErr } = workspaceId
        ? await caixaDataQuery.eq('contatos.workspace_id', workspaceId)
        : await caixaDataQuery;

      if (caixaErr) throw new Error(`caixa: ${caixaErr.message}`);
      const realizadoCaixa = (caixaData || []).reduce((sum, row: unknown) => {
        return sum + (Number((row as Record<string, unknown>).valor_entrada) || 0);
      }, 0);

      // --- Derivadas ---
      const safeDiv = (num: number, den: number) => den > 0 ? Number((num / den).toFixed(4)) : null;
      const realizadoCpmql = safeDiv(realizadoSpend, mqlsCount || 0);

      const pctAtingidoMql = (metaMqlTarget != null && metaMqlTarget > 0) ? Number(((mqlsCount || 0) / metaMqlTarget * 100).toFixed(2)) : null;
      const pctAtingidoVendas = (metaVendasTarget != null && metaVendasTarget > 0) ? Number(((vendasCount || 0) / metaVendasTarget * 100).toFixed(2)) : null;
      const pctAtingidoSpend = (metaSpendTarget != null && metaSpendTarget > 0) ? Number(((realizadoSpend || 0) / metaSpendTarget * 100).toFixed(2)) : null;

      const idealDiaMql = (metaMqlTarget != null && metaMqlTarget > 0) ? Number((metaMqlTarget / 22).toFixed(2)) : null;
      const idealDiaVendas = (metaVendasTarget != null && metaVendasTarget > 0) ? Number((metaVendasTarget / 22).toFixed(2)) : null;

      const row = {
        snapshot_id: snapshotId,
        workspace_id: workspaceId,
        dimension: dim,
        dimension_value: dim,
        meta_mql_target: metaMqlTarget,
        meta_cpmql_target: metaCpmqlTarget,
        meta_spend_target: metaSpendTarget,
        meta_vendas_target: metaVendasTarget,
        realizado_mql: mqlsCount || 0,
        realizado_spend: Number(realizadoSpend.toFixed(2)),
        realizado_vendas: vendasCount || 0,
        realizado_faturamento: Number(realizadoFaturamento.toFixed(2)),
        realizado_caixa: Number(realizadoCaixa.toFixed(2)),
        realizado_cpmql: realizadoCpmql,
        pct_atingido_mql: pctAtingidoMql,
        pct_atingido_vendas: pctAtingidoVendas,
        pct_atingido_spend: pctAtingidoSpend,
        ideal_dia_mql: idealDiaMql,
        ideal_dia_vendas: idealDiaVendas,
      };

      if (dryRun) {
        console.log('[DRY RUN] metas cohort row:', row);
        result.inserted++;
        continue;
      }

      const { error: insertErr } = await supabase
        .from('weekly_metas')
        .upsert(row, { onConflict: 'snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value' });

      if (insertErr) {
        throw new Error(`insert: ${insertErr.message}`);
      }
      result.inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`metas cohort[${dim}]: ${msg}`);
    }
  }

  return result;
}

// =============================================================================
// DISPATCHER
// =============================================================================

export function getModuleComputeFn(
  module: ModuleKey,
  reportType: ReportType,
): (typeof computeTrafegoProdutividade) | null {
  if (reportType === 'produtividade') {
    switch (module) {
      case 'trafego': return computeTrafegoProdutividade;
      case 'aquisicao': return computeAquisicaoProdutividade;
      case 'organico': return computeOrganicoProdutividade;
      case 'prevendas': return computePrevendasProdutividade;
      case 'vendas': return computeVendasProdutividade;
      case 'recuperacao': return computeRecuperacaoProdutividade;
      case 'sdr': return computeSdrProdutividade;
      case 'closer': return computeCloserProdutividade;
      case 'metas': return computeMetasProdutividade;
    }
  }
  // Cohort: métricas filtradas por data_lead_recebido (cumulativas)
  switch (module) {
    case 'trafego': return computeTrafegoCohort;
    case 'aquisicao': return computeAquisicaoCohort;
    case 'organico': return computeOrganicoCohort;
    case 'prevendas': return computePrevendasCohort;
    case 'vendas': return computeVendasCohort;
    case 'recuperacao': return computeRecuperacaoCohort;
    case 'sdr': return computeSdrCohort;
    case 'closer': return computeCloserCohort;
    case 'metas': return computeMetasCohort;
  }
  return null;
}

// =============================================================================
// FILA DE REPROCESSAMENTO
// =============================================================================

async function markReprocessQueueProcessed(
  supabase: SupabaseClient<any, 'public', any>,
  workspaceId: string,
  weekStart: string,
  reportType: ReportType,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('mark_weekly_reprocess_queue_processed', {
      p_workspace_id: workspaceId,
      p_week_start: weekStart,
      p_report_type: reportType,
    });

    if (error) {
      console.error('Failed to mark reprocess queue as processed:', error);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unexpected error marking reprocess queue:', msg);
  }
}

// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================

if (import.meta.main) {
  Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  const startTime = Date.now();

  try {
    const body = await req.json() as ComputePayload;
    const weekStart = body.week_start;
    const reportType = body.report_type;
    const modules = body.modules || [...ALL_MODULES];
    const dryRun = body.dry_run || false;
    // Fail-closed multi-tenant (Fase 8): workspace_id SEMPRE explicito no body.
    // O fallback a env global (WEEKLY_REPORTS_WORKSPACE_ID) foi removido:
    // caller sem workspace_id recebe 400 — nunca assume um tenant global.
    const workspaceId = body.workspace_id;

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id obrigatório no body (fail-closed multi-tenant; sem fallback de env)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validações
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return new Response(
        JSON.stringify({ success: false, error: 'week_start obrigatório (formato YYYY-MM-DD)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const weekEnd = getWeekEnd(weekStart);

    if (!reportType || !['cohort', 'produtividade'].includes(reportType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'report_type deve ser "cohort" ou "produtividade"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Cria ou atualiza snapshot
    const snapshot = await ensureSnapshot(supabase, weekStart, weekEnd, reportType, workspaceId);
    if (!snapshot) {
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao criar/atualizar snapshot' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Limpa dados antigos do mesmo snapshot (para reprocessamento)
    if (!dryRun) {
      for (const module of modules) {
        const tableName = `weekly_${module}`;
        const { error: delErr } = await supabase
          .from(tableName)
          .delete()
          .eq('snapshot_id', snapshot.id);
        if (delErr) {
          console.warn(`Failed to clear old data for ${module}:`, delErr);
        }
      }
    }

    // Executa cálculo por módulo
    const moduleResults: Record<string, ModuleResult> = {};
    let totalRecords = 0;

    for (const module of modules) {
      const computeFn = getModuleComputeFn(module, reportType);
      if (!computeFn) {
        moduleResults[module] = { inserted: 0, errors: [`Módulo ${module} não suportado para ${reportType}`] };
        continue;
      }

      console.log(`Computing ${reportType} for ${module} — week ${weekStart}...`);
      const modResult = await computeFn(supabase, snapshot.id, workspaceId, weekStart, weekEnd, dryRun);
      moduleResults[module] = modResult;
      totalRecords += modResult.inserted;
    }

    // Verifica se houve erros críticos
    const allErrors = Object.values(moduleResults).flatMap(r => r.errors);
    const hasCriticalErrors = allErrors.length > 0 && Object.values(moduleResults).every(r => r.inserted === 0);

    const durationMs = Date.now() - startTime;

    if (!dryRun) {
      await finalizeSnapshot(
        supabase,
        snapshot.id,
        hasCriticalErrors ? 'failed' : 'completed',
        durationMs,
        totalRecords,
        hasCriticalErrors ? allErrors.join('; ') : undefined,
      );

      // Se veio da fila de reprocessamento e computou com sucesso,
      // marca os itens pendentes deste workspace/semana/tipo como processados.
      if (!hasCriticalErrors && body.reprocess) {
        await markReprocessQueueProcessed(supabase, workspaceId, weekStart, reportType);
      }
    }

    const response: ComputeResponse = {
      success: !hasCriticalErrors,
      snapshot_id: snapshot.id,
      duration_ms: durationMs,
      module_results: moduleResults,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unhandled error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
}
