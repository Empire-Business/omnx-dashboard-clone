// Script para executar backfill via SQL
// Usa a função PostgreSQL que chama a Edge Function internamente

const { createClient } = require('@supabase/supabase-js');

// Usar a URL direta do banco para bypassar a API REST
const DATABASE_URL = 'postgresql://postgres.qzesffnkqgelmtfblzkr:%40Empire2025@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

async function runBackfill() {
    console.log('========================================');
    console.log('🚀 Executando backfill via SQL');
    console.log('========================================');
    
    // Datas para recuperar (20/02 a 24/02)
    const dataInicio = '2026-02-20';
    const dataFim = '2026-02-24';
    
    console.log(`📅 Período: ${dataInicio} até ${dataFim}`);
    console.log('\nPara executar o backfill, rode este SQL no Supabase Dashboard SQL Editor:');
    console.log('');
    console.log(`SELECT backfill_meta_ads_job('${dataInicio}'::DATE, '${dataFim}'::DATE);`);
    console.log('');
    console.log('Depois verifique o status com:');
    console.log('SELECT * FROM verificar_status_backfill();');
}

runBackfill();
