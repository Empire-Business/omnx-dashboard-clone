#!/usr/bin/env node
// Confere, venda a venda, o que existe no omnx-desk contra o que o dashboard mostra.
//
// Responde três perguntas, nesta ordem:
//   1. Toda venda concluída no desk chegou ao CRM? (sincronização)
//   2. Toda venda que chegou ao CRM é VISÍVEL nas abas? (pipeline Recuperação /
//      pipeline_id NULL / sem data_pagamento_entrada / workspace divergente)
//   3. O contrato de cada venda está no mesmo estado nos dois lados?
//
// Uso (PowerShell):
//   $env:DESK_URL="https://wuzmckatbmlpkdxtfhqr.supabase.co"
//   $env:DESK_SERVICE_KEY="<service_role do desk>"
//   $env:CRM_URL="https://qzesffnkqgelmtfblzkr.supabase.co"
//   $env:CRM_SERVICE_KEY="<service_role do CRM>"
//   node scripts/conferir-vendas-desk-vs-dashboard.mjs 2026-08-01 2026-08-31
//
// Só faz leitura. Nada é escrito em nenhum dos dois bancos.
import { createClient } from '@supabase/supabase-js'

const [inicio = '2026-08-01', fim = '2026-08-31'] = process.argv.slice(2)

const need = (k) => {
  const v = process.env[k]
  if (!v) { console.error(`Falta a variável de ambiente ${k}`); process.exit(1) }
  return v
}

const desk = createClient(need('DESK_URL'), need('DESK_SERVICE_KEY'), { auth: { persistSession: false } })
const crm = createClient(need('CRM_URL'), need('CRM_SERVICE_KEY'), { auth: { persistSession: false } })

// Pipeline de Recuperação — as abas Aquisição/Vendas/Tráfego o excluem por padrão.
const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L'

const brl = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const linha = (t) => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`)

async function paginar(query) {
  const PAGE = 1000
  let all = [], page = 0
  for (;;) {
    const { data, error } = await query().range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw error
    all = all.concat(data ?? [])
    if ((data?.length ?? 0) < PAGE) return all
    page++
  }
}

// ── 1. Desk ────────────────────────────────────────────────────────────────
const vendasDesk = await paginar(() =>
  desk.from('vendas_pendentes')
    .select('id, cliente_nome, status, pagamentos, ghl_oportunidade_id, ghl_venda_id, sincronizado_em, sincronizacao_erro, atendido_em')
    .order('id'))

const contratosDesk = await paginar(() =>
  desk.from('contratos')
    .select('venda_pendente_id, status, link_clicksign, data_assinatura')
    .order('venda_pendente_id'))
const contratoPorVenda = new Map(contratosDesk.map((c) => [c.venda_pendente_id, c]))

// Data de entrada da venda no desk = 1º pagamento (mesma regra do crm-registrar-venda).
const dataEntradaDesk = (v) => {
  const lista = Array.isArray(v.pagamentos) ? v.pagamentos : []
  const entrada = lista.find((p) => String(p?.sinal ?? '').toLowerCase().includes('entrada'))
    ?? [...lista].sort((a, b) => String(a?.data ?? '').localeCompare(String(b?.data ?? '')))[0]
  return entrada?.data ?? null
}

const noPeriodo = vendasDesk.filter((v) => {
  const d = dataEntradaDesk(v)
  return d && d >= inicio && d <= fim
})

linha(`DESK — vendas com entrada entre ${inicio} e ${fim}`)
console.log(`Total no período: ${noPeriodo.length}`)
console.log(`Sem vínculo no CRM (ghl_oportunidade_id nulo): ${noPeriodo.filter((v) => !v.ghl_oportunidade_id).length}`)
console.log(`Com erro de sincronização: ${noPeriodo.filter((v) => v.sincronizacao_erro).length}`)
for (const v of noPeriodo.filter((v) => !v.ghl_oportunidade_id || v.sincronizacao_erro)) {
  console.log(`  · ${v.cliente_nome} (${v.status}) — ${v.sincronizacao_erro ? 'erro: ' + String(v.sincronizacao_erro).slice(0, 120) : 'sem vínculo'}`)
}

// ── 2. CRM ─────────────────────────────────────────────────────────────────
const vendasCrm = await paginar(() =>
  crm.from('vendas_fechamento')
    .select('id, oportunidade_id, valor_faturado, valor_entrada, data_pagamento_entrada, origem, contrato_status, op_link_do_contrato_assinado, data_da_assinatura_do_contrato, workspace_id')
    .gte('data_pagamento_entrada', `${inicio}T00:00:00-03:00`)
    .lte('data_pagamento_entrada', `${fim}T23:59:59-03:00`)
    .order('id'))

const oppIds = [...new Set(vendasCrm.map((v) => v.oportunidade_id).filter(Boolean))]
const opps = []
for (let i = 0; i < oppIds.length; i += 100) {
  const { data, error } = await crm
    .from('oportunidades')
    .select('id, pipeline_id, pipeline_name, contato_id, workspace_id, data_lead_recebido, vendedor_closer')
    .in('id', oppIds.slice(i, i + 100))
  if (error) throw error
  opps.push(...(data ?? []))
}
const oppPorId = new Map(opps.map((o) => [o.id, o]))

const invisiveis = vendasCrm.filter((v) => {
  const o = oppPorId.get(v.oportunidade_id)
  return !o || o.pipeline_id === null || o.pipeline_id === PIPELINE_RECUPERACAO_ID
})

linha(`CRM — vendas com pagamento de entrada entre ${inicio} e ${fim}`)
console.log(`Total em vendas_fechamento: ${vendasCrm.length}`)
console.log(`Faturamento somado: ${brl(vendasCrm.reduce((s, v) => s + Number(v.valor_faturado ?? 0), 0))}`)
console.log(`Origem omnx_desk/empiredesk: ${vendasCrm.filter((v) => ['omnx_desk', 'empiredesk'].includes(v.origem)).length}`)
console.log(`\nINVISÍVEIS nas abas (opp ausente, pipeline_id NULL ou pipeline Recuperação): ${invisiveis.length}`)
for (const v of invisiveis) {
  const o = oppPorId.get(v.oportunidade_id)
  const motivo = !o ? 'oportunidade não encontrada'
    : o.pipeline_id === null ? 'pipeline_id NULL (some de todos os painéis)'
    : 'pipeline Recuperação (excluído por padrão)'
  console.log(`  · opp ${v.oportunidade_id} — ${brl(v.valor_faturado)} — ${motivo}`)
}

// ── 3. Desk × CRM, venda a venda ───────────────────────────────────────────
const crmPorOpp = new Map(vendasCrm.map((v) => [v.oportunidade_id, v]))

linha('DESK × CRM — venda a venda')
let faltando = 0, contratoDivergente = 0
for (const v of noPeriodo) {
  const crmRow = v.ghl_oportunidade_id ? crmPorOpp.get(v.ghl_oportunidade_id) : null
  if (!crmRow) {
    faltando++
    console.log(`  ✗ ${v.cliente_nome} — no desk (entrada ${dataEntradaDesk(v)}) e AUSENTE do CRM no período`)
    continue
  }
  const cDesk = contratoPorVenda.get(v.id)
  const statusDesk = cDesk?.status ?? null
  const statusCrm = crmRow.contrato_status ?? null
  if ((statusDesk ?? '') !== (statusCrm ?? '')) {
    contratoDivergente++
    console.log(`  ~ ${v.cliente_nome} — contrato no desk "${statusDesk ?? '—'}" × no CRM "${statusCrm ?? '—'}"`)
  }
}
const soNoCrm = vendasCrm.filter((v) => !noPeriodo.some((d) => d.ghl_oportunidade_id === v.oportunidade_id))

linha('RESUMO')
console.log(`Desk no período:               ${noPeriodo.length}`)
console.log(`CRM no período:                ${vendasCrm.length}`)
console.log(`No desk e ausentes do CRM:     ${faltando}`)
console.log(`No CRM sem par no desk:        ${soNoCrm.length} (venda antiga, importada ou de outra origem)`)
console.log(`Invisíveis nas abas:           ${invisiveis.length}`)
console.log(`Contrato divergente:           ${contratoDivergente}`)
