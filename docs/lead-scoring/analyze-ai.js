const fs = require('fs');

console.log('Loading files...');
const comunicacoes = JSON.parse(fs.readFileSync('/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/lead-scoring/raw_comunicacoes.json', 'utf8'));
const oportunidades = JSON.parse(fs.readFileSync('/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/lead-scoring/raw_oportunidades.json', 'utf8'));
const contatos = JSON.parse(fs.readFileSync('/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/lead-scoring/raw_contatos.json', 'utf8'));

console.log('Total comunicacoes:', comunicacoes.length);
console.log('Total oportunidades:', oportunidades.length);
console.log('Total contatos:', contatos.length);

// Count AI conversations
const aiConversations = comunicacoes.filter(c => c.tipo === 'ai_conversation');
console.log('AI conversations (tipo=ai_conversation):', aiConversations.length);

// Count ai_summary populated
const withAiSummary = comunicacoes.filter(c => c.ai_summary && c.ai_summary.trim().length > 0);
console.log('With ai_summary populated:', withAiSummary.length);

// Count ai_transcript populated
const withAiTranscript = comunicacoes.filter(c => c.ai_transcript && c.ai_transcript.trim().length > 0);
console.log('With ai_transcript populated:', withAiTranscript.length);

// Mostrar alguns exemplos de ai_summary
console.log('\n--- Sample AI Summaries ---');
withAiSummary.slice(0, 10).forEach((c, i) => {
  console.log(`\n[${i+1}] Contato: ${c.contato_nome || 'N/A'}`);
  console.log('Summary:', c.ai_summary.substring(0, 800));
  console.log('---');
});

// Build contato_id to MQL map
const contatoMqlMap = new Map();
contatos.forEach(c => {
  if (c.tags && c.tags.toLowerCase().includes('mql')) {
    contatoMqlMap.set(c.id, true);
  }
});

// Build oportunidade to pipeline map
const oppPipelineMap = new Map();
oportunidades.forEach(o => {
  oppPipelineMap.set(o.contato_id, o.pipeline_name);
});

console.log('\n\n=== MQL Analysis ===');
const mqlComms = withAiSummary.filter(c => contatoMqlMap.has(c.contato_id));
console.log('AI summaries from MQL contacts:', mqlComms.length);

console.log('\n\n=== Closed Won Analysis ===');
const closedWonOppIds = new Set(oportunidades
  .filter(o => o.pipeline_stage_id === 'won' || o.status === 'won')
  .map(o => o.contato_id));
const closedWonComms = withAiSummary.filter(c => closedWonOppIds.has(c.contato_id));
console.log('AI summaries from Closed Won contacts:', closedWonComms.length);
console.log('Sample closed won summaries:');
closedWonComms.slice(0, 5).forEach((c, i) => {
  console.log(`\n[${i+1}] ${c.contato_nome}: ${c.ai_summary.substring(0, 400)}`);
});