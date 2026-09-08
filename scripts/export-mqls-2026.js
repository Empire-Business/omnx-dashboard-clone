#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const OUTPUT_PATH = path.join(ROOT, 'exports', 'mqls-2026.csv')
const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L'
const PAGE_SIZE = 1000

function readEnvFile(filePath) {
  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return env
}

function csvEscape(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function rowToCSV(cols, obj) {
  return cols.map(c => csvEscape(obj[c])).join(',')
}

function isMqlByTag(tags) {
  if (!tags) return false
  return tags.toLowerCase().split(',').map(t => t.trim()).some(t => t === 'mql')
}

const CONTATO_SELECT = [
  'ghl_id', 'nome', 'email', 'telefone', 'country', 'date_created',
  'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content',
  'tt_source', 'tt_campaign', 'tt_medium', 'tt_term', 'tt_content',
  'fbclid', 'gclid', 'owner_name', 'closer_name', 'tags',
  'como_nos_conheceu', 'faturamento_anual', 'perfil_inteligente',
  'descricao_negocio', 'tipo_empresa',
  'investe_trafego', 'treinamento_marketing', 'tempo_usa_internet',
  'super_heroi_favorito', 'disponibilidade_barra', 'print_instagram',
  'situacao_atual', 'preciso_ajuda_para', 'obstaculos',
  'visao_6_meses', 'plano_meta', 'situacao_investimentos', 'possiveis_objecoes',
  'swot_forcas', 'swot_fraquezas', 'swot_oportunidades', 'swot_ameacas',
  'follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4', 'follow_up_5',
  'follow_up_6', 'follow_up_7', 'follow_up_8', 'follow_up_9', 'follow_up_10',
  'follow_up_11', 'follow_up_12', 'follow_up_13', 'follow_up_14', 'follow_up_15',
  'comunicacao_veredito', 'comunicacao_erros_atuais', 'comunicacao_tendencia_mercado',
  'analise_oferta_principal', 'banco_ideias_conteudo', 'canais_venda_recomendados',
  'analise_gap_pontos_fracos', 'estudo_concorrentes',
  'estrategia_antibrjection_scripts', 'plano_acao_passo_a_passo',
  'id_analise', 'link_analise', 'status_analise', 'data_analise',
].join(', ')

const OPP_SELECT = `
  id, ghl_opportunity_id, pipeline_name, pipeline_id, status, lost_reason,
  sdr_name, vendedor_closer,
  data_lead_recebido, data_conectado, data_qualificado,
  data_tentativa_1, data_tentativa_2, data_tentativa_3, data_tentativa_4,
  data_tentativa_5, data_tentativa_6, data_tentativa_7, data_tentativa_8,
  data_no_show, data_agendamento_reuniao, data_reuniao_agendada, data_reuniao_realizada,
  data_agendamento_vendas, data_realizacao_vendas, data_no_show_vendas,
  data_negociacao, data_fechado, data_perdido, data_perdido_vendas,
  resumo_ia, percepcao_closer,
  contatos!inner(${CONTATO_SELECT})
`

const ALL_COLS = [
  // Oportunidade
  'opp_id', 'ghl_opportunity_id', 'pipeline_name', 'status', 'lost_reason',
  'sdr_name', 'vendedor_closer',
  'data_lead_recebido', 'data_conectado', 'data_qualificado',
  'data_tentativa_1', 'data_tentativa_2', 'data_tentativa_3', 'data_tentativa_4',
  'data_tentativa_5', 'data_tentativa_6', 'data_tentativa_7', 'data_tentativa_8',
  'data_no_show', 'data_agendamento_reuniao', 'data_reuniao_agendada', 'data_reuniao_realizada',
  'data_agendamento_vendas', 'data_realizacao_vendas', 'data_no_show_vendas',
  'data_negociacao', 'data_fechado', 'data_perdido', 'data_perdido_vendas',
  'resumo_ia', 'percepcao_closer',
  // Contato
  'ghl_id', 'nome', 'email', 'telefone', 'country', 'date_created',
  'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content',
  'tt_source', 'tt_campaign', 'tt_medium', 'tt_term', 'tt_content',
  'fbclid', 'gclid', 'owner_name', 'closer_name', 'tags',
  'como_nos_conheceu', 'faturamento_anual', 'perfil_inteligente',
  'descricao_negocio', 'tipo_empresa',
  'investe_trafego', 'treinamento_marketing', 'tempo_usa_internet',
  'super_heroi_favorito', 'disponibilidade_barra', 'print_instagram',
  'situacao_atual', 'preciso_ajuda_para', 'obstaculos',
  'visao_6_meses', 'plano_meta', 'situacao_investimentos', 'possiveis_objecoes',
  'swot_forcas', 'swot_fraquezas', 'swot_oportunidades', 'swot_ameacas',
  'follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4', 'follow_up_5',
  'follow_up_6', 'follow_up_7', 'follow_up_8', 'follow_up_9', 'follow_up_10',
  'follow_up_11', 'follow_up_12', 'follow_up_13', 'follow_up_14', 'follow_up_15',
  'comunicacao_veredito', 'comunicacao_erros_atuais', 'comunicacao_tendencia_mercado',
  'analise_oferta_principal', 'banco_ideias_conteudo', 'canais_venda_recomendados',
  'analise_gap_pontos_fracos', 'estudo_concorrentes',
  'estrategia_antibrjection_scripts', 'plano_acao_passo_a_passo',
  'id_analise', 'link_analise', 'status_analise', 'data_analise',
]

async function main() {
  if (!fs.existsSync(ENV_PATH)) throw new Error(`Arquivo de ambiente não encontrado: ${ENV_PATH}`)
  const env = readEnvFile(ENV_PATH)
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('Credenciais Supabase não encontradas no .env.local')

  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })

  console.log('🔍 Buscando MQLs de 2026...\n')

  let allRows = []
  let page = 0
  while (true) {
    const { data, error } = await sb
      .from('oportunidades')
      .select(OPP_SELECT)
      .gte('data_lead_recebido', '2026-01-01T00:00:00-03:00')
      .lte('data_lead_recebido', '2026-12-31T23:59:59-03:00')
      .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
      .order('data_lead_recebido', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    // Filtrar apenas os que têm tag 'mql' no contato
    const mqls = data.filter(row => isMqlByTag(row.contatos?.tags))
    allRows = allRows.concat(mqls)

    console.log(`   Página ${page + 1}: ${data.length} opps buscadas → ${mqls.length} MQLs`)
    if (data.length < PAGE_SIZE) break
    page++
  }

  console.log(`\n✅ Total de MQLs encontrados: ${allRows.length}`)

  // Montar CSV
  const lines = [ALL_COLS.join(',')]

  for (const row of allRows) {
    const c = row.contatos || {}
    const flat = {
      opp_id: row.id,
      ghl_opportunity_id: row.ghl_opportunity_id,
      pipeline_name: row.pipeline_name,
      status: row.status,
      lost_reason: row.lost_reason,
      sdr_name: row.sdr_name,
      vendedor_closer: row.vendedor_closer,
      data_lead_recebido: row.data_lead_recebido,
      data_conectado: row.data_conectado,
      data_qualificado: row.data_qualificado,
      data_tentativa_1: row.data_tentativa_1,
      data_tentativa_2: row.data_tentativa_2,
      data_tentativa_3: row.data_tentativa_3,
      data_tentativa_4: row.data_tentativa_4,
      data_tentativa_5: row.data_tentativa_5,
      data_tentativa_6: row.data_tentativa_6,
      data_tentativa_7: row.data_tentativa_7,
      data_tentativa_8: row.data_tentativa_8,
      data_no_show: row.data_no_show,
      data_agendamento_reuniao: row.data_agendamento_reuniao,
      data_reuniao_agendada: row.data_reuniao_agendada,
      data_reuniao_realizada: row.data_reuniao_realizada,
      data_agendamento_vendas: row.data_agendamento_vendas,
      data_realizacao_vendas: row.data_realizacao_vendas,
      data_no_show_vendas: row.data_no_show_vendas,
      data_negociacao: row.data_negociacao,
      data_fechado: row.data_fechado,
      data_perdido: row.data_perdido,
      data_perdido_vendas: row.data_perdido_vendas,
      resumo_ia: row.resumo_ia,
      percepcao_closer: row.percepcao_closer,
      // Contato
      ghl_id: c.ghl_id,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      country: c.country,
      date_created: c.date_created,
      utm_source: c.utm_source,
      utm_campaign: c.utm_campaign,
      utm_medium: c.utm_medium,
      utm_term: c.utm_term,
      utm_content: c.utm_content,
      tt_source: c.tt_source,
      tt_campaign: c.tt_campaign,
      tt_medium: c.tt_medium,
      tt_term: c.tt_term,
      tt_content: c.tt_content,
      fbclid: c.fbclid,
      gclid: c.gclid,
      owner_name: c.owner_name,
      closer_name: c.closer_name,
      tags: c.tags,
      como_nos_conheceu: c.como_nos_conheceu,
      faturamento_anual: c.faturamento_anual,
      perfil_inteligente: c.perfil_inteligente,
      descricao_negocio: c.descricao_negocio,
      tipo_empresa: c.tipo_empresa,
      investe_trafego: c.investe_trafego,
      treinamento_marketing: c.treinamento_marketing,
      tempo_usa_internet: c.tempo_usa_internet,
      super_heroi_favorito: c.super_heroi_favorito,
      disponibilidade_barra: c.disponibilidade_barra,
      print_instagram: c.print_instagram,
      situacao_atual: c.situacao_atual,
      preciso_ajuda_para: c.preciso_ajuda_para,
      obstaculos: c.obstaculos,
      visao_6_meses: c.visao_6_meses,
      plano_meta: c.plano_meta,
      situacao_investimentos: c.situacao_investimentos,
      possiveis_objecoes: c.possiveis_objecoes,
      swot_forcas: c.swot_forcas,
      swot_fraquezas: c.swot_fraquezas,
      swot_oportunidades: c.swot_oportunidades,
      swot_ameacas: c.swot_ameacas,
      follow_up_1: c.follow_up_1,
      follow_up_2: c.follow_up_2,
      follow_up_3: c.follow_up_3,
      follow_up_4: c.follow_up_4,
      follow_up_5: c.follow_up_5,
      follow_up_6: c.follow_up_6,
      follow_up_7: c.follow_up_7,
      follow_up_8: c.follow_up_8,
      follow_up_9: c.follow_up_9,
      follow_up_10: c.follow_up_10,
      follow_up_11: c.follow_up_11,
      follow_up_12: c.follow_up_12,
      follow_up_13: c.follow_up_13,
      follow_up_14: c.follow_up_14,
      follow_up_15: c.follow_up_15,
      comunicacao_veredito: c.comunicacao_veredito,
      comunicacao_erros_atuais: c.comunicacao_erros_atuais,
      comunicacao_tendencia_mercado: c.comunicacao_tendencia_mercado,
      analise_oferta_principal: c.analise_oferta_principal,
      banco_ideias_conteudo: c.banco_ideias_conteudo,
      canais_venda_recomendados: c.canais_venda_recomendados,
      analise_gap_pontos_fracos: c.analise_gap_pontos_fracos,
      estudo_concorrentes: c.estudo_concorrentes,
      estrategia_antibrjection_scripts: c.estrategia_antibrjection_scripts,
      plano_acao_passo_a_passo: c.plano_acao_passo_a_passo,
      id_analise: c.id_analise,
      link_analise: c.link_analise,
      status_analise: c.status_analise,
      data_analise: c.data_analise,
    }
    lines.push(rowToCSV(ALL_COLS, flat))
  }

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8')
  console.log(`\n📄 CSV salvo em: ${OUTPUT_PATH}`)
  console.log(`   ${allRows.length} linhas de dados + 1 header = ${allRows.length + 1} linhas totais`)
}

main().catch(err => { console.error('❌ Erro:', err.message); process.exit(1) })
