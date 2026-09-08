const fs = require('fs');

const comunicacoes = JSON.parse(fs.readFileSync('raw_comunicacoes.json', 'utf8'));
const oportunidades = JSON.parse(fs.readFileSync('raw_oportunidades.json', 'utf8'));
const contatos = JSON.parse(fs.readFileSync('raw_contatos.json', 'utf8'));

// Analyze message direction
console.log('=== MESSAGE DIRECTION ANALYSIS ===');
const directions = { inbound: 0, outbound: 0, unknown: 0 };
comunicacoes.forEach(c => {
  if (c.direction === 'inbound') directions.inbound++;
  else if (c.direction === 'outbound') directions.outbound++;
  else directions.unknown++;
});
console.log('Inbound:', directions.inbound);
console.log('Outbound:', directions.outbound);
console.log('Unknown:', directions.unknown);

// Analyze by channel
console.log('\n=== CHANNEL ANALYSIS ===');
const channels = {};
comunicacoes.forEach(c => {
  channels[c.channel] = (channels[c.channel] || 0) + 1;
});
console.log(JSON.stringify(channels, null, 2));

// Analyze phone calls
console.log('\n=== PHONE CALL ANALYSIS ===');
const calls = comunicacoes.filter(c => c.tipo === 'ligacao');
console.log('Total calls:', calls.length);
const answeredCalls = calls.filter(c => c.phone_call_status === 'answered');
console.log('Answered calls:', answeredCalls.length);

// Analyze message bodies more deeply
console.log('\n=== DEEP MESSAGE ANALYSIS ===');

// Extract all unique contact names who sent inbound messages
const inboundContacts = new Set();
comunicacoes.filter(c => c.direction === 'inbound' && c.mensagem_body).forEach(c => {
  inboundContacts.add(c.contato_id);
});
console.log('Unique contacts with inbound messages:', inboundContacts.size);

// Sample inbound messages
console.log('\n=== SAMPLE INBOUND MESSAGES ===');
const inboundMsgs = comunicacoes.filter(c => c.direction === 'inbound' && c.mensagem_body && c.mensagem_body.length > 20);
console.log('Total inbound with body:', inboundMsgs.length);
inboundMsgs.slice(0, 20).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ' (' + m.channel + '):');
  console.log(m.mensagem_body.substring(0, 400));
});

// Analyze SDR distribution
console.log('\n=== SDR DISTRIBUTION ===');
const sdrCounts = {};
comunicacoes.forEach(c => {
  if (c.sdr_name) {
    sdrCounts[c.sdr_name] = (sdrCounts[c.sdr_name] || 0) + 1;
  }
});
console.log(JSON.stringify(sdrCounts, null, 2));

// Analyze ghl_source distribution
console.log('\n=== GHL SOURCE DISTRIBUTION ===');
const sourceCounts = {};
comunicacoes.forEach(c => {
  if (c.ghl_source) {
    sourceCounts[c.ghl_source] = (sourceCounts[c.ghl_source] || 0) + 1;
  }
});
console.log(JSON.stringify(sourceCounts, null, 2));

// Find messages with pricing questions
console.log('\n=== PRICE-RELATED MESSAGES ===');
const priceRelated = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return /quanto\s*custa|valor\s*do|preço|parcela|r\$\s*\d|\d+\s*mil|investimento|mensalidade/i.test(text);
});
console.log('Messages mentioning price:', priceRelated.length);
priceRelated.slice(0, 5).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ':');
  console.log(m.mensagem_body.substring(0, 300));
});

// Find messages asking to schedule
console.log('\n=== SCHEDULE-RELATED MESSAGES ===');
const scheduleRelated = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return /reunião|agendar|horário|disponibilidade|conversa|call|zoom|google\s*meet|teams/i.test(text);
});
console.log('Messages mentioning scheduling:', scheduleRelated.length);

// Find objection messages
console.log('\n=== OBJECTION MESSAGES ===');
const objectionKeywords = [
  'preciso pensar', 'depois', 'vou ver', 'não agora', 'muito caro',
  'não tenho', 'já tenho', 'outro', 'comparar', 'não confio'
];

objectionKeywords.forEach(kw => {
  const count = comunicacoes.filter(c => {
    if (!c.mensagem_body) return false;
    return c.mensagem_body.toLowerCase().includes(kw.toLowerCase());
  }).length;
  console.log(`"${kw}": ${count} messages`);
});

// Find buying intent messages
console.log('\n=== BUYING INTENT MESSAGES ===');
const intentKeywords = [
  'tenho interesse', 'quero começar', 'quando começa', 'como faz pra pagar',
  'pode mandar', 'vamos marcar', 'conta pra mim', 'prefiro falar'
];

intentKeywords.forEach(kw => {
  const count = comunicacoes.filter(c => {
    if (!c.mensagem_body) return false;
    return c.mensagem_body.toLowerCase().includes(kw.toLowerCase());
  }).length;
  console.log(`"${kw}": ${count} messages`);
});

// Look at closed won Oportunidades
console.log('\n=== CLOSED WON ANALYSIS ===');
const closedWon = oportunidades.filter(o => o.pipeline_stage_id === 'won' || o.status === 'won');
console.log('Total closed won:', closedWon.length);

// Find comunicacoes for closed won contacts
const closedWonIds = new Set(closedWon.map(o => o.contato_id));
const closedWonComms = comunicacoes.filter(c => closedWonIds.has(c.contato_id));
console.log('Total comunicacoes for closed won contacts:', closedWonComms.length);

const closedWonInbound = closedWonComms.filter(c => c.direction === 'inbound' && c.mensagem_body);
console.log('Inbound messages from closed won:', closedWonInbound.length);

// Sample from closed won
console.log('\nSample closed won inbound messages:');
closedWonInbound.slice(0, 10).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ':');
  console.log(m.mensagem_body.substring(0, 300));
});

// Messages that mention starting/beginning
console.log('\n=== START/BEGINNING MENTIONS ===');
const startMentions = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return /começar|começa|iniciar|início|primeiro\s*passo| vamos\s*começar|bora\s*começar/i.test(text);
});
console.log('Messages mentioning starting:', startMentions.length);

// Messages mentioning timeline/urgency
console.log('\n=== TIMELINE/URGENCY MENTIONS ===');
const urgencyMentions = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return /urgente|esse\s*mês|esse\s*ano|imediato|rapidamente|o\s*mais\s*rápido|breve|急切/i.test(text);
});
console.log('Messages mentioning urgency:', urgencyMentions.length);