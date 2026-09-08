import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  parseTags,
  extractTagsByPrefix,
  isMqlByTag,
  isVendaExterna,
  filterByLeadDate,
  countUniqueMqls,
  filterUniqueMqls,
  buildCampaignFunnelMap,
  buildCampaignNameMap,
  computeMetaKpis,
  computeRevenueKpis,
  applyMqlFilter,
  buildPaymentDateMap,
  buildRevenueMap,
  computeFunnel,
  computeSmallCards,
  computeLossReasons,
  computeAvgCycle,
  computeClosingCycle,
  computeIdealDia,
  computeCostMqlIdealDia,
  computeCostPerMqlSeries,
  type OppRow,
  type MetaRow,
  type RevenueRow,
} from '@/hooks/useTrafego'

import { useCohort } from '@/hooks/useCohort'

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeOpp(overrides: Partial<OppRow> = {}): OppRow {
  return {
    id: 'opp-1',
    contato_id: 'c-1',
    ghl_opportunity_id: null,
    pipeline_name: 'Pré-Vendas MQL',
    pipeline_id: 'pipeline-x',
    lost_reason: null,
    vendedor_closer: null,
    status: 'open',
    data_lead_recebido: '2026-03-10T12:00:00Z',
    data_conectado: null,
    data_qualificado: null,
    data_no_show: null,
    data_agendamento_reuniao: null,
    data_reuniao_agendada: null,
    data_realizacao_vendas: null,
    data_fechado: null,
    data_perdido: null,
    data_perdido_vendas: null,
    data_negociacao: null,
    data_no_show_vendas: null,
    data_agendamento_vendas: null,
    appointment_status: null,
    data_pendencias_preenchimento: null,
    resumo_ia: null,
    percepcao_closer: null,
    sdr_name: null,
    agendamento_origem: null,
    agendamento_por_user_id: null,
    agendamento_por_user_nome: null,
    agendamento_por_user_email: null,
    agendamento_calendar_id: null,
    agendamento_calendar_name: null,
    agendamento_assigned_user_id: null,
    agendamento_assigned_user_nome: null,
    contatos: {
      ghl_id: 'g-1',
      nome: 'Lead Teste',
      email: 'lead@teste.com',
      telefone: '+5511999999999',
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: '123',
      utm_term: null,
      utm_content: null,
      fbclid: null,
      gclid: null,
      tt_source: null,
      tt_campaign: null,
      tt_medium: null,
      tt_term: null,
      tt_content: null,
      owner_name: 'sdr1',
      owner_email: null,
      date_created: '2026-03-10T11:00:00Z',
      como_nos_conheceu: null,
      faturamento_anual: null,
      perfil_inteligente: null,
      tags: null,
    },
    ...overrides,
  }
}

function makeRevenue(overrides: Partial<RevenueRow> = {}): RevenueRow {
  return {
    oportunidade_id: 'opp-1',
    valor_faturado: 5000,
    valor_entrada: 1000,
    data_pagamento_entrada: null,
    ...overrides,
  }
}

// ─── parseTags ────────────────────────────────────────────────────────────

describe('parseTags', () => {
  it('retorna array vazio para null/undefined', () => {
    expect(parseTags(null)).toEqual([])
    expect(parseTags(undefined)).toEqual([])
  })

  it('parseia JSON array', () => {
    expect(parseTags('["MQL","vip"]')).toEqual(['MQL', 'vip'])
  })

  it('fallback para CSV quando JSON invalido', () => {
    expect(parseTags('MQL, vip ,cliente')).toEqual(['MQL', 'vip', 'cliente'])
  })

  it('parseia array literal', () => {
    expect(parseTags(['MQL', 'vip'])).toEqual(['MQL', 'vip'])
  })

  it('filtra valores vazios no CSV', () => {
    expect(parseTags('MQL,, ,')).toEqual(['MQL'])
  })

  it('retorna array vazio para string vazia', () => {
    expect(parseTags('')).toEqual([])
  })
})

// ─── extractTagsByPrefix ──────────────────────────────────────────────────

describe('extractTagsByPrefix', () => {
  it('filtra tags por prefixo', () => {
    expect(extractTagsByPrefix(['[cp] 1', '[cp] 2', 'mql'], '[cp]')).toEqual(['[cp] 1', '[cp] 2'])
  })

  it('retorna vazio quando nenhuma tag combina', () => {
    expect(extractTagsByPrefix(['mql', 'vip'], '[cp]')).toEqual([])
  })
})

// ─── isMqlByTag ───────────────────────────────────────────────────────────

describe('isMqlByTag', () => {
  it('detecta MQL case-insensitive', () => {
    expect(isMqlByTag(makeOpp({ contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }).contatos)).toBe(true)
    expect(isMqlByTag(makeOpp({ contatos: { ...makeOpp().contatos!, tags: '["mql"]' } }).contatos)).toBe(true)
  })

  it('retorna false quando contato é null', () => {
    expect(isMqlByTag(null)).toBe(false)
  })

  it('retorna false quando tags é null', () => {
    expect(isMqlByTag(makeOpp().contatos)).toBe(false)
  })

  it('retorna false quando tags nao contem MQL', () => {
    expect(isMqlByTag(makeOpp({ contatos: { ...makeOpp().contatos!, tags: '["vip"]' } }).contatos)).toBe(false)
  })
})

// ─── isVendaExterna ───────────────────────────────────────────────────────

describe('isVendaExterna', () => {
  it('detecta por contact_source', () => {
    const opp = makeOpp({ contatos: { ...makeOpp().contatos!, contact_source: 'Vendas Externas' } })
    expect(isVendaExterna(opp)).toBe(true)
  })

  it('detecta por tag (case-insensitive)', () => {
    const opp = makeOpp({ contatos: { ...makeOpp().contatos!, tags: '["venda externa"]' } })
    expect(isVendaExterna(opp)).toBe(true)
  })

  it('retorna false quando nenhum dos dois', () => {
    expect(isVendaExterna(makeOpp())).toBe(false)
  })
})

// ─── filterByLeadDate ──────────────────────────────────────────────────

describe('filterByLeadDate', () => {
  it('mantem opps cuja data_lead_recebido esta no periodo', () => {
    const opps = [makeOpp({ data_lead_recebido: '2026-03-10T11:00:00Z' })]
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(1)
  })

  it('exclui opps cuja data_lead_recebido esta fora do periodo', () => {
    const opps = [makeOpp({ data_lead_recebido: '2026-02-10T11:00:00Z' })]
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(0)
  })

  // Regressao: campanha que pega base antiga (ex: [cp] codigo-audiencia-08-26).
  // O contato existe desde novembro, mas gerou lead novo em marco -- ele TEM
  // que aparecer em marco. Com a regua antiga (date_created do contato) esse
  // lead sumia do painel, e era essa a divergencia contra o CRM.
  it('inclui lead novo de contato antigo (contato fora do periodo, lead dentro)', () => {
    const opps = [
      makeOpp({
        data_lead_recebido: '2026-03-10T11:00:00Z',
        contatos: { ...makeOpp().contatos!, date_created: '2025-11-11T13:29:00Z' },
      }),
    ]
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(1)
  })

  // Espelho do caso acima: contato criado no periodo, mas cujo lead e de outro
  // mes, nao deve ser contado no periodo do contato.
  it('exclui lead antigo de contato criado no periodo', () => {
    const opps = [
      makeOpp({
        data_lead_recebido: '2026-02-10T11:00:00Z',
        contatos: { ...makeOpp().contatos!, date_created: '2026-03-05T11:00:00Z' },
      }),
    ]
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(0)
  })

  it('cai para date_created do contato quando data_lead_recebido e nula', () => {
    const dentro = [
      makeOpp({
        data_lead_recebido: null,
        contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z' },
      }),
    ]
    const fora = [
      makeOpp({
        data_lead_recebido: null,
        contatos: { ...makeOpp().contatos!, date_created: '2026-02-10T11:00:00Z' },
      }),
    ]
    expect(filterByLeadDate(dentro, '2026-03-01', '2026-03-31')).toHaveLength(1)
    expect(filterByLeadDate(fora, '2026-03-01', '2026-03-31')).toHaveLength(0)
  })

  it('inclui opps sem nenhuma das duas datas (fallback inclusivo)', () => {
    const opps = [
      makeOpp({
        data_lead_recebido: null,
        contatos: { ...makeOpp().contatos!, date_created: null },
      }),
    ]
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(1)
  })

  it('converte TIMESTAMPTZ para SP antes de comparar (00:30Z = dia anterior em SP)', () => {
    // 2026-03-01T00:30:00Z = 2026-02-28 21:30 SP -> deve cair em fevereiro
    const opps = [makeOpp({ data_lead_recebido: '2026-03-01T00:30:00Z' })]
    expect(filterByLeadDate(opps, '2026-02-01', '2026-02-28')).toHaveLength(1)
    expect(filterByLeadDate(opps, '2026-03-01', '2026-03-31')).toHaveLength(0)
  })
})

// ─── countUniqueMqls / filterUniqueMqls ───────────────────────────────────

describe('countUniqueMqls / filterUniqueMqls', () => {
  it('conta 1 MQL por contato, ignorando multiplas opps do mesmo contato', () => {
    const opps = [
      makeOpp({ id: 'o1', contato_id: 'c1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contato_id: 'c1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o3', contato_id: 'c2', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
    ]
    expect(countUniqueMqls(opps)).toBe(2)
  })

  it('filterUniqueMqls mantem so a primeira opp por contato', () => {
    const opps = [
      makeOpp({ id: 'o1', contato_id: 'c1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contato_id: 'c1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
    ]
    const filtered = filterUniqueMqls(opps)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('o1')
  })

  it('usa opp.id como fallback quando contato_id é null', () => {
    const opps = [
      makeOpp({ id: 'o1', contato_id: null, contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contato_id: null, contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
    ]
    expect(countUniqueMqls(opps)).toBe(2)
  })

  it('ignora opps sem tag MQL', () => {
    const opps = [makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, tags: '["vip"]' } })]
    expect(countUniqueMqls(opps)).toBe(0)
  })
})

// ─── buildCampaignFunnelMap / buildCampaignNameMap ────────────────────────

describe('buildCampaignFunnelMap', () => {
  it('mapeia utm_campaign para array de funis', () => {
    const campaigns = [
      { utm_campaign: '123', funnels: '["webinario","vsl"]' },
      { utm_campaign: '456', funnels: '["vsl"]' },
    ]
    const map = buildCampaignFunnelMap(campaigns)
    expect(map.get('123')).toEqual(['webinario', 'vsl'])
    expect(map.get('456')).toEqual(['vsl'])
  })

  it('ignora campanhas sem funis', () => {
    const campaigns = [
      { utm_campaign: '123', funnels: null },
      { utm_campaign: '456', funnels: '["vsl"]' },
    ]
    const map = buildCampaignFunnelMap(campaigns)
    expect(map.has('123')).toBe(false)
    expect(map.get('456')).toEqual(['vsl'])
  })

  it('converte utm_campaign numerico para string', () => {
    const campaigns = [{ utm_campaign: 123, funnels: '["vsl"]' }]
    const map = buildCampaignFunnelMap(campaigns)
    expect(map.get('123')).toEqual(['vsl'])
  })
})

describe('buildCampaignNameMap', () => {
  it('mapeia utm_campaign para nome amigavel', () => {
    const campaigns = [
      { utm_campaign: '123', nome: 'Webinário Julho' },
      { utm_campaign: '456', nome: 'VSL Evergreen' },
    ]
    const map = buildCampaignNameMap(campaigns)
    expect(map.get('123')).toBe('Webinário Julho')
  })

  it('ignora campanhas sem nome', () => {
    const campaigns = [{ utm_campaign: '123', nome: null }]
    const map = buildCampaignNameMap(campaigns)
    expect(map.size).toBe(0)
  })
})

// ─── computeMetaKpis ──────────────────────────────────────────────────────

describe('computeMetaKpis', () => {
  it('soma spend/impressions/clicks e calcula CTR', () => {
    const rows: MetaRow[] = [
      { spend: 100, impressions: 1000, clicks: 50, ctr: 5, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: '2026-03-01' },
      { spend: 200, impressions: 2000, clicks: 30, ctr: 1.5, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: '2026-03-02' },
    ]
    const kpis = computeMetaKpis(rows)
    expect(kpis.spend).toBe(300)
    expect(kpis.impressions).toBe(3000)
    expect(kpis.clicks).toBe(80)
    expect(kpis.ctr).toBeCloseTo(2.6667, 2)
  })

  it('usa accountDailyRows como fonte de verdade para spend quando fornecido', () => {
    const rows: MetaRow[] = [
      { spend: 100, impressions: 0, clicks: 0, ctr: 0, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: null },
    ]
    const accountDaily = [{ date: '2026-03-01', spend: 999 }]
    const kpis = computeMetaKpis(rows, accountDaily)
    expect(kpis.spend).toBe(999)
  })

  it('conta leads do array actions quando action_type=lead', () => {
    const rows: MetaRow[] = [
      {
        spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: null,
        landing_page_views: null, video_views: null, link_clicks: null, leads: null,
        actions: [{ action_type: 'lead', value: '5' }, { action_type: 'other', value: '10' }],
        campaign_name: null, adset_name: null, ad_name: null, date: null,
      },
    ]
    const kpis = computeMetaKpis(rows)
    expect(kpis.leadsCount).toBe(5)
  })

  it('retorna zeros para array vazio', () => {
    const kpis = computeMetaKpis([])
    expect(kpis.spend).toBe(0)
    expect(kpis.impressions).toBe(0)
    expect(kpis.ctr).toBe(0)
  })
})

// ─── computeRevenueKpis ───────────────────────────────────────────────────

describe('computeRevenueKpis', () => {
  it('soma faturamento e entrada', () => {
    const rows: RevenueRow[] = [
      makeRevenue({ valor_faturado: 5000, valor_entrada: 1000 }),
      makeRevenue({ valor_faturado: 3000, valor_entrada: 500 }),
    ]
    const kpis = computeRevenueKpis(rows)
    expect(kpis.valorFaturado).toBe(8000)
    expect(kpis.valorEntrada).toBe(1500)
  })

  it('trata null como 0', () => {
    const rows: RevenueRow[] = [makeRevenue({ valor_faturado: null, valor_entrada: null })]
    const kpis = computeRevenueKpis(rows)
    expect(kpis.valorFaturado).toBe(0)
    expect(kpis.valorEntrada).toBe(0)
  })
})

// ─── applyMqlFilter ───────────────────────────────────────────────────────

describe('applyMqlFilter', () => {
  it('filtra so MQLs quando mqlFilter=mql', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contatos: { ...makeOpp().contatos!, tags: '["vip"]' } }),
    ]
    expect(applyMqlFilter(opps, 'mql')).toHaveLength(1)
    expect(applyMqlFilter(opps, 'mql')[0].id).toBe('o1')
  })

  it('retorna todas quando mqlFilter=all', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contatos: { ...makeOpp().contatos!, tags: '["vip"]' } }),
    ]
    expect(applyMqlFilter(opps, 'all')).toHaveLength(2)
  })
})

// ─── buildPaymentDateMap / buildRevenueMap ────────────────────────────────

describe('buildPaymentDateMap', () => {
  it('so inclui opps com data_pagamento_entrada preenchida', () => {
    const rows: RevenueRow[] = [
      makeRevenue({ oportunidade_id: 'o1', data_pagamento_entrada: '2026-03-15T10:00:00Z' }),
      makeRevenue({ oportunidade_id: 'o2', data_pagamento_entrada: null }),
    ]
    const map = buildPaymentDateMap(rows)
    expect(map.size).toBe(1)
    expect(map.get('o1')).toBe('2026-03-15')
  })

  it('normaliza TIMESTAMPTZ para YYYY-MM-DD', () => {
    const rows: RevenueRow[] = [
      makeRevenue({ oportunidade_id: 'o1', data_pagamento_entrada: '2026-03-15T23:59:59Z' }),
    ]
    const map = buildPaymentDateMap(rows)
    // slice(0,10) -> '2026-03-15' independente do timezone
    expect(map.get('o1')).toBe('2026-03-15')
  })
})

describe('buildRevenueMap', () => {
  it('mapeia oppId para {faturamento, caixa} apenas de opps com pagamento', () => {
    const rows: RevenueRow[] = [
      makeRevenue({ oportunidade_id: 'o1', valor_faturado: 5000, valor_entrada: 1000, data_pagamento_entrada: '2026-03-15' }),
      makeRevenue({ oportunidade_id: 'o2', valor_faturado: 999, valor_entrada: 99, data_pagamento_entrada: null }),
    ]
    const map = buildRevenueMap(rows)
    expect(map.size).toBe(1)
    expect(map.get('o1')).toEqual({ faturamento: 5000, caixa: 1000 })
  })
})

// ─── computeFunnel ────────────────────────────────────────────────────────

describe('computeFunnel', () => {
  it('calcula funil completo com 5 etapas', () => {
    const opps = [
      makeOpp({ id: 'o1', contato_id: 'c-1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' }, data_agendamento_reuniao: '2026-03-12', data_realizacao_vendas: '2026-03-13' }),
      makeOpp({ id: 'o2', contato_id: 'c-2', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o3', contato_id: 'c-3', contatos: { ...makeOpp().contatos!, tags: null } }),
    ]
    const funnel = computeFunnel(opps)
    expect(funnel).toHaveLength(5)
    expect(funnel[0]).toEqual(expect.objectContaining({ key: 'leads', count: 3 }))
    expect(funnel[1]).toEqual(expect.objectContaining({ key: 'mql', count: 2 }))
    expect(funnel[2]).toEqual(expect.objectContaining({ key: 'agendados', count: 1 }))
    expect(funnel[3]).toEqual(expect.objectContaining({ key: 'reunioes', count: 1 }))
    expect(funnel[4]).toEqual(expect.objectContaining({ key: 'fechados', count: 0 }))
  })

  it('conta MQL uma vez por contato, mesmo com varias oportunidades', () => {
    // MQL e uma tag do CONTATO: o mesmo lead com 2 oportunidades nao pode virar 2 MQLs.
    const opps = [
      makeOpp({ id: 'o1', contato_id: 'c-1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contato_id: 'c-1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
    ]
    const funnel = computeFunnel(opps)
    expect(funnel[0]).toEqual(expect.objectContaining({ key: 'leads', count: 2 }))
    expect(funnel[1]).toEqual(expect.objectContaining({ key: 'mql', count: 1 }))
  })

  it('usa paymentDateMap para contar fechados quando fornecido', () => {
    const opps = [makeOpp({ id: 'o1', data_fechado: null })]
    const paymentMap = new Map([['o1', '2026-03-15']])
    const funnel = computeFunnel(opps, paymentMap)
    expect(funnel[4].count).toBe(1)
  })

  it('usa data_fechado quando paymentDateMap nao fornecido', () => {
    const opps = [makeOpp({ id: 'o1', data_fechado: '2026-03-15' })]
    const funnel = computeFunnel(opps)
    expect(funnel[4].count).toBe(1)
  })
})

// ─── computeSmallCards ────────────────────────────────────────────────────

describe('computeSmallCards', () => {
  it('agrupa opps por categoria', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' }, data_conectado: '2026-03-12' }),
      makeOpp({ id: 'o2', pipeline_name: 'Pré-Vendas nMQL' }),
      makeOpp({ id: 'o3', data_perdido: '2026-03-14' }),
      makeOpp({ id: 'o4', data_perdido_vendas: '2026-03-16' }),
      makeOpp({ id: 'o5', data_negociacao: '2026-03-15' }),
    ]
    const cards = computeSmallCards(opps)
    expect(cards.mqls).toHaveLength(1)
    expect(cards.nmqls).toHaveLength(1)
    expect(cards.conectados).toHaveLength(1)
    expect(cards.perdidosSemReuniao).toHaveLength(1)
    expect(cards.perdidosAposReuniao).toHaveLength(1)
    expect(cards.emNegociacao).toHaveLength(1)
  })
})

// ─── computeLossReasons ───────────────────────────────────────────────────

describe('computeLossReasons', () => {
  it('agrupa perdidos sem reuniao por reason', () => {
    const opps = [
      makeOpp({ id: 'o1', data_perdido: '2026-03-14', lost_reason: 'sem dinheiro' }),
      makeOpp({ id: 'o2', data_perdido: '2026-03-15', lost_reason: 'sem dinheiro' }),
      makeOpp({ id: 'o3', data_perdido: '2026-03-16', lost_reason: null }),
    ]
    const reasons = computeLossReasons(opps, false)
    expect(reasons).toEqual([
      { reason: 'sem dinheiro', count: 2 },
      { reason: 'Não informado', count: 1 },
    ])
  })

  it('agrupa perdidos apos reuniao quando withMeeting=true', () => {
    const opps = [
      makeOpp({ id: 'o1', data_perdido: '2026-03-14', lost_reason: 'caro' }),
      makeOpp({ id: 'o2', data_perdido_vendas: '2026-03-16', lost_reason: 'timing' }),
    ]
    const reasons = computeLossReasons(opps, true)
    expect(reasons).toEqual([{ reason: 'timing', count: 1 }])
  })

  it('ordena por count descendente', () => {
    const opps = [
      makeOpp({ id: 'o1', data_perdido: '2026-03-14', lost_reason: 'raro' }),
      makeOpp({ id: 'o2', data_perdido: '2026-03-15', lost_reason: 'comum' }),
      makeOpp({ id: 'o3', data_perdido: '2026-03-16', lost_reason: 'comum' }),
    ]
    const reasons = computeLossReasons(opps, false)
    expect(reasons[0].reason).toBe('comum')
    expect(reasons[0].count).toBe(2)
  })
})

// ─── computeAvgCycle ──────────────────────────────────────────────────────

describe('computeAvgCycle', () => {
  it('calcula media de dias entre data_lead_recebido e pagamento', () => {
    const opps = [
      makeOpp({ id: 'o1', data_lead_recebido: '2026-03-01T12:00:00Z' }),
      makeOpp({ id: 'o2', data_lead_recebido: '2026-03-05T12:00:00Z' }),
    ]
    const paymentMap = new Map([
      ['o1', '2026-03-11'],
      ['o2', '2026-03-11'],
    ])
    // o1: 10 dias (1 -> 11), o2: 6 dias (5 -> 11), media = 8
    expect(computeAvgCycle(opps, paymentMap)).toBe(8)
  })

  it('retorna null quando nao ha opps fechadas', () => {
    expect(computeAvgCycle([], new Map())).toBeNull()
  })

  it('usa data_fechado quando paymentMap nao fornecido', () => {
    const opps = [makeOpp({ id: 'o1', data_lead_recebido: '2026-03-01T12:00:00Z', data_fechado: '2026-03-11' })]
    expect(computeAvgCycle(opps)).toBe(10)
  })
})

// ─── computeClosingCycle ──────────────────────────────────────────────────

describe('computeClosingCycle', () => {
  it('calcula media de dias entre realizacao e pagamento', () => {
    const opps = [
      makeOpp({ id: 'o1', data_realizacao_vendas: '2026-03-05' }),
      makeOpp({ id: 'o2', data_realizacao_vendas: '2026-03-08' }),
    ]
    const paymentMap = new Map([
      ['o1', '2026-03-10'],
      ['o2', '2026-03-12'],
    ])
    // o1: 5 dias, o2: 4 dias, media = 4.5 -> arredondado 5
    // Wait: 5->10 = 5, 8->12 = 4, (5+4)/2 = 4.5 -> Math.round = 5
    // Actually Math.round(4.5) = 5 in JS (rounds half to nearest even? no, JS rounds half up)
    expect(computeClosingCycle(opps, paymentMap)).toBe(5)
  })

  it('retorna null quando nao ha opps com realizacao+pagamento', () => {
    expect(computeClosingCycle([], new Map())).toBeNull()
  })
})

// ─── computeIdealDia ──────────────────────────────────────────────────────

describe('computeIdealDia', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calcula ideal acumulado proporcional aos dias decorridos', () => {
    // computeIdealDia usa spToday() (data real de hoje) — fixar o relógio para
    // 2026-03-05T15:00:00Z (12:00 em SP) torna o teste determinístico.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-05T15:00:00Z'))
    // periodo 10 dias, hoje no meio (5 dias), meta 100
    const result = computeIdealDia({ startDate: '2026-03-01', endDate: '2026-03-10', meta: 100, atual: 60 })
    expect(result.periodDays).toBe(10)
    expect(result.daysElapsed).toBe(5)
    expect(result.idealAcumulado).toBe(50)
    expect(result.delta).toBe(10)
    expect(result.pctOfMeta).toBe(60)
  })

  it('pctOfMeta é 0 quando meta é 0', () => {
    const result = computeIdealDia({ startDate: '2026-03-01', endDate: '2026-03-10', meta: 0, atual: 10 })
    expect(result.pctOfMeta).toBe(0)
  })

  it('daysElapsed nunca excede periodDays', () => {
    // today depois do fim -> daysElapsed = periodDays
    const result = computeIdealDia({ startDate: '2026-03-01', endDate: '2026-03-05', meta: 100, atual: 200 })
    expect(result.daysElapsed).toBe(result.periodDays)
    expect(result.daysRemaining).toBe(0)
  })
})

// ─── computeCostMqlIdealDia ───────────────────────────────────────────────

describe('computeCostMqlIdealDia', () => {
  it('calcula budget maximo = costMeta * mqlMeta', () => {
    const result = computeCostMqlIdealDia({
      startDate: '2026-03-01', endDate: '2026-03-10',
      costMeta: 200, mqlMeta: 50, atualSpend: 500, atualMqls: 10,
    })
    expect(result?.maxBudget).toBe(10000)
    expect(result?.onTrack).toBe(true) // projetado < max
  })

  it('retorna null quando costMeta ou mqlMeta <= 0', () => {
    expect(computeCostMqlIdealDia({ startDate: '2026-03-01', endDate: '2026-03-10', costMeta: 0, mqlMeta: 50, atualSpend: 0, atualMqls: 0 })).toBeNull()
    expect(computeCostMqlIdealDia({ startDate: '2026-03-01', endDate: '2026-03-10', costMeta: 200, mqlMeta: 0, atualSpend: 0, atualMqls: 0 })).toBeNull()
  })

  it('onTrack=false quando projetado excede maxBudget', () => {
    const result = computeCostMqlIdealDia({
      startDate: '2026-03-01', endDate: '2026-03-30',
      costMeta: 100, mqlMeta: 10, atualSpend: 5000, atualMqls: 0,
    })
    expect(result?.maxBudget).toBe(1000)
    expect(result?.onTrack).toBe(false)
  })
})

// ─── computeCostPerMqlSeries ──────────────────────────────────────────────

describe('computeCostPerMqlSeries', () => {
  it('construi serie cumulativa de spend e MQLs por dia', () => {
    const metaRows: MetaRow[] = [
      { spend: 100, impressions: 0, clicks: 0, ctr: 0, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: '2026-03-01' },
      { spend: 200, impressions: 0, clicks: 0, ctr: 0, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: '2026-03-02' },
    ]
    const opps = [
      makeOpp({ id: 'o1', data_lead_recebido: '2026-03-01T12:00:00Z', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', data_lead_recebido: '2026-03-02T12:00:00Z', contatos: { ...makeOpp().contatos!, tags: '["MQL"]' } }),
    ]
    const series = computeCostPerMqlSeries(metaRows, opps, '2026-03-01', '2026-03-02')
    expect(series).toHaveLength(2)
    expect(series[0].cumSpend).toBe(100)
    expect(series[0].cumMqls).toBe(1)
    expect(series[1].cumSpend).toBe(300)
    expect(series[1].cumMqls).toBe(2)
    expect(series[1].costPerMql).toBe(150)
  })

  it('costPerMql é 0 quando cumMqls é 0', () => {
    const metaRows: MetaRow[] = [
      { spend: 100, impressions: 0, clicks: 0, ctr: 0, cpm: null, landing_page_views: null, video_views: null, link_clicks: null, leads: null, actions: [], campaign_name: null, adset_name: null, ad_name: null, date: '2026-03-01' },
    ]
    const series = computeCostPerMqlSeries(metaRows, [], '2026-03-01', '2026-03-01')
    expect(series[0].costPerMql).toBe(0)
  })
})

// ─── useCohort (hook) ─────────────────────────────────────────────────────

describe('useCohort', () => {
  it('retorna estado vazio quando nao ha opps', () => {
    const { result } = renderHook(() => useCohort([], [], '2026-03-01', '2026-03-31'))
    expect(result.current.rows).toEqual([])
    expect(result.current.avgConectados).toBe(0)
    expect(result.current.avgAgendados).toBe(0)
    expect(result.current.avgReuniao).toBe(0)
    expect(result.current.avgFechados).toBe(0)
  })

  it('agrupa opps por mes cohort (usando data_lead_recebido)', () => {
    const opps = [
      makeOpp({ id: 'o1', data_lead_recebido: '2026-03-10T11:00:00Z' }),
      makeOpp({ id: 'o2', data_lead_recebido: '2026-03-15T11:00:00Z' }),
      makeOpp({ id: 'o3', data_lead_recebido: '2026-02-20T11:00:00Z' }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(2)
    // ordenado descendente: marco primeiro, fevereiro depois
    expect(result.current.rows[0].cohort_mes).toBe('2026-03-01')
    expect(result.current.rows[0].leads_count).toBe(2)
    expect(result.current.rows[1].cohort_mes).toBe('2026-02-01')
    expect(result.current.rows[1].leads_count).toBe(1)
  })

  // O agrupamento tem que seguir a mesma regua do filtro de periodo
  // (filterByLeadDate). Se ele usasse a data do contato, um lead filtrado
  // como marco cairia na linha de cohort de novembro do ano anterior.
  it('agrupa pela data do lead mesmo quando o contato e de outro mes', () => {
    const opps = [
      makeOpp({
        id: 'o1',
        data_lead_recebido: '2026-03-10T11:00:00Z',
        contatos: { ...makeOpp().contatos!, date_created: '2025-11-11T13:29:00Z' },
      }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-03-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-03-01')
  })

  it('cai para date_created do contato quando data_lead_recebido e nula', () => {
    const opps = [
      makeOpp({
        id: 'o1',
        data_lead_recebido: null,
        contatos: { ...makeOpp().contatos!, date_created: '2026-02-20T11:00:00Z' },
      }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-02-01')
  })

  it('filtra meses fora do periodo selecionado', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z' } }),
      makeOpp({ id: 'o2', contatos: { ...makeOpp().contatos!, date_created: '2026-01-10T11:00:00Z' } }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-03-01')
  })

  it('calcula mqls_pct como % de leads', () => {
    const opps = [
      makeOpp({ id: 'o1', contato_id: 'c1', contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z', tags: '["MQL"]' } }),
      makeOpp({ id: 'o2', contato_id: 'c2', contatos: { ...makeOpp().contatos!, date_created: '2026-03-15T11:00:00Z', tags: null } }),
      makeOpp({ id: 'o3', contato_id: 'c3', contatos: { ...makeOpp().contatos!, date_created: '2026-03-20T11:00:00Z', tags: '["MQL"]' } }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-03-01', '2026-03-31'))
    expect(result.current.rows[0].leads_count).toBe(3)
    expect(result.current.rows[0].mqls).toBe(2)
    expect(result.current.rows[0].mqls_pct).toBe(67) // 2/3 = 66.67 -> Math.round = 67
  })

  it('conta fechados apenas por paymentDateMap (data_pagamento_entrada)', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z' }, data_fechado: '2026-03-20' }),
      makeOpp({ id: 'o2', contatos: { ...makeOpp().contatos!, date_created: '2026-03-15T11:00:00Z' } }),
    ]
    const revenue = [
      makeRevenue({ oportunidade_id: 'o2', data_pagamento_entrada: '2026-03-25', valor_faturado: 5000 }),
    ]
    const { result } = renderHook(() => useCohort(opps, revenue, '2026-03-01', '2026-03-31'))
    // o1 tem data_fechado mas SEM pagamento -> nao conta como fechado
    // o2 tem pagamento -> conta
    expect(result.current.rows[0].fechados).toBe(1)
    expect(result.current.rows[0].faturamento).toBe(5000)
  })

  it('agrupa faturamento corretamente quando uma opp tem multiplas entradas de revenue', () => {
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z' } }),
    ]
    const revenue = [
      makeRevenue({ oportunidade_id: 'o1', data_pagamento_entrada: '2026-03-25', valor_faturado: 3000 }),
      makeRevenue({ oportunidade_id: 'o1', data_pagamento_entrada: '2026-03-26', valor_faturado: 2000 }),
    ]
    const { result } = renderHook(() => useCohort(opps, revenue, '2026-03-01', '2026-03-31'))
    expect(result.current.rows[0].faturamento).toBe(5000)
  })

  it('converte TIMESTAMPTZ para SP antes de extrair mes (00:30Z = mes anterior)', () => {
    // 2026-03-01T00:30:00Z = 2026-02-28 21:30 SP -> cohort fevereiro
    const opps = [
      makeOpp({ id: 'o1', data_lead_recebido: '2026-03-01T00:30:00Z' }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0].cohort_mes).toBe('2026-02-01')
  })

  it('calcula medias de % para color coding apenas de meses com leads', () => {
    // so marco tem leads; fevereiro existe no periodo mas sem opps
    const opps = [
      makeOpp({ id: 'o1', contatos: { ...makeOpp().contatos!, date_created: '2026-03-10T11:00:00Z' }, data_conectado: '2026-03-15' }),
    ]
    const { result } = renderHook(() => useCohort(opps, [], '2026-02-01', '2026-03-31'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.avgConectados).toBe(100) // 1 conectado de 1 lead = 100%
  })
})
