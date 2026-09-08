// Edge Function protótipo: Clara 2.0 — Relatório Autônomo (single-shot rápido)
// Chama todas as ferramentas de investigação em paralelo e entrega o contexto
// completo para o LLM escrever UM relatório narrativo autônomo em Markdown puro.
// Sem template de dashboard.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { isServiceRoleCaller } from '../_shared/require-service-role.ts'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Clara - OMNX <clara@omnx.pro>'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  replyTo?: string | null,
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
        from: RESEND_FROM_EMAIL,
        to,
        reply_to: replyTo || undefined,
        subject,
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

function getWeekBoundaries(dateInput?: string): { start: string; end: string } {
  const tz = 'America/Sao_Paulo'

  let year: number
  let month: number
  let day: number

  if (dateInput) {
    const [y, m, d] = dateInput.split('-').map(Number)
    year = y
    month = m
    day = d
  } else {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const parts = fmt.formatToParts(new Date())
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    year = get('year')
    month = get('month')
    day = get('day')
  }

  const base = new Date(year, month - 1, day)
  const weekday = base.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  const monday = new Date(base)
  monday.setDate(base.getDate() + diff)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const body = (await req.json()) as {
      workspace_id?: string
      week_start?: string
      prompt_extra?: string
      output_format?: 'markdown' | 'html'
      max_tokens?: number
      send_email?: boolean
      recipient_emails?: string[]
      subject?: string
      reply_to?: string
      model_id?: string
    }

    const isServiceCall = isServiceRoleCaller(req)
    let userId = 'service'
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if (!isServiceCall) {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(authHeader)
      if (authErr || !user) return jsonResponse({ error: 'Não autorizado' }, 401)
      userId = user.id
    }

    const workspaceId = body.workspace_id ?? '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
    const { start, end } = getWeekBoundaries(body.week_start)
    const shouldSendEmail = body.send_email === true
    const outputFormat = shouldSendEmail ? 'html' : (body.output_format ?? 'markdown')
    const maxTokens = body.max_tokens ?? 4096

    if (!isServiceCall) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      if (!member) return jsonResponse({ error: 'Acesso negado para este workspace' }, 403)
    }

    // Credencial OpenRouter
    let apiKey: string
    try {
      const creds = await resolveWorkspaceCredential(supabase, workspaceId, 'openrouter')
      apiKey = creds.apiKey
    } catch {
      return jsonResponse({ error: 'Sem credencial OpenRouter para este workspace' }, 400)
    }

    // Settings da Clara
    const { data: settings } = await supabase
      .from('clara_workspace_settings')
      .select('is_enabled, business_context, persistent_instructions, response_rules, scheduled_report_instructions, max_response_tokens, model_id, analysis_depth')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (settings && !settings.is_enabled) {
      return jsonResponse({ error: 'Clara desabilitada para este workspace' }, 400)
    }

    const modelId = body.model_id || settings?.model_id || DEFAULT_MODEL
    const analysisDepth = settings?.analysis_depth || 'detailed'
    const finalMaxTokens = Math.max(settings?.max_response_tokens ?? maxTokens, maxTokens)

    const globalInstructions = settings
      ? [settings.business_context, settings.persistent_instructions, settings.response_rules, settings.scheduled_report_instructions]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .join('\n\n')
      : ''

    const depthInstruction =
      analysisDepth === 'detailed'
        ? 'Relatório DETALHADO: 6-10 seções, análises profundas, múltiplas hipóteses testadas, recomendações específicas.'
        : analysisDepth === 'concise'
        ? 'Relatório CONCISO: 2-3 parágrafos diretos com a conclusão principal.'
        : 'Relatório STANDARD: 4-6 seções com análises relevantes e recomendações acionáveis.'

    // Coleta TODAS as ferramentas de uma vez (paralelo)
    const [
      { data: kpis, error: e1 },
      { data: comparison, error: e2 },
      { data: funnel, error: e3 },
      { data: campaigns, error: e4 },
      { data: creatives, error: e5 },
      { data: channels, error: e6 },
      { data: benchmarks, error: e7 },
    ] = await Promise.all([
      supabase.rpc('get_clara_kpis', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_comparison', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_funnel', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_campaigns', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_creatives', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_channels', { p_workspace_id: workspaceId, p_week_start: start, p_week_end: end }),
      supabase.rpc('get_clara_benchmarks', { p_workspace_id: workspaceId, p_metric: 'all' }),
    ])

    const errors = [e1, e2, e3, e4, e5, e6, e7].filter(Boolean)
    if (errors.length > 0) {
      return jsonResponse({ error: 'Erro ao coletar dados', details: errors.map((e) => e!.message) }, 500)
    }

    const context = {
      semana: { inicio: start, fim: end },
      kpis,
      comparativo_semana_anterior: comparison,
      funil: funnel,
      campanhas: campaigns,
      criativos: creatives,
      canais: channels,
      benchmarks_historicos: benchmarks,
    }

    const systemPrompt = `Você é a Clara, analista sênior de performance da OMNX.

MISSÃO: Gerar um relatório de análise AUTÔNOMO — uma investigação completa, não um dashboard descrito.

VOCÊ RECEBEU TODOS OS DADOS DE UMA VEZ. Sua tarefa é:
1. Identificar o que é realmente importante nesta semana
2. Formular hipóteses sobre causas
3. Cruzar os dados para confirmar ou refutar
4. Entregar insights acionáveis e recomendações concretas

REGRAS DE OURO:
- NUNCA invente números. Cite os valores EXATOS dos dados fornecidos.
- NUNCA diga "os dados mostram" sem citar qual dado.
- Compare com a semana anterior e com benchmarks históricos.
- Seja direta, brasileira, sem enrolação.

FORMATO DE SAÍDA (${outputFormat.toUpperCase()}):
${
  outputFormat === 'html'
    ? 'Use tags HTML de conteúdo: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <table>, <tr>, <td>, <th>, <br>. NÃO use <style>, <head>, <body>, <html>, <script>.'
    : 'Use Markdown puro: #, ##, ###, listas, negrito, tabelas markdown. NÃO use HTML.'
}

ESTRUTURA OBRIGATÓRIA:
1. ## Resumo Executivo (3-5 bullets com os achados mais importantes)
2. ## O que mudou de importante (dados da semana + comparação com anterior)
3. ## Investigação: hipóteses testadas (use funil, campanhas, criativos, canais e benchmarks)
4. ## Análise de campanhas e criativos
5. ## Riscos e oportunidades
6. ## Recomendações acionáveis numeradas

${depthInstruction}

CONTEXTO DA EMPRESA:
${globalInstructions || 'Nenhum contexto adicional configurado.'}
${body.prompt_extra ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO: ${body.prompt_extra}` : ''}`

    const userPrompt = `Abaixo estão TODOS os dados da semana ${start} a ${end}. Gere o relatório autônomo completo.

DADOS BRUTOS (JSON):
${JSON.stringify(context, null, 2)}`

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnx.pro',
        'X-Title': 'Clara Research Report',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: finalMaxTokens,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(180_000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      return jsonResponse({ error: `OpenRouter error ${res.status}: ${err}` }, 502)
    }

    const completion = await res.json()
    const report = completion?.choices?.[0]?.message?.content

    if (!report || report.trim().length === 0) {
      return jsonResponse({ error: 'Clara não gerou conteúdo' }, 500)
    }

    if (shouldSendEmail) {
      const recipients = body.recipient_emails ?? []
      if (recipients.length === 0 || !recipients.every((e) => typeof e === 'string' && e.includes('@'))) {
        return jsonResponse({ error: 'recipient_emails inválido' }, 400)
      }

      const emailSubject = body.subject?.trim()
        ? body.subject
        : `Relatório Autônomo da Clara — ${start} a ${end}`

      const { messageId, error: sendError } = await sendEmail(
        recipients,
        emailSubject,
        report,
        body.reply_to,
      )

      if (sendError) {
        return jsonResponse({ error: `Erro ao enviar email: ${sendError}` }, 502)
      }

      return jsonResponse({
        success: true,
        week_start: start,
        week_end: end,
        model: modelId,
        message_id: messageId,
        recipients,
        subject: emailSubject,
      })
    }

    return jsonResponse({
      success: true,
      week_start: start,
      week_end: end,
      model: modelId,
      report,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[clara-research-report] erro:', msg)
    return jsonResponse({ error: `Erro interno: ${msg}` }, 500)
  }
})
