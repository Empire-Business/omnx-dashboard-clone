const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);

// Load data
console.log('Loading data...');
const contatos = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'raw_contatos.json'), 'utf8'));
const oportunidades = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'raw_oportunidades.json'), 'utf8'));
const vendasFechamento = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'raw_vendas_fechamento.json'), 'utf8'));

console.log(`Contatos: ${contatos.length}`);
console.log(`Oportunidades: ${oportunidades.length}`);
console.log(`Vendas Fechamento: ${vendasFechamento.length}`);

// Build maps for analysis
const contatoById = new Map(contatos.map(c => [c.id, c]));
const vendasByContatoId = new Map();
vendasFechamento.forEach(v => {
  if (!vendasByContatoId.has(v.contato_id)) {
    vendasByContatoId.set(v.contato_id, []);
  }
  vendasByContatoId.get(v.contato_id).push(v);
});

const oppByContatoId = new Map();
oportunidades.forEach(o => {
  if (!oppByContatoId.has(o.contato_id)) {
    oppByContatoId.set(o.contato_id, []);
  }
  oppByContatoId.get(o.contato_id).push(o);
});

// Helper: Parse tags
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

// Helper: Extract email domain
function extractEmailDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// Helper: Check if domain is corporate
function isCorporateDomain(domain) {
  if (!domain) return false;
  const personalDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'yahoo.com.br', 'hotmail.com.br',
    'globo.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'msn.com'
  ];
  return !personalDomains.includes(domain);
}

// Helper: Classify domain
function classifyDomain(domain) {
  if (!domain) return 'unknown';
  const personalDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'yahoo.com.br', 'hotmail.com.br',
    'globo.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'msn.com'
  ];
  if (personalDomains.includes(domain)) return 'personal';
  return 'corporate';
}

// Helper: Extract domain category
function getDomainCategory(domain) {
  if (!domain) return 'unknown';
  const d = domain.toLowerCase();
  
  // Brazilian major portals
  if (['globo.com', 'bol.com.br', 'uol.com.br', 'terra.com.br'].includes(d)) return 'portal_brasileiro';
  
  // Personal email providers
  const personal = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com', 'protonmail.com', 'yahoo.com.br', 'hotmail.com.br', 'msn.com'];
  if (personal.includes(d)) return 'email_pessoal';
  
  // Corporate/Enterprise
  if (d.includes('.com.br') && !['globo.com', 'bol.com.br', 'uol.com.br', 'terra.com.br'].includes(d)) return 'corporativo_brasil';
  if (d.includes('.com') && !personal.includes(d)) return 'corporativo';
  if (d.includes('.org') || d.includes('.org.br')) return 'ong';
  if (d.includes('.edu') || d.includes('.edu.br')) return 'educacional';
  if (d.includes('.gov') || d.includes('.gov.br')) return 'governo';
  
  return 'outro';
}

// UTM friendly names mapping (based on common patterns from the data)
const utmSourceNames = {
  'facebook': 'Facebook Ads',
  'fb': 'Facebook Ads',
  'google': 'Google Ads',
  'gg': 'Google Ads',
  'instagram': 'Instagram',
  'ig': 'Instagram',
  'tiktok': 'TikTok Ads',
  'linkedin': 'LinkedIn Ads',
  'li': 'LinkedIn Ads',
  'organic': 'Orgânico',
  'direct': 'Direto',
  'referral': 'Indicação',
  'iorg-3': 'Orgânico Instagram',
  'org-3': 'Orgânico',
  'paid': 'Pago',
};

// Get UTM source friendly name
function getUtmSourceName(source) {
  if (!source) return 'Não identificado';
  const s = source.toLowerCase();
  return utmSourceNames[s] || source;
}

module.exports = { parseTags, extractEmailDomain, isCorporateDomain, classifyDomain, getDomainCategory, getUtmSourceName };

// ============================================================
// 1. EMAIL DOMAIN ANALYSIS
// ============================================================
console.log('\n=== EMAIL DOMAIN ANALYSIS ===');

const emailDomains = {};
const domainCategories = {};
const mqlDomains = {};
const closedDomains = {};
let mqlCount = 0;
let sqlCount = 0;
let closedCount = 0;

contatos.forEach(c => {
  const domain = extractEmailDomain(c.email);
  const tags = parseTags(c.tags);
  const isMql = tags.some(t => t.toLowerCase() === 'mql');
  const hasVenda = vendasByContatoId.has(c.id);
  
  // Count domain
  emailDomains[domain] = (emailDomains[domain] || 0) + 1;
  
  // Count by category
  const cat = getDomainCategory(domain);
  domainCategories[cat] = (domainCategories[cat] || 0) + 1;
  
  // Track MQL domains
  if (isMql) {
    mqlCount++;
    mqlDomains[domain] = (mqlDomains[domain] || 0) + 1;
  }
  
  // Track closed deals
  if (hasVenda) {
    closedCount++;
    closedDomains[domain] = (closedDomains[domain] || 0) + 1;
  }
});

console.log(`Total contacts: ${contatos.length}`);
console.log(`Total MQLs: ${mqlCount}`);
console.log(`Total Closed Deals: ${closedCount}`);

// Email category distribution
console.log('\nEmail Category Distribution:');
const sortedCategories = Object.entries(domainCategories).sort((a, b) => b[1] - a[1]);
sortedCategories.forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count} (${(count/contatos.length*100).toFixed(1)}%)`);
});

// Top domains
console.log('\nTop 20 Email Domains:');
const topDomains = Object.entries(emailDomains).sort((a, b) => b[1] - a[1]).slice(0, 20);
topDomains.forEach(([domain, count]) => {
  const cat = getDomainCategory(domain);
  const mqlPct = mqlDomains[domain] ? ((mqlDomains[domain]/count)*100).toFixed(1) : '0.0';
  const closedPct = closedDomains[domain] ? ((closedDomains[domain]/count)*100).toFixed(1) : '0.0';
  console.log(`  ${domain}: ${count} (MQL: ${mqlPct}%, Closed: ${closedPct}%) [${cat}]`);
});

// Corporate vs Personal conversion
let corporateContacts = 0, personalContacts = 0;
let corporateMqls = 0, personalMqls = 0;
let corporateClosed = 0, personalClosed = 0;

contatos.forEach(c => {
  const domain = extractEmailDomain(c.email);
  const isCorporate = isCorporateDomain(domain);
  const isMql = parseTags(c.tags).some(t => t.toLowerCase() === 'mql');
  const hasVenda = vendasByContatoId.has(c.id);
  
  if (isCorporate) {
    corporateContacts++;
    if (isMql) corporateMqls++;
    if (hasVenda) corporateClosed++;
  } else {
    personalContacts++;
    if (isMql) personalMqls++;
    if (hasVenda) personalClosed++;
  }
});

console.log('\nCorporate vs Personal Email Conversion:');
console.log(`Corporate: ${corporateContacts} contacts, ${corporateMqls} MQLs (${corporateContacts > 0 ? (corporateMqls/corporateContacts*100).toFixed(1) : 0}%), ${corporateClosed} closed (${corporateContacts > 0 ? (corporateClosed/corporateContacts*100).toFixed(1) : 0}%)`);
console.log(`Personal: ${personalContacts} contacts, ${personalMqls} MQLs (${personalContacts > 0 ? (personalMqls/personalContacts*100).toFixed(1) : 0}%), ${personalClosed} closed (${personalContacts > 0 ? (personalClosed/personalContacts*100).toFixed(1) : 0}%)`);

// ============================================================
// 2. GEOGRAPHIC DISTRIBUTION
// ============================================================
console.log('\n=== GEOGRAPHIC DISTRIBUTION ===');

const countries = {};
const brazilStates = {};
let brazilTotal = 0;

contatos.forEach(c => {
  const country = c.country || 'unknown';
  countries[country] = (countries[country] || 0) + 1;
  if (country === 'BR') brazilTotal++;
});

// Country distribution
console.log('\nCountry Distribution:');
const sortedCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]);
sortedCountries.slice(0, 10).forEach(([country, count]) => {
  console.log(`  ${country}: ${count} (${(count/contatos.length*100).toFixed(1)}%)`);
});

// Brazil states from vendas_fechamento
console.log('\nBrazilian States (from closed deals):');
vendasFechamento.forEach(v => {
  const uf = v.estado_uf;
  if (uf) {
    brazilStates[uf] = (brazilStates[uf] || 0) + 1;
  }
});
const sortedStates = Object.entries(brazilStates).sort((a, b) => b[1] - a[1]);
sortedStates.forEach(([uf, count]) => {
  console.log(`  ${uf}: ${count} (${(count/vendasFechamento.length*100).toFixed(1)}%)`);
});

// ============================================================
// 3. UTM SOURCE ANALYSIS
// ============================================================
console.log('\n=== UTM SOURCE ANALYSIS ===');

const utmSourceStats = {};
contatos.forEach(c => {
  const source = c.utm_source || 'null';
  if (!utmSourceStats[source]) {
    utmSourceStats[source] = { total: 0, mql: 0, closed: 0 };
  }
  utmSourceStats[source].total++;
  if (parseTags(c.tags).some(t => t.toLowerCase() === 'mql')) {
    utmSourceStats[source].mql++;
  }
  if (vendasByContatoId.has(c.id)) {
    utmSourceStats[source].closed++;
  }
});

console.log('\nUTM Source Performance:');
const sortedUtmSources = Object.entries(utmSourceStats).sort((a, b) => b[1].total - a[1].total);
sortedUtmSources.slice(0, 20).forEach(([source, stats]) => {
  const name = getUtmSourceName(source);
  const mqlRate = stats.total > 0 ? (stats.mql/stats.total*100).toFixed(1) : '0.0';
  const closeRate = stats.total > 0 ? (stats.closed/stats.total*100).toFixed(1) : '0.0';
  console.log(`  ${source} (${name}): Total=${stats.total}, MQL=${stats.mql} (${mqlRate}%), Closed=${stats.closed} (${closeRate}%)`);
});

// ============================================================
// 4. UTM CAMPAIGN ANALYSIS
// ============================================================
console.log('\n=== UTM CAMPAIGN ANALYSIS ===');

const utmCampaignStats = {};
contatos.forEach(c => {
  const campaign = c.utm_campaign || 'null';
  if (!utmCampaignStats[campaign]) {
    utmCampaignStats[campaign] = { total: 0, mql: 0, closed: 0 };
  }
  utmCampaignStats[campaign].total++;
  if (parseTags(c.tags).some(t => t.toLowerCase() === 'mql')) {
    utmCampaignStats[campaign].mql++;
  }
  if (vendasByContatoId.has(c.id)) {
    utmCampaignStats[campaign].closed++;
  }
});

console.log('\nUTM Campaign Performance (Top 20):');
const sortedCampaigns = Object.entries(utmCampaignStats).sort((a, b) => b[1].total - a[1].total);
sortedCampaigns.slice(0, 20).forEach(([campaign, stats]) => {
  const mqlRate = stats.total > 0 ? (stats.mql/stats.total*100).toFixed(1) : '0.0';
  const closeRate = stats.total > 0 ? (stats.closed/stats.total*100).toFixed(1) : '0.0';
  console.log(`  Campaign ${campaign}: Total=${stats.total}, MQL=${stats.mql} (${mqlRate}%), Closed=${stats.closed} (${closeRate}%)`);
});

// Top campaigns by conversion rate (min 30 leads)
console.log('\nTop Campaigns by Close Rate (min 30 leads):');
const qualifyingCampaigns = sortedCampaigns.filter(([, stats]) => stats.total >= 30);
qualifyingCampaigns.sort((a, b) => (b[1].closed/b[1].total*100) - (a[1].closed/a[1].total*100));
qualifyingCampaigns.slice(0, 10).forEach(([campaign, stats]) => {
  const closeRate = (stats.closed/stats.total*100).toFixed(1);
  console.log(`  Campaign ${campaign}: ${stats.total} leads, ${stats.closed} closed (${closeRate}%)`);
});

// ============================================================
// 5. SDR DISTRIBUTION
// ============================================================
console.log('\n=== SDR DISTRIBUTION ===');

const sdrStats = {};
contatos.forEach(c => {
  const sdr = c.owner_name || 'unassigned';
  if (!sdrStats[sdr]) {
    sdrStats[sdr] = { total: 0, mql: 0, closed: 0 };
  }
  sdrStats[sdr].total++;
  if (parseTags(c.tags).some(t => t.toLowerCase() === 'mql')) {
    sdrStats[sdr].mql++;
  }
  if (vendasByContatoId.has(c.id)) {
    sdrStats[sdr].closed++;
  }
});

console.log('\nSDR Performance:');
const sortedSdrs = Object.entries(sdrStats).sort((a, b) => b[1].total - a[1].total);
sortedSdrs.forEach(([sdr, stats]) => {
  const mqlRate = stats.total > 0 ? (stats.mql/stats.total*100).toFixed(1) : '0.0';
  const closeRate = stats.total > 0 ? (stats.closed/stats.total*100).toFixed(1) : '0.0';
  const mqlToCloseRate = stats.mql > 0 ? (stats.closed/stats.mql*100).toFixed(1) : '0.0';
  console.log(`  ${sdr}: Total=${stats.total}, MQL=${stats.mql} (${mqlRate}%), Closed=${stats.closed} (${closeRate}%), MQL-to-Close=${mqlToCloseRate}%`);
});

// Top SDRs by MQL-to-Close rate (min 10 MQLs)
console.log('\nTop SDRs by MQL-to-Close Rate (min 10 MQLs):');
const qualifyingSdrs = sortedSdrs.filter(([, stats]) => stats.mql >= 10);
qualifyingSdrs.sort((a, b) => (b[1].closed/b[1].mql*100) - (a[1].closed/a[1].mql*100));
qualifyingSdrs.slice(0, 10).forEach(([sdr, stats]) => {
  const mqlToCloseRate = (stats.closed/stats.mql*100).toFixed(1);
  console.log(`  ${sdr}: ${stats.mql} MQLs, ${stats.closed} closed (${mqlToCloseRate}%)`);
});

// ============================================================
// 6. TAG ANALYSIS
// ============================================================
console.log('\n=== TAG ANALYSIS ===');

const tagCounts = {};
const tagClosedRates = {};

contatos.forEach(c => {
  const tags = parseTags(c.tags);
  const hasVenda = vendasByContatoId.has(c.id);
  
  tags.forEach(tag => {
    const normalizedTag = tag.toLowerCase().trim();
    if (!tagCounts[normalizedTag]) {
      tagCounts[normalizedTag] = 0;
      tagClosedRates[normalizedTag] = { total: 0, closed: 0 };
    }
    tagCounts[normalizedTag]++;
    tagClosedRates[normalizedTag].total++;
    if (hasVenda) {
      tagClosedRates[normalizedTag].closed++;
    }
  });
});

console.log('\nTop 30 Tags by Frequency:');
const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
sortedTags.slice(0, 30).forEach(([tag, count]) => {
  const rate = tagClosedRates[tag];
  const closeRate = rate.total > 0 ? (rate.closed/rate.total*100).toFixed(1) : '0.0';
  console.log(`  "${tag}": ${count} (Close Rate: ${closeRate}%)`);
});

// Tags of interest
console.log('\nTags of Interest:');
['mql', 'sql', 'conectado', 'agendado', 'reagendar-sim', 'no-show', 'perdido', 'nmql', 'nsql'].forEach(tag => {
  const count = tagCounts[tag] || 0;
  const rate = tagClosedRates[tag];
  const closeRate = rate && rate.total > 0 ? (rate.closed/rate.total*100).toFixed(1) : '0.0';
  console.log(`  ${tag}: ${count} (Close Rate: ${closeRate}%)`);
});

// ============================================================
// 7. LEAD VOLUME OVER TIME
// ============================================================
console.log('\n=== LEAD VOLUME OVER TIME ===');

const monthlyLeads = {};
const monthlyMqls = {};
const monthlyClosed = {};

contatos.forEach(c => {
  if (!c.date_created) return;
  const date = new Date(c.date_created);
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  
  monthlyLeads[monthKey] = (monthlyLeads[monthKey] || 0) + 1;
  
  if (parseTags(c.tags).some(t => t.toLowerCase() === 'mql')) {
    monthlyMqls[monthKey] = (monthlyMqls[monthKey] || 0) + 1;
  }
  
  if (vendasByContatoId.has(c.id)) {
    monthlyClosed[monthKey] = (monthlyClosed[monthKey] || 0) + 1;
  }
});

console.log('\nMonthly Lead Volume:');
const sortedMonths = Object.keys(monthlyLeads).sort();
sortedMonths.forEach(month => {
  const leads = monthlyLeads[month] || 0;
  const mqls = monthlyMqls[month] || 0;
  const closed = monthlyClosed[month] || 0;
  const mqlRate = leads > 0 ? (mqls/leads*100).toFixed(1) : '0.0';
  const closeRate = leads > 0 ? (closed/leads*100).toFixed(1) : '0.0';
  console.log(`  ${month}: Leads=${leads}, MQLs=${mqls} (${mqlRate}%), Closed=${closed} (${closeRate}%)`);
});

// ============================================================
// SUMMARY STATS
// ============================================================
console.log('\n=== SUMMARY STATS ===');
console.log(`Total Contatos: ${contatos.length}`);
console.log(`Total MQLs: ${mqlCount}`);
console.log(`Total Closed Deals: ${closedCount}`);
console.log(`Overall MQL Rate: ${(mqlCount/contatos.length*100).toFixed(1)}%`);
console.log(`Overall Close Rate: ${(closedCount/contatos.length*100).toFixed(1)}%`);
console.log(`MQL-to-Close Rate: ${mqlCount > 0 ? (closedCount/mqlCount*100).toFixed(1) : 0}%`);

// Export data for report generation
const reportData = {
  emailDomains,
  domainCategories,
  mqlDomains,
  closedDomains,
  mqlCount,
  sqlCount,
  closedCount,
  corporateContacts,
  personalContacts,
  corporateMqls,
  personalMqls,
  corporateClosed,
  personalClosed,
  countries,
  brazilStates,
  utmSourceStats,
  utmCampaignStats,
  sdrStats,
  tagCounts,
  tagClosedRates,
  monthlyLeads,
  monthlyMqls,
  monthlyClosed,
  totalContatos: contatos.length,
};

fs.writeFileSync(
  path.join(DATA_DIR, 'analysis_results.json'),
  JSON.stringify(reportData, null, 2)
);
console.log('\nAnalysis results saved to analysis_results.json');
