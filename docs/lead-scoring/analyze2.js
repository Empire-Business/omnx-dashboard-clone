const fs = require('fs');
const oportunidades = JSON.parse(fs.readFileSync('raw_oportunidades.json', 'utf8'));
const contatos = JSON.parse(fs.readFileSync('raw_contatos.json', 'utf8'));
const comunicacoes = JSON.parse(fs.readFileSync('raw_comunicacoes.json', 'utf8'));

console.log('Total oportunidades:', oportunidades.length);

// Count resumo_ia populated
const withResumoIA = oportunidades.filter(o => o.resumo_ia && o.resumo_ia.trim().length > 0);
console.log('With resumo_ia populated:', withResumoIA.length);

// Build contato_id to MQL map
const contatoMqlMap = new Set();
contatos.forEach(c => {
  if (c.tags && c.tags.toLowerCase().includes('mql')) {
    contatoMqlMap.add(c.id);
  }
});

console.log('MQL contacts count:', contatoMqlMap.size);

// Count by pipeline
const pipelineCounts = {};
oportunidades.forEach(o => {
  const name = o.pipeline_name || 'NULL';
  pipelineCounts[name] = (pipelineCounts[name] || 0) + 1;
});
console.log('\nPipeline distribution:', JSON.stringify(pipelineCounts, null, 2));

// Check closed won
const closedWon = oportunidades.filter(o => o.pipeline_stage_id === 'won' || o.status === 'won');
console.log('\nClosed Won count:', closedWon.length);

// Sample resumo_ia
console.log('\n--- Sample resumo_ia ---');
withResumoIA.slice(0, 10).forEach((o, i) => {
  console.log('\n[' + (i+1) + '] ' + o.nome_contato + ' | Pipeline: ' + o.pipeline_name);
  console.log('Resumo IA:', o.resumo_ia.substring(0, 800));
  console.log('---');
});