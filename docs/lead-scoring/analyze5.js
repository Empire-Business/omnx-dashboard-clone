const fs = require('fs');

const comunicacoes = JSON.parse(fs.readFileSync('raw_comunicacoes.json', 'utf8'));
const oportunidades = JSON.parse(fs.readFileSync('raw_oportunidades.json', 'utf8'));
const contatos = JSON.parse(fs.readFileSync('raw_contatos.json', 'utf8'));

// Full pipeline breakdown
console.log('=== FULL PIPELINE BREAKDOWN ===');
const pipelineStats = {};
oportunidades.forEach(o => {
  const name = o.pipeline_name || 'Unknown';
  if (!pipelineStats[name]) {
    pipelineStats[name] = { total: 0, withResumoIA: 0, won: 0, lost: 0 };
  }
  pipelineStats[name].total++;
  if (o.resumo_ia && o.resumo_ia.trim().length > 0) pipelineStats[name].withResumoIA++;
  if (o.pipeline_stage_id === 'won' || o.status === 'won') pipelineStats[name].won++;
  if (o.pipeline_stage_id === 'lost' || o.status === 'lost') pipelineStats[name].lost++;
});

Object.entries(pipelineStats).sort((a, b) => b[1].total - a[1].total).forEach(([name, stats]) => {
  console.log(`${name}: Total=${stats.total}, Won=${stats.won}, Lost=${stats.lost}, WithResumoIA=${stats.withResumoIA}`);
});

// Analyze what 'depois' messages mean - context analysis
console.log('\n=== ANALYZING "DEPOIS" CONTEXT ===');
const depoisMsgs = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  return c.mensagem_body.toLowerCase().includes('depois');
});
console.log('Messages with "depois":', depoisMsgs.length);

// Sample some
depoisMsgs.slice(0, 10).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ' (' + m.channel + '):');
  console.log(m.mensagem_body.substring(0, 300));
});

// Analyze calls more deeply
console.log('\n=== CALL ANALYSIS ===');
const calls = comunicacoes.filter(c => c.tipo === 'ligacao');
console.log('Total calls:', calls.length);

// Find call-related keywords in mensagem_body
const callKeywords = ['ligação', 'telefonema', 'chamada', 'call', 'audio', 'whatsapp', 'zoom'];
callKeywords.forEach(kw => {
  const count = comunicacoes.filter(c => {
    if (!c.mensagem_body) return false;
    return c.mensagem_body.toLowerCase().includes(kw.toLowerCase());
  }).length;
  console.log(`"${kw}": ${count}`);
});

// Analyze outbound vs inbound effectiveness
console.log('\n=== INBOUND MESSAGE ANALYSIS ===');
const inbound = comunicacoes.filter(c => c.direction === 'inbound' && c.mensagem_body);
console.log('Total inbound with body:', inbound.length);

// Find positive responses
const positiveResponses = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return /sim|claro|concordo|perfeito|beleza|entendi|então\s*bora|com\s*certeza|yes|yep|confirma|ok\b/i.test(text);
});
console.log('Positive response messages:', positiveResponses.length);

// Analyze follow-up patterns
console.log('\n=== FOLLOW-UP PATTERNS ===');
const followupKeywords = ['retorno', 'seguir', 'próximo passo', 'andamento', 'feedback', 'retornar'];
followupKeywords.forEach(kw => {
  const count = comunicacoes.filter(c => {
    if (!c.mensagem_body) return false;
    return c.mensagem_body.toLowerCase().includes(kw.toLowerCase());
  }).length;
  console.log(`"${kw}": ${count}`);
});

// Look at mensagens from leads who became customers
console.log('\n=== WHAT CLOSED WON LEADS SAID ===');
const closedWon = oportunidades.filter(o => o.pipeline_stage_id === 'won' || o.status === 'won');
const closedWonIds = new Set(closedWon.map(o => o.contato_id));
const closedWonInbound = comunicacoes.filter(c => closedWonIds.has(c.contato_id) && c.direction === 'inbound' && c.mensagem_body);
console.log('Closed won inbound messages:', closedWonInbound.length);

// Extract keywords from closed won messages
const closedWonKeywords = {
  'payment/price': /pagamento|preço|parcela|valor|r\$\s*\d|transferência|boleto|cartão/i,
  'contract': /contrato|assinatura|assin|documento|contrato/i,
  'start beginning': /começar|iniciar|começa|início|primeiro|vamos\s*começar|bora/i,
  'schedule': /reunião|agendar|horário|agenda|disponibilidade/i,
  'confirm': /confirm|perfeito|sim|ok|entendi|claro|beleza/i,
  'urgency': /urgente|imediato|já|rapidamente|o\s*mais\s*rápido/i,
};

Object.keys(closedWonKeywords).forEach(kw => {
  const count = closedWonInbound.filter(c => closedWonKeywords[kw].test(c.mensagem_body.toLowerCase())).length;
  console.log(`Closed Won - "${kw}": ${count} (${((count/closedWonInbound.length)*100).toFixed(1)}%)`);
});

// Sample more closed won messages
console.log('\n=== MORE CLOSED WON INBOUND SAMPLES ===');
closedWonInbound.slice(10, 25).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ':');
  console.log(m.mensagem_body.substring(0, 300));
});

// Analyze "outro" context - are they comparing?
console.log('\n=== ANALYZING "OUTRO" CONTEXT ===');
const outroMsgs = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  return c.mensagem_body.toLowerCase().includes('outro');
});
console.log('Messages with "outro":', outroMsgs.length);
outroMsgs.slice(0, 10).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ':');
  console.log(m.mensagem_body.substring(0, 300));
});

// Date range of comunicacoes
console.log('\n=== COMMUNICATION DATE RANGE ===');
const dates = comunicacoes.map(c => c.data_comunicacao).filter(d => d).sort();
console.log('Earliest:', dates[0]);
console.log('Latest:', dates[dates.length - 1]);

// Messages by month
const monthCounts = {};
comunicacoes.forEach(c => {
  if (c.data_comunicacao) {
    const month = c.data_comunicacao.substring(0, 7);
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  }
});
console.log('\nMessages by month:');
Object.entries(monthCounts).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}`));