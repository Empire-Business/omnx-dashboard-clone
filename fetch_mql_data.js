#!/usr/bin/env node
/**
 * Busca dados dos MQLs do gabarito no Supabase
 * Usa a API REST (axios/fetch) para executar query SQL
 */

const fs = require('fs');
const https = require('https');

// Ler arquivo com emails do gabarito
const gabaritoBefore = JSON.parse(fs.readFileSync('/tmp/mqls_gabarito.json', 'utf-8'));
const emails = gabaritoBefore.leads.map(l => l.email);

console.log(`📧 Buscando dados de ${emails.length} MQLs no Supabase...`);

// Construir query SQL
const emailList = emails.map(e => `'${e.replace(/'/g, "''")}'`).join(', ');

const sqlQuery = `
SELECT
    c.id,
    c.nome,
    c.email,
    c.tags,
    c.whatsapp,
    o.ghl_opportunity_id,
    o.data_lead_recebido::DATE as data_lead_recebido,
    o.pipeline_name
FROM contatos c
LEFT JOIN oportunidades o ON o.contato_id = c.id
WHERE c.email IN (${emailList})
ORDER BY c.email
`;

console.log(`\n💾 Dados do gabarito:`, {
  total_leads: gabaritoBefore.leads.length,
  emails_unicos: new Set(gabaritoBefore.leads.map(l => l.email)).size
});

// Config Supabase
const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('❌ ERRO: Variável SUPABASE_ANON_KEY não definida');
  console.error('Execute: export SUPABASE_ANON_KEY="sua-chave-aqui"');
  process.exit(1);
}

// Fazer request via API REST do Supabase
const options = {
  hostname: 'qzesffnkqgelmtfblzkr.supabase.co',
  path: '/rest/v1/rpc/query_sql',
  port: 443,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY
  }
};

// Na verdade, Supabase não tem rpc/query_sql por padrão. Vou usar uma abordagem diferente
// Vou salvar os emails como um arquivo JSON estruturado e usar Node para fazer a query via JS client

console.log('\n⚠️  Nota: Para buscar dados, execute a query SQL manualmente no Supabase console');
console.log('📋 Salve os resultados em JSON em: /tmp/supabase_results.json');
console.log('\n🔗 Link: https://supabase.com/dashboard/project/qzesffnkqgelmtfblzkr/sql');

// Salvar query para fácil cópia/cola
fs.writeFileSync('/tmp/sql_query_mqls.sql', sqlQuery);
console.log('\n💾 Query SQL salva em: /tmp/sql_query_mqls.sql');

// Criar um template de resultado esperado
const template = {
  total_gabarito: emails.length,
  data_analise: new Date().toISOString(),
  instrucoes: [
    '1. Copie o SQL de /tmp/sql_query_mqls.sql',
    '2. Abra https://supabase.com/dashboard/project/qzesffnkqgelmtfblzkr/sql',
    '3. Cole e execute',
    '4. Clique em "CSV" ou "JSON" para exportar',
    '5. Salve como /tmp/supabase_results.json'
  ],
  resultado_esperado: {
    contatos_encontrados: '?',
    com_tags: '?',
    sem_tags: '?',
    discrepancias: []
  }
};

fs.writeFileSync('/tmp/mql_analysis_template.json', JSON.stringify(template, null, 2));
console.log('📋 Template salvo em: /tmp/mql_analysis_template.json');

console.log('\n✅ Quando tiver os dados do Supabase, execute: python3 compare_mqls.py');
