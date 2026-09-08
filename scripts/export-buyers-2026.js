#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, 'eb-dash2', '.env.local')
const OUTPUT_PATH = path.join(ROOT, 'exports', 'comprantes-2026.csv')
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

const VF_SELECT = `
  produto_vendido, forma_pagamento,
  valor_entrada, numero_parcelas, valor_parcela, valor_faturado,
  data_pagamento_entrada, data_da_assinatura_do_contrato,
  nome_contratante, cpf_cnpj_contratante,
  logradouro_rua_avenida, numero_endereco, complemento_endereco,
  bairro, municipio, estado_uf, cep,
  observacoes_venda, link_gravacao_call_vendas,
  oportunidades!inner(
    ghl_opportunity_id, pipeline_name, status, sdr_name, vendedor_closer,
    data_lead_recebido, data_conectado, data_qualificado,
    data_agendamento_reuniao, data_reuniao_agendada, data_reuniao_realizada,
    data_agendamento_vendas, data_realizacao_vendas, data_fechado,
    data_no_show, data_no_show_vendas, data_negociacao, data_perdido,
    resumo_ia, percepcao_closer,
    contatos!inner(
      ghl_id, nome, email, telefone, country, date_created,
      utm_source, utm_campaign, utm_medium, utm_term, utm_content,
      tt_source, tt_campaign, fbclid, gclid,
      owner_name, closer_name, tags,
      como_nos_conheceu, faturamento_anual, perfil_inteligente,
      descricao_negocio, tipo_empresa,
      investe_trafego, treinamento_marketing, tempo_usa_internet,
      super_heroi_favorito, disponibilidade_barra, print_instagram,
      situacao_atual, preciso_ajuda_para, obstaculos,
      visao_6_meses, plano_meta, situacao_investimentos, possiveis_objecoes,
      swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas,
      follow_up_1, follow_up_2, follow_up_3, follow_up_4, follow_up_5,
      follow_up_6, follow_up_7, follow_up_8, follow_up_9, follow_up_10,
      follow_up_11, follow_up_12, follow_up_13, follow_up_14, follow_up_15,
      comunicacao_veredito, comunicacao_erros_atuais, comunicacao_tendencia_mercado,
      analise_oferta_principal, banco_ideias_conteudo, canais_venda_recomendados,
      analise_gap_pontos_fracos, estudo_concorrentes,
      estrategia_antibrjection_scripts, plano_acao_passo_a_passo,
      id_analise, link_analise, status_analise, data_analise
    )
  )
`

const ALL_COLS = [
  // Venda
  'produto_vendido', 'forma_pagamento',
  'valor_entrada', 'numero_parcelas', 'valor_parcela', 'valor_faturado',
  'data_pagamento_entrada', 'data_da_assinatura_do_contrato',
  'nome_contratante', 'cpf_cnpj_contratante',
  'logradouro_rua_avenida', 'numero_endereco', 'complemento_endereco',
  'bairro', 'municipio', 'estado_uf', 'cep',
  'observacoes_venda', 'link_gravacao_call_vendas',
  // Oportunidade
  'ghl_opportunity_id', 'pipeline_name', 'status', 'sdr_name', 'vendedor_closer',
  'data_lead_recebido', 'data_conectado', 'data_qualificado',
  'data_agendamento_reuniao', 'data_reuniao_agendada', 'data_reuniao_realizada',
  'data_agendamento_vendas', 'data_realizacao_vendas', 'data_fechado',
  'data_no_show', 'data_no_show_vendas', 'data_negociacao', 'data_perdido',
  'resumo_ia', 'percepcao_closer',
  // Contato
  'ghl_id', 'nome', 'email', 'telefone', 'country', 'date_created',
  'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content',
  'tt_source', 'tt_campaign', 'fbclid', 'gclid',
  'owner_name', 'closer_name', 'tags',
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

  console.log('🔍 Buscando comprantes de 2026...\n')

  let allRows = []
  let page = 0
  while (true) {
    const { data, error } = await sb
      .from('vendas_fechamento')
      .select(VF_SELECT)
      .gte('data_pagamento_entrada', '2026-01-01')
      .lte('data_pagamento_entrada', '2026-12-31')
      .not('data_pagamento_entrada', 'is', null)
      .order('data_pagamento_entrada', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    allRows = allRows.concat(data)
    console.log(`   Página ${page + 1}: ${data.length} comprantes`)
    if (data.length < PAGE_SIZE) break
    page++
  }

  console.log(`\n✅ Total de comprantes encontrados: ${allRows.length}`)

  const lines = [ALL_COLS.join(',')]

  for (const vf of allRows) {
    const o = vf.oportunidades || {}
    const c = o.contatos || {}
    const flat = {
      // Venda
      produto_vendido: vf.produto_vendido,
      forma_pagamento: vf.forma_pagamento,
      valor_entrada: vf.valor_entrada,
      numero_parcelas: vf.numero_parcelas,
      valor_parcela: vf.valor_parcela,
      valor_faturado: vf.valor_faturado,
      data_pagamento_entrada: vf.data_pagamento_entrada,
      data_da_assinatura_do_contrato: vf.data_da_assinatura_do_contrato,
      nome_contratante: vf.nome_contratante,
      cpf_cnpj_contratante: vf.cpf_cnpj_contratante,
      logradouro_rua_avenida: vf.logradouro_rua_avenida,
      numero_endereco: vf.numero_endereco,
      complemento_endereco: vf.complemento_endereco,
      bairro: vf.bairro,
      municipio: vf.municipio,
      estado_uf: vf.estado_uf,
      cep: vf.cep,
      observacoes_venda: vf.observacoes_venda,
      link_gravacao_call_vendas: vf.link_gravacao_call_vendas,
      // Oportunidade
      ghl_opportunity_id: o.ghl_opportunity_id,
      pipeline_name: o.pipeline_name,
      status: o.status,
      sdr_name: o.sdr_name,
      vendedor_closer: o.vendedor_closer,
      data_lead_recebido: o.data_lead_recebido,
      data_conectado: o.data_conectado,
      data_qualificado: o.data_qualificado,
      data_agendamento_reuniao: o.data_agendamento_reuniao,
      data_reuniao_agendada: o.data_reuniao_agendada,
      data_reuniao_realizada: o.data_reuniao_realizada,
      data_agendamento_vendas: o.data_agendamento_vendas,
      data_realizacao_vendas: o.data_realizacao_vendas,
      data_fechado: o.data_fechado,
      data_no_show: o.data_no_show,
      data_no_show_vendas: o.data_no_show_vendas,
      data_negociacao: o.data_negociacao,
      data_perdido: o.data_perdido,
      resumo_ia: o.resumo_ia,
      percepcao_closer: o.percepcao_closer,
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
