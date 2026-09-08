const fs = require('fs');

const oportunidades = JSON.parse(fs.readFileSync('raw_oportunidades.json', 'utf8'));
const contatos = JSON.parse(fs.readFileSync('raw_contatos.json', 'utf8'));
const comunicacoes = JSON.parse(fs.readFileSync('raw_comunicacoes.json', 'utf8'));

const withResumoIA = oportunidades.filter(o => o.resumo_ia && o.resumo_ia.trim().length > 0);
console.log('Analyzing', withResumoIA.length, 'resumo_ia records...\n');

// Build maps
const contatoMqlMap = new Set();
contatos.forEach(c => {
  if (c.tags && c.tags.toLowerCase().includes('mql')) {
    contatoMqlMap.add(c.id);
  }
});

// Topic/keyword extraction
const topicKeywords = {
  'tráfego pago': /tráfego\s*paid|pago|mídia\s*paid|ads|facebook\s*ads|google\s*ads|meta\s*ads|instagram\s*ads|campanha\s*paid/i,
  'produto/curso': /produto|curso|formação|mentoria|formação|serviço|consultoria|programa/i,
  'preço/valor': /preço|valor|quanto\s*custa|custar|parcel|investimento|r\$\s*\d+|mil\s*reis/i,
  'urgência': /urgente|já|esse\s*mês|preciso\s*agora|imediato|rapidamente|急切/i,
  'decision_maker': /marido|esposa|sócio|director|chefia|parceiro|diretor|gestor/i,
  'objeção_preço': /cara\s*demais|caro|valor\s*alto|preço\s*alto|invahível|não\s*tem\s*grana|money|dinheiro\s*curto/i,
  'objeção_tempo': /preciso\s*pensar|depois|mais\s*tar|deixa\s*pra\s*depois|vou\s*verificar|futuro|próprio\s*tempo/i,
  'objeção_concorrência': /já\s*tem|já\s*uso|tenho\s*outro|concorrente|alternativa|comparar/i,
  'objeção_informação': /mais\s*info|queria\s*saber|mais\s*detalhes|entender|como\s*funciona|explain|documentação/i,
  'objeção_authority': /preciso\s*conversar|tenho\s*que\s*perguntar|minha\s*chefia|vou\s*levantar|casar|marido\s*falar/i,
  'interest_signal': /quando\s*começa|como\s*faz\s*pra\s*pagar|pode\s*mandar|vamos\s*marcar|tenho\s*interesse|quero\s*começar|conta|pra\s*mim|anoi|sign up/i,
  'need_resolution': /preciso\s*resolv|urgente|já\s*precis|resolver\s*log|o\s*mais\s*rápido|breve/i,
  'dor_falta_tempo': /falta\s*tempo|não\s*tenho\s*tempo|agenda|ocupado|atrasad|completo/i,
  'dor_falta_leads': /falta\s*lead|lead\s*qualificado|sem\s*lead|precis[ao]\s*lead|conversão|client[es]\s*novo/i,
  'dor_faturamento': /faturamento|crescer|vendas|aumentar|receita|meta|batel|escal[áa]r/i,
  'dor_presença_digital': /presença\s*digital|rede\s*social|instagram|facebook|portfólio|marca|notoriedade|brand/i,
  'current_solution': /já\s*tento|tentei\s*vári|várias\s*vez|não\s*funcion|não\s*result| frustra/i,
  '期待_change': /mudar|transform|evolu|melhorar|potencial|up|growth/i,
};

// Count topics across all summaries
const topicCounts = {};
Object.keys(topicKeywords).forEach(k => topicCounts[k] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  Object.keys(topicKeywords).forEach(k => {
    if (topicKeywords[k].test(text)) {
      topicCounts[k]++;
    }
  });
});

console.log('=== TOPIC/KEYWORD FREQUENCY ===');
const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
sortedTopics.forEach(([topic, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`${topic}: ${count} (${pct}%)`);
});

// Compare MQL vs Closed Won
console.log('\n\n=== MQL vs CLOSED WON TOPICS ===');

const mqlOpps = withResumoIA.filter(o => contatoMqlMap.has(o.contato_id));
const closedWonOpps = withResumoIA.filter(o => o.pipeline_stage_id === 'won' || o.status === 'won');

console.log('MQL opps with resumo_ia:', mqlOpps.length);
console.log('Closed Won opps with resumo_ia:', closedWonOpps.length);

function countTopicsForGroup(opps) {
  const counts = {};
  Object.keys(topicKeywords).forEach(k => counts[k] = 0);
  opps.forEach(o => {
    const text = o.resumo_ia.toLowerCase();
    Object.keys(topicKeywords).forEach(k => {
      if (topicKeywords[k].test(text)) {
        counts[k]++;
      }
    });
  });
  return counts;
}

const mqlTopics = countTopicsForGroup(mqlOpps);
const wonTopics = countTopicsForGroup(closedWonOpps);

console.log('\nTopic comparison (MQL vs Closed Won):');
console.log('Topic'.padEnd(25), 'MQL'.padStart(8), 'Won'.padStart(8), 'Diff'.padStart(8));
console.log('-'.repeat(52));
sortedTopics.forEach(([topic]) => {
  const m = mqlTopics[topic];
  const w = wonTopics[topic];
  const mp = mqlOpps.length > 0 ? ((m / mqlOpps.length) * 100).toFixed(0) : '0';
  const wp = closedWonOpps.length > 0 ? ((w / closedWonOpps.length) * 100).toFixed(0) : '0';
  console.log(topic.padEnd(25), mp.padStart(8), wp.padStart(8), (parseInt(wp) - parseInt(mp)).toString().padStart(8));
});

// Extract sample summaries by topic
console.log('\n\n=== SAMPLE SUMMARIES BY PIPELINE ===');
const pipelines = ['Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Vendas SQL', 'Cami', '[fn] webinário'];
pipelines.forEach(pipeline => {
  const opps = withResumoIA.filter(o => o.pipeline_name === pipeline);
  if (opps.length > 0) {
    console.log('\n--- ' + pipeline + ' (' + opps.length + ' records) ---');
    opps.slice(0, 2).forEach(o => {
      console.log('[' + o.nome_contato + ']');
      console.log(o.resumo_ia.substring(0, 400) + '...\n');
    });
  }
});

// Extract specific pain points and objections from text
console.log('\n\n=== EXTRACTED OBJECTIONS FROM TEXT ===');
const objectionPatterns = [
  { name: 'Price - too expensive', pattern: /cara?\s*demais|caro\s*demais|preço\s*elevado|muito\s*caro|inviah|imposs[ií]vel\s*pagar/i },
  { name: 'Price - need discount', pattern: /desconto|promoção|barato|menor\s*preço|优惠/i },
  { name: 'Timing - need to think', pattern: /preciso\s*pensar|deixa\s*pra\s*depois|vou\s*ver|mais\s*tar|d[ée]pois\s*que|i\s*will\s*think/i },
  { name: 'Timing - not now', pattern: /não\s*agora|não\s*é\s*agora|momento\s*certo|posteriori|depois\s*de\s*algo/i },
  { name: 'Authority - need approval', pattern: /preciso\s*conversar\s*com|tenho\s*que\s*perguntar|marido\s*decid|esposa\s*ver|membro\s*fam[ií]lia/i },
  { name: 'Authority - boss/partner', pattern: /sócio\s*ver|sócio\s*decid|diretor|chefia|gestor\s*superior/i },
  { name: 'Competition - already has solution', pattern: /já\s*tem|já\s*contratou|já\s*faz|outro\s*forneced|alternativa/i },
  { name: 'Competition - comparing', pattern: /comparar|ver\s*outras|analisar\s*outras|concorrente|preço\s*local/i },
  { name: 'Info - need more details', pattern: /mais\s*detalhes|queria\s*saber|entender\s*melhor|documentação|como\s*funciona/i },
  { name: 'Info - send info', pattern: /manda\s*pra\s*mim|envia\s*informação|pode\s*mandar|envia\s*pro\s*meu\s*email/i },
  { name: 'Budget - no money', pattern: /não\s*tem\s*grana|sem\s*orcamento|orçamento\s*limit| dinheiro|finança|d[ií]ficil\s*finance|i[\s]*can[\s]*t\s*afford/i },
  { name: 'Trust - not sure', pattern: /não\s*confio|tenho\s*dúvida|dúvida\s*se|será\s*que|uncertain/i },
];

const objectionCounts = {};
objectionPatterns.forEach(p => objectionCounts[p.name] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  objectionPatterns.forEach(p => {
    if (p.pattern.test(text)) {
      objectionCounts[p.name]++;
    }
  });
});

console.log('Objection frequency:');
Object.entries(objectionCounts).sort((a, b) => b[1] - a[1]).forEach(([obj, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${obj}: ${count} (${pct}%)`);
});

// Extract buying signals
console.log('\n\n=== BUYING SIGNALS ===');
const buyingSignalPatterns = [
  { name: 'wants to start', pattern: /quando\s*começa|quero\s*começar|já\s*quero|começar\s*logo|how\s*to\s*start|começar\s*o\s*quanto|anoi\s*to\s*start/i },
  { name: 'asking how to pay', pattern: /como\s*faz\s*pra\s*pagar|formas\s*de\s*pagmento|parcel|condições\s*de\s*pagto|pagament|cartão|boleto/i },
  { name: 'ask for info', pattern: /pode\s*mandar|envia\s*pro\s*meu|manda\s*informação|queria\s*receber|me\s*envia/i },
  { name: 'schedule meeting', pattern: /vamos\s*marcar|agendar|reuni|horário|disponibilidade|best\s*time|schedule/i },
  { name: 'expresses urgency', pattern: /preciso\s*resolv|urgente|já\s*precis|log|rapida|breve|o\s*mais\s*rápido/i },
  { name: 'has budget ready', pattern: /tenho\s*orcamento|orcamento\s*pront|já\s*tenho\s*grana|tenho\s*disponível/i },
  { name: 'referral intent', pattern: /indica|recomend|conhece\s*algu[ée]|pode\s*indic|refer/i },
  { name: 'commitment signal', pattern: /vamos\s*que|confirma|bora\s*começar|de\s*acordo|concordo|é\s*sim|yes|i[\s]*want|i[\s]*will/i },
];

const buyingSignalCounts = {};
buyingSignalPatterns.forEach(p => buyingSignalCounts[p.name] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  buyingSignalPatterns.forEach(p => {
    if (p.pattern.test(text)) {
      buyingSignalCounts[p.name]++;
    }
  });
});

console.log('Buying signal frequency:');
Object.entries(buyingSignalCounts).sort((a, b) => b[1] - a[1]).forEach(([sig, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${sig}: ${count} (${pct}%)`);
});

// Extract pain points
console.log('\n\n=== PAIN POINTS ===');
const painPointPatterns = [
  { name: 'low traffic/audience', pattern: /falta\s*tráfego|baixa\s*audiência|pouca\s*visibilidade|alcance\s*limit|não\s*tem\s*tráfego/i },
  { name: 'no leads', pattern: /sem\s*lead|falta\s*lead|lead\s*qualificado|precis[ao]\s*lead|client[es]\s*novo/i },
  { name: 'low sales/revenue', pattern: /vendas\s*baixa|vendas\s*caí|venda\s*parou|receita\s*baixa|faturamento\s*baixo/i },
  { name: 'poor digital presence', pattern: /presença\s*digital|rede\s*social|instagram|marca\s*fraca|posicionamento\s*ruim/i },
  { name: 'no time', pattern: /falta\s*tempo|não\s*tenho\s*tempo|agenda|ocupado|atrasad/i },
  { name: 'high costs', pattern: /custo\s*elevado|gasto\s*muito|custo\s*alto|despesa/i },
  { name: 'competition pressure', pattern: /concorrência|concorrente|mercado\s*difícil|preço\s*baixo\s*concorrente/i },
  { name: 'ineffective marketing', pattern: /marketing\s*não\s*funcion|não\s*result|estratégia\s*errada|campanha\s*ruim/i },
  { name: 'scale/growth issues', pattern: /escalar|crescer\s*rápido|escalabilidade|meta\s*batel|crescimento/i },
  { name: 'low conversion', pattern: /conversão\s*baixa|taxa\s*conversão|lead\s*não\s*converte|funil\s*vaz|garrafão/i },
];

const painPointCounts = {};
painPointPatterns.forEach(p => painPointCounts[p.name] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  painPointPatterns.forEach(p => {
    if (p.pattern.test(text)) {
      painPointCounts[p.name]++;
    }
  });
});

console.log('Pain point frequency:');
Object.entries(painPointCounts).sort((a, b) => b[1] - a[1]).forEach(([pain, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${pain}: ${count} (${pct}%)`);
});

// Analyze mensagem_body patterns
console.log('\n\n=== COMMUNICATION MESSAGE PATTERNS ===');
const messageKeywords = {
  'interest_buy': /tenho\s*interesse|quero\s*saber|queria\s*receber|informações|start|começar|join/i,
  'price_query': /quanto\s*custa|preço|valor|parcela|mensalidade|investimento|r\$/i,
  'schedule': /reunião|agendar|horário|disponibilidade|agenda|marcar|conversa\s*call/i,
  'doubt_question': /dúvida|pergunta|tem\s*como\s*explic|como\s*funciona|entender/i,
  'urgency': /urgente|preciso\s*já|o\s*mais\s*rápido|急切|emergency/i,
};

const messageKeywordCounts = {};
Object.keys(messageKeywords).forEach(k => messageKeywordCounts[k] = 0);

comunicacoes.forEach(c => {
  if (c.mensagem_body) {
    const text = c.mensagem_body.toLowerCase();
    Object.keys(messageKeywords).forEach(k => {
      if (messageKeywords[k].test(text)) {
        messageKeywordCounts[k]++;
      }
    });
  }
});

console.log('Keyword frequency in mensagens:');
Object.entries(messageKeywordCounts).sort((a, b) => b[1] - a[1]).forEach(([kw, count]) => {
  const pct = ((count / comunicacoes.length) * 100).toFixed(1);
  console.log(`  ${kw}: ${count} (${pct}%)`);
});

// Sample some messages with high intent signals
console.log('\n\n=== SAMPLE HIGH-INTENT MESSAGES ===');
const highIntentMsgs = comunicacoes.filter(c => {
  if (!c.mensagem_body) return false;
  const text = c.mensagem_body.toLowerCase();
  return messageKeywords.interest_buy.test(text) || messageKeywords.price_query.test(text);
});
console.log('High intent messages:', highIntentMsgs.length);
highIntentMsgs.slice(0, 5).forEach((m, i) => {
  console.log('\n[' + (i+1) + '] ' + m.contato_nome + ':');
  console.log(m.mensagem_body.substring(0, 300));
});

// Extract business types from summaries
console.log('\n\n=== BUSINESS TYPES MENTIONED ===');
const businessTypes = {
  'serviços': /serviço|consultor|agência\s*de/i,
  'ecommerce': /e-commerce|loja\s*virtual|shopify|ecommerce|marketplace/i,
  'infoproduto': /curso|mentoria|coach|treinamento|online|inforproduto/i,
  'saúde': /médic|clínic|hospit|saúde|farmácia/i,
  'beleza': /beleza|estética|cabelo|skin|cosmétic/i,
  'food': /restaurante|alimentação|food|bistro|bar|café/i,
  'construção': /construção|civil|arquitetura|obras|engenhari/i,
  'marketing': /marketing|tráfego|édia|digital|agência/i,
  'tecnologia': /tech|software|app|sistema|programação/i,
  'educação': /escola|curso|educação|treinamento|instrut/i,
  'imobiliária': /imobiliária|imóvel|apartamento|casa|real\s*estate/i,
};

const businessTypeCounts = {};
Object.keys(businessTypes).forEach(k => businessTypeCounts[k] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  Object.keys(businessTypes).forEach(k => {
    if (businessTypes[k].test(text)) {
      businessTypeCounts[k]++;
    }
  });
});

console.log('Business type mentions:');
Object.entries(businessTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([bt, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${bt}: ${count} (${pct}%)`);
});

// Investment level analysis
console.log('\n\n=== INVESTMENT LEVEL MENTIONS ===');
const investmentLevels = {
  'no investment': /não\s*investe|não\s*tem\s*investimento|sem\s*investimento|invesimento\s*zero|0\s*reais/i,
  'low (<3k)': /até\s*r\$\s*3\s*mil|menos\s*de\s*3\s*mil|baixo\s*investimento|inferior\s*a\s*3/i,
  'medium (3-10k)': /r\$\s*3\s*a\s*5\s*mil|5\s*a\s*10\s*mil|3\s*a\s*10\s*mil|médio\s*investimento/i,
  'high (>10k)': /acima\s*de\s*r\$\s*10\s*mil|mais\s*de\s*10\s*mil|alto\s*investimento|10\s*a\s*\d+\s*mil/i,
  'undefined': /investimento\s*não\s*inform|não\s*foi\s*inform| dados\s*ausente/i,
};

const investmentCounts = {};
Object.keys(investmentLevels).forEach(k => investmentCounts[k] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  Object.keys(investmentLevels).forEach(k => {
    if (investmentLevels[k].test(text)) {
      investmentCounts[k]++;
    }
  });
});

console.log('Investment level mentions:');
Object.entries(investmentCounts).sort((a, b) => b[1] - a[1]).forEach(([inv, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${inv}: ${count} (${pct}%)`);
});

// Revenue mentions
console.log('\n\n=== REVENUE MENTIONS ===');
const revenueLevels = {
  'up to 120k': /at[ée]\s*r\$\s*120\s*mil|at[ée]\s*120\s*mil|at[ée]\s*um\s*mil|0\s*a\s*120/i,
  '120-300k': /120\s*a\s*300\s*mil|300\s*a\s*400\s*mil|r\$\s*1[23]\d|r\$\s*2\d\d/i,
  '300-700k': /300\s*a\s*700\s*mil|400\s*a\s*700\s*mil|acima\s*de\s*300|r\$\s*3\d\d/i,
  '700k-1M': /700\s*mil\s*a\s*1\s*m|acima\s*de\s*700|r\$\s*7\d\d/i,
  'above 1M': /acima\s*de\s*1\s*m[il]|1\s*milhão|bem\s*acima/i,
};

const revenueCounts = {};
Object.keys(revenueLevels).forEach(k => revenueCounts[k] = 0);

withResumoIA.forEach(o => {
  const text = o.resumo_ia.toLowerCase();
  Object.keys(revenueLevels).forEach(k => {
    if (revenueLevels[k].test(text)) {
      revenueCounts[k]++;
    }
  });
});

console.log('Revenue level mentions:');
Object.entries(revenueCounts).sort((a, b) => b[1] - a[1]).forEach(([rev, count]) => {
  const pct = ((count / withResumoIA.length) * 100).toFixed(1);
  console.log(`  ${rev}: ${count} (${pct}%)`);
});

// Save all results to a JSON file for the report
const results = {
  summary: {
    total_oportunidades: oportunidades.length,
    total_with_resumo_ia: withResumoIA.length,
    total_contatos: contatos.length,
    mql_contatos: contatoMqlMap.size,
    total_comunicacoes: comunicacoes.length,
  },
  topicCounts,
  objectionCounts,
  buyingSignalCounts,
  painPointCounts,
  businessTypeCounts,
  investmentCounts,
  revenueCounts,
  mqlVsWonTopics: {
    mql: mqlTopics,
    won: wonTopics,
  }
};

fs.writeFileSync('analysis-results.json', JSON.stringify(results, null, 2));
console.log('\n\nResults saved to analysis-results.json');