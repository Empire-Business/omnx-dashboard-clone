#!/usr/bin/env node
/**
 * validar-cron.js
 *
 * Valida snapshots semanais chamando a edge function compute-weekly-reports
 * (dry_run=true) e comparando os valores retornados com queries diretas no banco.
 *
 * Uso:
 *   node validar-cron.js --workspace=<uuid> [--module=trafego] [--weeks=4]
 *
 * Variáveis de ambiente obrigatórias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Fail-closed multi-tenant (Fase 8): --workspace é obrigatório — a edge
 * function exige workspace_id explícito no body (sem fallback de env).
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIG / CLI
// =============================================================================
const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    module: 'trafego',
    weeks: 4,
    workspace: null,
  };
  for (const arg of args) {
    if (arg.startsWith('--module=')) {
      opts.module = arg.split('=')[1];
    } else if (arg.startsWith('--weeks=')) {
      opts.weeks = parseInt(arg.split('=')[1], 10) || 4;
    } else if (arg.startsWith('--workspace=')) {
      opts.workspace = arg.split('=')[1];
    }
  }
  return opts;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getWeeks(count) {
  const weeks = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weeks.push(formatDate(getMonday(d)));
  }
  return weeks;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Erro: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

// =============================================================================
// EDGE FUNCTION CALL
// =============================================================================
async function callEdgeFunction(supabaseUrl, serviceKey, weekStart, reportType, moduleKey, workspaceId) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/compute-weekly-reports`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      week_start: weekStart,
      report_type: reportType,
      modules: [moduleKey],
      dry_run: true,
      workspace_id: workspaceId,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// =============================================================================
// REAL DATA QUERIES (direct from DB)
// =============================================================================
async function getRealData(supabase, weekStart, weekEnd, moduleKey, reportType) {
  const base = { weekStart, weekEnd };

  // Helper para contar oportunidades
  const countOpp = async (dateField, pipelineOp) => {
    let q = supabase
      .from('oportunidades')
      .select('*', { count: 'exact', head: true })
      .gte(dateField, weekStart)
      .lte(dateField, weekEnd);
    if (pipelineOp === 'eq') q = q.eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    else q = q.neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    const { count, error } = await q;
    if (error) throw new Error(`countOpp(${dateField}): ${error.message}`);
    return count || 0;
  };

  // Helper para contar MQLs
  const countMql = async (pipelineOp) => {
    let q = supabase
      .from('oportunidades')
      .select('*, contatos!inner(tags)', { count: 'exact', head: true })
      .gte('data_lead_recebido', weekStart)
      .lte('data_lead_recebido', weekEnd)
      .ilike('contatos.tags', '%MQL%');
    if (pipelineOp === 'eq') q = q.eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    else q = q.neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    const { count, error } = await q;
    if (error) throw new Error(`countMql: ${error.message}`);
    return count || 0;
  };

  // Helper: faturamento de oportunidades fechadas (produtividade)
  const faturamentoFechadas = async (pipelineOp) => {
    let q = supabase
      .from('oportunidades')
      .select('id')
      .gte('data_fechado', weekStart)
      .lte('data_fechado', weekEnd);
    if (pipelineOp === 'eq') q = q.eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    else q = q.neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
    const { data: ids, error } = await q;
    if (error) throw new Error(`faturamentoFechadas ids: ${error.message}`);
    if (!ids || ids.length === 0) return 0;
    const { data: vf, error: vfErr } = await supabase
      .from('vendas_fechamento')
      .select('valor_faturado')
      .in('oportunidade_id', ids.map((o) => o.id));
    if (vfErr) throw new Error(`faturamentoFechadas vf: ${vfErr.message}`);
    return (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
  };

  // Helper: caixa recebido na semana
  const caixaRecebido = async () => {
    const { data, error } = await supabase
      .from('vendas_fechamento')
      .select('valor_entrada')
      .gte('data_pagamento_entrada', weekStart)
      .lte('data_pagamento_entrada', weekEnd);
    if (error) throw new Error(`caixaRecebido: ${error.message}`);
    return (data || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
  };

  // Helper: Meta Ads na semana
  const metaAds = async () => {
    const { data, error } = await supabase
      .from('meta_ads_insights')
      .select('spend, impressions, clicks, leads')
      .gte('date', weekStart)
      .lte('date', weekEnd);
    if (error) throw new Error(`metaAds: ${error.message}`);
    const spend = (data || []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
    const impressions = (data || []).reduce((s, r) => s + (Number(r.impressions) || 0), 0);
    const clicks = (data || []).reduce((s, r) => s + (Number(r.clicks) || 0), 0);
    const leads = (data || []).reduce((s, r) => s + (Number(r.leads) || 0), 0);
    return { spend, impressions, clicks, leads };
  };

  const result = {};

  if (moduleKey === 'trafego' || moduleKey === 'aquisicao' || moduleKey === 'organico') {
    const pipelineOp = moduleKey === 'recuperacao' ? 'eq' : 'neq';
    if (reportType === 'produtividade') {
      result.leads_count = await countOpp('data_lead_recebido', pipelineOp);
      result.mqls_count = await countMql(pipelineOp);
      result.conectados_count = await countOpp('data_conectado', pipelineOp);
      result.agendados_count = await countOpp('data_agendamento_reuniao', pipelineOp);
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      result.fechados_count = await countOpp('data_fechado', pipelineOp);
      result.no_shows_count = await countOpp('data_no_show', pipelineOp);
      result.negociacao_count = await countOpp('data_negociacao', pipelineOp);
      result.perdidos_count = await countOpp('data_perdido', pipelineOp);
      result.faturamento_bruto = await faturamentoFechadas(pipelineOp);
      result.caixa_recebido = await caixaRecebido();
      const ma = await metaAds();
      result.meta_spend = ma.spend;
      result.meta_impressions = ma.impressions;
      result.meta_clicks = ma.clicks;
      result.meta_leads_actions = ma.leads;
    } else {
      // cohort: base é data_lead_recebido, métricas cumulativas
      let q = supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd);
      if (pipelineOp === 'eq') q = q.eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      else q = q.neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      const { data: opps, error } = await q;
      if (error) throw new Error(`cohort base: ${error.message}`);
      result.leads_count = opps?.length || 0;
      result.conectados_count = (opps || []).filter((o) => o.data_conectado != null).length;
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      result.no_shows_count = (opps || []).filter((o) => o.data_no_show != null).length;
      result.negociacao_count = (opps || []).filter((o) => o.data_negociacao != null).length;
      result.perdidos_count = (opps || []).filter((o) => o.data_perdido != null).length;
      result.mqls_count = await countMql(pipelineOp);
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        const { data: caixa } = await supabase.from('vendas_fechamento').select('valor_entrada').in('oportunidade_id', ids);
        result.caixa_recebido = (caixa || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
      }
      const ma = await metaAds();
      result.meta_spend = ma.spend;
      result.meta_impressions = ma.impressions;
      result.meta_clicks = ma.clicks;
      result.meta_leads_actions = ma.leads;
    }
  }

  if (moduleKey === 'prevendas') {
    const pipelineOp = 'neq';
    if (reportType === 'produtividade') {
      result.leads_count = await countOpp('data_lead_recebido', pipelineOp);
      result.mqls_count = await countMql(pipelineOp);
      result.conectados_count = await countOpp('data_conectado', pipelineOp);
      result.agendados_count = await countOpp('data_agendamento_reuniao', pipelineOp);
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      result.fechados_count = await countOpp('data_fechado', pipelineOp);
      result.no_shows_count = await countOpp('data_no_show', pipelineOp);
      result.negociacao_count = await countOpp('data_negociacao', pipelineOp);
      result.perdidos_count = await countOpp('data_perdido', pipelineOp);
      result.faturamento_bruto = await faturamentoFechadas(pipelineOp);
      result.caixa_recebido = await caixaRecebido();
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      const { data: leadsData } = await supabase
        .from('oportunidades')
        .select('id, data_conectado')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_sem_resposta = (leadsData || []).filter((o) => o.data_conectado == null).length;
      result.avg_response_seconds = null;
    } else {
      const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = opps?.length || 0;
      result.leads_sem_resposta = (opps || []).filter((o) => o.data_conectado == null).length;
      result.conectados_count = (opps || []).filter((o) => o.data_conectado != null).length;
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      result.no_shows_count = (opps || []).filter((o) => o.data_no_show != null).length;
      result.negociacao_count = (opps || []).filter((o) => o.data_negociacao != null).length;
      result.perdidos_count = (opps || []).filter((o) => o.data_perdido != null).length;
      result.mqls_count = await countMql('neq');
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        const { data: caixa } = await supabase.from('vendas_fechamento').select('valor_entrada').in('oportunidade_id', ids);
        result.caixa_recebido = (caixa || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
    }
  }

  if (moduleKey === 'vendas') {
    const pipelineOp = 'neq';
    if (reportType === 'produtividade') {
      result.leads_count = await countOpp('data_lead_recebido', pipelineOp);
      result.mqls_count = await countMql(pipelineOp);
      result.agendados_count = await countOpp('data_agendamento_reuniao', pipelineOp);
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      result.fechados_count = await countOpp('data_fechado', pipelineOp);
      result.no_shows_count = await countOpp('data_no_show', pipelineOp);
      result.negociacao_count = await countOpp('data_negociacao', pipelineOp);
      result.perdidos_count = await countOpp('data_perdido', pipelineOp);
      const { data: perdidosDetail } = await supabase
        .from('oportunidades')
        .select('data_realizacao_vendas')
        .gte('data_perdido', weekStart)
        .lte('data_perdido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.perdidos_apos_reuniao = (perdidosDetail || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.perdidos_sem_reuniao = (perdidosDetail || []).filter((o) => o.data_realizacao_vendas == null).length;
      result.faturamento_bruto = await faturamentoFechadas(pipelineOp);
      const { data: vfData } = await supabase
        .from('vendas_fechamento')
        .select('valor_entrada')
        .in(
          'oportunidade_id',
          (
            await supabase
              .from('oportunidades')
              .select('id')
              .gte('data_fechado', weekStart)
              .lte('data_fechado', weekEnd)
              .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
          ).data?.map((o) => o.id) || []
        );
      result.valor_entrada = (vfData || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      result.caixa_recebido = await caixaRecebido();
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
      const { data: cicloData } = await supabase
        .from('oportunidades')
        .select('data_realizacao_vendas, data_fechado')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .not('data_realizacao_vendas', 'is', null);
      if (cicloData && cicloData.length > 0) {
        const dias = cicloData.map((o) => {
          const d1 = new Date(o.data_realizacao_vendas).getTime();
          const d2 = new Date(o.data_fechado).getTime();
          return (d2 - d1) / (1000 * 60 * 60 * 24);
        });
        result.ciclo_fechamento_dias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      } else {
        result.ciclo_fechamento_dias = null;
      }
    } else {
      const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido, data_agendamento_reuniao')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = opps?.length || 0;
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      result.no_shows_count = (opps || []).filter((o) => o.data_no_show != null).length;
      result.negociacao_count = (opps || []).filter((o) => o.data_negociacao != null).length;
      result.perdidos_count = (opps || []).filter((o) => o.data_perdido != null).length;
      result.perdidos_apos_reuniao = (opps || []).filter((o) => o.data_perdido != null && o.data_realizacao_vendas != null).length;
      result.perdidos_sem_reuniao = (opps || []).filter((o) => o.data_perdido != null && o.data_realizacao_vendas == null).length;
      result.mqls_count = await countMql('neq');
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado, valor_entrada').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        result.caixa_recebido = (vf || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
        result.valor_entrada = result.caixa_recebido;
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
        result.valor_entrada = 0;
      }
      const comReuniao = (opps || []).filter((o) => o.data_fechado != null && o.data_realizacao_vendas != null);
      if (comReuniao.length > 0) {
        const dias = comReuniao.map((o) => {
          const d1 = new Date(o.data_realizacao_vendas).getTime();
          const d2 = new Date(o.data_fechado).getTime();
          return (d2 - d1) / (1000 * 60 * 60 * 24);
        });
        result.ciclo_fechamento_dias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      } else {
        result.ciclo_fechamento_dias = null;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
    }
  }

  if (moduleKey === 'recuperacao') {
    const pipelineOp = 'eq';
    if (reportType === 'produtividade') {
      result.leads_count = await countOpp('data_lead_recebido', pipelineOp);
      result.mqls_count = await countMql(pipelineOp);
      result.conectados_count = await countOpp('data_conectado', pipelineOp);
      result.agendados_count = await countOpp('data_agendamento_reuniao', pipelineOp);
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      result.fechados_count = await countOpp('data_fechado', pipelineOp);
      result.no_shows_count = await countOpp('data_no_show', pipelineOp);
      result.negociacao_count = await countOpp('data_negociacao', pipelineOp);
      result.perdidos_count = await countOpp('data_perdido', pipelineOp);
      result.faturamento_bruto = await faturamentoFechadas(pipelineOp);
      result.caixa_recebido = await caixaRecebido();
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.leads_sem_resposta = 0;
      result.avg_response_seconds = null;
    } else {
      const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_perdido')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .eq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = opps?.length || 0;
      result.conectados_count = (opps || []).filter((o) => o.data_conectado != null).length;
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      result.no_shows_count = (opps || []).filter((o) => o.data_no_show != null).length;
      result.negociacao_count = (opps || []).filter((o) => o.data_negociacao != null).length;
      result.perdidos_count = (opps || []).filter((o) => o.data_perdido != null).length;
      result.mqls_count = await countMql('eq');
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        const { data: caixa } = await supabase.from('vendas_fechamento').select('valor_entrada').in('oportunidade_id', ids);
        result.caixa_recebido = (caixa || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.leads_sem_resposta = 0;
      result.avg_response_seconds = null;
    }
  }

  if (moduleKey === 'sdr') {
    const pipelineOp = 'neq';
    if (reportType === 'produtividade') {
      const { data: leadsData } = await supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = leadsData?.length || 0;
      result.leads_sem_resposta = (leadsData || []).filter((o) => o.data_conectado == null).length;
      result.conectados_count = await countOpp('data_conectado', pipelineOp);
      const { data: agendadosData } = await supabase
        .from('oportunidades')
        .select('data_conectado, data_agendamento_reuniao')
        .gte('data_agendamento_reuniao', weekStart)
        .lte('data_agendamento_reuniao', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.agendados_count = agendadosData?.length || 0;
      result.agendados_no_prazo = (agendadosData || []).filter((o) => {
        if (!o.data_conectado || !o.data_agendamento_reuniao) return false;
        const d1 = new Date(o.data_conectado).getTime();
        const d2 = new Date(o.data_agendamento_reuniao).getTime();
        return d2 - d1 <= 24 * 60 * 60 * 1000;
      }).length;
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      result.fechados_count = await countOpp('data_fechado', pipelineOp);
      result.faturamento_bruto = await faturamentoFechadas(pipelineOp);
      result.caixa_recebido = await caixaRecebido();
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
      result.ultima_resposta_seconds = null;
    } else {
      const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = opps?.length || 0;
      result.leads_sem_resposta = (opps || []).filter((o) => o.data_conectado == null).length;
      result.conectados_count = (opps || []).filter((o) => o.data_conectado != null).length;
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.agendados_no_prazo = (opps || []).filter((o) => {
        if (!o.data_conectado || !o.data_agendamento_reuniao) return false;
        const d1 = new Date(o.data_conectado).getTime();
        const d2 = new Date(o.data_agendamento_reuniao).getTime();
        return d2 - d1 <= 24 * 60 * 60 * 1000;
      }).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        const { data: caixa } = await supabase.from('vendas_fechamento').select('valor_entrada').in('oportunidade_id', ids);
        result.caixa_recebido = (caixa || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
      result.ultima_resposta_seconds = null;
    }
  }

  if (moduleKey === 'closer') {
    const pipelineOp = 'neq';
    if (reportType === 'produtividade') {
      const { data: leadsData } = await supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = leadsData?.length || 0;
      result.leads_sem_resposta = (leadsData || []).filter((o) => o.data_realizacao_vendas == null).length;
      result.mqls_count = await countMql(pipelineOp);
      result.agendados_count = await countOpp('data_agendamento_reuniao', pipelineOp);
      result.reunioes_count = await countOpp('data_realizacao_vendas', pipelineOp);
      const { data: oppsFechadas } = await supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, data_fechado')
        .gte('data_fechado', weekStart)
        .lte('data_fechado', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.fechados_count = oppsFechadas?.length || 0;
      result.no_shows_count = await countOpp('data_no_show', pipelineOp);
      result.negociacao_count = await countOpp('data_negociacao', pipelineOp);
      if (oppsFechadas && oppsFechadas.length > 0) {
        const ids = oppsFechadas.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado, valor_entrada').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        result.caixa_recebido = (vf || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
        const comReuniao = oppsFechadas.filter((o) => o.data_realizacao_vendas != null);
        if (comReuniao.length > 0) {
          const dias = comReuniao.map((o) => {
            const d1 = new Date(o.data_realizacao_vendas).getTime();
            const d2 = new Date(o.data_fechado).getTime();
            return (d2 - d1) / (1000 * 60 * 60 * 24);
          });
          result.ciclo_fechamento_dias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
        } else {
          result.ciclo_fechamento_dias = null;
        }
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
        result.ciclo_fechamento_dias = null;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
    } else {
      const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, data_realizacao_vendas, data_fechado, data_no_show, data_negociacao, data_agendamento_reuniao')
        .gte('data_lead_recebido', weekStart)
        .lte('data_lead_recebido', weekEnd)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID);
      result.leads_count = opps?.length || 0;
      result.leads_sem_resposta = (opps || []).filter((o) => o.data_realizacao_vendas == null).length;
      result.mqls_count = await countMql('neq');
      result.agendados_count = (opps || []).filter((o) => o.data_agendamento_reuniao != null).length;
      result.reunioes_count = (opps || []).filter((o) => o.data_realizacao_vendas != null).length;
      result.fechados_count = (opps || []).filter((o) => o.data_fechado != null).length;
      result.no_shows_count = (opps || []).filter((o) => o.data_no_show != null).length;
      result.negociacao_count = (opps || []).filter((o) => o.data_negociacao != null).length;
      if (opps && opps.length > 0) {
        const ids = opps.map((o) => o.id);
        const { data: vf } = await supabase.from('vendas_fechamento').select('valor_faturado, valor_entrada').in('oportunidade_id', ids);
        result.faturamento_bruto = (vf || []).reduce((s, r) => s + (Number(r.valor_faturado) || 0), 0);
        result.caixa_recebido = (vf || []).reduce((s, r) => s + (Number(r.valor_entrada) || 0), 0);
      } else {
        result.faturamento_bruto = 0;
        result.caixa_recebido = 0;
      }
      const comReuniao = (opps || []).filter((o) => o.data_fechado != null && o.data_realizacao_vendas != null);
      if (comReuniao.length > 0) {
        const dias = comReuniao.map((o) => {
          const d1 = new Date(o.data_realizacao_vendas).getTime();
          const d2 = new Date(o.data_fechado).getTime();
          return (d2 - d1) / (1000 * 60 * 60 * 24);
        });
        result.ciclo_fechamento_dias = Number((dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(2));
      } else {
        result.ciclo_fechamento_dias = null;
      }
      result.ligacoes_count = 0;
      result.mensagens_count = 0;
      result.pessoas_contatadas = 0;
      result.avg_response_seconds = null;
    }
  }

  if (moduleKey === 'metas') {
    if (reportType === 'produtividade') {
      // Tabela metas (formato long) — fallback de metas_ads
      const { data: metasRows } = await supabase
        .from('metas')
        .select('tipo, valor')
        .eq('referencia', 'global')
        .lte('periodo_inicio', weekEnd)
        .gte('periodo_fim', weekStart);
      for (const row of metasRows || []) {
        if (row.tipo === 'mql_count_trafego') result.meta_mql_target = Number(row.valor) || null;
        if (row.tipo === 'custo_mql_trafego') result.meta_cpmql_target = Number(row.valor) || null;
        if (row.tipo === 'agendamentos_sdr') result.meta_vendas_target = Number(row.valor) || null;
      }
      result.meta_spend_target = null;
      result.realizado_mql = await countMql('neq');
      const ma = await metaAds();
      result.realizado_spend = ma.spend;
      result.realizado_vendas = await countOpp('data_fechado', 'neq');
      result.realizado_faturamento = await faturamentoFechadas('neq');
      result.realizado_caixa = await caixaRecebido();
      result.realizado_cpmql = null;
    } else {
      // Tabela metas (formato long) — fallback de metas_ads
      const { data: metasRows } = await supabase
        .from('metas')
        .select('tipo, valor')
        .eq('referencia', 'global')
        .lte('periodo_inicio', weekEnd)
        .gte('periodo_fim', weekStart);
      for (const row of metasRows || []) {
        if (row.tipo === 'mql_count_trafego') result.meta_mql_target = Number(row.valor) || null;
        if (row.tipo === 'custo_mql_trafego') result.meta_cpmql_target = Number(row.valor) || null;
        if (row.tipo === 'agendamentos_sdr') result.meta_vendas_target = Number(row.valor) || null;
      }
      result.meta_spend_target = null;
      result.realizado_mql = await countMql('neq');
      const ma = await metaAds();
      result.realizado_spend = ma.spend;
      result.realizado_vendas = await countOpp('data_fechado', 'neq');
      result.realizado_faturamento = await faturamentoFechadas('neq');
      result.realizado_caixa = await caixaRecebido();
      result.realizado_cpmql = null;
    }
  }

  return result;
}

// =============================================================================
// COMPARISON
// =============================================================================
function round(num, decimals = 2) {
  if (num == null) return null;
  return Number(Number(num).toFixed(decimals));
}

function compareValues(edgeVal, realVal, metric) {
  const ev = round(edgeVal);
  const rv = round(realVal);
  if (ev === rv) return null;
  if (ev == null && rv == null) return null;
  return { metric, edge: ev, real: rv, diff: round((ev || 0) - (rv || 0)) };
}

// =============================================================================
// REPORT
// =============================================================================
function generateReport(divergences, opts) {
  const now = new Date().toISOString();
  const lines = [
    '# Relatório de Validação — Weekly Snapshots',
    '',
    `- **Data:** ${now}`,
    `- **Módulo:** ${opts.module}`,
    `- **Semanas:** ${opts.weeks}`,
    '',
    '## Resumo',
    '',
    `| Semana | Tipo | Divergências |`,
    `|--------|------|--------------|`,
  ];

  let total = 0;
  for (const d of divergences) {
    lines.push(`| ${d.weekStart} | ${d.reportType} | ${d.items.length} |`);
    total += d.items.length;
  }

  lines.push('', `**Total de divergências encontradas:** ${total}`, '');

  for (const d of divergences) {
    if (d.items.length === 0) continue;
    lines.push(`## ${d.weekStart} — ${d.reportType}`, '');
    lines.push(`| Métrica | Edge Function | Banco Real | Diff |`);
    lines.push(`|---------|---------------|------------|------|`);
    for (const item of d.items) {
      lines.push(`| ${item.metric} | ${item.edge} | ${item.real} | ${item.diff} |`);
    }
    lines.push('');
    if (d.edgeErrors.length > 0) {
      lines.push('**Erros na edge function:**');
      for (const err of d.edgeErrors) lines.push(`- ${err}`);
      lines.push('');
    }
  }

  if (total === 0) {
    lines.push('✅ Nenhuma divergência encontrada.', '');
  }

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  const opts = parseArgs();
  if (!opts.workspace) {
    console.error('Erro: --workspace=<uuid> é obrigatório (fail-closed multi-tenant — a edge function não aceita mais fallback de env).');
    process.exit(1);
  }
  const supabase = getSupabase();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const weeks = getWeeks(opts.weeks);
  const reportTypes = ['produtividade', 'cohort'];
  const allDivergences = [];

  console.log(`Iniciando validação: módulo=${opts.module}, semanas=${opts.weeks}, workspace=${opts.workspace}`);

  for (const weekStart of weeks) {
    const weekEnd = formatDate(new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000));
    for (const reportType of reportTypes) {
      console.log(`  → ${weekStart} [${reportType}] …`);
      let edgeResult = null;
      let edgeErrors = [];
      try {
        const res = await callEdgeFunction(supabaseUrl, serviceKey, weekStart, reportType, opts.module, opts.workspace);
        edgeResult = res;
        if (res.module_results && res.module_results[opts.module]) {
          edgeErrors = res.module_results[opts.module].errors || [];
        }
      } catch (err) {
        console.error(`     ERRO edge function: ${err.message}`);
        allDivergences.push({ weekStart, reportType, items: [], edgeErrors: [err.message] });
        continue;
      }

      let realData;
      try {
        realData = await getRealData(supabase, weekStart, weekEnd, opts.module, reportType);
      } catch (err) {
        console.error(`     ERRO query real: ${err.message}`);
        allDivergences.push({ weekStart, reportType, items: [], edgeErrors: [`DB error: ${err.message}`] });
        continue;
      }

      // Extrair valores da edge function (dry_run retorna module_results)
      const modRes = edgeResult?.module_results?.[opts.module];
      let edgeRow = {};
      // A edge function não retorna os dados calculados no JSON de resposta (só inserted/errors).
      // Portanto, comparamos o snapshot no banco com os dados reais do banco.
      // Isso valida se o snapshot está correto.
      // Se quisermos validar a edge function em si, precisaríamos que ela retornasse os valores.
      // Como o prompt pede "chama a edge function e compara com os dados do banco", fazemos via snapshot.
      const { data: snapshotRow } = await supabase
        .from(`weekly_${opts.module}`)
        .select('*')
        .eq('dimension', 'todos')
        .eq('dimension_value', 'todos')
        .in('snapshot_id', (
          await supabase.from('weekly_snapshots').select('id').eq('week_start', weekStart).eq('report_type', reportType).eq('workspace_id', opts.workspace)
        ).data?.map((s) => s.id) || [])
        .maybeSingle();

      if (snapshotRow) {
        edgeRow = snapshotRow;
      } else {
        console.log(`     ⚠️ Snapshot não encontrado para ${weekStart} ${reportType}`);
      }

      const items = [];
      for (const key of Object.keys(realData)) {
        const div = compareValues(edgeRow[key], realData[key], key);
        if (div) items.push(div);
      }

      allDivergences.push({ weekStart, reportType, items, edgeErrors });
      if (items.length > 0) {
        console.log(`     ⚠️ ${items.length} divergência(s)`);
      } else {
        console.log(`     ✅ OK`);
      }
    }
  }

  const report = generateReport(allDivergences, opts);
  const outPath = path.join(__dirname, `validacao-${opts.module}-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
  console.log(`\nRelatório salvo em: ${outPath}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
