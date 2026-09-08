/**
 * Replay local do agent loop da Clara (send-weekly-report-email) para diagnóstico.
 * Executa as MESMAS chamadas OpenRouter e RPCs read-only do loop real,
 * imprimindo status/finish_reason/tokens por iteração. Nunca imprime a chave.
 *
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... PROJECT_REF=... node scripts/diagnostico-clara-agent-loop.mjs
 */

const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const SUPABASE_URL = `https://${REF}.supabase.co`
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SCHEDULE_ID = '311b77f1-0002-46b7-81e9-9241e942c7a3'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_TOOL_ITERATIONS = 6

if (!SRK) { console.error('SUPABASE_SERVICE_ROLE_KEY ausente'); process.exit(1) }

const H = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' }

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  return res.json()
}
async function rpc(name, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(params) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${name}: ${data?.message || res.status}`)
  return data
}

// ---- schedule + settings + credencial (mesmo caminho da edge function) ----
const schedule = (await rest(`weekly_email_schedules?id=eq.${SCHEDULE_ID}&select=*`))[0]
if (!schedule) { console.error('schedule não encontrado'); process.exit(1) }
const ws = schedule.workspace_id

const settings = (await rest(`clara_workspace_settings?workspace_id=eq.${ws}&select=is_enabled,business_context,persistent_instructions,response_rules,scheduled_report_instructions,max_response_tokens,model_id,analysis_depth`))[0]
console.log('settings: is_enabled =', settings?.is_enabled, '| model_id =', settings?.model_id, '| depth =', settings?.analysis_depth, '| max_response_tokens =', settings?.max_response_tokens)

const meta = (await rpc('get_workspace_credential_meta', { p_workspace_id: ws, p_provider: 'openrouter' }))
const metaRow = Array.isArray(meta) ? meta[0] : meta
const apiKey = await rpc('get_decrypted_secret', { p_secret_key_id: metaRow.secret_key_id })

// week_start do último log (mesmo usado no teste que falhou)
const lastLog = (await rest(`weekly_email_logs?schedule_id=eq.${SCHEDULE_ID}&select=week_start&order=created_at.desc&limit=1`))[0]
const weekStart = lastLog?.week_start || '2026-07-13'
const weekEndDate = new Date(weekStart + 'T00:00:00'); weekEndDate.setDate(weekEndDate.getDate() + 6)
const weekEnd = weekEndDate.toISOString().slice(0, 10)
console.log('week:', weekStart, '→', weekEnd, '| email_format =', schedule.email_format)

// ---- tools (mesmos schemas de report-tools.ts) ----
const weekParams = {
  type: 'object',
  properties: {
    week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
    week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
  },
  required: ['week_start', 'week_end'],
}
const TOOLS = [
  { name: 'get_kpis', rpc: 'get_clara_kpis', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Retorna todos os KPIs do tráfego para uma semana: leads, MQLs, investimento, CPMQL, ROAS, taxas do funil, receita e caixa. Chamar SEMPRE primeiro.', parameters: weekParams },
  { name: 'compare_periods', rpc: 'get_clara_comparison', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Compara os KPIs da semana atual com a semana anterior. Retorna cada métrica com valor atual, anterior e delta percentual.', parameters: weekParams },
  { name: 'get_funnel', rpc: 'get_clara_funnel', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Retorna o funil de conversão completo com taxas entre etapas.', parameters: weekParams },
  { name: 'get_creatives', rpc: 'get_clara_creatives', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Retorna os 5 criativos mais eficientes e os 5 piores no período.', parameters: weekParams },
  { name: 'get_campaigns', rpc: 'get_clara_campaigns', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Retorna performance de cada campanha do Meta Ads.', parameters: weekParams },
  { name: 'get_campaigns_crm', rpc: 'get_clara_campaigns_crm', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Cruza campanhas do Meta Ads com o CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).', parameters: weekParams },
  { name: 'get_creatives_crm', rpc: 'get_clara_creatives_crm', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Cruza criativos (CR-xxx) do Meta Ads com o CRM.', parameters: weekParams },
  { name: 'get_channels', rpc: 'get_clara_channels', args: (a) => ({ p_workspace_id: ws, p_week_start: a.week_start, p_week_end: a.week_end }), description: 'Breakdown de leads, MQLs, vendas e faturamento por canal.', parameters: weekParams },
  { name: 'get_trend', rpc: 'get_clara_trend', args: (a) => ({ p_workspace_id: ws, p_metric: a.metric, p_weeks_back: a.weeks_back ?? 8 }), description: 'Tendência de uma métrica nas últimas semanas.', parameters: { type: 'object', properties: { metric: { type: 'string' }, weeks_back: { type: 'integer' } }, required: ['metric'] } },
  { name: 'get_benchmarks', rpc: 'get_clara_benchmarks', args: () => ({ p_workspace_id: ws, p_metric: 'all' }), description: 'Médias e desvios-padrão históricos (12 semanas).', parameters: { type: 'object', properties: {}, required: [] } },
]
const openAiTools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))

// ---- system prompt (réplica EXATA do template da edge function, linhas 447-482) ----
const modelId = settings?.model_id || 'qwen/qwen3.6-plus'
const analysisDepth = settings?.analysis_depth || 'standard'
const maxTokens = Math.max(settings?.max_response_tokens ?? 2048, 2048)
const globalInstructions = [settings?.business_context, settings?.persistent_instructions, settings?.response_rules, settings?.scheduled_report_instructions].filter((v) => typeof v === 'string' && v.trim()).join('\n\n')
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

const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `Gere o relatório de tráfego da semana ${weekStart}. Use as ferramentas disponíveis para investigar antes de escrever.` },
]

async function callOpenRouter(body) {
  const t0 = Date.now()
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://omnx.pro', 'X-Title': 'Clara - OMNX Relatórios' },
    body: JSON.stringify(body),
  })
  const elapsedMs = Date.now() - t0
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json, elapsedMs }
}

let finalContent = null
for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
  const isLast = i === MAX_TOOL_ITERATIONS - 1
  const { status, json, elapsedMs } = await callOpenRouter({
    model: modelId,
    messages,
    tools: isLast ? undefined : openAiTools,
    tool_choice: isLast ? 'none' : 'auto',
    max_tokens: isLast ? Math.max(maxTokens, 4096) : maxTokens,
    temperature: 0.3,
  })
  if (status !== 200) {
    console.log(`\n[iter ${i}] HTTP ${status} (${elapsedMs}ms) →`, JSON.stringify(json).slice(0, 700))
    break
  }
  const choice = json?.choices?.[0]
  const msg = choice?.message
  const usage = json?.usage
  console.log(`\n[iter ${i}] 200 em ${(elapsedMs / 1000).toFixed(1)}s | finish=${choice?.finish_reason} | content_len=${msg?.content?.length ?? 'null'} | tool_calls=${msg?.tool_calls?.length ?? 0} | reasoning_len=${msg?.reasoning?.length ?? 0} | usage=${JSON.stringify(usage)}`)
  if (!msg) { console.log('sem message — break'); break }
  messages.push(msg)
  if (msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      const tool = TOOLS.find((t) => t.name === tc.function.name)
      let result
      try {
        let raw = tc.function.arguments
        if (!raw || raw === 'undefined' || !raw.trim()) raw = '{}'
        result = JSON.stringify(await rpc(tool.rpc, tool.args(JSON.parse(raw))))
      } catch (e) { result = JSON.stringify({ error: String(e.message || e) }) }
      console.log(`  tool ${tc.function.name} → ${result.length} chars`)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
    }
    if (i >= 2) messages.push({ role: 'user', content: 'AGORA ESCREVA O RELATÓRIO com os dados coletados. Sem mais ferramentas. HTML de conteúdo.' })
    continue
  }
  if (msg.content && msg.content.trim()) { finalContent = msg.content; break }
}

if (!finalContent) {
  console.log('\n[loop terminou sem content] chamando fallback final sem tools…')
  messages.push({ role: 'user', content: 'ESCREVA O RELATÓRIO AGORA.' })
  const { status, json } = await callOpenRouter({ model: modelId, messages, max_tokens: 4096, temperature: 0.3 })
  console.log('fallback →', status, '| finish =', json?.choices?.[0]?.finish_reason, '| content_len =', json?.choices?.[0]?.message?.content?.length ?? 'null', '| body =', status !== 200 ? JSON.stringify(json).slice(0, 500) : '(ok)')
  finalContent = json?.choices?.[0]?.message?.content || null
}

console.log('\nRESULTADO:', finalContent ? `OK — ${finalContent.length} chars de análise` : 'FALHOU — retornaria null (502)')
