const fs = require('fs');
const path = require('path');

const BASE_PATH = '/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/lead-scoring';
const OUTPUT_PATH = `${BASE_PATH}/05-RANKING-COMPLETO`;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_PATH)) {
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

console.log('📊 Loading data files...');

// Load all-leads-scored.json (main scored data)
const scoredData = JSON.parse(fs.readFileSync(`${BASE_PATH}/04-SCoring-PREDICTIVO/all-leads-scored.json`, 'utf8'));
const contacts = scoredData.contacts;
const metadata = scoredData.metadata;

console.log(`✓ Loaded ${contacts.length} scored contacts`);

// Load vendas_fechamento for buyer data
const vendasFechamento = JSON.parse(fs.readFileSync(`${BASE_PATH}/raw_vendas_fechamento.json`, 'utf8'));
console.log(`✓ Loaded ${vendasFechamento.length} closed sales`);

// Load oportunidades for pipeline info
const oportunidades = JSON.parse(fs.readFileSync(`${BASE_PATH}/raw_oportunidades.json`, 'utf8'));
console.log(`✓ Loaded ${oportunidades.length} opportunities`);

// Load raw_contatos for additional contact details
const rawContatos = JSON.parse(fs.readFileSync(`${BASE_PATH}/raw_contatos.json`, 'utf8'));
console.log(`✓ Loaded ${rawContatos.length} raw contacts`);

// Load comunicacoes for engagement metrics
const comunicacoes = JSON.parse(fs.readFileSync(`${BASE_PATH}/raw_comunicacoes.json`, 'utf8'));
console.log(`✓ Loaded ${comunicacoes.length} communications`);

// Create maps for quick lookups
const contatoMap = new Map(rawContatos.map(c => [c.id, c]));
const vendasMap = new Map(vendasFechamento.map(v => [v.contato_id, v]));
const oppByContatoMap = new Map();
oportunidades.forEach(opp => {
  if (!oppByContatoMap.has(opp.contato_id)) {
    oppByContatoMap.set(opp.contato_id, []);
  }
  oppByContatoMap.get(opp.contato_id).push(opp);
});

// Count communications per contact
const commCountMap = new Map();
comunicacoes.forEach(comm => {
  commCountMap.set(comm.contato_id, (commCountMap.get(comm.contato_id) || 0) + 1);
});

// Calculate days since lead received
function daysSinceLead(dataLeadRecebido) {
  if (!dataLeadRecebido) return null;
  const leadDate = new Date(dataLeadRecebido);
  const now = new Date('2026-04-02');
  return Math.floor((now - leadDate) / (1000 * 60 * 60 * 24));
}

// TIER CLASSIFICATION
function getTier(score) {
  if (score >= 18) return { tier: 'TIER 1 - HOT', tierKey: 'hot', priority: 1 };
  if (score >= 14) return { tier: 'TIER 2 - WARM', tierKey: 'warm', priority: 2 };
  if (score >= 8) return { tier: 'TIER 3 - NURTURING', tierKey: 'nurturing', priority: 3 };
  return { tier: 'TIER 4 - COLD', tierKey: 'cold', priority: 4 };
}

// Check if contact has MQL tag
function hasMqlTag(tags) {
  if (!tags) return false;
  const tagList = tags.split(',').map(t => t.trim().toLowerCase());
  return tagList.includes('mql');
}

// Check if contact has SQL tag
function hasSqlTag(tags) {
  if (!tags) return false;
  const tagList = tags.split(',').map(t => t.trim().toLowerCase());
  return tagList.includes('sql');
}

// Build enriched lead data
console.log('\n🔄 Enriching lead data...');
const enrichedLeads = contacts.map(contact => {
  const raw = contatoMap.get(contact.contato_id);
  // Use is_buyer from the scoring model (authoritative)
  const hasBought = contact.is_buyer;
  const vendas = hasBought ? vendasMap.get(contact.contato_id) : null;
  const opps = oppByContatoMap.get(contact.contato_id) || [];
  const commCount = commCountMap.get(contact.contato_id) || 0;
  const daysSince = daysSinceLead(contact.data_lead_recebido);
  
  // Get primary opportunity (most advanced)
  const primaryOpp = opps.length > 0 
    ? opps.sort((a, b) => {
        const stageOrder = ['Open', 'Qualificado', 'Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Agendamento', 'Reunião Agendada', 'Reunião Realizada', 'Negociação', 'Fechado', 'Won'];
        return (stageOrder.indexOf(a.pipeline_stage_id) || 0) - (stageOrder.indexOf(b.pipeline_stage_id) || 0);
      })[0] 
    : null;

  const tierInfo = getTier(contact.score_final);
  const isMql = hasMqlTag(contact.tags);
  const isSql = hasSqlTag(contact.tags);
  const sdrName = contact.feature_details?.sinais?.sdr_name || contact.owner_name || '—';

  return {
    contato_id: contact.contato_id,
    nome: contact.nome,
    email: contact.email,
    telefone: contact.telefone,
    score_final: contact.score_final,
    tier: tierInfo.tier,
    tier_key: tierInfo.tierKey,
    category_label: contact.categoria_label,
    breakdown: contact.breakdown,
    is_buyer: contact.is_buyer,
    has_bought: hasBought,
    buyer_confirmed_at: vendas?.data_pagamento_entrada || contact.buyer_confirmed_at,
    pipeline_name: contact.pipeline_name || primaryOpp?.pipeline_name || '—',
    pipeline_stage: primaryOpp?.pipeline_stage_id || '—',
    owner_name: sdrName,
    sdr_name: sdrName,
    tags: contact.tags,
    is_mql: isMql,
    is_sql: isSql,
    total_messages: commCount,
    days_since_lead: daysSince,
    data_lead_recebido: contact.data_lead_recebido,
    engagement_score: contact.breakdown?.engajamento_comportamental || 0,
    progression_score: contact.breakdown?.progressao_estagio || 0,
    fit_score: contact.breakdown?.fit_demografico || 0,
    sinais_score: contact.breakdown?.sinais_explicitos || 0,
    in_vendas_pipeline: contact.feature_details?.sinais?.in_vendas_pipeline || false,
    has_sdr: contact.feature_details?.sinais?.has_sdr || false,
    meetings_scheduled: contact.feature_details?.comportamental?.meetings_scheduled || 0,
    meetings_realized: contact.feature_details?.comportamental?.meetings_realized || 0,
  };
});

console.log(`✓ Enriched ${enrichedLeads.length} leads`);

// ============================================
// SECTION A: TOP 50 HOTTEST LEADS (NOT YET PURCHASED)
// ============================================
console.log('\n🔥 Generating Top 50 Hottest Leads...');
const notPurchased = enrichedLeads
  .filter(l => !l.has_bought && l.score_final > 0)
  .sort((a, b) => b.score_final - a.score_final)
  .slice(0, 50);

const top50Table = notPurchased.map((lead, i) => {
  const mqlTag = lead.is_mql ? '✅ MQL' : '❌';
  const sqlTag = lead.is_sql ? '✅ SQL' : '❌';
  return `${i + 1}|${lead.nome}|${lead.email || '—'}|${lead.score_final.toFixed(2)}|${mqlTag}|${sqlTag}|${lead.pipeline_name}|${lead.sdr_name}|${lead.days_since_lead || '—'}d|${lead.total_messages}`;
});

// ============================================
// SECTION B: MQLS BY SCORE RANKING
// ============================================
console.log('📋 Generating MQL Ranking...');
const mqls = enrichedLeads
  .filter(l => l.is_mql && !l.has_bought)
  .sort((a, b) => b.score_final - a.score_final)
  .slice(0, 100);

const mqlTable = mqls.map((lead, i) => {
  return `${i + 1}|${lead.nome}|${lead.email || '—'}|Score: ${lead.score_final.toFixed(2)}|${lead.pipeline_name}|${lead.pipeline_stage}`;
});

// ============================================
// SECTION C: RECENT LEADS BY SCORE (LAST 90 DAYS)
// ============================================
console.log('📅 Generating Recent Leads Ranking (last 90 days)...');
const ninetyDaysAgo = new Date('2026-01-02');
const recentLeads = enrichedLeads
  .filter(l => {
    if (!l.data_lead_recebido) return false;
    const leadDate = new Date(l.data_lead_recebido);
    return leadDate >= ninetyDaysAgo;
  })
  .sort((a, b) => b.score_final - a.score_final)
  .slice(0, 100);

const recentTable = recentLeads.map((lead, i) => {
  const stageEmoji = lead.pipeline_stage === 'Reunião Realizada' ? '🎯' 
    : lead.pipeline_stage === 'Reunião Agendada' ? '📅'
    : lead.pipeline_stage === 'Negociação' ? '💬'
    : '📍';
  return `${i + 1}|${lead.nome}|${lead.email || '—'}|Score: ${lead.score_final.toFixed(2)}|${lead.pipeline_name}|${stageEmoji} ${lead.pipeline_stage}|${lead.days_since_lead || '—'}d`;
});

// ============================================
// SECTION D: SDR LEADERBOARD
// ============================================
console.log('🏆 Generating SDR Leaderboard...');
const sdrStats = new Map();

enrichedLeads.forEach(lead => {
  const sdr = lead.sdr_name || 'Unassigned';
  if (!sdrStats.has(sdr)) {
    sdrStats.set(sdr, {
      sdr_name: sdr,
      total_leads: 0,
      avg_score: 0,
      total_score: 0,
      hot_count: 0,
      warm_count: 0,
      nurturing_count: 0,
      cold_count: 0,
      mql_count: 0,
      sql_count: 0,
      buyers: 0,
      revenue: 0,
    });
  }
  const stats = sdrStats.get(sdr);
  stats.total_leads++;
  stats.total_score += lead.score_final;
  stats.avg_score = stats.total_score / stats.total_leads;
  
  if (lead.tier_key === 'hot') stats.hot_count++;
  if (lead.tier_key === 'warm') stats.warm_count++;
  if (lead.tier_key === 'nurturing') stats.nurturing_count++;
  if (lead.tier_key === 'cold') stats.cold_count++;
  if (lead.is_mql) stats.mql_count++;
  if (lead.is_sql) stats.sql_count++;
  if (lead.has_bought) {
    stats.buyers++;
    const venda = vendasMap.get(lead.contato_id);
    if (venda) stats.revenue += venda.valor_faturado || 0;
  }
});

const sdrLeaderboard = Array.from(sdrStats.values())
  .filter(s => s.sdr_name !== '—')
  .sort((a, b) => b.avg_score - a.avg_score);

// ============================================
// SECTION E: PREDICT NEXT BUYERS
// ============================================
console.log('🎯 Identifying Predicted Next Buyers...');

// Criteria: Score >= 14, in Vendas SQL pipeline or advanced stage, recent engagement
const predictedNextBuyers = enrichedLeads
  .filter(l => 
    !l.has_bought && 
    l.score_final >= 14 &&
    (l.in_vendas_pipeline || l.pipeline_stage === 'Reunião Realizada' || l.pipeline_stage === 'Reunião Agendada') &&
    (l.days_since_lead === null || l.days_since_lead <= 60)
  )
  .sort((a, b) => b.score_final - a.score_final)
  .slice(0, 50);

const predictedBuyersTable = predictedNextBuyers.map((lead, i) => {
  const signals = [];
  if (lead.is_mql) signals.push('MQL');
  if (lead.is_sql) signals.push('SQL');
  if (lead.in_vendas_pipeline) signals.push('Vendas SQL');
  if (lead.meetings_realized > 0) signals.push(`${lead.meetings_realized}x reuniões`);
  if (lead.total_messages > 10) signals.push(`${lead.total_messages} msgs`);
  
  return `${i + 1}|${lead.nome}|${lead.email || '—'}|Score: ${lead.score_final.toFixed(2)}|${signals.join(', ')}|${lead.pipeline_name}`;
});

// ============================================
// SECTION F: CONVERSION FUNNEL BY TIER
// ============================================
console.log('📊 Calculating Conversion Funnel by Tier...');

// Define buyerContactIds first
const buyerContactIds = new Set(enrichedLeads.filter(l => l.has_bought).map(l => l.contato_id));

const tierStats = {
  hot: { count: 0, mql_count: 0, buyers: 0, revenue: 0, total_score: 0 },
  warm: { count: 0, mql_count: 0, buyers: 0, revenue: 0, total_score: 0 },
  nurturing: { count: 0, mql_count: 0, buyers: 0, revenue: 0, total_score: 0 },
  cold: { count: 0, mql_count: 0, buyers: 0, revenue: 0, total_score: 0 },
};

enrichedLeads.forEach(lead => {
  const tier = lead.tier_key;
  tierStats[tier].count++;
  tierStats[tier].total_score += lead.score_final;
  if (lead.is_mql) tierStats[tier].mql_count++;
  if (lead.has_bought) {
    tierStats[tier].buyers++;
  }
});

// Calculate revenue per tier from matched sales
vendasFechamento.forEach(venda => {
  if (buyerContactIds.has(venda.contato_id)) {
    const lead = enrichedLeads.find(l => l.contato_id === venda.contato_id);
    if (lead) {
      tierStats[lead.tier_key].revenue += venda.valor_faturado || 0;
    }
  }
});

// Calculate days to purchase for converted leads
const daysToPurchaseByTier = { hot: [], warm: [], nurturing: [], cold: [] };
enrichedLeads.forEach(lead => {
  if (lead.has_bought && lead.data_lead_recebido && lead.buyer_confirmed_at) {
    const leadDate = new Date(lead.data_lead_recebido);
    const purchaseDate = new Date(lead.buyer_confirmed_at);
    const days = Math.floor((purchaseDate - leadDate) / (1000 * 60 * 60 * 24));
    if (days >= 0 && days < 365) {
      daysToPurchaseByTier[lead.tier_key].push(days);
    }
  }
});

function avgDays(daysArray) {
  if (daysArray.length === 0) return 'N/A';
  return (daysArray.reduce((a, b) => a + b, 0) / daysArray.length).toFixed(1);
}

// Average deal value calculation (from closed sales that match our scored contacts)
let matchedSalesRevenue = 0;
let matchedSalesCount = 0;
vendasFechamento.forEach(v => {
  if (buyerContactIds.has(v.contato_id)) {
    matchedSalesRevenue += (v.valor_faturado || 0);
    matchedSalesCount++;
  }
});

const avgDealValue = matchedSalesCount > 0 ? matchedSalesRevenue / matchedSalesCount : 0;

// ============================================
// GENERATE CSV EXPORTS
// ============================================
console.log('\n📁 Generating CSV exports...');

// ALL LEADS CSV
const allLeadsCsvHeader = 'contact_id,name,email,score,tier,tier_key,tags,pipeline_name,pipeline_stage,sdr_name,total_messages,days_since_lead,has_bought,is_mql,is_sql,engagement_score,progression_score,fit_score';
const allLeadsCsv = enrichedLeads
  .map(l => [
    l.contato_id,
    `"${l.nome || ''}"`,
    l.email || '',
    l.score_final.toFixed(2),
    `"${l.tier}"`,
    l.tier_key,
    `"${l.tags || ''}"`,
    `"${l.pipeline_name}"`,
    `"${l.pipeline_stage}"`,
    `"${l.sdr_name}"`,
    l.total_messages,
    l.days_since_lead || '',
    l.has_bought ? 'Yes' : 'No',
    l.is_mql ? 'Yes' : 'No',
    l.is_sql ? 'Yes' : 'No',
    l.engagement_score,
    l.progression_score,
    l.fit_score
  ].join(','))
  .join('\n');

fs.writeFileSync(`${OUTPUT_PATH}/all-leads-ranking.csv`, allLeadsCsvHeader + '\n' + allLeadsCsv);
console.log(`✓ Saved all-leads-ranking.csv (${enrichedLeads.length} leads)`);

// HOT LEADS CSV (Top 100 not purchased)
const hotLeadsCsvHeader = 'rank,name,email,score,tier,pipeline_name,pipeline_stage,sdr_name,total_messages,days_since_lead,is_mql,is_sql,engagement_score,progression_score';
const hotLeadsCsv = notPurchased
  .slice(0, 100)
  .map((l, i) => [
    i + 1,
    `"${l.nome || ''}"`,
    l.email || '',
    l.score_final.toFixed(2),
    `"${l.tier}"`,
    `"${l.pipeline_name}"`,
    `"${l.pipeline_stage}"`,
    `"${l.sdr_name}"`,
    l.total_messages,
    l.days_since_lead || '',
    l.is_mql ? 'Yes' : 'No',
    l.is_sql ? 'Yes' : 'No',
    l.engagement_score,
    l.progression_score
  ].join(','))
  .join('\n');

fs.writeFileSync(`${OUTPUT_PATH}/hot-leads.csv`, hotLeadsCsvHeader + '\n' + hotLeadsCsv);
console.log(`✓ Saved hot-leads.csv (${Math.min(100, notPurchased.length)} hot leads)`);

// ============================================
// GENERATE MARKDOWN REPORT
// ============================================
console.log('\n📝 Generating ranking report...');

const report = `# 📊 RELATÓRIO DE RANKING DE LEADS
**Data de Geração:** 2026-04-02  
**Total de Leads:** ${enrichedLeads.length.toLocaleString()}  
**Total de Compradores:** ${enrichedLeads.filter(l => l.has_bought).length}  

---

## 📈 RESUMO EXECUTIVO

### Distribuição por Tier

| Tier | Leads | % | Compradores | Taxa Conv. | Receita |
|------|-------|---|------------|-------------|---------|
| 🔥 HOT (18-22) | ${tierStats.hot.count} | ${((tierStats.hot.count / enrichedLeads.length) * 100).toFixed(1)}% | ${tierStats.hot.buyers} | ${tierStats.hot.count > 0 ? ((tierStats.hot.buyers / tierStats.hot.count) * 100).toFixed(1) : 0}% | R$ ${(tierStats.hot.revenue / 1000).toFixed(0)}k |
| 🌡️ WARM (14-17) | ${tierStats.warm.count} | ${((tierStats.warm.count / enrichedLeads.length) * 100).toFixed(1)}% | ${tierStats.warm.buyers} | ${tierStats.warm.count > 0 ? ((tierStats.warm.buyers / tierStats.warm.count) * 100).toFixed(1) : 0}% | R$ ${(tierStats.warm.revenue / 1000).toFixed(0)}k |
| 🌱 NURTURING (8-13) | ${tierStats.nurturing.count} | ${((tierStats.nurturing.count / enrichedLeads.length) * 100).toFixed(1)}% | ${tierStats.nurturing.buyers} | ${tierStats.nurturing.count > 0 ? ((tierStats.nurturing.buyers / tierStats.nurturing.count) * 100).toFixed(1) : 0}% | R$ ${(tierStats.nurturing.revenue / 1000).toFixed(0)}k |
| ❄️ COLD (0-7) | ${tierStats.cold.count} | ${((tierStats.cold.count / enrichedLeads.length) * 100).toFixed(1)}% | ${tierStats.cold.buyers} | ${tierStats.cold.count > 0 ? ((tierStats.cold.buyers / tierStats.cold.count) * 100).toFixed(1) : 0}% | R$ ${(tierStats.cold.revenue / 1000).toFixed(0)}k |

### Receita Total: R$ ${((tierStats.hot.revenue + tierStats.warm.revenue + tierStats.nurturing.revenue + tierStats.cold.revenue) / 1000).toFixed(0)}k
### Valor Médio por Deal: R$ ${(avgDealValue / 1000).toFixed(0)}k

---

## 🔥 TOP 50 LEADS MAIS QUENTES (NÃO COMPRARAM)

*Leads com maior pontuação que ainda não fecharam compra*

| # | Nome | Email | Score | MQL | SQL | Pipeline | SDR | Dias | Msgs |
|---|------|-------|-------|-----|-----|----------|-----|------|------|
${top50Table.map(row => {
  const [num, nome, email, score, mql, sql, pipeline, sdr, dias, msgs] = row.split('|');
  return `| ${num} | ${nome} | ${email} | ${score} | ${mql} | ${sql} | ${pipeline} | ${sdr} | ${dias} | ${msgs} |`;
}).join('\n')}

---

## 📋 RANKING MQLs POR SCORE

*Leads qualificados pelo marketing (MQL) ordenados por pontuação*

| # | Nome | Email | Score | Pipeline | Estágio |
|---|------|-------|-------|----------|---------|
${mqlTable.map(row => {
  const [num, nome, email, score, pipeline, stage] = row.split('|');
  return `| ${num} | ${nome} | ${email} | ${score} | ${pipeline} | ${stage} |`;
}).join('\n')}

---

## 📅 LEADS RECENTES POR SCORE (ÚLTIMOS 90 DIAS)

*Leads mais novos ordenados por pontuação*

| # | Nome | Email | Score | Pipeline | Estágio | Dias |
|---|------|-------|-------|----------|---------|------|
${recentTable.map(row => {
  const [num, nome, email, score, pipeline, stage, dias] = row.split('|');
  return `| ${num} | ${nome} | ${email} | ${score} | ${pipeline} | ${stage} | ${dias} |`;
}).join('\n')}

---

## 🏆 SDR LEADERBOARD

*Performance dos SDRs por pontuação média e conversão*

| SDR | Leads | Avg Score | HOT | WARM | NURT | COLD | MQLs | SQLs | Compradores | Receita |
|-----|-------|-----------|-----|------|------|------|------|------|-------------|--------|
${sdrLeaderboard.map(sdr => {
  const convRate = sdr.total_leads > 0 ? ((sdr.buyers / sdr.total_leads) * 100).toFixed(1) : '0';
  return `| ${sdr.sdr_name} | ${sdr.total_leads} | ${sdr.avg_score.toFixed(2)} | ${sdr.hot_count} | ${sdr.warm_count} | ${sdr.nurturing_count} | ${sdr.cold_count} | ${sdr.mql_count} | ${sdr.sql_count} | ${sdr.buyers} | R$ ${(sdr.revenue / 1000).toFixed(0)}k |`;
}).join('\n')}

---

## 🎯 PRÓXIMOS COMPRADORES PREVISTOS

*Leads com alta probabilidade de compra baseados em score >= 14, estágio avançado e engajamento recente*

| # | Nome | Email | Score | Sinais | Pipeline |
|---|------|-------|-------|--------|----------|
${predictedBuyersTable.map(row => {
  const [num, nome, email, score, sinais, pipeline] = row.split('|');
  return `| ${num} | ${nome} | ${email} | ${score} | ${sinais} | ${pipeline} |`;
}).join('\n')}

---

## 📊 FUNIL DE CONVERSÃO POR TIER

| Tier | Leads | MQL % | Temp. Média Compra | Receita Projetada* |
|------|-------|-------|-------------------|------------------|
| 🔥 HOT | ${tierStats.hot.count} | ${tierStats.hot.count > 0 ? ((tierStats.hot.mql_count / tierStats.hot.count) * 100).toFixed(1) : 0}% | ${avgDays(daysToPurchaseByTier.hot)} dias | R$ ${((tierStats.hot.count - tierStats.hot.buyers) * avgDealValue / 1000).toFixed(0)}k |
| 🌡️ WARM | ${tierStats.warm.count} | ${tierStats.warm.count > 0 ? ((tierStats.warm.mql_count / tierStats.warm.count) * 100).toFixed(1) : 0}% | ${avgDays(daysToPurchaseByTier.warm)} dias | R$ ${((tierStats.warm.count - tierStats.warm.buyers) * avgDealValue / 1000).toFixed(0)}k |
| 🌱 NURTURING | ${tierStats.nurturing.count} | ${tierStats.nurturing.count > 0 ? ((tierStats.nurturing.mql_count / tierStats.nurturing.count) * 100).toFixed(1) : 0}% | ${avgDays(daysToPurchaseByTier.nurturing)} dias | R$ ${((tierStats.nurturing.count - tierStats.nurturing.buyers) * avgDealValue / 1000).toFixed(0)}k |
| ❄️ COLD | ${tierStats.cold.count} | ${tierStats.cold.count > 0 ? ((tierStats.cold.mql_count / tierStats.cold.count) * 100).toFixed(1) : 0}% | ${avgDays(daysToPurchaseByTier.cold)} dias | R$ ${((tierStats.cold.count - tierStats.cold.buyers) * avgDealValue / 1000).toFixed(0)}k |

*\* Receita projetada = (Leads não comprados do tier) × Valor médio do deal (R$ ${(avgDealValue / 1000).toFixed(0)}k)*

---

## 📈 ESTATÍSTICAS DE CONVERSÃO

### Por Pipeline
| Pipeline | Leads | Compradores | Taxa |
|----------|-------|-------------|------|
| Vendas SQL | ${enrichedLeads.filter(l => l.pipeline_name === 'Vendas SQL').length} | ${enrichedLeads.filter(l => l.pipeline_name === 'Vendas SQL' && l.has_bought).length} | ${((enrichedLeads.filter(l => l.pipeline_name === 'Vendas SQL' && l.has_bought).length / enrichedLeads.filter(l => l.pipeline_name === 'Vendas SQL').length) * 100 || 0).toFixed(1)}% |
| Pré-Vendas MQL | ${enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas MQL').length} | ${enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas MQL' && l.has_bought).length} | ${((enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas MQL' && l.has_bought).length / enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas MQL').length) * 100 || 0).toFixed(1)}% |
| Pré-Vendas nMQL | ${enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas nMQL').length} | ${enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas nMQL' && l.has_bought).length} | ${((enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas nMQL' && l.has_bought).length / enrichedLeads.filter(l => l.pipeline_name === 'Pré-Vendas nMQL').length) * 100 || 0).toFixed(1)}% |

### Score Stats por Status
| Métrica | Buyers | Non-Buyers |
|---------|--------|------------|
| Média | ${enrichedLeads.filter(l => l.has_bought).reduce((sum, l) => sum + l.score_final, 0) / enrichedLeads.filter(l => l.has_bought).length || 0} | ${enrichedLeads.filter(l => !l.has_bought).reduce((sum, l) => sum + l.score_final, 0) / enrichedLeads.filter(l => !l.has_bought).length || 0} |
| HOT % | ${((enrichedLeads.filter(l => l.has_bought && l.tier_key === 'hot').length / enrichedLeads.filter(l => l.has_bought).length) * 100 || 0).toFixed(1)}% | ${((enrichedLeads.filter(l => !l.has_bought && l.tier_key === 'hot').length / enrichedLeads.filter(l => !l.has_bought).length) * 100 || 0).toFixed(1)}% |

---

## 📁 ARQUIVOS GERADOS

1. **all-leads-ranking.csv** - Ranking completo de todos os leads
2. **hot-leads.csv** - Top 100 leads mais quentes

---

*Relatório gerado automaticamente em 2026-04-02*
`;

fs.writeFileSync(`${OUTPUT_PATH}/ranking-leads.md`, report);
console.log(`✓ Saved ranking-leads.md`);

// ============================================
// SUMMARY OUTPUT
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📊 RELATÓRIO DE RANKING DE LEADS - RESUMO');
console.log('='.repeat(60));

console.log(`
📈 DISTRIBUIÇÃO POR TIER:
   🔥 HOT (18-22):     ${tierStats.hot.count.toString().padStart(5)} leads
   🌡️ WARM (14-17):    ${tierStats.warm.count.toString().padStart(5)} leads
   🌱 NURTURING (8-13): ${tierStats.nurturing.count.toString().padStart(5)} leads
   ❄️ COLD (0-7):       ${tierStats.cold.count.toString().padStart(5)} leads

🏆 TOP SDRs POR AVG SCORE:
${sdrLeaderboard.slice(0, 5).map(s => `   ${s.sdr_name}: ${s.avg_score.toFixed(2)} (${s.total_leads} leads)`).join('\n')}

🔥 TOP 5 LEADS MAIS QUENTES (NÃO COMPRARAM):
${notPurchased.slice(0, 5).map((l, i) => `   ${i+1}. ${l.nome} - Score: ${l.score_final.toFixed(2)}`).join('\n')}

📁 ARQUIVOS GERADOS:
   ✓ ${OUTPUT_PATH}/ranking-leads.md
   ✓ ${OUTPUT_PATH}/all-leads-ranking.csv
   ✓ ${OUTPUT_PATH}/hot-leads.csv
`);

console.log('✅ Ranking report generation complete!');
