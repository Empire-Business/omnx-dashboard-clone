// Edge Function: send-weekly-report-email
// Envia relatórios semanais por e-mail via Resend, baseado em weekly_email_schedules.
// v2 — Clara Agente Autônoma: investiga hipóteses, cruza dados, gera insights.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { isServiceRoleCaller } from '../_shared/require-service-role.ts'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { buildClaraTools, toolsToOpenAIFormat, executeToolCall, type ClaraTool } from '../_shared/report-tools.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Clara - OMNX <clara@omnx.pro>'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'
const MAX_TOOL_ITERATIONS = 6

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Schedule {
  id: string
  workspace_id: string
  name: string
  description: string | null
  modules: string[]
  report_type: 'cohort' | 'produtividade'
  dimensions: string[]
  frequency: string
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  timezone: string
  subject: string
  recipient_emails: string[]
  reply_to: string | null
  template_key: string
  include_comparative: boolean
  include_trends: boolean
  clara_prompt: string | null
  use_clara_summary: boolean
  email_format: 'full' | 'clara_only'
  last_run_at: string | null
  next_run_at: string | null
  email_sent_count: number
}

interface DashboardRow {
  module: string
  week_start: string
  week_end: string
  year_week: string
  report_type: string
  dimension: string
  dimension_value: string
  leads_count: number | null
  mqls_count: number | null
  conectados_count: number | null
  agendados_count: number | null
  reunioes_count: number | null
  fechados_count: number | null
  no_shows_count: number | null
  negociacao_count: number | null
  perdidos_count: number | null
  faturamento_bruto: number | null
  caixa_recebido: number | null
  valor_entrada: number | null
  meta_spend: number | null
  meta_impressions: number | null
  meta_clicks: number | null
  meta_leads_actions: number | null
  cpmql: number | null
  cpv: number | null
  roas: number | null
  roas_caixa: number | null
  ctr: number | null
  taxa_conexao_pct: number | null
  taxa_agendamento_pct: number | null
  taxa_reuniao_pct: number | null
  taxa_conversao_pct: number | null
  taxa_no_show_pct: number | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function fmtN(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function moduleLabel(module: string): string {
  const labels: Record<string, string> = {
    trafego: 'Tráfego',
    aquisicao: 'Aquisição',
    organico: 'Orgânico',
    prevendas: 'Pré-Vendas',
    vendas: 'Vendas',
    recuperacao: 'Recuperação',
    sdr: 'SDR',
    closer: 'Closer',
    metas: 'Metas',
  }
  return labels[module] ?? module
}

function getWeekStart(dateInput?: string, reportType: 'cohort' | 'produtividade' = 'cohort'): string {
  const d = dateInput ? new Date(dateInput + 'T00:00:00') : new Date()
  const tz = 'America/Sao_Paulo'
  const spDate = new Date(d.toLocaleString('en-US', { timeZone: tz }))
  const day = spDate.getDay()
  const diff = day === 0 ? -6 : 1 - day // segunda-feira da semana atual
  const monday = new Date(spDate)
  monday.setDate(spDate.getDate() + diff)

  if (reportType === 'produtividade') {
    // Produtividade: semana passada (já finalizada)
    monday.setDate(monday.getDate() - 7)
  }

  return monday.toISOString().slice(0, 10)
}

function calculateNextRunAt(schedule: Schedule): string {
  const now = new Date().toISOString()
  // Reutiliza a lógica da RPC SQL. Como estamos na edge function, fazemos cálculo simples local.
  // Chamamos a RPC calculate_next_run_at para garantir consistência.
  return now
}

async function fetchDashboardData(
  supabase: any,
  schedule: Schedule,
  weekStart: string,
): Promise<DashboardRow[]> {
  const { data, error } = await supabase
    .from('v_weekly_dashboard')
    .select('*')
    .eq('week_start', weekStart)
    .eq('report_type', schedule.report_type)
    .in('module', schedule.modules)
    .in('dimension', schedule.dimensions.length ? schedule.dimensions : ['todos'])
    .order('module', { ascending: true })

  if (error) throw new Error(`Erro ao buscar dados: ${error.message}`)
  return (data ?? []) as unknown as DashboardRow[]
}

function kpiCard(label: string, value: string, sub?: string, accent?: string): string {
  const c = accent ?? '#0D1829'
  return `
    <td style="width:25%;padding:8px 6px;vertical-align:top;">
      <div style="background:#f8fafc;border-radius:8px;padding:12px 10px;text-align:center;border:1px solid #e2e8f0;">
        <p style="margin:0 0 4px;font-size:10px;color:#64748b;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;">${label}</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:${c};line-height:1.2;">${value}</p>
        ${sub ? `<p style="margin:2px 0 0;font-size:10px;color:#94a3b8;">${sub}</p>` : ''}
      </div>
    </td>`
}

function funnelBar(label: string, count: number, total: number, pct: number | null, color: string): string {
  const w = total > 0 ? Math.max(2, (count / total) * 100) : 0
  return `
    <tr>
      <td style="padding:6px 10px;font-size:12px;color:#475569;font-weight:500;white-space:nowrap;">${label}</td>
      <td style="padding:6px 6px;width:70%;">
        <div style="background:#f1f5f9;border-radius:4px;height:18px;overflow:hidden;">
          <div style="background:${color};height:100%;width:${w}%;border-radius:4px;min-width:${count > 0 ? '2px' : '0'};"></div>
        </div>
      </td>
      <td style="padding:6px 6px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">${fmtN(count)}</td>
      <td style="padding:6px 6px;text-align:right;font-size:11px;color:#94a3b8;white-space:nowrap;">${pct != null ? fmtPct(pct) + ' da base' : '—'}</td>
    </tr>`
}

function funnelStep(label: string, count: number, prevCount: number, color: string): string {
  const pctPrev = prevCount > 0 ? (count / prevCount) * 100 : null
  return `
    <tr>
      <td style="padding:6px 10px;font-size:12px;color:#475569;">${label}</td>
      <td style="padding:6px 10px;text-align:right;font-size:14px;font-weight:700;color:#0f172a;">${fmtN(count)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:12px;color:${pctPrev != null ? '#0f172a' : '#94a3b8'};">${pctPrev != null ? fmtPct(pctPrev) : '—'}</td>
    </tr>`
}

function metaRow(label: string, value: string): string {
  return `<tr><td style="padding:5px 10px;font-size:12px;color:#475569;">${label}</td><td style="padding:5px 10px;text-align:right;font-size:13px;font-weight:600;color:#0f172a;">${value}</td></tr>`
}

function buildEmailHtml(schedule: Schedule, weekStart: string, weekEnd: string, rows: DashboardRow[]): string {
  const r = rows.find(x => x.dimension === 'todos') ?? rows[0]
  if (!r) {
    return `<p>Sem dados disponíveis para o período ${weekStart} a ${weekEnd}.</p>`
  }

  const leads = r.leads_count ?? 0
  const mqls = r.mqls_count ?? 0
  const conect = r.conectados_count ?? 0
  const agend = r.agendados_count ?? 0
  const reunioes = r.reunioes_count ?? 0
  const fechados = r.fechados_count ?? 0
  const noShows = r.no_shows_count ?? 0
  const perdidos = r.perdidos_count ?? 0
  const negociacao = r.negociacao_count ?? 0

  const spend = r.meta_spend ?? 0
  const impressions = r.meta_impressions ?? 0
  const clicks = r.meta_clicks ?? 0
  const metaLeads = r.meta_leads_actions ?? 0
  const cpmql = r.cpmql ?? 0
  const ctr = r.ctr ?? 0
  const roas = r.roas ?? 0
  const roasCaixa = r.roas_caixa ?? 0

  const taxaConexao = r.taxa_conexao_pct
  const taxaAgend = r.taxa_agendamento_pct
  const taxaReuniao = r.taxa_reuniao_pct
  const taxaConv = r.taxa_conversao_pct
  const taxaNoShow = r.taxa_no_show_pct

  const faturamento = r.faturamento_bruto ?? 0
  const caixa = r.caixa_recebido ?? 0

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${schedule.subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:720px;width:100%;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">

<!-- HEADER -->
<tr><td style="background:#0D1829;padding:28px 32px;">
<p style="margin:0;color:#C9A240;font-size:12px;font-weight:600;letter-spacing:0.05em;">CLARA · RELATÓRIO AUTOMÁTICO</p>
<h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">${schedule.subject}</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${weekStart} a ${weekEnd} · COHORT por data_lead_recebido</p>
</td></tr>

<!-- BODY -->
<tr><td style="padding:28px 32px;">

<!-- KPIs -->
<h2 style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0D1829;text-transform:uppercase;letter-spacing:0.05em;">Indicadores Principais</h2>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${kpiCard('Leads', fmtN(leads), 'total de leads novos')}
${kpiCard('MQLs', fmtN(mqls), fmtPct(mqls / Math.max(leads, 1)) + ' de conversão')}
${kpiCard('Investimento', fmtBRL(spend), 'Meta Ads')}
${kpiCard('CPMQL', fmtBRL(cpmql), 'custo por MQL')}
</tr></table>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr>
${kpiCard('Receita', fmtBRL(faturamento), '', '#059669')}
${kpiCard('Caixa', fmtBRL(caixa), '', '#059669')}
${kpiCard('ROAS', fmtN(roas, 1) + 'x', 'receita / ads', roas > 1 ? '#059669' : '#dc2626')}
${kpiCard('ROAS Caixa', roasCaixa ? fmtN(roasCaixa, 1) + 'x' : '—', 'caixa / ads', '#0D1829')}
</tr></table>

<!-- FUNIL -->
<h2 style="margin:32px 0 16px;font-size:14px;font-weight:700;color:#0D1829;text-transform:uppercase;letter-spacing:0.05em;">Funil de Conversão</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;">
<tr style="background:#f8fafc;">
  <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;font-weight:600;">Etapa</th>
  <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;font-weight:600;">Qtd</th>
  <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;font-weight:600;">Tx etapa anterior</th>
</tr>
${funnelStep('Leads (total)', leads, leads, '#0D1829')}
${funnelStep('MQLs', mqls, leads, '#6366f1')}
${funnelStep('Conectados', conect, mqls, '#8b5cf6')}
${funnelStep('Agendados', agend, conect, '#a855f7')}
${funnelStep('Reuniões', reunioes, agend, '#d946ef')}
${funnelStep('Fechados', fechados, reunioes, '#059669')}
</table>

<!-- BARRAS DO FUNIL -->
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${funnelBar('Leads', leads, leads, 100, '#0D1829')}
${funnelBar('MQL', mqls, leads, mqls / Math.max(leads, 1) * 100, '#6366f1')}
${funnelBar('Conectados', conect, leads, conect / Math.max(leads, 1) * 100, '#8b5cf6')}
${funnelBar('Agendados', agend, leads, agend / Math.max(leads, 1) * 100, '#a855f7')}
${funnelBar('Reuniões', reunioes, leads, reunioes / Math.max(leads, 1) * 100, '#d946ef')}
${funnelBar('Fechados', fechados, leads, fechados / Math.max(leads, 1) * 100, '#059669')}
</table>

<!-- TAXAS -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
<tr>
  <td style="width:33%;padding:6px 4px;text-align:center;">
    <p style="margin:0;font-size:10px;color:#64748b;">Conexão</p>
    <p style="margin:2px 0 0;font-size:14px;font-weight:700;color:#0D1829;">${fmtPct(taxaConexao)}</p>
  </td>
  <td style="width:33%;padding:6px 4px;text-align:center;">
    <p style="margin:0;font-size:10px;color:#64748b;">Agendamento</p>
    <p style="margin:2px 0 0;font-size:14px;font-weight:700;color:#0D1829;">${fmtPct(taxaAgend)}</p>
  </td>
  <td style="width:33%;padding:6px 4px;text-align:center;">
    <p style="margin:0;font-size:10px;color:#64748b;">No-Show</p>
    <p style="margin:2px 0 0;font-size:14px;font-weight:700;color:#dc2626;">${fmtPct(taxaNoShow)}</p>
  </td>
</tr>
</table>

<!-- META ADS -->
<h2 style="margin:32px 0 16px;font-size:14px;font-weight:700;color:#0D1829;text-transform:uppercase;letter-spacing:0.05em;">Meta Ads</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${metaRow('Investimento total', fmtBRL(spend))}
${metaRow('Impressões', fmtN(impressions))}
${metaRow('Cliques', fmtN(clicks))}
${metaRow('CTR', fmtPct(ctr ? ctr * 100 : null))}
${metaRow('Leads (Meta)', fmtN(metaLeads))}
${metaRow('CPMQL', fmtBRL(cpmql))}
${metaRow('ROAS', fmtN(roas, 1) + 'x')}
${metaRow('ROAS Caixa', roasCaixa ? fmtN(roasCaixa, 1) + 'x' : '—')}
</table>

<!-- OUTLIERS -->
<h2 style="margin:32px 0 16px;font-size:14px;font-weight:700;color:#0D1829;text-transform:uppercase;letter-spacing:0.05em;">Perdas &amp; Pendências</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${metaRow('No-Shows', fmtN(noShows) + ' (' + fmtPct(taxaNoShow) + ')')}
${metaRow('Perdidos', fmtN(perdidos))}
${metaRow('Em negociação', fmtN(negociacao))}
</table>

<!-- FOOTER -->
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
Relatório gerado automaticamente pela Clara · OMNX<br/>
Dados: COHORT por data_lead_recebido · ${new Date().toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}
</p>
</div>

</td></tr></table>
</td></tr></table>
</body></html>`
}

function buildComparativeSection(rows: DashboardRow[], schedule: Schedule): string {
  // Agrupa por módulo e pega a primeira linha (dimensão 'todos')
  const summary = rows
    .filter((r) => r.dimension === 'todos' || r.dimension_value === 'todos')
    .map((r) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;">${moduleLabel(r.module)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${fmtN(r.mqls_count)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${fmtN(r.reunioes_count)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${fmtN(r.fechados_count)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${fmtBRL(r.faturamento_bruto)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${fmtBRL(r.caixa_recebido)}</td>
      </tr>
    `)
    .join('')

  if (!summary) return ''

  return `
    <div style="margin-top:32px;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="font-size:15px;font-weight:700;color:#0D1829;margin:0 0 16px;">Resumo executivo por módulo</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Módulo</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">MQLs</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Reuniões</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Fechados</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Faturamento</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Caixa</th>
          </tr>
        </thead>
        <tbody>${summary}</tbody>
      </table>
    </div>
  `
}

async function callClaraSummary(
  schedule: Schedule,
  weekStart: string,
  rows: DashboardRow[],
): Promise<string | null> {
  if (!schedule.use_clara_summary) return null

  // weekEnd derivado do weekStart (segunda + 6 dias), mesmo cálculo do caller
  const weekEndDate = new Date(weekStart + 'T00:00:00')
  weekEndDate.setDate(weekEndDate.getDate() + 6)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const tools = buildClaraTools()
  const openAiTools = toolsToOpenAIFormat(tools)

  try {
    // ── PASSO 1: Resolver credencial OpenRouter ──
    let apiKey: string
    try {
      const creds = await resolveWorkspaceCredential(sb, schedule.workspace_id, 'openrouter')
      apiKey = creds.apiKey
    } catch {
      console.error('[Clara Agent] Sem credencial OpenRouter para workspace', schedule.workspace_id)
      return null
    }

    // ── PASSO 2: Ler configurações da Clara ──
    const { data: settings } = await sb
      .from('clara_workspace_settings')
      .select('is_enabled, business_context, persistent_instructions, response_rules, scheduled_report_instructions, max_response_tokens, model_id, analysis_depth')
      .eq('workspace_id', schedule.workspace_id)
      .maybeSingle()

    if (settings && !settings.is_enabled) return null

    const modelId = settings?.model_id || DEFAULT_MODEL
    const analysisDepth = settings?.analysis_depth || 'standard'
    const maxTokens = Math.max(settings?.max_response_tokens ?? 2048, 2048)

    const globalInstructions = settings
      ? [settings.business_context, settings.persistent_instructions, settings.response_rules, settings.scheduled_report_instructions]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join('\n\n')
      : ''

    // ── PASSO 3: System prompt de autonomia ──
    const depthInstruction = analysisDepth === 'detailed'
      ? 'Seja extremamente detalhada. Use TODAS as ferramentas disponíveis. Gere 5-8 seções com análises profundas.'
      : analysisDepth === 'concise'
      ? 'Seja concisa. Use no máximo 2 ferramentas. Gere 2-3 parágrafos diretos.'
      : 'Use as ferramentas que julgar necessárias. Gere 3-5 seções com análises relevantes.'

    const claraOnlyInstruction = schedule.email_format === 'clara_only'
      ? `ESSE E-MAIL SERÁ O CORPO INTEIRO DA MENSAGEM. Não é um resumo dentro de um template. Escreva como se estivesse enviando um e-mail diretamente para o Bruno. Seja pessoal, direta e analítica. Inclua uma saudação, o contexto, a análise cruzada com números exatos, insights e recomendações acionáveis. Não repita os KPIs do dashboard de forma mecânica.`
      : ''

    const systemPrompt = `Você é a Clara, analista sênior de dados da OMNX. Você TEM AUTONOMIA para investigar.

SUA MISSÃO: Gerar um relatório semanal de tráfego com INSIGHTS ACIONÁVEIS.

VOCÊ TEM FERRAMENTAS DE INVESTIGAÇÃO. Use-as para buscar dados ANTES de escrever.
Máximo 5 tool calls — depois disso, ESCREVA o relatório com o que já tem.

FERRAMENTAS OBRIGATÓRIAS PARA ANÁLISE DE TRÁFEGO:
- Use 'get_campaigns_crm' para avaliar a eficiência REAL de cada campanha do Meta Ads cruzada com o CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).
- Use 'get_creatives_crm' para avaliar a eficiência REAL de cada criativo (CR-xxx) cruzada com o CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).
- Use 'get_kpis', 'compare_periods' e 'get_funnel' para contexto geral.

REGRAS DE OURO:
- NUNCA invente números. Cite os números EXATOS que recebeu das ferramentas.
- Ao analisar campanhas ou criativos, SEMPRE priorize métricas de CRM (CPMQL, CPAgendamento, CPReunião, CPV) em vez de métricas de vaidade (impressões, cliques, CTR).
- Compare SEMPRE com semana anterior e benchmarks antes de concluir.
- Priorize INSIGHTS sobre descrições.
- Termine com RECOMENDAÇÕES CONCRETAS e ACIONÁVEIS.
- Seja DIRETA e BRASILEIRA. Sem enrolação.
${claraOnlyInstruction}

FORMATO HTML (CRÍTICO — siga EXATAMENTE):
- Use APENAS tags de conteúdo: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <table>, <tr>, <td>, <th>, <br>, <hr>, <div>, <span>
- NÃO use <style>, <head>, <body>, <html>, <link>, <meta>, <script>
- NÃO escreva CSS inline style. Apenas tags semânticas.
- NÃO use markdown (\`\`\`html).
- NÃO invente classes CSS.
- Use <strong> para destaques, não CSS.

${depthInstruction}

CONTEXTO DA EMPRESA:
${globalInstructions || 'Nenhum contexto adicional configurado.'}

PERÍODO: ${weekStart} a ${weekEnd}.
${schedule.clara_prompt ? `\nINSTRUÇÕES: ${schedule.clara_prompt}` : ''}`

    // ── PASSO 4: Agent loop com function calling ──
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Gere o relatório de tráfego da semana ${weekStart}. Use as ferramentas disponíveis para investigar antes de escrever.` },
    ]

    let finalContent: string | null = null

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const isLastIteration = i === MAX_TOOL_ITERATIONS - 1
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://omnx.pro',
          'X-Title': 'Clara - OMNX Relatórios',
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          tools: isLastIteration ? undefined : openAiTools, // última iteração força resposta sem tools
          tool_choice: isLastIteration ? 'none' : 'auto',
          max_tokens: isLastIteration ? Math.max(maxTokens, 4096) : maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(90_000),
      })

      if (!res.ok) {
        console.error(`[Clara Agent] OpenRouter error ${res.status}`)
        break
      }

      const completion = await res.json()
      const choice = completion?.choices?.[0]
      const msg = choice?.message

      if (!msg) break

      // Adiciona a resposta ao histórico
      messages.push(msg)

      // Se tem tool_calls, executa e continua
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fn = tc.function
          console.log(`[Clara Agent] Tool call: ${fn.name}(${fn.arguments?.slice(0, 200)})`)
          const result = await executeToolCall(tools, sb, schedule.workspace_id, fn.name, fn.arguments)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          })
        }
        // Após 3 iterações de tools, força a escrita
        if (i >= 2) {
          messages.push({
            role: 'user',
            content: 'AGORA ESCREVA O RELATÓRIO com os dados coletados. Sem mais ferramentas. Números exatos. Use tags HTML de conteúdo (h2, h3, p, ul, li, strong, table). NÃO use <style>, <head>, <html>, <body>, nem markdown.',
          })
        }
        continue
      }

      // Se tem content, é a resposta final
      if (msg.content && msg.content.trim().length > 0) {
        finalContent = msg.content
        break
      }
    }

    // Fallback: se ainda sem resposta, chamada final sem tools
    if (!finalContent) {
      messages.push({
        role: 'user',
        content: 'ESCREVA O RELATÓRIO AGORA. Use dados já coletados. Números exatos. HTML de conteúdo. Sem CSS, sem markdown.',
      })
      try {
        const finalRes = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://omnx.pro', 'X-Title': 'Clara - OMNX Relatórios' },
          body: JSON.stringify({ model: modelId, messages, max_tokens: 4096, temperature: 0.3 }),
          signal: AbortSignal.timeout(90_000),
        })
        if (finalRes.ok) {
          const fd = await finalRes.json()
          finalContent = fd?.choices?.[0]?.message?.content || null
        }
      } catch { /* fallback falhou */ }
    }

    return finalContent
  } catch (e) {
    console.error('[Clara Agent] Erro:', e instanceof Error ? e.message : String(e))
    return null
  }
}

async function sendEmail(
  schedule: Schedule,
  html: string,
): Promise<{ messageId: string | null; error: string | null }> {
  if (!RESEND_API_KEY) {
    return { messageId: null, error: 'RESEND_API_KEY não configurada' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: schedule.recipient_emails,
        reply_to: schedule.reply_to || undefined,
        subject: schedule.subject,
        html,
      }),
    })

    const data = await res.json().catch(() => ({} as Record<string, unknown>))

    if (!res.ok) {
      return { messageId: null, error: (data as { message?: string }).message ?? `Resend erro ${res.status}` }
    }

    return { messageId: (data as { id?: string }).id ?? null, error: null }
  } catch (e) {
    return { messageId: null, error: e instanceof Error ? e.message : String(e) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const body = (await req.json()) as {
      schedule_id?: string
      week_start?: string
      test_email?: string
      dry_run?: boolean
    }

    // Chamada interna (cron via pg_cron) autenticada com o service_role_key.
    // Substitui o antigo checador de '_internal_secret'/BOT_INTERNAL_SECRET, que
    // era inerte aqui: o cron nunca enviava esse campo no body. Consolidado no
    // guard único de _shared/require-service-role.ts.
    const isServiceCall = isServiceRoleCaller(req)
    let userId = 'service'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (!isServiceCall) {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(authHeader)
      if (authErr || !user) {
        return jsonResponse({ error: 'Não autorizado' }, 401)
      }
      userId = user.id
    }

    const { schedule_id, week_start: explicitWeekStart, test_email, dry_run } = body
    if (!schedule_id) {
      return jsonResponse({ error: 'schedule_id é obrigatório' }, 400)
    }

    // Busca schedule
    const { data: schedule, error: scheduleErr } = await supabase
      .from('weekly_email_schedules')
      .select('*')
      .eq('id', schedule_id)
      .maybeSingle()

    if (scheduleErr || !schedule) {
      return jsonResponse({ error: 'Automação não encontrada' }, 404)
    }

    const typedSchedule = schedule as Schedule

    // A chamada manual só pode executar uma automação da conta ativa do usuário.
    // O cron usa service role e continua autorizado pelo guard acima.
    if (!isServiceCall) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', typedSchedule.workspace_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      if (!member) return jsonResponse({ error: 'Acesso negado para esta automação' }, 403)
    }

    // Determina week_start
    const weekStart = explicitWeekStart ?? getWeekStart(undefined, typedSchedule.report_type)
    const weekEndDate = new Date(weekStart + 'T00:00:00')
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const weekEnd = weekEndDate.toISOString().slice(0, 10)

    // Insere log pending
    const { data: log, error: logErr } = await supabase
      .from('weekly_email_logs')
      .insert({
        schedule_id: typedSchedule.id,
        week_start: weekStart,
        report_type: typedSchedule.report_type,
        recipient_emails: test_email ? [test_email] : typedSchedule.recipient_emails,
        subject: typedSchedule.subject,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logErr || !log) {
      return jsonResponse({ error: `Erro ao criar log: ${logErr?.message}` }, 500)
    }

    // Busca dados
    const rows = await fetchDashboardData(supabase, typedSchedule, weekStart)

    if (!rows.length) {
      await supabase
        .from('weekly_email_logs')
        .update({ status: 'failed', error_message: 'Nenhum dado encontrado para o período' })
        .eq('id', log.id)
      return jsonResponse({ error: 'Nenhum dado encontrado para o período' }, 404)
    }

    // Gera HTML
    let html: string
    const claraSummary = typedSchedule.use_clara_summary
      ? await callClaraSummary(typedSchedule, weekStart, rows)
      : null

    if (typedSchedule.email_format === 'clara_only') {
      if (!claraSummary) {
        const errorMsg = 'A Clara não conseguiu gerar a análise autônoma (verifique a credencial OpenRouter do workspace). E-mail não enviado para evitar envio do template visual.'
        await supabase
          .from('weekly_email_logs')
          .update({ status: 'failed', error_message: errorMsg })
          .eq('id', log.id)
        await supabase
          .from('weekly_email_schedules')
          .update({ last_error: errorMsg })
          .eq('id', typedSchedule.id)
        return jsonResponse({ error: errorMsg }, 502)
      }
      // Email escrito apenas pela Clara, sem o template visual padrão
      html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${typedSchedule.subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:720px;width:100%;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
<tr><td style="background:#0D1829;padding:28px 32px;">
<p style="margin:0;color:#C9A240;font-size:12px;font-weight:600;letter-spacing:0.05em;">CLARA · RELATÓRIO AUTÔNOMO</p>
<h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">${typedSchedule.subject}</h1>
<p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${weekStart} a ${weekEnd}</p>
</td></tr>
<tr><td style="padding:28px 32px;">
<div style="font-size:14px;color:#1e293b;line-height:1.7;">${claraSummary}</div>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
Relatório gerado automaticamente pela Clara · OMNX<br/>
${new Date().toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}
</p>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
    } else {
      html = buildEmailHtml(typedSchedule, weekStart, weekEnd, rows)
      if (claraSummary) {
        html = html.replace(
          /<td style="padding:28px 32px;">/,
          `<td style="padding:28px 32px;">
           <div style="margin-bottom:24px;padding:20px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border-left:4px solid #C9A240;border-radius:6px;">
             <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#C9A240;letter-spacing:0.1em;">ANÁLISE DA CLARA</p>
             <div style="font-size:14px;color:#1e293b;line-height:1.7;">${claraSummary}</div>
           </div>`,
        )
      }
    }

    if (dry_run) {
      return jsonResponse({
        success: true,
        dry_run: true,
        week_start: weekStart,
        week_end: weekEnd,
        rows_count: rows.length,
        html_preview: html.slice(0, 2000),
      })
    }

    // Envia e-mail
    const { messageId, error: sendError } = await sendEmail(
      { ...typedSchedule, recipient_emails: test_email ? [test_email] : typedSchedule.recipient_emails },
      html,
    )

    if (sendError) {
      await supabase
        .from('weekly_email_logs')
        .update({ status: 'failed', error_message: sendError })
        .eq('id', log.id)

      await supabase
        .from('weekly_email_schedules')
        .update({ last_error: sendError })
        .eq('id', typedSchedule.id)

      return jsonResponse({ error: sendError }, 502)
    }

    // Atualiza schedule
    const { data: nextRunData, error: nextRunErr } = await supabase.rpc('calculate_next_run_at', {
      p_frequency: typedSchedule.frequency,
      p_day_of_week: typedSchedule.day_of_week,
      p_day_of_month: typedSchedule.day_of_month,
      p_time_of_day: typedSchedule.time_of_day,
      p_timezone: typedSchedule.timezone,
      p_after: new Date().toISOString(),
    })

    const nextRunAt = nextRunErr || !nextRunData ? null : nextRunData

    await supabase
      .from('weekly_email_schedules')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
        email_sent_count: typedSchedule.email_sent_count + 1,
        last_error: null,
      })
      .eq('id', typedSchedule.id)

    await supabase
      .from('weekly_email_logs')
      .update({
        status: 'sent',
        resend_message_id: messageId,
        recipient_emails: test_email ? [test_email] : typedSchedule.recipient_emails,
      })
      .eq('id', log.id)

    return jsonResponse({
      success: true,
      message_id: messageId,
      week_start: weekStart,
      week_end: weekEnd,
      recipients: test_email ? [test_email] : typedSchedule.recipient_emails,
      next_run_at: nextRunAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-weekly-report-email] erro:', msg)
    return jsonResponse({ error: `Erro interno: ${msg}` }, 500)
  }
})
