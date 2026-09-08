// report-tools.ts — Ferramentas de investigação da Clara Agente Autônoma
// Cada tool é uma função que a Clara pode chamar via function calling para
// investigar hipóteses, cruzar dados e gerar insights.
//
// Interface compatível com OpenAI/OpenRouter function calling:
//   { name, description, parameters (JSON Schema), execute }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

export interface ClaraTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (supabase: SupabaseClient, workspaceId: string, args: Record<string, unknown>) => Promise<unknown>
}

export function buildClaraTools(): ClaraTool[] {
  return [
    {
      name: 'get_kpis',
      description: 'Retorna todos os KPIs do tráfego para uma semana: leads, MQLs, investimento, CPMQL, ROAS, taxas do funil, receita e caixa. Chamar SEMPRE primeiro.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Segunda-feira da semana no formato YYYY-MM-DD (ex: 2026-07-13)' },
          week_end: { type: 'string', description: 'Domingo da semana no formato YYYY-MM-DD (ex: 2026-07-19)' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_kpis', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_kpis: ${error.message}`)
        return data
      },
    },

    {
      name: 'compare_periods',
      description: 'Compara os KPIs da semana atual com a semana anterior. Retorna cada métrica com valor atual, anterior e delta percentual. Use para detectar o que subiu ou caiu.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início da semana atual no formato YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim da semana atual no formato YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_comparison', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_comparison: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_funnel',
      description: 'Retorna o funil de conversão completo: leads → MQLs → conectados → agendados → reuniões → fechados, com taxas de conversão entre cada etapa, no-shows e perdidos.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início da semana YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim da semana YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_funnel', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_funnel: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_creatives',
      description: 'Retorna os 5 criativos mais eficientes (menor CPL) e os 5 piores (maior CPL) no período, com spend, impressions, clicks, leads e CTR. Use para identificar quais criativos escalar e quais pausar.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_creatives', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_creatives: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_campaigns',
      description: 'Retorna performance de cada campanha do Meta Ads: spend, impressions, clicks, leads, CTR e CPL. Use para comparar eficiência entre campanhas.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_campaigns', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_campaigns: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_campaigns_crm',
      description: 'Cruza campanhas do Meta Ads com o CRM: retorna spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS e ROAS Caixa por campanha. Use SEMPRE que precisar avaliar eficiência real de campanhas em termos de resultado comercial.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_campaigns_crm', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_campaigns_crm: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_creatives_crm',
      description: 'Cruza criativos do Meta Ads (identificados por CR-xxx no ad_name/utm_term) com o CRM: retorna spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS e ROAS Caixa por criativo. Use SEMPRE que precisar avaliar eficiência real de criativos em termos de resultado comercial.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_creatives_crm', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_creatives_crm: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_channels',
      description: 'Retorna breakdown de leads, MQLs, oportunidades, vendas e faturamento por canal de origem (utm_source: Facebook, Google, Instagram, etc). Use para comparar volume vs qualidade entre canais.',
      parameters: {
        type: 'object',
        properties: {
          week_start: { type: 'string', description: 'Data de início YYYY-MM-DD' },
          week_end: { type: 'string', description: 'Data de fim YYYY-MM-DD' },
        },
        required: ['week_start', 'week_end'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_channels', {
          p_workspace_id: ws,
          p_week_start: args.week_start,
          p_week_end: args.week_end,
        })
        if (error) throw new Error(`get_clara_channels: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_trend',
      description: 'Retorna a tendência de uma métrica específica nas últimas semanas (até 12). Use para detectar padrões de subida ou queda que não são visíveis em uma única semana. Métricas válidas: leads_count, mqls_count, conectados_count, agendados_count, reunioes_count, fechados_count, no_shows_count, perdidos_count, meta_spend, meta_impressions, meta_clicks, cpmql, roas, taxa_conexao_pct, taxa_agendamento_pct, taxa_no_show_pct.',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            description: 'Nome da métrica (ex: "cpmql", "mqls_count", "meta_spend")',
          },
          weeks_back: {
            type: 'integer',
            description: 'Quantas semanas para trás (1-12, default 8)',
          },
        },
        required: ['metric'],
      },
      execute: async (sb, ws, args) => {
        const { data, error } = await sb.rpc('get_clara_trend', {
          p_workspace_id: ws,
          p_metric: args.metric,
          p_weeks_back: (args.weeks_back as number) ?? 8,
        })
        if (error) throw new Error(`get_clara_trend: ${error.message}`)
        return data
      },
    },

    {
      name: 'get_benchmarks',
      description: 'Retorna médias e desvios-padrão históricos das principais métricas (12 semanas). Use para detectar anomalias — qualquer valor fora de 2 desvios-padrão merece investigação.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async (sb, ws, _args) => {
        const { data, error } = await sb.rpc('get_clara_benchmarks', {
          p_workspace_id: ws,
          p_metric: 'all',
        })
        if (error) throw new Error(`get_clara_benchmarks: ${error.message}`)
        return data
      },
    },
  ]
}

export function toolsToOpenAIFormat(tools: ClaraTool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export async function executeToolCall(
  tools: ClaraTool[],
  supabase: SupabaseClient,
  workspaceId: string,
  name: string,
  args: string,
): Promise<string> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return JSON.stringify({ error: `Tool desconhecida: ${name}` })

  try {
    if (!args || typeof args !== 'string' || args === 'undefined' || args.trim() === '') {
      args = '{}'
    }
    const parsedArgs = JSON.parse(args)
    const result = await tool.execute(supabase, workspaceId, parsedArgs)
    return JSON.stringify(result)
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}
