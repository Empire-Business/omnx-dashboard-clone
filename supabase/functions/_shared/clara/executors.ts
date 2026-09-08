// Executores das tools da Clara

import { fmtBRL, getClosedRevenue, isMqlByTag, OppRow, paginatedMetaAds, paginatedOpps, PIPELINE_RECUPERACAO_ID } from './helpers.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, args: Record<string, any>, supabase: any, workspaceId?: string): Promise<unknown> {
  switch (name) {
    case 'query_funnel_cohort': {
      const { start_date, end_date, utm_source, utm_campaign_code, sdr_name, group_by = 'none' } = args
      const startISO = `${start_date}T00:00:00-03:00`
      const endISO = `${end_date}T23:59:59.999-03:00`

      const opps = await paginatedOpps(supabase, (q) => {
        q = q.gte('data_lead_recebido', startISO).lte('data_lead_recebido', endISO)
        if (sdr_name) q = q.eq('sdr_name', sdr_name)
        return q
      })

      // Filtros pós-query (campos do join)
      let filtered = opps
      if (utm_source) filtered = filtered.filter((o) => o.contatos?.utm_source === utm_source)
      if (utm_campaign_code) filtered = filtered.filter((o) => o.contatos?.utm_campaign === String(utm_campaign_code))

      const { closedSet, revenueMap } = await getClosedRevenue(supabase, filtered.map((o) => o.id))

      const aggregate = (rows: OppRow[]) => ({
        leads: rows.length,
        mqls: rows.filter((o) => isMqlByTag(o.contatos)).length,
        conectados: rows.filter((o) => o.data_conectado).length,
        agendados: rows.filter((o) => o.data_agendamento_reuniao).length,
        reunioes: rows.filter((o) => o.data_realizacao_vendas).length,
        fechados: rows.filter((o) => closedSet.has(o.id)).length,
        faturamento_brl: fmtBRL([...revenueMap.entries()].filter(([id]) => rows.some(r=>r.id===id)).reduce((s,[,v])=>s+v, 0)),
      })

      if (group_by === 'none') {
        return { ...aggregate(filtered), period: { start: start_date, end: end_date }, mode: 'COHORT' }
      }

      const groups = new Map<string, OppRow[]>()
      for (const opp of filtered) {
        let key = 'Sem classificação'
        if (group_by === 'month') key = (opp.data_lead_recebido ?? '').slice(0, 7)
        else if (group_by === 'sdr') key = opp.sdr_name ?? opp.contatos?.owner_name ?? 'Sem SDR'
        else if (group_by === 'campaign') key = opp.contatos?.utm_campaign ?? 'Sem campanha'
        else if (group_by === 'channel') key = opp.contatos?.utm_source ?? 'Sem canal'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(opp)
      }

      return {
        group_by,
        period: { start: start_date, end: end_date },
        mode: 'COHORT',
        groups: [...groups.entries()].map(([key, rows]) => ({ key, ...aggregate(rows) })),
      }
    }

    case 'query_revenue_produtividade': {
      const { start_date, end_date, closer_name, group_by = 'none' } = args
      const startISO = `${start_date}T00:00:00-03:00`
      const endISO = `${end_date}T23:59:59.999-03:00`

      let q = supabase
        .from('vendas_fechamento')
        .select('oportunidade_id, valor_faturado, valor_entrada, forma_pagamento, produto_vendido, oportunidades(vendedor_closer, sdr_name)')
        .gte('data_pagamento_entrada', startISO)
        .lte('data_pagamento_entrada', endISO)
        .not('data_pagamento_entrada', 'is', null)

      if (closer_name) {
        // filtrar após query já que é join
      }

      const { data: revData, error: revErr } = await q
      if (revErr) throw new Error(revErr.message)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows = (revData ?? []) as any[]
      if (closer_name) rows = rows.filter((r) => r.oportunidades?.vendedor_closer === closer_name)

      const totalFaturado = rows.reduce((s: number, r: {valor_faturado:number}) => s + (r.valor_faturado ?? 0), 0)
      const totalEntrada = rows.reduce((s: number, r: {valor_entrada:number}) => s + (r.valor_entrada ?? 0), 0)

      if (group_by === 'none') {
        return {
          vendas: rows.length,
          faturamento_brl: fmtBRL(totalFaturado),
          caixa_brl: fmtBRL(totalEntrada),
          period: { start: start_date, end: end_date },
          mode: 'PRODUTIVIDADE',
        }
      }

      const groups = new Map<string, { faturado: number; entrada: number; count: number }>()
      for (const r of rows) {
        let key = 'Sem classificação'
        if (group_by === 'closer') key = r.oportunidades?.vendedor_closer ?? 'Sem closer'
        else if (group_by === 'product') key = r.produto_vendido ?? 'Sem produto'
        else if (group_by === 'payment_method') key = r.forma_pagamento ?? 'Sem forma'
        const cur = groups.get(key) ?? { faturado: 0, entrada: 0, count: 0 }
        cur.faturado += r.valor_faturado ?? 0
        cur.entrada += r.valor_entrada ?? 0
        cur.count++
        groups.set(key, cur)
      }

      return {
        group_by,
        period: { start: start_date, end: end_date },
        mode: 'PRODUTIVIDADE',
        groups: [...groups.entries()].map(([key, g]) => ({
          key,
          vendas: g.count,
          faturamento_brl: fmtBRL(g.faturado),
          caixa_brl: fmtBRL(g.entrada),
        })),
      }
    }

    case 'query_meta_ads': {
      const { start_date, end_date, campaign_name, adset_name, group_by = 'campaign', limit = 10 } = args

      let q = supabase
        .from('meta_ads_insights')
        .select('date, campaign_name, adset_name, ad_name, spend, impressions, clicks, leads, ctr, cpm, landing_page_views')
        .gte('date', start_date)
        .lte('date', end_date)
        .order('date', { ascending: false })

      if (campaign_name) q = q.ilike('campaign_name', `%${campaign_name}%`)
      if (adset_name) q = q.ilike('adset_name', `%${adset_name}%`)

      const { data, error } = await q.limit(5000)
      if (error) throw new Error(error.message)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[]
      const groups = new Map<string, { spend: number; impressions: number; clicks: number; leads: number; lp_views: number }>()

      for (const r of rows) {
        let key = 'Total'
        if (group_by === 'campaign') key = r.campaign_name ?? 'Sem campanha'
        else if (group_by === 'adset') key = r.adset_name ?? 'Sem conjunto'
        else if (group_by === 'ad') key = r.ad_name ?? 'Sem anúncio'
        else if (group_by === 'day') key = r.date ?? 'Sem data'

        const cur = groups.get(key) ?? { spend: 0, impressions: 0, clicks: 0, leads: 0, lp_views: 0 }
        cur.spend += r.spend ?? 0
        cur.impressions += r.impressions ?? 0
        cur.clicks += r.clicks ?? 0
        cur.leads += r.leads ?? 0
        cur.lp_views += r.landing_page_views ?? 0
        groups.set(key, cur)
      }

      const sorted = [...groups.entries()]
        .sort((a, b) => b[1].spend - a[1].spend)
        .slice(0, limit)
        .map(([key, g]) => ({
          key,
          spend_brl: fmtBRL(g.spend),
          impressions: g.impressions.toLocaleString('pt-BR'),
          clicks: g.clicks.toLocaleString('pt-BR'),
          ctr_pct: g.impressions > 0 ? ((g.clicks / g.impressions) * 100).toFixed(2) + '%' : '—',
          cpm_brl: g.impressions > 0 ? fmtBRL((g.spend / g.impressions) * 1000) : '—',
          leads_meta: g.leads,
          lp_views: g.lp_views.toLocaleString('pt-BR'),
        }))

      return {
        group_by,
        period: { start: start_date, end: end_date },
        top_n: sorted.length,
        results: sorted,
        note: 'Leads aqui são do Meta Ads. Para CPMQL real, combine com query_funnel_cohort (leads do CRM).',
      }
    }

    case 'query_meta_ads_region': {
      const { start_date, end_date } = args

      const { data, error } = await supabase.rpc('analisar_meta_ads_por_regiao', {
        p_workspace_id: workspaceId,
        p_start_date: start_date,
        p_end_date: end_date,
      })

      if (error) throw new Error(error.message)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[]
      const total_investimento = rows.reduce((sum, r) => sum + (Number(r.investimento) || 0), 0)
      const total_vendas = rows.reduce((sum, r) => sum + (Number(r.vendas) || 0), 0)

      const formatted = rows
        .filter((r) => r.regiao !== 'Desconhecido')
        .map((r) => ({
          regiao: r.regiao,
          investimento_brl: fmtBRL(r.investimento),
          vendas: Number(r.vendas || 0),
          faturamento_brl: fmtBRL(r.faturamento),
          entrada_caixa_brl: fmtBRL(r.entrada),
          cpv_brl: r.cpv != null ? fmtBRL(r.cpv) : '—',
          roas: r.roas != null ? Number(r.roas).toFixed(2) : '—',
          roas_caixa: r.roas_caixa != null ? Number(r.roas_caixa).toFixed(2) : '—',
          pct_das_vendas: r.pct_vendas != null ? Number(r.pct_vendas).toFixed(1) + '%' : '—',
        }))

      return {
        period: { start: start_date, end: end_date },
        total_investimento_brl: fmtBRL(total_investimento),
        total_vendas: total_vendas,
        regioes: formatted,
        note: 'Investimento é por localização de exibição do anúncio (Meta). Vendas são de tráfego pago (utm_source) com endereço do contratante no CRM. CPV = investimento / vendas. ROAS = faturamento / investimento. ROAS CAIXA = entrada / investimento.',
      }
    }

    case 'query_sdr_performance': {
      const { start_date, end_date, sdr_name, mode } = args

      // Buscar SDRs oficiais
      const { data: usersData } = await supabase
        .from('ghl_users')
        .select('nome, papeis')
        .contains('papeis', ['sdr'])
        .eq('deleted', false)

      const sdrNames = new Set((usersData ?? []).map((u: {nome: string}) => u.nome))

      const opps = await paginatedOpps(supabase, (q) => {
        if (mode === 'cohort') {
          // COHORT: filtra por data_lead_recebido (quando o lead entrou)
          q = q.gte('data_lead_recebido', `${start_date}T00:00:00-03:00`)
            .lte('data_lead_recebido', `${end_date}T23:59:59.999-03:00`)
        } else {
          // PRODUTIVIDADE: busca leads com qualquer evento no período
          // Janela ampla: leads dos últimos 2 anos (evita buscar TODO o histórico)
          const twoYearsAgo = new Date()
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
          const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10)
          q = q.gte('data_lead_recebido', `${twoYearsAgoStr}T00:00:00-03:00`)
        }
        if (sdr_name) q = q.eq('sdr_name', sdr_name)
        return q
      })

      // Filtrar apenas SDRs oficiais
      const filtered = opps.filter((o) => {
        const name = o.sdr_name ?? o.contatos?.owner_name ?? ''
        return sdrNames.has(name) || !!sdr_name
      })

      const groups = new Map<string, OppRow[]>()
      for (const opp of filtered) {
        const name = opp.sdr_name ?? opp.contatos?.owner_name ?? 'Sem SDR'
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name)!.push(opp)
      }

      const result = [...groups.entries()].map(([name, rows]) => {
        if (mode === 'produtividade') {
          return {
            sdr: name,
            leads_total: rows.length,
            conectados: rows.filter((o) => o.data_conectado && o.data_conectado >= start_date && o.data_conectado <= end_date).length,
            agendados: rows.filter((o) => o.data_agendamento_reuniao && o.data_agendamento_reuniao >= start_date && o.data_agendamento_reuniao <= end_date).length,
            reunioes: rows.filter((o) => o.data_realizacao_vendas && o.data_realizacao_vendas >= start_date && o.data_realizacao_vendas <= end_date).length,
          }
        }
        // cohort
        return {
          sdr: name,
          leads: rows.length,
          mqls: rows.filter((o) => isMqlByTag(o.contatos)).length,
          conectados: rows.filter((o) => o.data_conectado).length,
          agendados: rows.filter((o) => o.data_agendamento_reuniao).length,
          reunioes: rows.filter((o) => o.data_realizacao_vendas).length,
        }
      }).sort((a, b) => (b.leads ?? 0) - (a.leads ?? 0))

      return { mode, period: { start: start_date, end: end_date }, sdrs: result }
    }

    case 'query_leads_parados': {
      const { min_days_without_contact = 3, sdr_name, limit = 20 } = args
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - min_days_without_contact)
      const cutoffStr = cutoffDate.toISOString().slice(0, 10)

      let q = supabase
        .from('oportunidades')
        .select('id, sdr_name, data_lead_recebido, data_conectado, contatos(nome, email, tags, owner_name)')
        .is('data_conectado', null)
        .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
        .lte('data_lead_recebido', `${cutoffStr}T23:59:59.999-03:00`)
        .order('data_lead_recebido', { ascending: true })
        .limit(limit)

      if (sdr_name) q = q.eq('sdr_name', sdr_name)

      const { data, error } = await q
      if (error) throw new Error(error.message)

      return {
        leads_parados: (data ?? []).length,
        min_days: min_days_without_contact,
        leads: (data ?? []).map((o: {
          id: string
          sdr_name: string | null
          data_lead_recebido: string | null
          contatos: { nome: string | null; email: string | null; owner_name: string | null } | null
        }) => ({
          nome: o.contatos?.nome ?? '—',
          sdr: o.sdr_name ?? o.contatos?.owner_name ?? '—',
          data_lead: o.data_lead_recebido?.slice(0, 10) ?? '—',
        })),
      }
    }

    case 'query_goals': {
      const { period_start, period_end } = args

      let q = supabase
        .from('goal_versions')
        .select('id, target_value, period_start, period_end, cadence, goal_definitions(id, scope_label, goal_metric_definitions(metric_name, unit, area_key)), goal_snapshots(snapshot_date, actual_value, ideal_value, status)')
        .order('period_start', { ascending: false })
        .limit(30)

      if (period_start) q = q.gte('period_end', period_start)
      if (period_end) q = q.lte('period_start', period_end)

      const { data, error } = await q
      if (error) throw new Error(error.message)

      return {
        metas: (data ?? []).map((v: {
          id: string
          target_value: number
          period_start: string
          period_end: string
          cadence: string
          goal_definitions: {
            scope_label: string
            goal_metric_definitions: { metric_name: string; unit: string; area_key: string }
          }
          goal_snapshots: { snapshot_date: string; actual_value: number; ideal_value: number; status: string }[]
        }) => {
          const latest = v.goal_snapshots?.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
          const def = v.goal_definitions
          const metric = def?.goal_metric_definitions
          return {
            metrica: metric?.metric_name ?? '—',
            area: metric?.area_key ?? '—',
            escopo: def?.scope_label ?? 'Geral',
            meta: v.target_value,
            periodo: `${v.period_start} a ${v.period_end}`,
            atual: latest?.actual_value ?? null,
            status: latest?.status ?? 'sem_dados',
            progresso_pct: latest?.actual_value != null && v.target_value > 0
              ? Math.round((latest.actual_value / v.target_value) * 100) + '%'
              : '—',
          }
        }),
      }
    }

    case 'query_campaign_mapping': {
      const { campaign_name } = args
      let q = supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').order('nome')
      if (campaign_name) q = q.ilike('nome', `%${campaign_name}%`)
      const { data, error } = await q.limit(50)
      if (error) throw new Error(error.message)
      return {
        campanhas: (data ?? []).map((c: {nome: string; utm_campaign: string; funnels: unknown}) => ({
          nome: c.nome,
          utm_campaign_code: c.utm_campaign,
          funnels: c.funnels,
        })),
        nota: 'Use utm_campaign_code como parâmetro utm_campaign_code em query_funnel_cohort',
      }
    }

    case 'query_organico': {
      const { start_date, end_date, group_by = 'channel' } = args

      // Buscar fontes pagas para excluir
      const { data: paidSources } = await supabase.from('utm_sources').select('utm_source')
      const paidSet = new Set((paidSources ?? []).map((s: {utm_source: string}) => s.utm_source))

      const opps = await paginatedOpps(supabase, (q) =>
        q.gte('data_lead_recebido', `${start_date}T00:00:00-03:00`)
          .lte('data_lead_recebido', `${end_date}T23:59:59.999-03:00`)
      )

      // Manter apenas orgânicos (utm_source não está em utm_sources pagas)
      const organic = opps.filter((o) => !paidSet.has(o.contatos?.utm_source ?? ''))

      const { closedSet } = await getClosedRevenue(supabase, organic.map((o) => o.id))

      const groups = new Map<string, OppRow[]>()
      for (const opp of organic) {
        let key = 'Orgânico'
        if (group_by === 'channel') key = opp.contatos?.utm_source ?? 'Sem canal'
        else if (group_by === 'month') key = (opp.data_lead_recebido ?? '').slice(0, 7)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(opp)
      }

      return {
        group_by,
        period: { start: start_date, end: end_date },
        mode: 'COHORT',
        groups: [...groups.entries()].map(([key, rows]) => ({
          canal: key,
          leads: rows.length,
          mqls: rows.filter((o) => isMqlByTag(o.contatos)).length,
          conectados: rows.filter((o) => o.data_conectado).length,
          agendados: rows.filter((o) => o.data_agendamento_reuniao).length,
          fechados: rows.filter((o) => closedSet.has(o.id)).length,
        })),
      }
    }

    case 'list_sdrs': {
      const { data, error } = await supabase
        .from('ghl_users')
        .select('nome, email')
        .contains('papeis', ['sdr'])
        .eq('deleted', false)
        .order('nome')
      if (error) throw new Error(error.message)
      return {
        sdrs: (data ?? []).map((u: {nome: string; email: string}) => ({ nome: u.nome, email: u.email })),
        total: data?.length ?? 0,
      }
    }

    case 'query_funnel_comparison': {
      const { start_date, end_date } = args

      // 1. Carregar mapeamento utm_campaigns → funnels
      const { data: campaigns, error: campErr } = await supabase
        .from('utm_campaigns')
        .select('utm_campaign, nome, funnels')
      if (campErr) throw new Error(campErr.message)

      // Mapas: código → funnels[], e nome (lower) → funnels[]
      const codeToFunnels = new Map<string, string[]>()
      const nomeToFunnels = new Map<string, string[]>()
      for (const c of campaigns ?? []) {
        if (!c.funnels) continue
        let funnels: string[]
        try {
          funnels = Array.isArray(c.funnels) ? c.funnels.map(String) : JSON.parse(String(c.funnels)).map(String)
        } catch { continue }
        if (!funnels.length) continue
        if (c.utm_campaign) codeToFunnels.set(String(c.utm_campaign), funnels)
        if (c.nome) nomeToFunnels.set(String(c.nome).toLowerCase(), funnels)
      }

      // 2. Carregar oportunidades (cohort)
      const opps = await paginatedOpps(supabase, (q) =>
        q.gte('data_lead_recebido', `${start_date}T00:00:00-03:00`)
         .lte('data_lead_recebido', `${end_date}T23:59:59.999-03:00`)
      )

      // 3. Carregar fechamentos
      const { closedSet } = await getClosedRevenue(supabase, opps.map((o) => o.id))

      // 4. Agrupar métricas do CRM por funil
      interface FunnelCRM { mqls: number; connected: number; mtg_sched: number; mtg_done: number; closed: number }
      const funnelCRM = new Map<string, FunnelCRM>()
      const ensureFunnel = (name: string): FunnelCRM => {
        if (!funnelCRM.has(name)) funnelCRM.set(name, { mqls: 0, connected: 0, mtg_sched: 0, mtg_done: 0, closed: 0 })
        return funnelCRM.get(name)!
      }

      for (const opp of opps) {
        const isMql = isMqlByTag(opp.contatos)
        const utmCode = opp.contatos?.utm_campaign
        const funnels = utmCode ? (codeToFunnels.get(String(utmCode)) ?? []) : []
        const buckets = funnels.length > 0 ? funnels : ['Sem funil']
        for (const funnel of buckets) {
          const f = ensureFunnel(funnel)
          if (isMql) f.mqls++
          if (opp.data_conectado) f.connected++
          if (opp.data_agendamento_reuniao) f.mtg_sched++
          if (opp.data_realizacao_vendas) f.mtg_done++
          if (closedSet.has(opp.id)) f.closed++
        }
      }

      // 5. Carregar investimento Meta Ads (paginado)
      const adsRows = await paginatedMetaAds(supabase, start_date, end_date)

      // 6. Agrupar spend por funil via nome da campanha
      const funnelSpend = new Map<string, number>()
      for (const r of adsRows) {
        const campLower = (r.campaign_name ?? '').toLowerCase()
        let matched: string[] = []
        for (const [nome, f] of nomeToFunnels) {
          if (campLower.includes(nome) || nome.includes(campLower)) { matched = f; break }
        }
        if (!matched.length) matched = ['Sem funil']
        for (const funnel of matched) {
          funnelSpend.set(funnel, (funnelSpend.get(funnel) ?? 0) + (r.spend ?? 0))
        }
      }

      // 7. Mesclar CRM + Ads e calcular KPIs
      const allFunnels = new Set([...funnelCRM.keys(), ...funnelSpend.keys()])
      const results = [...allFunnels]
        .map((funnel) => {
          const crm = funnelCRM.get(funnel) ?? { mqls: 0, connected: 0, mtg_sched: 0, mtg_done: 0, closed: 0 }
          const spend = funnelSpend.get(funnel) ?? 0
          const cpmql     = crm.mqls > 0        ? Math.round(spend / crm.mqls)       : null
          const cprm      = crm.mtg_done > 0    ? Math.round(spend / crm.mtg_done)   : null
          const convPct   = crm.mtg_done > 0    ? ((crm.closed / crm.mtg_done) * 100).toFixed(1) + '%' : '—'
          const mqlConvPct = crm.mqls > 0       ? ((crm.mtg_done / crm.mqls) * 100).toFixed(1) + '%' : '—'
          return {
            funnel,
            spend_brl: fmtBRL(spend),
            spend_raw: Math.round(spend),
            mqls: crm.mqls,
            conectados: crm.connected,
            agendados: crm.mtg_sched,
            reunioes_realizadas: crm.mtg_done,
            fechados: crm.closed,
            cpmql_brl: cpmql !== null ? fmtBRL(cpmql) : '—',
            custo_por_reuniao_brl: cprm !== null ? fmtBRL(cprm) : '—',
            conv_mql_para_reuniao: mqlConvPct,
            conv_reuniao_para_fechamento: convPct,
          }
        })
        .sort((a, b) => b.spend_raw - a.spend_raw)
        .map(({ spend_raw: _, ...rest }) => rest)

      return {
        mode: 'COHORT',
        period: { start: start_date, end: end_date },
        total_opps: opps.length,
        funnels: results,
        nota: 'CPMQL = invest. Meta / MQLs CRM. Um lead pode aparecer em múltiplos funis. "Sem funil" = campanha não mapeada em utm_campaigns.',
      }
    }

    case 'run_sql_query': {
      const { sql, description } = args
      const normalized = sql.trim().toUpperCase()
      if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        return { error: 'Apenas SELECT/WITH são permitidos.' }
      }
      const { data, error } = await supabase.rpc('bot_query', { sql_text: sql })
      if (error) return { error: error.message, sql_used: sql }
      return {
        description,
        rows: data ?? [],
        row_count: Array.isArray(data) ? data.length : 0,
        note: 'Resultado direto do banco via SQL — máxima precisão.',
      }
    }

    case 'query_historical_trends': {
      const { metric, months_back = 6, utm_source } = args
      const clampedMonths = Math.max(1, Math.min(12, months_back))

      // Gerar lista de meses: do mais antigo ao mais recente
      const now = new Date()
      const months: string[] = []
      for (let i = clampedMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const seriesMap = new Map<string, number>()

      if (['leads', 'mqls', 'conectados', 'agendados', 'reunioes'].includes(metric)) {
        const startISO = `${months[0]}-01T00:00:00-03:00`
        const lastMonth = months[months.length - 1]
        const endDate = new Date(parseInt(lastMonth.slice(0, 4)), parseInt(lastMonth.slice(5, 7)), 0)
        const endISO = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59.999-03:00`

        const opps = await paginatedOpps(supabase, (q) => {
          q = q.gte('data_lead_recebido', startISO).lte('data_lead_recebido', endISO)
          return q
        })

        let filtered = opps
        if (utm_source) filtered = filtered.filter((o) => o.contatos?.utm_source === utm_source)

        // Para mqls: precisamos closedSet? Não — só funil
        for (const opp of filtered) {
          const month = (opp.data_lead_recebido ?? '').slice(0, 7)
          if (!seriesMap.has(month)) seriesMap.set(month, 0)
          let counts = false
          if (metric === 'leads') counts = true
          else if (metric === 'mqls') counts = isMqlByTag(opp.contatos)
          else if (metric === 'conectados') counts = !!opp.data_conectado
          else if (metric === 'agendados') counts = !!opp.data_agendamento_reuniao
          else if (metric === 'reunioes') counts = !!opp.data_realizacao_vendas
          if (counts) seriesMap.set(month, (seriesMap.get(month) ?? 0) + 1)
        }

      } else if (['vendas', 'faturamento', 'caixa'].includes(metric)) {
        const startISO = `${months[0]}-01T00:00:00-03:00`
        const lastMonth = months[months.length - 1]
        const endDate = new Date(parseInt(lastMonth.slice(0, 4)), parseInt(lastMonth.slice(5, 7)), 0)
        const endISO = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59.999-03:00`

        const { data: revData } = await supabase
          .from('vendas_fechamento')
          .select('oportunidade_id, valor_faturado, valor_entrada, data_pagamento_entrada')
          .gte('data_pagamento_entrada', startISO)
          .lte('data_pagamento_entrada', endISO)
          .not('data_pagamento_entrada', 'is', null)

        for (const r of revData ?? []) {
          const month = (r.data_pagamento_entrada as string).slice(0, 7)
          if (!seriesMap.has(month)) seriesMap.set(month, 0)
          let val = 0
          if (metric === 'vendas') val = 1
          else if (metric === 'faturamento') val = r.valor_faturado ?? 0
          else if (metric === 'caixa') val = r.valor_entrada ?? 0
          seriesMap.set(month, (seriesMap.get(month) ?? 0) + val)
        }

      } else if (metric === 'spend_meta') {
        const startDate = `${months[0]}-01`
        const lastMonth = months[months.length - 1]
        const endDate = new Date(parseInt(lastMonth.slice(0, 4)), parseInt(lastMonth.slice(5, 7)), 0)
        const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

        let q = supabase.from('meta_ads_insights').select('date, spend').gte('date', startDate).lte('date', endStr)
        if (utm_source) {
          // filtrar por public_code no ad_name — não implementável sem lookup, usar aproximação por campanha
        }
        const { data: metaData } = await q.limit(50000)
        for (const r of metaData ?? []) {
          const month = (r.date as string).slice(0, 7)
          if (!seriesMap.has(month)) seriesMap.set(month, 0)
          seriesMap.set(month, (seriesMap.get(month) ?? 0) + (r.spend ?? 0))
        }

      } else if (metric === 'cpmql' || metric === 'roas') {
        // Buscar spend e mqls/faturamento em paralelo
        const startDateStr = `${months[0]}-01`
        const lastMonth = months[months.length - 1]
        const endDateObj = new Date(parseInt(lastMonth.slice(0, 4)), parseInt(lastMonth.slice(5, 7)), 0)
        const endStr = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`
        const startISO = `${months[0]}-01T00:00:00-03:00`
        const endISO = `${endStr}T23:59:59.999-03:00`

        const [metaRes, oppRes, revRes] = await Promise.all([
          supabase.from('meta_ads_insights').select('date, spend').gte('date', startDateStr).lte('date', endStr).limit(50000),
          metric === 'cpmql' ? paginatedOpps(supabase, (q) => q.gte('data_lead_recebido', startISO).lte('data_lead_recebido', endISO)) : Promise.resolve([]),
          metric === 'roas' ? supabase.from('vendas_fechamento').select('valor_faturado, data_pagamento_entrada').gte('data_pagamento_entrada', startISO).lte('data_pagamento_entrada', endISO).not('data_pagamento_entrada', 'is', null) : Promise.resolve({ data: [] }),
        ])

        const spendByMonth = new Map<string, number>()
        for (const r of (metaRes.data ?? [])) {
          const m = (r.date as string).slice(0, 7)
          spendByMonth.set(m, (spendByMonth.get(m) ?? 0) + (r.spend ?? 0))
        }

        if (metric === 'cpmql') {
          const mqlsByMonth = new Map<string, number>()
          const oppsArr = Array.isArray(oppRes) ? oppRes : []
          for (const opp of oppsArr) {
            if (!isMqlByTag(opp.contatos)) continue
            if (utm_source && opp.contatos?.utm_source !== utm_source) continue
            const m = (opp.data_lead_recebido ?? '').slice(0, 7)
            mqlsByMonth.set(m, (mqlsByMonth.get(m) ?? 0) + 1)
          }
          for (const month of months) {
            const spend = spendByMonth.get(month) ?? 0
            const mqls = mqlsByMonth.get(month) ?? 0
            seriesMap.set(month, mqls > 0 ? spend / mqls : 0)
          }
        } else {
          // roas
          const fatByMonth = new Map<string, number>()
          const revData = 'data' in revRes ? revRes.data : []
          for (const r of revData ?? []) {
            const m = (r.data_pagamento_entrada as string).slice(0, 7)
            fatByMonth.set(m, (fatByMonth.get(m) ?? 0) + (r.valor_faturado ?? 0))
          }
          for (const month of months) {
            const spend = spendByMonth.get(month) ?? 0
            const fat = fatByMonth.get(month) ?? 0
            seriesMap.set(month, spend > 0 ? fat / spend : 0)
          }
        }
      }

      // Montar série com growth%
      const isCurrency = ['faturamento', 'caixa', 'spend_meta'].includes(metric)
      const isRatio = ['cpmql', 'roas'].includes(metric)
      const series = months.map((month, idx) => {
        const value = seriesMap.get(month) ?? 0
        const prev = idx > 0 ? (seriesMap.get(months[idx - 1]) ?? 0) : null
        const growth_pct = prev !== null && prev > 0
          ? `${(((value - prev) / prev) * 100) > 0 ? '+' : ''}${(((value - prev) / prev) * 100).toFixed(1)}%`
          : null
        return {
          month,
          value: isCurrency ? parseFloat(value.toFixed(2)) : isRatio ? parseFloat(value.toFixed(2)) : Math.round(value),
          value_fmt: isCurrency ? fmtBRL(value) : isRatio ? value.toFixed(2) + 'x' : String(Math.round(value)),
          growth_pct,
        }
      })

      // Calcular tendência média (últimos 3 meses)
      const recent = series.filter((s) => s.growth_pct !== null).slice(-3)
      const growthValues = recent.map((s) => parseFloat(s.growth_pct!.replace('%', '').replace('+', '')))
      const avgGrowth = growthValues.length > 0 ? growthValues.reduce((a, b) => a + b, 0) / growthValues.length : 0
      const trend = avgGrowth > 5 ? 'alta_forte' : avgGrowth > 1 ? 'alta_leve' : avgGrowth < -5 ? 'queda_forte' : avgGrowth < -1 ? 'queda_leve' : 'estavel'

      const lastValue = series[series.length - 1]?.value ?? 0
      const projBase = lastValue * (1 + avgGrowth / 100)
      const projConservador = lastValue * (1 + (avgGrowth - 15) / 100)
      const projOtimista = lastValue * (1 + (avgGrowth + 15) / 100)

      return {
        metric,
        months_back: clampedMonths,
        series,
        avg_growth_pct_3m: `${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(1)}%`,
        trend,
        projecao_proximo_mes: {
          conservador: isCurrency ? fmtBRL(projConservador) : isRatio ? projConservador.toFixed(2) + 'x' : String(Math.round(projConservador)),
          base: isCurrency ? fmtBRL(projBase) : isRatio ? projBase.toFixed(2) + 'x' : String(Math.round(projBase)),
          otimista: isCurrency ? fmtBRL(projOtimista) : isRatio ? projOtimista.toFixed(2) + 'x' : String(Math.round(projOtimista)),
        },
        nota: 'Projeção por tendência linear dos últimos 3 meses. Cenários: conservador (−15%), base, otimista (+15%)',
      }
    }

    case 'get_buyer_profile': {
      const { start_date, end_date, messages_per_buyer = 25 } = args
      const startISO = `${start_date}T00:00:00-03:00`
      const endISO = `${end_date}T23:59:59.999-03:00`
      const msgLimit = Math.min(Number(messages_per_buyer) || 25, 40)

      // 1. Buscar vendas do período com join simples (2 níveis, confirmado funcional)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sales, error: salesErr } = await (supabase as any)
        .from('vendas_fechamento')
        .select('oportunidade_id, valor_faturado, valor_entrada, forma_pagamento, produto_vendido, numero_parcelas, data_pagamento_entrada, oportunidades(id, contato_id, sdr_name, vendedor_closer, data_lead_recebido)')
        .gte('data_pagamento_entrada', startISO)
        .lte('data_pagamento_entrada', endISO)
        .not('data_pagamento_entrada', 'is', null)

      if (salesErr) throw new Error(`vendas_fechamento: ${salesErr.message}`)
      if (!sales?.length) return { buyers: [], total: 0, period: { start: start_date, end: end_date }, nota: 'Nenhuma venda encontrada no período.' }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const salesTyped = sales as any[]

      // 2. Coletar IDs únicos
      const contatoIds: string[] = [...new Set<string>(
        salesTyped.map((s: any) => s.oportunidades?.contato_id).filter(Boolean)
      )]
      const oppIds: string[] = salesTyped.map((s: any) => s.oportunidades?.id).filter(Boolean)

      // 3. Buscar info de contatos separadamente (campos confirmados: nome, email, tags, utm_source, utm_campaign, estado_uf)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contatosData } = await (supabase as any)
        .from('contatos')
        .select('id, nome, email, tags, utm_source, utm_campaign, estado_uf')
        .in('id', contatoIds)
        .limit(200)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contatoMap = new Map<string, any>()
      for (const c of contatosData ?? []) {
        contatoMap.set(c.id, c)
      }

      // 4. Buscar mensagens de todos os compradores
      const safeLimit = Math.min(contatoIds.length * msgLimit, 950)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: msgs } = await (supabase as any)
        .from('comunicacoes')
        .select('contato_id, data_comunicacao, channel, direction, mensagem_body')
        .in('contato_id', contatoIds)
        .order('contato_id', { ascending: true })
        .order('data_comunicacao', { ascending: false })
        .limit(safeLimit)

      // Agrupar mensagens por contato_id
      const msgsByContato = new Map<string, { direction: string; canal: string; data: string; texto: string }[]>()
      for (const msg of msgs ?? []) {
        if (!msg.contato_id) continue
        if (!msgsByContato.has(msg.contato_id)) msgsByContato.set(msg.contato_id, [])
        const arr = msgsByContato.get(msg.contato_id)!
        if (arr.length < msgLimit) {
          arr.push({
            direction: msg.direction ?? 'unknown',
            canal: msg.channel ?? 'unknown',
            data: String(msg.data_comunicacao ?? '').slice(0, 10),
            texto: String(msg.mensagem_body ?? '').slice(0, 400),
          })
        }
      }

      // 5. Montar perfil de cada comprador
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buyers = salesTyped.map((s: any) => {
        const opp = s.oportunidades
        const contatoId: string | undefined = opp?.contato_id
        const contato = contatoId ? contatoMap.get(contatoId) : null

        let ciclo_dias: number | null = null
        if (opp?.data_lead_recebido && s.data_pagamento_entrada) {
          ciclo_dias = Math.round(
            (new Date(String(s.data_pagamento_entrada)).getTime() - new Date(String(opp.data_lead_recebido)).getTime())
            / (1000 * 60 * 60 * 24)
          )
        }

        return {
          nome: contato?.nome ?? 'Sem nome',
          email: contato?.email ?? null,
          estado: contato?.estado_uf ?? null,
          produto: s.produto_vendido ?? null,
          faturamento: fmtBRL(s.valor_faturado ?? 0),
          entrada: fmtBRL(s.valor_entrada ?? 0),
          forma_pagamento: s.forma_pagamento ?? null,
          parcelas: s.numero_parcelas ?? null,
          canal_origem: contato?.utm_source ?? 'orgânico',
          campanha_origem: contato?.utm_campaign ?? null,
          sdr: opp?.sdr_name ?? null,
          closer: opp?.vendedor_closer ?? null,
          ciclo_compra_dias: ciclo_dias,
          data_compra: String(s.data_pagamento_entrada ?? '').slice(0, 10),
          mensagens: contatoId ? (msgsByContato.get(contatoId) ?? []) : [],
        }
      })

      const totalFat = salesTyped.reduce((sum: number, r: any) => sum + (r.valor_faturado ?? 0), 0)
      const ciclos = buyers.map((b: any) => b.ciclo_compra_dias).filter((c: unknown): c is number => typeof c === 'number')
      const avgCiclo = ciclos.length ? Math.round(ciclos.reduce((a: number, b: number) => a + b, 0) / ciclos.length) : null
      const medCiclo = ciclos.length ? [...ciclos].sort((a: number, b: number) => a - b)[Math.floor(ciclos.length / 2)] : null

      return {
        total_compradores: buyers.length,
        period: { start: start_date, end: end_date },
        faturamento_total: fmtBRL(totalFat),
        ticket_medio: buyers.length ? fmtBRL(totalFat / buyers.length) : 'R$ 0,00',
        ciclo_medio_dias: avgCiclo,
        ciclo_mediano_dias: medCiclo,
        buyers,
        nota: `${buyers.length} compradores com até ${msgLimit} mensagens cada (400 chars/msg). Analise os dados e escreva o relatório.`,
      }
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`)
  }
}
