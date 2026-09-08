const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://qzesffnkqgelmtfblzkr.supabase.co';
const serviceRoleKey = 'REMOVED_SERVICE_ROLE_TOKEN_CONFIGURE_IN_SUPABASE_DASHBOARD';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const OUTPUT_DIR = '/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/lead-scoring';

async function fetchAll(table, select = '*', filter = {}) {
  const all = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase.from(table).select(select);

    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    }

    const start = page * pageSize;
    query = query.range(start, start + pageSize - 1);

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      break;
    }

    if (data) {
      all.push(...data);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    page++;
    console.log(`  Fetched ${all.length} rows from ${table}...`);
  }

  console.log(`  Total: ${all.length} rows from ${table}`);
  return all;
}

async function main() {
  console.log('Starting data extraction for Lead Scoring analysis...\n');

  console.log('=== Fetching CONTATOS ===');
  const contatos = await fetchAll('contatos');

  console.log('\n=== Fetching OPORTUNIDADES ===');
  const oportunidades = await fetchAll('oportunidades');

  console.log('\n=== Fetching COMUNICACOES ===');
  const comunicacoes = await fetchAll('comunicacoes');

  console.log('\n=== Fetching VENDAS_FECHAMENTO ===');
  const vendasFechamento = await fetchAll('vendas_fechamento');

  console.log('\n=== Fetching REUNIOES ===');
  const reunioes = await fetchAll('reunioes');

  console.log('\n=== Saving to JSON files ===');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw_contatos.json'), JSON.stringify(contatos, null, 2));
  console.log('  Saved raw_contatos.json');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw_oportunidades.json'), JSON.stringify(oportunidades, null, 2));
  console.log('  Saved raw_oportunidades.json');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw_comunicacoes.json'), JSON.stringify(comunicacoes, null, 2));
  console.log('  Saved raw_comunicacoes.json');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw_vendas_fechamento.json'), JSON.stringify(vendasFechamento, null, 2));
  console.log('  Saved raw_vendas_fechamento.json');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'raw_reunioes.json'), JSON.stringify(reunioes, null, 2));
  console.log('  Saved raw_reunioes.json');

  console.log('\n=== Data extraction complete! ===');
  console.log(`Total contacts: ${contatos.length}`);
  console.log(`Total opportunities: ${oportunidades.length}`);
  console.log(`Total communications: ${comunicacoes.length}`);
  console.log(`Total closed deals: ${vendasFechamento.length}`);
  console.log(`Total meetings: ${reunioes.length}`);
}

main().catch(console.error);
